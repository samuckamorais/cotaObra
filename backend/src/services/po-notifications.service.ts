import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';

/**
 * CO-5-06 — Notifica fornecedor vencedor (WhatsApp + email se disponível).
 * CO-5-07 — Notifica fornecedores não vencedores (sem expor preços absolutos).
 *
 * Para perdedores, o `TenantSettings.notifyLosersMode` controla a exposição
 * (futura coluna; default 'position_only').
 */

export class PurchaseOrderNotificationsService {
  /**
   * Avisa o fornecedor vencedor que ganhou a cotação.
   * Envia mensagem WhatsApp com nº da PO + valor + link do PDF.
   */
  static async notifyWinner(purchaseOrderId: string): Promise<void> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        supplier: { select: { name: true, phone: true, email: true } },
        quote: {
          include: {
            site: { select: { name: true } },
          },
        },
      },
    });
    if (!po) {
      logger.warn('notify_winner.po_not_found', { purchaseOrderId });
      return;
    }

    const totalBR = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(po.totalValue));

    const pdfLine = po.pdfUrl ? `\n📄 PDF da OC: ${po.pdfUrl}` : '';

    const body =
      `🎉 *Parabéns ${po.supplier.name.split(' ')[0]}!*\n\n` +
      `Sua proposta foi escolhida para a obra *${po.quote.site?.name ?? 'da construtora'}*.\n\n` +
      `*Ordem de Compra Nº ${String(po.number).padStart(6, '0')}*\n` +
      `Total: *${totalBR}*\n` +
      `Pagamento: ${po.paymentTerms}\n` +
      `Prazo de entrega: ${po.deliveryDays} dias\n` +
      `${po.freightMode === 'CIF' ? 'Frete CIF (incluso)' : 'Frete FOB (separado)'}` +
      pdfLine +
      `\n\nO comprador entrará em contato para acertar a logística. Obrigado!`;

    try {
      await whatsappService.sendMessage({
        to: po.supplier.phone,
        body,
      });
      logger.info('notify_winner.sent', {
        purchaseOrderId,
        supplierId: po.supplierId,
      });
    } catch (err: any) {
      logger.error('notify_winner.failed', {
        purchaseOrderId,
        err: err?.message,
      });
    }

    // TODO Sprint 5+: email com PDF anexado quando supplier.email != null
    // (depende de email.service que já existe — pluga no email-drip pattern)
  }

  /**
   * Avisa fornecedores não-vencedores. CO-5-07: sem expor preços absolutos
   * dos concorrentes — apenas posição + delta% para o vencedor.
   */
  static async notifyLosers(quoteId: string): Promise<void> {
    const proposals = await prisma.proposal.findMany({
      where: { quoteId },
      include: {
        supplier: { select: { name: true, phone: true } },
      },
      orderBy: { rank: 'asc' },
    });

    const winner = proposals.find((p) => p.rank === 1);
    if (!winner) return;
    const winnerCorrected = winner.correctedTotal ? Number(winner.correctedTotal) : null;

    const losers = proposals.filter((p) => p.rank !== null && p.rank !== 1);

    for (const loser of losers) {
      const corrected = loser.correctedTotal ? Number(loser.correctedTotal) : null;
      let deltaText = '';
      if (winnerCorrected && corrected) {
        const deltaPct = ((corrected - winnerCorrected) / winnerCorrected) * 100;
        deltaText = `\n📊 Você ficou *+${deltaPct.toFixed(1)}%* acima do vencedor.`;
      }

      const body =
        `Olá ${loser.supplier.name.split(' ')[0]}! 👋\n\n` +
        `A cotação que você participou foi fechada.\n` +
        `Sua proposta ficou em *${loser.rank}º lugar* entre ${proposals.length} fornecedores.${deltaText}\n\n` +
        `Obrigado pela participação. Próxima vai ser sua! 💪\n\n` +
        `_CotaObra — informação sem expor preços dos concorrentes._`;

      try {
        await whatsappService.sendMessage({
          to: loser.supplier.phone,
          body,
        });
        logger.info('notify_loser.sent', {
          quoteId,
          supplierId: loser.supplierId,
          rank: loser.rank,
        });
      } catch (err: any) {
        logger.warn('notify_loser.failed', {
          quoteId,
          supplierId: loser.supplierId,
          err: err?.message,
        });
      }
    }
  }
}
