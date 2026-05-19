import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { resolveRequester } from './requester.service';
import { QuoteRequestService } from '../modules/quote-requests/quote-request.service';
import { parseDeadline } from '../utils/validators';
import { normalizeUnit } from '../utils/unit-normalizer';
import { resolveCategoryValue } from '../constants/material-categories';
import type { Site } from '@prisma/client';

/**
 * CO-2-01 (mínimo) + CO-2-08 — RequesterIntakeService.
 *
 * Fluxo simplificado (Sprint 2 entry-point) que substitui a antiga FSM
 * do produtor quando o número está cadastrado em User.phone:
 *
 *   IDLE
 *     ↓ (mensagem entrante de número cadastrado em User.phone)
 *     ├─ user sem obra ativa  → responde "sem obra; fale com seu comprador" → IDLE
 *     ├─ 1 obra ativa         → pula seleção, vai para AWAITING_TEXT
 *     └─ N obras ativas       → AWAITING_SITE_SELECTION
 *   AWAITING_SITE_SELECTION
 *     ↓ (usuário responde "1" / "2" / nome da obra)
 *     AWAITING_TEXT
 *   AWAITING_TEXT
 *     ↓ (texto livre: "200 sacas cimento na obra Aurora pra sexta")
 *     SUBMITTED → cria QuoteRequest(PENDING_REVIEW) → confirmação ao user → IDLE
 *
 * Estado vive no Redis com TTL 30min. A versão completa da FSM com todos
 * os estados (AWAITING_QUANTITY, AWAITING_UNIT, etc.) entra em Sprint 2 PRs
 * subsequentes; nesta versão usamos NLU + parseDeadline para extrair tudo
 * de uma frase só (smart-fill default).
 *
 * Retorna `true` se interceptou a mensagem (deve parar o pipeline legado);
 * `false` se o phone não é REQUESTER cadastrado em User.phone.
 */

const TTL_SECONDS = 30 * 60; // 30 minutos

type IntakeState =
  | { state: 'AWAITING_SITE_SELECTION'; sites: Array<{ id: string; name: string }> }
  | { state: 'AWAITING_TEXT'; siteId: string; siteName: string };

async function loadState(userId: string): Promise<IntakeState | null> {
  const raw = await redis.get(`requester_intake:${userId}`);
  return raw ? (JSON.parse(raw) as IntakeState) : null;
}

async function saveState(userId: string, state: IntakeState): Promise<void> {
  await redis.set(`requester_intake:${userId}`, JSON.stringify(state), 'EX', TTL_SECONDS);
}

async function clearState(userId: string): Promise<void> {
  await redis.del(`requester_intake:${userId}`);
}

/**
 * CO-2-11 — log estruturado de transições da FSM Requester.
 * Emite evento `fsm.requester.transition` com from/to/userId/tenantId.
 * Ferramentas de observabilidade (Sentry/PostHog) podem agregar daqui.
 */
function logTransition(
  userId: string,
  from: 'IDLE' | 'AWAITING_SITE_SELECTION' | 'AWAITING_TEXT',
  to: 'AWAITING_SITE_SELECTION' | 'AWAITING_TEXT' | 'SUBMITTED' | 'IDLE',
  meta: Record<string, unknown> = {},
) {
  logger.info('fsm.requester.transition', { userId, from, to, ...meta });
}

function formatSitesList(sites: Site[]): string {
  return sites.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
}

/**
 * Tenta interpretar a escolha de obra pelo usuário (número 1-N ou texto).
 */
function parseSiteChoice(
  message: string,
  sites: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const normalized = message.trim().toLowerCase();
  // Match numérico
  const num = parseInt(normalized, 10);
  if (Number.isFinite(num) && num >= 1 && num <= sites.length) {
    return sites[num - 1];
  }
  // Match por nome (contains)
  const byName = sites.find((s) => normalized.includes(s.name.toLowerCase()));
  if (byName) return byName;
  return null;
}

/**
 * Quebra texto livre em itens simples. Versão lightweight do NLU —
 * CO-2-02 vai expandir com GPT-4o quando o env permitir.
 *
 * Tenta extrair: qty, unit, material (livre), deadline.
 * Formato esperado de cada item: "200 sacas cimento", "30 m3 areia média".
 * Se múltiplos itens separados por vírgula/`+`/`e`, parsea cada um.
 */
