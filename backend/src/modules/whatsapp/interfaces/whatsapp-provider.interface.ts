import {
  IncomingMessage,
  OutgoingMessage,
  OutgoingDocumentMessage,
} from '../../../types';

/**
 * Interface abstrata para providers de WhatsApp
 * Implementações: Twilio (produção) e Evolution API (legado, deprecated em prod)
 */
export interface IWhatsAppProvider {
  /**
   * Envia mensagem para um número de telefone
   */
  sendMessage(message: OutgoingMessage): Promise<void>;

  /**
   * FEAT-PDF-001 — Envia documento (PDF) como mídia.
   *
   * Aceita SEMPRE uma URL pública HTTPS (não buffer). Em produção, a URL
   * é uma presigned URL do MinIO. Evolution provider lança erro nesse
   * método (deprecated em prod — §13 da spec).
   */
  sendDocument(message: OutgoingDocumentMessage): Promise<void>;

  /**
   * Verifica webhook (usado para validação inicial)
   * Retorna true se webhook é válido
   */
  verifyWebhook(query: Record<string, unknown>): boolean;

  /**
   * Parseia payload do webhook e retorna mensagem normalizada
   */
  parseIncomingMessage(payload: unknown): IncomingMessage;

  /**
   * Nome do provider (para logs)
   */
  getProviderName(): string;
}
