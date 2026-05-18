import crypto from 'crypto';
import { openaiService } from './openai.service';
import { ConversationContext, ProducerState } from '../types';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import { ProductCategoryService } from './product-category.service';
import {
  NLUExtraction,
  NLU_CONFIDENCE_LOW,
} from './nlu-types';
import { SemanticValidator, ValidatedExtraction } from './semantic-validator.service';
import { FSMEventService } from './fsm-event.service';
import { fuzzyMatchCity } from './fuzzy-match.service';
import { SmartDefaultsService } from './smart-defaults.service';

/**
 * Serviço para extrair múltiplas entidades de mensagens do usuário usando GPT-4
 * Simplificado para reutilizar o OpenAI service existente
 */
export class NLUExtractorService {
  /**
   * Extrai todas as entidades possíveis de uma mensagem
   * Usa o OpenAI service existente para entender contexto
   */
  async extractEntities(
    message: string,
    currentState: ProducerState,
    context: ConversationContext
  ): Promise<Partial<ConversationContext>> {
    try {
      // Usar o método interpretMessage existente do OpenAI service
      const response = await openaiService.interpretMessage(
        message,
        `Estado atual: ${currentState}. Contexto: ${JSON.stringify(context)}`
      );

      // Se a resposta trouxe entities, usar elas diretamente
      if (response.entities && Object.keys(response.entities).length > 0) {
        return response.entities as Partial<ConversationContext>;
      }

      // Fallback: retornar vazio se não conseguiu extrair
      return {};
    } catch (error) {
      logger.error('NLU extraction failed', { error, message, currentState });
      // Fallback: retornar objeto vazio em caso de erro
      return {};
    }
  }

  /**
   * Determina próximo estado baseado nos dados que já foram coletados
   */
  determineNextState(context: ConversationContext): ProducerState {
    // Lógica de próximo estado baseado nos campos preenchidos
    if (!context.product) return 'AWAITING_PRODUCT';
    if (!context.quantity) return 'AWAITING_QUANTITY';
    if (!context.region) return 'AWAITING_REGION';
    if (!context.deadline) return 'AWAITING_DEADLINE';

    // Frete é obrigatório — sempre perguntar antes do escopo de fornecedores
    if (!context.freight) return 'AWAITING_FREIGHT';

    return 'AWAITING_SUPPLIER_SCOPE';
  }

  /**
   * Gera mensagem de confirmação com os dados extraídos
   */
  buildConfirmationMessage(context: ConversationContext, nextState: ProducerState): string {
    let message = `✅ *Entendi:*\n`;

    if (context.product) message += `📦 Produto: ${context.product}\n`;
    if (context.quantity && context.unit)
      message += `📊 Quantidade: ${context.quantity} ${context.unit}\n`;
    if (context.region) message += `📍 Região: ${context.region}\n`;
    if (context.deadline) {
      const deadlineDate = new Date(context.deadline);
      message += `⏰ Prazo: ${deadlineDate.toLocaleDateString('pt-BR')}\n`;
    }

    message += `\n`;

    // Adicionar próxima pergunta baseado no estado
    switch (nextState) {
      case 'AWAITING_PRODUCT':
        message += `*Qual produto você deseja cotar?*`;
        break;
      case 'AWAITING_QUANTITY':
        message += `*Qual a quantidade desejada?*\nExemplo: 100 sacas, 500 kg`;
        break;
      case 'AWAITING_REGION':
        message += `*Qual a região de entrega?*\nExemplo: Rio Verde, Goiânia`;
        break;
      case 'AWAITING_DEADLINE':
        message += `*Qual o prazo desejado?*\nExemplo: em 5 dias, 30/04`;
        break;
      case 'AWAITING_SUPPLIER_SCOPE':
        message += `Está correto? Digite *sim* para continuar ou *corrigir* para refazer.`;
        break;
      default:
        message += `Prosseguindo...`;
    }

    return message;
  }