export function quickParseRequest(text: string): {
  items: Array<{ description: string; qty?: number; unit?: string; spec?: string }>;
  deadlineAt: Date | null;
} {
  // Extrai prazo do final da frase (após "pra"/"para"/"até"/"até dia")
  let deadlineAt: Date | null = null;
  let body = text.trim();
  const deadlineMatch = body.match(/(?:pra|para|at[eé]|at[eé] dia|prazo)\s+([^.,;]+)$/i);
  if (deadlineMatch) {
    const parsed = parseDeadline(deadlineMatch[1].trim());
    if (parsed) {
      deadlineAt = parsed;
      body = body.slice(0, body.lastIndexOf(deadlineMatch[0])).trim();
    }
  }

  // Quebra em fragmentos por vírgula / ponto e vírgula / " e "
  const fragments = body
    .split(/,| e |;|\+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = fragments.map((f) => parseItem(f));
  return { items, deadlineAt };
}

function parseItem(fragment: string): {
  description: string;
  qty?: number;
  unit?: string;
  spec?: string;
} {
  // Quantidade no início: "200 sacas cimento" → qty=200, unit="sacas"
  const qtyMatch = fragment.match(/^(\d+(?:[.,]\d+)?)\s*([a-záçãéó²³µ]+)?\s*(.*)$/i);
  if (qtyMatch) {
    const qty = parseFloat(qtyMatch[1].replace(',', '.'));
    const unitRaw = qtyMatch[2] ?? '';
    const description = (qtyMatch[3] ?? '').trim() || fragment;

    // Normaliza unit se reconhecido; caso contrário deixa como rawUnit
    const unit = unitRaw ? normalizeUnit(unitRaw) : undefined;
    // Tenta resolver categoria como hint (não persiste; só pra log)
    void resolveCategoryValue(description);

    return {
      description: description || fragment,
      qty: Number.isFinite(qty) ? qty : undefined,
      unit: unit || undefined,
    };
  }
  return { description: fragment };
}

export interface IntakeResult {
  intercepted: boolean;
  replies: string[]; // mensagens que o caller deve enviar ao usuário
}

/**
 * Ponto único de entrada da FSM Requester. Chamado pelo whatsapp.service
 * ANTES do lookup legado de Producer.
 */
export async function handleRequesterMessage(
  phone: string,
  text: string,
): Promise<IntakeResult> {
  const ctx = await resolveRequester(phone);
  if (!ctx) {
    return { intercepted: false, replies: [] };
  }

  const { user, sites } = ctx;

  if (sites.length === 0) {
    return {
      intercepted: true,
      replies: [
        `Olá ${user.name.split(' ')[0]}! Você não tem obras ativas vinculadas no CotaObra. Fale com seu comprador/admin para liberar acesso.`,
      ],
    };
  }

  const state = await loadState(user.id);

  // --- Comando reset/cancelar ---
  if (/^(cancelar|cancela|sair|reset|recomecar|recomeçar)$/i.test(text.trim())) {
    await clearState(user.id);
    return {
      intercepted: true,
      replies: ['OK, cancelei. Mande nova mensagem quando quiser abrir solicitação.'],
    };
  }

  // --- Estado: aguardando seleção de obra ---
  if (state?.state === 'AWAITING_SITE_SELECTION') {
    const chosen = parseSiteChoice(text, state.sites);
    if (!chosen) {
      return {
        intercepted: true,
        replies: [
          `Não entendi qual obra. Responda com o número:\n\n${state.sites
            .map((s, i) => `${i + 1}) ${s.name}`)
            .join('\n')}`,
        ],
      };
    }
    await saveState(user.id, {
      state: 'AWAITING_TEXT',
      siteId: chosen.id,
      siteName: chosen.name,
    });
    logTransition(user.id, 'AWAITING_SITE_SELECTION', 'AWAITING_TEXT', {
      tenantId: user.tenantId,
      siteId: chosen.id,
    });
    return {
      intercepted: true,
      replies: [
        `Obra: *${chosen.name}* ✅\n\nAgora me diz o que você precisa. Em uma frase: quantidade + material + prazo.\n\nEx: _200 sacas de cimento, 30m³ de areia média, para sexta_`,
      ],
    };
  }

  // --- Estado: aguardando texto da solicitação ---
  if (state?.state === 'AWAITING_TEXT') {
    return await submitRequest(user.id, user.tenantId!, state.siteId, state.siteName, text);
  }

  // --- IDLE: primeira mensagem ---
  // Comando "ajuda"
  if (/^(ajuda|help|menu|oi|ol[áa]|bom dia|boa tarde|boa noite)$/i.test(text.trim())) {
    if (sites.length === 1) {
      const s = sites[0];
      await saveState(user.id, { state: 'AWAITING_TEXT', siteId: s.id, siteName: s.name });
      logTransition(user.id, 'IDLE', 'AWAITING_TEXT', {
        tenantId: user.tenantId,
        siteId: s.id,
        autoSingleSite: true,
      });
      return {
        intercepted: true,
        replies: [
          `Olá ${user.name.split(' ')[0]}! 👋 Bem-vindo ao *CotaObra*.\n\nVou abrir uma solicitação para a obra *${s.name}*.\n\nMe descreve o que você precisa em uma frase: quantidade + material + prazo.\n\nEx: _200 sacas de cimento pra sexta_`,
        ],
      };
    }
    // Multi-site → pergunta qual
    await saveState(user.id, {
      state: 'AWAITING_SITE_SELECTION',
      sites: sites.map((s) => ({ id: s.id, name: s.name })),
    });
    logTransition(user.id, 'IDLE', 'AWAITING_SITE_SELECTION', {
      tenantId: user.tenantId,
      siteCount: sites.length,
    });
    return {
      intercepted: true,
      replies: [
        `Olá ${user.name.split(' ')[0]}! 👋\n\nVocê está atrelado a ${sites.length} obras:\n\n${formatSitesList(sites)}\n\nEm qual obra é esta solicitação? Responda com o número.`,
      ],
    };
  }

  // Mensagem solta (sem ser "oi" e sem estado) — assume direto que o user
  // está pedindo algo. Se single site, processa; se múltiplo, pergunta.
  if (sites.length === 1) {
    const s = sites[0];
    return await submitRequest(user.id, user.tenantId!, s.id, s.name, text);
  }
  await saveState(user.id, {
    state: 'AWAITING_SITE_SELECTION',
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
  });
  return {
    intercepted: true,
    replies: [
      `Você está em ${sites.length} obras. Em qual é esta solicitação?\n\n${formatSitesList(sites)}\n\nResponda com o número e depois me diga o que precisa.`,
    ],
  };
}

