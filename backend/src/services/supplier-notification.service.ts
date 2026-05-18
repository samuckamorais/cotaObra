import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { Messages } from '../flows/messages';
import { logger } from '../utils/logger';
import { TenantSettingsService } from './tenant-settings.service';

/**
 * Serviço para notificar fornecedores sobre cotações e resultados
 */
export class SupplierNotificationService {
  /**
   * Envia feedback pós-proposta com ranking atual
   */
  async sendProposalRankingFeedback(proposalId: string): Promise<void> {
    try {
      const proposal = await prisma.proposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: {
          supplier: true,
          quote: true,
        },
      });

      // Buscar total de propostas da cotação (sem revelar posição)
      const totalProposals = await prisma.proposal.count({
        where: { quoteId: proposal.quoteId },
      });

      // Calcular tempo de expiração
      const expiresAt = proposal.quote.expiresAt;
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      const minutesLeft = Math.floor(diff / 60000);
      const expiresIn =
        minutesLeft > 60
          ? `${Math.floor(minutesLeft / 60)}h${minutesLeft % 60}min`
          : `${minutesLeft}min`;

      await whatsappService.sendMessage({
        to: proposal.supplier.phone,
        body: Messages.PROPOSAL_SENT_WITH_RANKING({
          totalProposals,
          yourPrice: proposal.price,
          expiresIn,
        }),
      });

