import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * CO-3-07 — atualiza delivery/read receipts de QuoteSupplierNotification
 * a partir de eventos do provider WhatsApp.
 *
 * Mapeamento de eventos comuns (Twilio + Evolution):
 *   sent       → deliveryStatus=SENT
 *   delivered  → deliveryStatus=DELIVERED + deliveredAt
 *   read       → deliveryStatus=READ + readAt
 *   failed     → deliveryStatus=FAILED + errorMsg
 *
 * O webhook chama este service por `(phone, externalMessageId?)`. Como
 * QuoteSupplierNotification não armazena messageId externo ainda, usamos
 * o phone como fallback — atualiza a notificação MAIS RECENTE para esse
 * supplier que esteja em status SENT/DELIVERED/READ.
 */

export type DeliveryEvent = 'sent' | 'delivered' | 'read' | 'failed';

export interface DeliveryWebhookPayload {
  phone: string; // número do destinatário (fornecedor)
  event: DeliveryEvent;
  errorMsg?: string;
  timestamp?: Date;
}

export class NotificationStatusService {
  static async applyEvent(payload: DeliveryWebhookPayload): Promise<boolean> {
    const phoneNorm = payload.phone.startsWith('+') ? payload.phone : `+${payload.phone}`;

    // Encontra o supplier pelo telefone
    const supplier = await prisma.supplier.findFirst({
      where: { phone: phoneNorm },
      select: { id: true, tenantId: true },
    });

    if (!supplier) {
      logger.debug('notification_status.unknown_supplier', { phone: phoneNorm });
      return false;
    }

    // Pega a notificação MAIS RECENTE deste supplier ainda em status pré-RESPONDED
    const notification = await prisma.quoteSupplierNotification.findFirst({
      where: {
        supplierId: supplier.id,
        respondedAt: null,
      },
      orderBy: { notifiedAt: 'desc' },
    });

    if (!notification) {
      logger.debug('notification_status.no_open_notification', {
        supplierId: supplier.id,
      });
      return false;
    }

    const at = payload.timestamp ?? new Date();
    const updates: any = {};
    switch (payload.event) {
      case 'sent':
        updates.deliveryStatus = 'SENT';
        break;
      case 'delivered':
        updates.deliveryStatus = 'DELIVERED';
        updates.deliveredAt = at;
        break;
      case 'read':
        updates.deliveryStatus = 'READ';
        updates.readAt = at;
        if (!notification.deliveredAt) updates.deliveredAt = at;
        break;
      case 'failed':
        updates.deliveryStatus = 'FAILED';
        updates.errorMsg = payload.errorMsg ?? 'Falha no envio (sem detalhe do provider)';
        break;
    }

    await prisma.quoteSupplierNotification.update({
      where: { id: notification.id },
      data: updates,
    });

    logger.info('notification_status.applied', {
      notificationId: notification.id,
      supplierId: supplier.id,
      event: payload.event,
    });

    return true;
  }
}