/**
 * CO-2-08 — Submete a solicitação (cria QuoteRequest), limpa estado e
 * responde ao usuário com a confirmação numerada.
 */
async function submitRequest(
  userId: string,
  tenantId: string,
  siteId: string,
  siteName: string,
  rawText: string,
): Promise<IntakeResult> {
  const { items, deadlineAt } = quickParseRequest(rawText);

  if (items.length === 0 || items.every((it) => !it.description)) {
    return {
      intercepted: true,
      replies: [
        'Não consegui entender o pedido. Tenta no formato:\n\n_QTD UNIDADE MATERIAL pra PRAZO_\n\nEx: _200 sacas cimento pra sexta_',
      ],
    };
  }

  try {
    const qr = await QuoteRequestService.createFromFsm({
      tenantId,
      siteId,
      requesterId: userId,
      items,
      deadlineAt,
      rawText,
      source: 'whatsapp',
    });

    await clearState(userId);
    logTransition(userId, 'AWAITING_TEXT', 'SUBMITTED', {
      tenantId,
      siteId,
      quoteRequestId: qr.id,
      itemCount: items.length,
    });

    const shortId = qr.id.slice(0, 8);
    const itemList = items
      .map((it, i) => {
        const parts = [it.qty?.toString(), it.unit, it.description]
          .filter(Boolean)
          .join(' ');
        return `  ${i + 1}. ${parts}`;
      })
      .join('\n');
    const prazo = deadlineAt
      ? deadlineAt.toLocaleDateString('pt-BR')
      : '— (comprador vai definir)';

    return {
      intercepted: true,
      replies: [
        `✅ *Solicitação #${shortId}* registrada para *${siteName}*\n\nItens:\n${itemList}\n\nPrazo: ${prazo}\n\nO comprador foi notificado e vai revisar. Você recebe aqui quando as cotações estiverem fechadas.\n\n_Mande nova mensagem se quiser abrir outra solicitação._`,
      ],
    };
  } catch (err: any) {
    logger.error('requester_intake.submit_failed', { err: err?.message, userId, siteId });
    return {
      intercepted: true,
      replies: [
        'Tive um problema ao registrar sua solicitação 😔. Tenta de novo em alguns minutos ou avise o comprador.',
      ],
    };
  }
}
