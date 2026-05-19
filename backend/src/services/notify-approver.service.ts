import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';

/**
 * CO-6-04 — Notifica o aprovador (APPROVER) quando uma quote acima do threshold
 * fica pendente. Envia WhatsApp + (futuramente) email.
 *
 * Se o Approval tiver `approverId` definido, notifica ele direto.
 * Caso contrário, notifica todos os APPROVERs ativos do tenant.
 *
 * HSM: usa template aprovado pela Meta no futuro; por enquanto texto livre
 * (ok em sandbox/Twilio). Marcar como `[CO-6-04]` para detectar no log.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export class NotifyApproverService {
  static async notify(approvalId: string): Promise<{ sent: number }> {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
      include: {
        tenant: { select: { id: true, name: true } },
        quote: {
          select: {
            id: true,
            region: true,
            deadline: true,
            site: { select: { name: true } },
          },
        },
        requestedBy: { select: { name: true } },
        approver: { select: { id: true, name: true, phone: true, email: true, active: true } },
      },
    });

    if (!approval) {
      logger.warn('notify_approver.not_found', { approvalId });
      return { sent: 0 };
    }

    const recipients: Array<{ id: string; name: string; phone: string | null; email: string | null }> = [];

    if (approval.approver && approval.approver.active && approval.approver.phone) {
      recipients.push({
        id: approval.approver.id,
        name: approval.approver.name,
        phone: approval.approver.phone,
        email: approval.approver.email,
      });
    } else {
      // Fallback: todos os APPROVER + ADMIN ativos do tenant
      const fallback = await prisma.user.findMany({
        where: {
          tenantId: approval.tenantId,
          role: { in: ['APPROVER', 'ADMIN'] },
          active: true,
          phone: { not: null },
        },
        select: { id: true, name: true, phone: true, email: true },
      });
      recipients.push(
        ...fallback.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
        })),
      );
    }

    if (recipients.length === 0) {
      logger.warn('notify_approver.no_recipients', { approvalId, tenantId: approval.tenantId });
      return { sent: 0 };
    }

    const total = BRL.format(Number(approval.totalAmount));
    const threshold = BRL.format(Number(approval.thresholdAmount));
    const siteName = approval.quote.site?.name ?? approval.quote.region;
    const requester = approval.requestedBy?.name ?? 'comprador';

    const body =
      `🔔 *Aprovação pendente*\n\n` +
      `Solicitante: ${requester}\n` +
      `Obra: ${siteName}\n` +
      `Valor: *${total}* (teto: ${threshold})\n` +
      `\nAcesse o painel para aprovar ou rejeitar a cotação.\n` +
      `Ref: ${approval.id.slice(0, 8)}`;

    let sent = 0;
    for (const r of recipients) {
      if (!r.phone) continue;
      try {
        await whatsappService.sendMessage({ to: r.phone, body });
        sent++;
      } catch (err: any) {
        logger.warn('notify_approver.whatsapp_failed', {
          approvalId,
          userId: r.id,
          err: err?.message,
        });
      }
    }

    logger.info('notify_approver.sent', { approvalId, recipients: recipients.length, sent });
    return { sent };
  }
}
