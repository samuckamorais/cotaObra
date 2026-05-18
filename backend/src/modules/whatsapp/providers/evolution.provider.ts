import axios, { AxiosInstance } from 'axios';
import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';
import {
  IncomingMessage,
  OutgoingMessage,
  OutgoingDocumentMessage,
} from '../../../types';
import { env } from '../../../config/env';
import { redis } from '../../../config/redis';
import { logger } from '../../../utils/logger';
import { createError } from '../../../utils/error-handler';

/**
 * AUD-04 (CO-0-10): wrapper conservador para o Evolution.
 *
 * Mitigações para evitar bloqueio do número WhatsApp recém-conectado:
 *  - Rate limit por destinatário: máx EVOLUTION_MAX_MSG_PER_HOUR por hora.
 *  - Delays randômicos entre EVOLUTION_MIN_DELAY_MS e EVOLUTION_MAX_DELAY_MS.
 *  - Abort: se EVOLUTION_ABORT_AFTER_ERRORS erros 5xx consecutivos para um
 *    número, pausa esse número por EVOLUTION_PAUSE_DURATION_MS (1h padrão).
 *
 * Estado vive no Redis:
 *  - evolution:rate:{number}     INCR + EXPIRE 3600  (contador por hora)
 *  - evolution:errors:{number}   INCR (zerado em sucesso)
 *  - evolution:paused:{number}   SETEX TTL=PAUSE_DURATION_MS/1000
 */
async function isNumberPaused(number: string): Promise<boolean> {
  return (await redis.get(`evolution:paused:${number}`)) !== null;
}

async function incrementHourlyRate(number: string): Promise<number> {
  const key = `evolution:rate:${number}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  return count;
}

async function markError(number: string): Promise<number> {
  const key = `evolution:errors:${number}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  return count;
}

async function clearErrors(number: string): Promise<void> {
  await redis.del(`evolution:errors:${number}`);
}

async function pauseNumber(number: string, ttlMs: number): Promise<void> {
  await redis.set(
    `evolution:paused:${number}`,
    '1',
    'EX',
    Math.max(60, Math.floor(ttlMs / 1000)),
  );
}