      logger.info('Sent proposal confirmation to supplier', {
        supplierId: proposal.supplierId,
        proposalId,
      });
    } catch (error) {
      logger.error('Failed to send proposal confirmation', { error, proposalId });
    }
  }

  /**
   * Notifica todos os fornecedores sobre resultado da cotação
   */
  async notifyQuoteResult(quoteId: string): Promise<void> {
    try {
      const quote = await prisma.quote.findUniqueOrThrow({
        where: { id: quoteId },
        include: {
          producer: true,
          proposals: {
            include: {
              supplier: true,
            },
          },
        },
      });

      // Se não foi fechada, não notificar
      if (quote.status !== 'CLOSED' || !quote.closedSupplierId) {
        return;
      }

      const winningProposal = quote.proposals.find((p) => p.supplierId === quote.closedSupplierId);

      if (!winningProposal) {
        logger.warn('Winning proposal not found', { quoteId, closedSupplierId: quote.closedSupplierId });
        return;
      }

      // Ler configuração do tenant para saber qual mensagem enviar ao vencedor
      // (CO-0-04: settings agora são por tenant, compartilhadas pela construtora.)
      const tenantSettings = await TenantSettingsService.getOrCreate(quote.tenantId);
      const notifType = tenantSettings.winnerNotificationType;

      if (notifType !== 'NONE') {
        const body =
          notifType === 'SELECTED'
            ? Messages.PROPOSAL_SELECTED({
                producerName: quote.producer.name,
                producerPhone: quote.producer.phone,
              })
            : Messages.QUOTE_CLOSED_PRODUCER_CONTACTS(quote.producer.name);

        await whatsappService.sendMessage({ to: winningProposal.supplier.phone, body });

        logger.info('Notified winning supplier (auto)', {
          quoteId,
          supplierId: quote.closedSupplierId,
          notifType,
        });
      } else {
        logger.info('Winner notification skipped (NONE)', { quoteId });
      }

      // Atualizar rating do vencedor
      await this.updateSupplierRating(quote.closedSupplierId, true);

      logger.info('Notified winning supplier', {
        quoteId,
        supplierId: quote.closedSupplierId,
      });

      // Notificar perdedores
      const losers = quote.proposals.filter((p) => p.supplierId !== quote.closedSupplierId);

      for (const loser of losers) {
        await whatsappService.sendMessage({
          to: loser.supplier.phone,
          body: Messages.PROPOSAL_NOT_SELECTED({
            winningPrice: winningProposal.price,
            yourPrice: loser.price,
            producerName: quote.producer.name,
          }),
        });

        // Atualizar contadores do perdedor (não muda rating)
        await this.updateSupplierRating(loser.supplierId, false);

        logger.info('Notified losing supplier', {
          quoteId,
          supplierId: loser.supplierId,
        });

        // Delay para não spammar WhatsApp API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('Failed to notify quote result', { error, quoteId });
    }
  }

  /**
   * Atualiza rating do fornecedor baseado no resultado
   */
  private async updateSupplierRating(supplierId: string, wasAccepted: boolean): Promise<void> {
    try {
      const supplier = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
      });

      const newTotalProposals = supplier.totalProposals + 1;
      const newAcceptedProposals = wasAccepted
        ? supplier.acceptedProposals + 1
        : supplier.acceptedProposals;

      // Calcular novo rating (0-5 baseado na taxa de aceitação)
      const acceptanceRate = newAcceptedProposals / newTotalProposals;
      const newRating = acceptanceRate * 5;

      await prisma.supplier.update({
        where: { id: supplierId },
        data: {
          totalProposals: newTotalProposals,
          acceptedProposals: newAcceptedProposals,
          rating: newRating,
        },
      });

      logger.info('Updated supplier rating', {
        supplierId,
        wasAccepted,
        newRating,
        acceptanceRate,
      });
    } catch (error) {
      logger.error('Failed to update supplier rating', { error, supplierId });
    }
  }

  /**
   * Envia feedback competitivo pós-fechamento para todos os fornecedores
   * Winner recebe parabéns; losers recebem posição, preço e diferença %
   */
  async notifyQuoteResults(quoteId: string): Promise<void> {
    try {
      const quote = await prisma.quote.findUniqueOrThrow({
        where: { id: quoteId },
        include: {
          producer: true,
          items: { select: { product: true } },
          proposals: {
            include: { supplier: true },
            orderBy: { price: 'asc' },
          },
        },
      });

      if (quote.status !== 'CLOSED' || !quote.closedSupplierId) {
        return;
      }

      const productName =
        quote.items.length > 0
          ? quote.items.map((i) => i.product).join(', ')
          : (quote as any).product || 'produto';

      const winningProposal = quote.proposals.find(
        (p) => p.supplierId === quote.closedSupplierId,
      );

      if (!winningProposal) {
        logger.warn('Winning proposal not found for results notification', { quoteId });
        return;
      }

      // Notificar vencedor
      await whatsappService.sendMessage({
        to: winningProposal.supplier.phone,
        body: Messages.PROPOSAL_WON_DETAILED({
          product: productName,
          producerName: quote.producer.name,
        }),
      });

      logger.info('Sent detailed win notification', {
        quoteId,
        supplierId: winningProposal.supplierId,
      });

      // Ordenar propostas por preço para determinar posição
      const sorted = [...quote.proposals].sort((a, b) => a.price - b.price);

      // Notificar perdedores com posição e diferença
      for (const proposal of sorted) {
        if (proposal.supplierId === quote.closedSupplierId) continue;

        const position = sorted.findIndex((p) => p.id === proposal.id) + 1;
        const diff = proposal.price - winningProposal.price;
        const diffPercent = winningProposal.price > 0
          ? (diff / winningProposal.price) * 100
          : 0;

        await whatsappService.sendMessage({
          to: proposal.supplier.phone,
          body: Messages.PROPOSAL_LOST_DETAILED({
            position,
            yourPrice: proposal.price,
            winnerPrice: winningProposal.price,
            diffPercent,
          }),
        });

        logger.info('Sent detailed loss notification', {
          quoteId,
          supplierId: proposal.supplierId,
          position,
          diffPercent,
        });

        // Delay para não spammar WhatsApp API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('Failed to notify quote results', { error, quoteId });
    }
  }
}

export const supplierNotificationService = new SupplierNotificationService();
