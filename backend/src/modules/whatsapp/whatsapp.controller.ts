import crypto from 'crypto';
import { Request, Response } from 'express';
import { whatsappService } from './whatsapp.service';
import { WhatsAppFactory } from './whatsapp.factory';
import { TwilioProvider } from './providers/twilio.provider';
import { ErrorHandler } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { NotificationStatusService } from '../../services/notification-status.service';

// Algoritmo canônico Twilio: HMAC-SHA1(url + keys.sort().reduce(k+v))
// usado APENAS para log de diagnóstico quando validateRequest retorna false.
function computeTwilioSignatureForDebug(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac('sha1', authToken).update(data).digest('base64');
}

/**
 * Controller para webhook do WhatsApp
 * Recebe mensagens dos providers (Twilio/Evolution API)
 */
export class WhatsAppController {
  /**
   * GET /api/whatsapp/webhook
   * Verificação inicial do webhook (usado por alguns providers)
   */
  static verifyWebhook = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const isValid = whatsappService.verifyWebhook(req.query);

      if (isValid) {
        res.status(200).send('Webhook verified');
      } else {
        res.status(403).send('Webhook verification failed');
      }
    }
  );

  /**
   * POST /api/whatsapp/webhook
   * Recebe mensagens do WhatsApp via provider
   *
   * Segurança Twilio: valida X-Twilio-Signature antes de processar.
   * Evolution API: autenticação via apikey no header da instância (não precisa validar aqui).
   */
  static handleWebhook = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      // ── Validação de assinatura Twilio ──────────────────────────────────
      if (env.WHATSAPP_PROVIDER === 'twilio') {
        const provider = WhatsAppFactory.create() as TwilioProvider;
        if (typeof provider.validateSignature === 'function') {
          const signature = (req.headers['x-twilio-signature'] as string) || '';
          // URL completa que o Twilio usou para assinar (deve bater exatamente com a configurada no painel)
          const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

          const rawParams = (req.body ?? {}) as Record<string, string>;

          // Tenta validar de duas formas: COM e SEM ChannelMetadata.
          // Documentação Twilio é ambígua sobre WhatsApp Senders, então
          // aceitamos a assinatura se qualquer uma das estratégias bater.
          const paramsWithCM: Record<string, string> = { ...rawParams };
          const paramsWithoutCM: Record<string, string> = { ...rawParams };
          delete paramsWithoutCM.ChannelMetadata;

          const isValidWithCM = provider.validateSignature(signature, webhookUrl, paramsWithCM);
          const isValidWithoutCM = provider.validateSignature(signature, webhookUrl, paramsWithoutCM);
          const isValid = isValidWithCM || isValidWithoutCM;

          if (!isValid) {
            // Diagnóstico: calcula a assinatura manualmente das duas formas
            // para identificar qual estratégia o Twilio está usando.
            const token = env.TWILIO_AUTH_TOKEN ?? '';
            const sigWithCM = token
              ? computeTwilioSignatureForDebug(token, webhookUrl, paramsWithCM)
              : '<no-token>';
            const sigWithoutCM = token
              ? computeTwilioSignatureForDebug(token, webhookUrl, paramsWithoutCM)
              : '<no-token>';

            logger.warn('Twilio signature validation failed', {
              webhookUrl,
              receivedSignature: signature,
              calculatedWithChannelMetadata: sigWithCM,
              calculatedWithoutChannelMetadata: sigWithoutCM,
              matchWithCM: signature === sigWithCM,
              matchWithoutCM: signature === sigWithoutCM,
              protocol: req.protocol,
              host: req.get('host'),
              xForwardedProto: req.headers['x-forwarded-proto'],
              contentType: req.headers['content-type'],
              bodyType: typeof req.body,
              paramsCountWithCM: Object.keys(paramsWithCM).length,
              paramsCountWithoutCM: Object.keys(paramsWithoutCM).length,
              paramKeys: Object.keys(paramsWithCM).sort(),
              tokenLength: token.length,
              accountSidFromBody: (rawParams as any).AccountSid,
              accountSidFromEnv: env.TWILIO_ACCOUNT_SID,
              accountSidsMatch: (rawParams as any).AccountSid === env.TWILIO_ACCOUNT_SID,
              skipValidationFlag: env.WHATSAPP_SKIP_SIGNATURE_VALIDATION,
            });

            if (env.WHATSAPP_SKIP_SIGNATURE_VALIDATION) {
              // Flag de emergência ligada — segue o fluxo mesmo com signature inválida.
              // ATENÇÃO: em prod isso permite qualquer cliente disparar o pipeline.
              logger.warn(
                '⚠️  TWILIO SIGNATURE VALIDATION BYPASSED — debug/emergência ativa via WHATSAPP_SKIP_SIGNATURE_VALIDATION=true',
              );
            } else {
              res.status(403).json({ error: 'Invalid Twilio signature' });
              return;
            }
          }
        }
      }
      // ───────────────────────────────────────────────────────────────────

      logger.info('Webhook received', {
        provider: env.WHATSAPP_PROVIDER,
        from: req.body?.From || req.body?.data?.key?.remoteJid,
      });

      let incomingMessage;
      try {
        incomingMessage = whatsappService.parseWebhookPayload(req.body);
      } catch (err: any) {
        // Eventos ignorados (fromMe, grupos, eventos não-mensagem) — responder 200 silenciosamente
        logger.debug('Webhook payload skipped', { reason: err.message });
        WhatsAppController.respondEmpty(res);
        return;
      }

      // Processar mensagem de forma assíncrona (não bloqueia resposta)
      whatsappService.handleIncomingMessage(incomingMessage).catch((error) => {
        logger.error('Error processing webhook message asynchronously', { error });
      });

      // Responder imediatamente (200 OK) para o provider
      WhatsAppController.respondEmpty(res);
    }
  );

  /**
   * Resposta padrão para webhooks de mensageria.
   *
   * Twilio (WhatsApp Senders) exige resposta TwiML (XML) ou vazia.
   * Retornar JSON dispara o erro 12300 - Invalid Content-Type.
   *
   * Evolution API aceita qualquer 200 OK, então TwiML vazio funciona pros dois.
   */
  private static respondEmpty(res: Response): void {
    res
      .status(200)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  /**
   * POST /api/whatsapp/status-callback — CO-3-07
   *
   * Endpoint genérico (provider-agnostic) que recebe eventos de delivery/read
   * receipts. O caller envia:
   *   { phone, event: 'sent'|'delivered'|'read'|'failed', errorMsg?, timestamp? }
   *
   * Twilio: webhook nativo bate aqui se configurado em "Status callback URL".
   * Evolution: handler local na app pode chamar este endpoint para uniformizar.
   *
   * Verificação de assinatura: feita upstream pelos middlewares específicos
   * de cada provider; este endpoint só consome o payload normalizado.
   */
  static statusCallback = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      // Aceita formato canônico { phone, event } OU formato Twilio (To, MessageStatus)
      const body = req.body ?? {};
      const phone = (body.phone ?? body.To ?? '').toString();
      const eventRaw = (body.event ?? body.MessageStatus ?? '').toString().toLowerCase();
      const errorMsg = (body.errorMsg ?? body.ErrorMessage ?? body.ErrorCode)?.toString();

      // Mapeia status do Twilio para o nosso vocabulário canônico
      const map: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
        undelivered: 'failed',
      };
      const event = map[eventRaw];

      if (!phone || !event) {
        logger.warn('whatsapp.status_callback.invalid_payload', { body });
        res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD' } });
        return;
      }

      const applied = await NotificationStatusService.applyEvent({
        phone,
        event,
        errorMsg,
      });

      res.status(200).json({ success: true, applied });
    },
  );
}
