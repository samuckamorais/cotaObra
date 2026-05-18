import twilio from 'twilio';
import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';
import {
  IncomingMessage,
  OutgoingMessage,
  OutgoingDocumentMessage,
} from '../../../types';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { createError } from '../../../utils/error-handler';

/**
 * Provider Twilio para WhatsApp Business API
 * Requer: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
 */
export class TwilioProvider implements IWhatsAppProvider {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_NUMBER) {
      logger.warn('Twilio credentials not configured. Using mock mode.');
    }

    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.fromNumber = env.TWILIO_WHATSAPP_NUMBER || '';
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    try {
      // Mock mode se credenciais não estiverem configuradas
      if (!env.TWILIO_ACCOUNT_SID) {
        logger.info('[MOCK] Twilio sendMessage', message);
        return;
      }

      // Twilio requer prefixo "whatsapp:" nos números
      const from = `whatsapp:${this.fromNumber}`;
      const to = `whatsapp:${message.to}`;

      const result = await this.client.messages.create({
        from,
        to,
        body: message.body,
      });

      logger.info('Twilio message sent', {
        sid: result.sid,
        to: message.to,
        status: result.status,
      });
    } catch (error) {
      logger.error('Twilio sendMessage error', { error, message });
      throw createError.badRequest('Erro ao enviar mensagem via Twilio');
    }
  }

  /**
   * FEAT-PDF-001 — Envia documento via Twilio MediaUrl.
   *
   * Twilio só aceita mídia via URL HTTPS pública (não buffer). A URL
   * fornecida em `message.mediaUrl` precisa estar acessível pela
   * internet (em prod: presigned URL do MinIO via Traefik).
   *
   * Atenção operacional (§2.4 spec):
   *  - Tamanho máx: 16 MB (limite Twilio + WhatsApp).
   *  - Se conversa estiver fora da janela de 24h, é necessário Template
   *    aprovado pela Meta (error code 63031). Esta v1 não trata
   *    template — caller deve enviar fallback texto se 4xx.
   *  - Caption max ~1024 chars (WhatsApp). Truncar antes se necessário.
   *
   * Privacidade nos logs: NÃO loggar `mediaUrl` (contém X-Amz-Signature
   * que vaza acesso ao objeto). Logamos só o filename + status + sid.
   */
  async sendDocument(message: OutgoingDocumentMessage): Promise<void> {
    if (!env.TWILIO_ACCOUNT_SID) {
      logger.info('[MOCK] Twilio sendDocument', {
        to: message.to,
        filename: message.filename,
      });
      return;
    }

    const from = `whatsapp:${this.fromNumber}`;
    const to = `whatsapp:${message.to}`;

    try {
      const result = await this.client.messages.create({
        from,
        to,
        body: message.caption ?? '',
        mediaUrl: [message.mediaUrl],
      });

      logger.info('Twilio sendDocument sent', {
        sid: result.sid,
        to: message.to,
        filename: message.filename,
        status: result.status,
      });
    } catch (error) {
      // Extrai code do Twilio (63016 mediaUrl inválida, 63031 fora janela 24h, etc).
      const twilioError = error as {
        code?: number;
        message?: string;
        status?: number;
      };
      logger.error('Twilio sendDocument error', {
        to: message.to,
        filename: message.filename,
        twilioCode: twilioError.code,
        httpStatus: twilioError.status,
        message: twilioError.message,
      });
      // Propaga preservando o error original para o job decidir retry/fallback.
      throw error;
    }
  }

  verifyWebhook(_query: Record<string, unknown>): boolean {
    // Twilio não requer verificação GET inicial (diferente do Facebook/Meta)
    // A validação é feita via assinatura X-Twilio-Signature no POST
    return true;
  }

  parseIncomingMessage(payload: unknown): IncomingMessage {
    const body = payload as Record<string, unknown>;

    // Formato do webhook Twilio:
    // {
    //   From: "whatsapp:+5564999999999",
    //   Body: "mensagem do usuário",       ← texto (vazio quando é mídia)
    //   MessageSid: "SM...",
    //   NumMedia: "1",                     ← quantidade de arquivos de mídia
    //   MediaUrl0: "https://...",          ← URL do arquivo
    //   MediaContentType0: "audio/ogg",   ← MIME type
    // }

    const from = (body.From as string)?.replace('whatsapp:', '') || '';
    const messageBody = (body.Body as string) || '';
    const numMedia = parseInt((body.NumMedia as string) || '0', 10);

    if (!from) {
      throw createError.badRequest('Invalid Twilio webhook payload: missing From');
    }

    // Mensagem com mídia (áudio ou imagem)
    if (numMedia > 0) {
      const mediaUrl = body.MediaUrl0 as string;
      const mimeType = (body.MediaContentType0 as string) || '';

      let type: 'audio' | 'image' | 'text' = 'text';
      if (mimeType.startsWith('audio/')) {
        type = 'audio';
      } else if (mimeType.startsWith('image/')) {
        type = 'image';
      }

      logger.info('Twilio media message received', { from, type, mimeType, mediaUrl });

      return {
        from,
        body: messageBody, // pode ser legenda da imagem ou vazio
        type,
        mediaUrl,
        mimeType,
        timestamp: new Date(),
      };
    }

    // Mensagem de texto pura
    if (!messageBody) {
      throw createError.badRequest('Invalid Twilio webhook payload: empty body and no media');
    }

    return {
      from,
      body: messageBody,
      type: 'text',
      timestamp: new Date(),
    };
  }

  getProviderName(): string {
    return 'Twilio';
  }

  /**
   * Valida assinatura do webhook Twilio
   * Twilio assina cada requisição com X-Twilio-Signature
   */
  validateSignature(signature: string, url: string, params: Record<string, string>): boolean {
    if (!env.TWILIO_AUTH_TOKEN) {
      logger.warn('Twilio signature validation skipped (no auth token)');
      return true;
    }

    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
  }
}
