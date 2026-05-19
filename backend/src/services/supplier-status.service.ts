import { prisma } from '../config/database';
import { createError } from '../utils/error-handler';

/**
 * CO-3-09 — Lista de fornecedores convidados em uma cotação com status
 * agregado (NotifiedAt, deliveryStatus, respondedAt, proposalId).
 *
 * Status apresentado no frontend:
 *   - PENDING   notificação criada mas ainda não enviada (transient)
 *   - SENT      mensagem WhatsApp enviada
 *   - DELIVERED entregue ao device do fornecedor
 *   - READ      lida pelo fornecedor
 *   - RESPONDED fornecedor respondeu (proposta ou decline)
 *   - FAILED    erro no envio (errorMsg preenchido)
 */

export interface SupplierStatusItem {
  notificationId: string;
  supplierId: string;
  supplierName: string;
  supplierCompany: string | null;
  supplierPhone: string;
  notifiedAt: Date;
  deliveryStatus: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'RESPONDED' | 'FAILED';
  deliveredAt: Date | null;
  readAt: Date | null;
  respondedAt: Date | null;
  responseType: string | null;
  hasProposal: boolean;
  errorMsg: string | null;
  followUpCount: number;
}

export class SupplierStatusService {
  static async listForQuote(
    tenantId: string,
    quoteId: string,
  ): Promise<{
    items: SupplierStatusItem[];
    summary: {
      total: number;
      responded: number;
      delivered: number;
      read: number;
      failed: number;
    };
  }> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      select: { id: true },
    });
    if (!quote) throw createError.notFound('Cotação não encontrada');

    const notifications = await prisma.quoteSupplierNotification.findMany({
      where: { quoteId },
      include: {
        supplier: {
          select: { id: true, name: true, company: true, phone: true },
        },
      },
      orderBy: { notifiedAt: 'asc' },
    });

    // Quais fornecedores já enviaram proposta?
    const proposals = await prisma.proposal.findMany({
      where: { quoteId },
      select: { supplierId: true },
    });
    const supplierIdsWithProposal = new Set(proposals.map((p) => p.supplierId));

    const items: SupplierStatusItem[] = notifications.map((n) => {
      const hasProposal = supplierIdsWithProposal.has(n.supplierId);
      let deliveryStatus: SupplierStatusItem['deliveryStatus'] = 'PENDING';
      if (hasProposal || n.respondedAt) {
        deliveryStatus = 'RESPONDED';
      } else if (n.errorMsg) {
        deliveryStatus = 'FAILED';
      } else if (n.readAt) {
        deliveryStatus = 'READ';
      } else if (n.deliveredAt) {
        deliveryStatus = 'DELIVERED';
      } else if (n.deliveryStatus === 'SENT' || n.deliveryStatus === null) {
        deliveryStatus = 'SENT';
      } else {
        deliveryStatus = n.deliveryStatus as SupplierStatusItem['deliveryStatus'];
      }

      return {
        notificationId: n.id,
        supplierId: n.supplierId,
        supplierName: n.supplier.name,
        supplierCompany: n.supplier.company,
        supplierPhone: n.supplier.phone,
        notifiedAt: n.notifiedAt,
        deliveryStatus,
        deliveredAt: n.deliveredAt,
        readAt: n.readAt,
        respondedAt: n.respondedAt,
        responseType: n.responseType,
        hasProposal,
        errorMsg: n.errorMsg,
        followUpCount: n.followUpCount,
      };
    });

    const summary = {
      total: items.length,
      responded: items.filter((i) => i.deliveryStatus === 'RESPONDED').length,
      delivered: items.filter((i) => i.deliveredAt !== null).length,
      read: items.filter((i) => i.readAt !== null).length,
      failed: items.filter((i) => i.deliveryStatus === 'FAILED').length,
    };

    return { items, summary };
  }
}