function randomDelayMs(): number {
  const min = env.EVOLUTION_MIN_DELAY_MS;
  const max = env.EVOLUTION_MAX_DELAY_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Provider Evolution API (Open Source) para WhatsApp
 * Requer: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
 */
export class EvolutionProvider implements IWhatsAppProvider {
  private client: AxiosInstance;
  private instanceName: string;

  constructor() {
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE_NAME) {
      logger.warn('Evolution API credentials not configured. Using mock mode.');
    }

    // FEAT-PDF-001 (§13) — Evolution está deprecated em produção.
    // Em dev/local segue funcionando; em prod alertamos no boot.
    if (env.NODE_ENV === 'production') {
      logger.warn(
        'EvolutionProvider está DEPRECATED em produção. Migre para WHATSAPP_PROVIDER=twilio. ' +
          'Esta classe permanece apenas para compatibilidade com ambientes de teste/dev.',
      );
    }

    this.instanceName = env.EVOLUTION_INSTANCE_NAME || '';

    this.client = axios.create({
      baseURL: env.EVOLUTION_API_URL,
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY || '',
      },
      timeout: 10000,
    });
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    // Mock mode se credenciais não estiverem configuradas
    if (!env.EVOLUTION_API_URL) {
      logger.info('[MOCK] Evolution sendMessage', message);
      return;
    }

    // Remover '+' do número se houver (Evolution API não aceita)
    const number = message.to.replace('+', '');

    // AUD-04: checa se o número está pausado (erros 5xx consecutivos).
    if (await isNumberPaused(number)) {
      logger.warn('Evolution: destinatário em quarentena (AUD-04), pulando envio', {
        to: message.to,
      });
      throw createError.badRequest(
        'Destinatário temporariamente bloqueado por erros consecutivos. Tente em 1h.',
      );
    }

    // AUD-04: rate limit conservador por hora por destinatário.
    const hourCount = await incrementHourlyRate(number);
    if (hourCount > env.EVOLUTION_MAX_MSG_PER_HOUR) {
      logger.warn('Evolution rate limit per hour exceeded (AUD-04)', {
        to: message.to,
        hourCount,
        limit: env.EVOLUTION_MAX_MSG_PER_HOUR,
      });
      throw createError.badRequest(
        `Limite de ${env.EVOLUTION_MAX_MSG_PER_HOUR} mensagens/hora para este número atingido.`,
      );
    }

    // AUD-04: delay randômico antes de enviar (parecer "humano").
    const delay = randomDelayMs();
    await sleep(delay);

    const payload = {
      number,
      text: message.body,
    };

    try {
      const response = await this.client.post(
        `/message/sendText/${this.instanceName}`,
        payload,
      );

      // Sucesso → zera o contador de erros consecutivos.
      await clearErrors(number);

      logger.info('Evolution message sent', {
        to: message.to,
        status: response.status,
        messageId: response.data?.key?.id,
        appliedDelayMs: delay,
      });
    } catch (error) {
      const status =
        (error as any)?.response?.status ??
        (error as any)?.status ??
        0;

      // AUD-04: 5xx repetidos → pausa o número por 1h.
      if (status >= 500 && status < 600) {
        const errCount = await markError(number);
        if (errCount >= env.EVOLUTION_ABORT_AFTER_ERRORS) {
          await pauseNumber(number, env.EVOLUTION_PAUSE_DURATION_MS);
          logger.error(
            'Evolution: 3+ erros 5xx consecutivos — pausando número por 1h (AUD-04)',
            { to: message.to, errCount, status },
          );
        }
      }

      logger.error('Evolution sendMessage error', { error, message, status });
      throw createError.badRequest('Erro ao enviar mensagem via Evolution API');
    }
  }

  /**
   * FEAT-PDF-001 (§13.2) — Stub deprecated.
   *
   * Evolution provider NÃO suporta envio de documentos em produção
   * (limitações conhecidas de SLA, rate limit e ausência de signature).
   * O CotaObra padronizou Twilio como provider único para PDFs.
   *
   * Em vez de simular silenciosamente, lançamos erro claro — o caller
   * (job de PDF) precisa saber que esse caminho não vai entregar mídia.
   */
  async sendDocument(_message: OutgoingDocumentMessage): Promise<void> {
    throw createError.badRequest(
      'Evolution provider não suporta envio de documentos em produção. ' +
        'Configure WHATSAPP_PROVIDER=twilio antes de enviar PDFs.',
    );
  }

  verifyWebhook(_query: Record<string, unknown>): boolean {
    // Evolution API não requer verificação especial
    // A autenticação é feita via apikey no header
    return true;
  }

  parseIncomingMessage(payload: unknown): IncomingMessage {
    const body = payload as Record<string, unknown>;

    logger.debug('Evolution webhook raw payload', {
      event: body.event,
      dataKeys: body.data ? Object.keys(body.data as object) : [],
    });

    // Ignorar eventos que não são mensagens recebidas
    const event = body.event as string;
    if (event && event !== 'messages.upsert') {
      throw createError.badRequest(`Evento ignorado: ${event}`);
    }

    const data = body.data as Record<string, unknown>;
    const key = data?.key as Record<string, unknown>;
    const msgObj = data?.message as Record<string, unknown>;

    // Ignorar mensagens enviadas pelo próprio bot (fromMe = true)
    if (key?.fromMe === true) {
      throw createError.badRequest('Mensagem própria ignorada');
    }

    // Ignorar mensagens de grupos
    const remoteJid = key?.remoteJid as string;
    if (!remoteJid || remoteJid.includes('@g.us')) {
      throw createError.badRequest('Mensagem de grupo ignorada');
    }

    // Extrair texto da mensagem (suporta vários formatos)
    let conversation =
      (msgObj?.conversation as string) ||
      (msgObj?.extendedTextMessage as any)?.text ||
      (msgObj?.buttonsResponseMessage as any)?.selectedDisplayText ||
      (msgObj?.listResponseMessage as any)?.title ||
      (msgObj?.imageMessage as any)?.caption ||
      '';

    // Suporte a contatos compartilhados (contactMessage)
    // Evolution API envia: { contactMessage: { displayName, vcard } }
    const contactMsg = msgObj?.contactMessage as any;
    if (!conversation && contactMsg) {
      const vcard = contactMsg.vcard as string | undefined;
      const displayName = contactMsg.displayName as string | undefined;
      if (vcard) {
        conversation = vcard;
      } else if (displayName) {
        conversation = `CONTATO: ${displayName}`;
      }
    }

    if (!conversation) {
      throw createError.badRequest('Mensagem sem texto — tipo de mídia não suportado');
    }

    // Extrair número do remoteJid (formato: 5564999999999@s.whatsapp.net)
    const from = '+' + remoteJid.split('@')[0];

    return {
      from,
      body: conversation,
      timestamp: data.messageTimestamp
        ? new Date(Number(data.messageTimestamp) * 1000)
        : new Date(),
    };
  }

  getProviderName(): string {
    return 'Evolution API';
  }

  /**
   * Verifica status da instância Evolution API
   */
  async checkInstanceStatus(): Promise<boolean> {
    try {
      const response = await this.client.get(`/instance/connectionState/${this.instanceName}`);
      const state = response.data?.instance?.state;
      return state === 'open';
    } catch (error) {
      logger.error('Evolution instance status check failed', { error });
      return false;
    }
  }
}