  /**
   * Extrai múltiplos campos de uma mensagem usando regex simples (stub sem GPT).
   * Pode ser aprimorado com OpenAI posteriormente.
   */
  extractMultipleFields(
    message: string,
    _currentState: string,
  ): {
    product?: string;
    quantity?: number;
    unit?: string;
    region?: string;
    deadline?: string;
    freight?: string;
    paymentTerms?: string;
    category?: string;
  } {
    const result: {
      product?: string;
      quantity?: number;
      unit?: string;
      region?: string;
      deadline?: string;
      freight?: string;
      paymentTerms?: string;
      category?: string;
    } = {};

    const normalized = message.toLowerCase().trim();

    // Detectar quantidade + unidade: "100 sacas", "500 kg", "20 ton", "30 litros", "10 bag", "5 caixas", "400 km"
    const qtyMatch = normalized.match(
      /(\d+(?:[.,]\d+)?)\s*(big\s*bags?|bags?|sacas?|sacos?|kg|kgs|quilos?|ton(?:eladas?)?|litros?|lts?|l(?:\b)|un(?:idades?)?|caixas?|cx|km|kms|hectares?|ha)/i,
    );
    if (qtyMatch) {
      result.quantity = parseFloat(qtyMatch[1].replace(',', '.'));
      const rawUnit = qtyMatch[2].toLowerCase().replace(/\s+/g, ' ').trim();
      if (/^big\s*bags?$|^bags?$/.test(rawUnit)) result.unit = 'Big Bags';
      else if (/^sac|^saco/.test(rawUnit)) result.unit = 'sacas';
      else if (/^kg|^quilo/.test(rawUnit)) result.unit = 'kg';
      else if (/^ton/.test(rawUnit)) result.unit = 'Ton';
      else if (/^l$|^lts?$|^litro/.test(rawUnit)) result.unit = 'litros';
      else if (/^un/.test(rawUnit)) result.unit = 'Unidades';
      else if (/^caix|^cx$/.test(rawUnit)) result.unit = 'Caixas';
      else if (/^km/.test(rawUnit)) result.unit = 'km';
      else if (/^ha|^hectare/.test(rawUnit)) result.unit = 'ha';
      else result.unit = rawUnit;
    }

    // Detectar produtos comuns
    const products = [
      'soja', 'milho', 'algodão', 'café', 'arroz', 'feijão', 'trigo',
      'sorgo', 'cana', 'mandioca', 'girassol',
      'fertilizante', 'npk', 'ureia', 'kcl', 'map', 'dap', 'calcário',
      'herbicida', 'fungicida', 'inseticida', 'acaricida',
      'glifosato', 'atrazina', 'roundup', '2,4-d',
      'semente', 'sementes', 'adubo',
      'ração', 'farelo', 'torta de soja',
    ];
    for (const prod of products) {
      if (normalized.includes(prod)) {
        result.product = prod.charAt(0).toUpperCase() + prod.slice(1);
        break;
      }
    }

    // Detectar padrão cidade/estado: "Rio Verde", "Rio Verde - GO", "Sorriso/MT"
    const cityStateMatch = message.match(
      /(?:em|para|entrega(?:\s+em)?|região(?:\s+de)?)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:do|de|da|dos|das)\s+)?[A-ZÀ-Ú]?[a-zà-ú]*(?:\s*[-/]\s*[A-Z]{2})?)/,
    );
    if (cityStateMatch) {
      result.region = cityStateMatch[1].trim();
    }

    // Detectar prazo: "em 5 dias", "amanhã", "30/06", "até sexta"
    const deadlinePatterns = [
      { regex: /amanh[ãa]/i, value: 'amanhã' },
      { regex: /em\s+(\d+)\s*dias?/i, value: null },
      { regex: /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/, value: null },
      { regex: /at[ée]\s+(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i, value: null },
    ];
    for (const pattern of deadlinePatterns) {
      const match = normalized.match(pattern.regex);
      if (match) {
        if (pattern.value) {
          result.deadline = pattern.value;
        } else if (match[0].startsWith('em')) {
          result.deadline = `em ${match[1]} dias`;
        } else if (match[0].match(/\d+[/.-]\d+/)) {
          result.deadline = match[0];
        } else {
          result.deadline = match[0];
        }
        break;
      }
    }

    // Detectar frete: CIF ou FOB
    const freightMatch = normalized.match(/\b(cif|fob)\b/i);
    if (freightMatch) {
      result.freight = freightMatch[1].toUpperCase();
    }

    // Detectar condição de pagamento
    const paymentMatch = normalized.match(
      /\b(à\s*vista|a\s*vista|30\s*dias|30\/60|30\/60\/90|safra|safrinha|antecipado)\b/i,
    );
    if (paymentMatch) {
      result.paymentTerms = paymentMatch[1];
    }

    // Detectar categoria
    const categoryMatch = normalized.match(
      /\b(sementes|fertilizantes|defensivos|rações|máquinas|peças)\b/i,
    );
    if (categoryMatch) {
      result.category = categoryMatch[1].charAt(0).toUpperCase() + categoryMatch[1].slice(1);
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // FF-BE-010 — Multi-slot extraction with confidence
  // ──────────────────────────────────────────────────────────────────

  /**
   * Extrai múltiplos campos com confiança. Estratégia:
   *   1. Cache Redis (TTL 30 min) — chave hash da mensagem normalizada.
   *   2. OpenAI structured outputs (gpt-4o-2024-08-06) com timeout 4s.
   *   3. Fallback regex (extractMultipleFields existente, mantido).
   * Categoria é resolvida via ProductCategoryService quando NLU não
   * conseguiu inferir mas detectou produto.
   *
   * Falhas de cache não impedem a extração. Falhas da OpenAI fazem
   * fallback automático para o regex.
   */
  async extractMultiSlot(message: string): Promise<NLUExtraction> {
    const trimmed = message.trim();
    const cached = await this.cacheGet(trimmed);
    if (cached) return { ...cached, source: 'cache' };

    // 1. Tentar OpenAI estruturado
    const ai = await openaiService.extractStructuredQuoteFields(trimmed);
    if (ai && Object.keys(ai.fields).length > 0) {
      const extraction = await this.buildExtraction(trimmed, ai.fields, 'openai', ai.modelVersion);
      await this.cacheSet(trimmed, extraction);
      return extraction;
    }

    // 2. Fallback regex
    const regex = this.extractMultipleFields(trimmed, 'IDLE');
    const fields: Record<string, any> = {};
    if (regex.product) fields.product = { value: regex.product, confidence: 0.7 };
    if (regex.quantity !== undefined && regex.unit) {
      fields.quantity = { value: regex.quantity, unit: regex.unit, confidence: 0.85 };
    }
    if (regex.region) fields.region = { value: regex.region, confidence: 0.7, needsDisambiguation: false };
    if (regex.deadline) fields.deadline = { value: regex.deadline, confidence: 0.7 };
    if (regex.freight) fields.freight = { value: regex.freight, confidence: 0.95 };
    if (regex.paymentTerms) fields.payment = { value: regex.paymentTerms, confidence: 0.85 };
    if (regex.category) fields.category = { value: regex.category, confidence: 0.85 };

    const extraction = await this.buildExtraction(trimmed, fields, 'regex', 'regex-v1');
    await this.cacheSet(trimmed, extraction);
    return extraction;
  }

  /**
   * Pipeline completo: extração + validação semântica (FF-BE-012).
   * Caller deve consumir issues no resumo do smart-fill.
   * Eventos validation_failed registrados automaticamente via FSMEvent.
   */
  async extractAndValidate(
    message: string,
    options?: { producerId?: string },
  ): Promise<ValidatedExtraction> {
    const extraction = await this.extractMultiSlot(message);

    // FF-BE-018 — Fuzzy/disambig de região ANTES da validação semântica
    if (extraction.fields.region) {
      const original = extraction.fields.region.value;
      // Tenta usar UF do histórico para desempate
      let preferUF: string | undefined;
      if (options?.producerId) {
        const prefs = await SmartDefaultsService.loadFor(options.producerId);
        if (prefs?.region) {
          const m = prefs.region.match(/-\s*([A-Z]{2})\s*$/);
          if (m) preferUF = m[1];
        }
      }
      const verdict = fuzzyMatchCity(original, preferUF);
      if (verdict.kind === 'silent') {
        extraction.fields.region.value = verdict.value;
        // mantém confidence original — match canônico não muda certeza
      }
      // 'suggest' e 'unknown' são tratados pelo SemanticValidator
      // (region_unknown vira warn). Anexa sugestão no payload do
      // extraction para o smart fill builder usar.
      if (verdict.kind === 'suggest') {
        (extraction.fields.region as any).suggested = verdict.value;
        (extraction.fields.region as any).suggestedScore = verdict.score;
      }
    }

    const validated = SemanticValidator.validate(extraction);

    // Telemetria — registra cada issue como validation_failed
    if (options?.producerId && validated.issues.length > 0) {
      for (const issue of validated.issues) {
        FSMEventService.track({
          producerId: options.producerId,
          eventType: 'validation_failed',
          payload: {
            field: issue.field,
            reason: issue.reason,
            severity: issue.severity,
            value: issue.value,
          },
        }).catch(() => undefined);
      }
    }

    // Telemetria adicional — campos com low confidence
    if (options?.producerId) {
      for (const [name, fld] of Object.entries(extraction.fields)) {
        if (!fld) continue;
        if ((fld as any).confidence < 0.7) {
          FSMEventService.track({
            producerId: options.producerId,
            eventType: 'low_confidence_field',
            payload: { field: name, confidence: (fld as any).confidence },
          }).catch(() => undefined);
        }
      }
    }

    return validated;
  }

  /**
   * Filtra campos com confiança baixa (descarta) e enriquece com
   * categoria inferida quando NLU detectou produto mas não categoria.
   */
  private async buildExtraction(
    rawMessage: string,
    rawFields: Record<string, any>,
    source: 'openai' | 'regex',
    modelVersion: string,
  ): Promise<NLUExtraction> {
    const fields: NLUExtraction['fields'] = {};

    for (const [k, v] of Object.entries(rawFields)) {
      if (!v || typeof v !== 'object') continue;
      if (typeof v.confidence !== 'number') continue;
      if (v.confidence < NLU_CONFIDENCE_LOW) continue; // descarta baixa
      (fields as any)[k] = v;
    }

    // Inferir categoria quando NLU não retornou mas há produto
    if (!fields.category && fields.product?.value) {
      try {
        const inferred = await ProductCategoryService.infer(fields.product.value);
        if (inferred) {
          fields.category = { value: inferred, confidence: 0.9 };
        }
      } catch (err) {
        logger.warn('Category inference failed', { err });
      }
    }

    return {
      fields,
      rawMessage,
      extractedAt: new Date(),
      modelVersion,
      source,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cache Redis (TTL 30min) — fail-open em qualquer erro
  // ──────────────────────────────────────────────────────────────────

  private static readonly CACHE_TTL_S = 30 * 60;
  private static readonly CACHE_PREFIX = 'nlu_extract:';

  private cacheKey(message: string): string {
    const norm = message.toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = crypto.createHash('sha1').update(norm).digest('hex').slice(0, 16);
    return `${NLUExtractorService.CACHE_PREFIX}${hash}`;
  }

  private async cacheGet(message: string): Promise<NLUExtraction | null> {
    try {
      const raw = await redis.get(this.cacheKey(message));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as NLUExtraction;
      // ressuscitar Date
      parsed.extractedAt = new Date(parsed.extractedAt);
      return parsed;
    } catch {
      return null;
    }
  }

  private async cacheSet(message: string, value: NLUExtraction): Promise<void> {
    try {
      await redis.setex(
        this.cacheKey(message),
        NLUExtractorService.CACHE_TTL_S,
        JSON.stringify(value),
      );
    } catch {
      // ignore
    }
  }
}

export const nluExtractorService = new NLUExtractorService();
