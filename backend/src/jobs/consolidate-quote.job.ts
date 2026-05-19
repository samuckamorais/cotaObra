import cron from 'node-cron';
import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { Messages } from '../flows/messages';
import { logger, logWithContext } from '../utils/logger';
import { env } from '../config/env';
import { JobLockService } from '../services/job-lock.service';
import { analyticsService } from '../services/analytics.service';
import { sseManager } from '../lib/sse-manager';
// CO-4-02: pricing-engine para calcular ranking corrigido durante consolidação.
import {
  rankProposals,
  DEFAULT_PRICING_SETTINGS,
  type PricingSettings,
} from '../services/pricing-engine.service';

function resultsUrl(quoteId: string): string {
  return `${env.FRONTEND_URL}/quotes/${quoteId}/resultados`;
}

/**
 * Job periódico (cron) para consolidar cotações
 * Verifica a cada X minutos se há cotações prontas para consolidação
 *
 * Condições de consolidação:
 * 1. Status = COLLECTING
 * 2. expiresAt atingido OU todos fornecedores responderam
 */
export function startConsolidateQuoteJob(): void {
  const intervalMinutes = env.CONSOLIDATE_CHECK_INTERVAL;

  // Executar a cada X minutos
  cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    logger.info('Running consolidate quote job');

    try {
      // Buscar cotações elegíveis para consolidação
      const quotes = await prisma.quote.findMany({
        where: {
          status: 'COLLECTING',
          expiresAt: {
            lte: new Date(),
          },
        },
        include: {
          producer: true,
          proposals: {
            include: {
              supplier: true,
            },
          },
          supplierNotifications: {
            include: {
              supplier: true,
            },
          },
        },
      });

      for (const quote of quotes) {
        await consolidateQuote(quote.id);
      }

      logger.info(`Consolidate job completed`, { quotesProcessed: quotes.length });
    } catch (error) {
      logger.error('Error in consolidate quote job', { error });
    }
  });

  logger.info(`✅ Consolidate quote job scheduled (every ${intervalMinutes} minutes)`);
}

/**
 * Consolida uma cotação específica
 * Ordena propostas e envia resumo ao produtor
 */
export async function consolidateQuote(quoteId: string): Promise<void> {
  logWithContext('info', 'Consolidating quote', { quoteId });

  // Adquire lock exclusivo para evitar race condition com expire-quotes job
  const locked = await JobLockService.acquire(quoteId, 'consolidate');
  if (!locked) {
    logger.warn('Could not acquire lock — skipping quote consolidation', { quoteId, jobName: 'consolidate' });
    return;
  }

  try {
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: {
        producer: true,
        items: true,
        proposals: {
          include: {
            supplier: true,
            items: true,
          },
        },
        supplierNotifications: {
          include: {
            supplier: true,
          },
        },
      },
    });

    // Re-verifica status após adquirir o lock — o expire job pode ter
    // mudado o status para EXPIRED entre o findMany do cron e agora
    if (quote.status !== 'COLLECTING') {
      logWithContext('info', 'Quote no longer COLLECTING — skipping consolidation', {
        quoteId,
        currentStatus: quote.status,
      });
      return;
    }

    // Pegar produto do primeiro item ou campo legado
    const itemName = (quote as any).items?.[0]?.product || quote.product || 'cotação';

    // Notificar fornecedores que foram contatados mas não enviaram proposta
    const respondedSupplierIds = new Set(quote.proposals.map((p) => p.supplierId));
    const nonRespondents = quote.supplierNotifications.filter(
      (n) => !respondedSupplierIds.has(n.supplierId),
    );

    for (const notification of nonRespondents) {
      try {
        await whatsappService.sendMessage({
          to: notification.supplier.phone,
          body: Messages.QUOTE_EXPIRED_SUPPLIER(itemName),
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        logger.warn('Failed to notify non-respondent supplier on expiry', {
          supplierId: notification.supplierId,
          quoteId,
        });
      }
    }

    if (nonRespondents.length > 0) {
      logWithContext('info', 'Notified non-respondent suppliers on expiry', {
        quoteId,
        count: nonRespondents.length,
      });
    }

    // Se não houver propostas, marcar como EXPIRED
    if (quote.proposals.length === 0) {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'EXPIRED', processedBy: 'consolidate' },
      });

      await whatsappService.sendMessage({
        to: quote.producer.phone,
        body: `⏰ Sua cotação *${itemName}* expirou sem receber propostas.\n\nTente novamente com um prazo maior ou outros fornecedores.`,
      });

      logWithContext('warn', 'Quote expired without proposals', { quoteId });
      analyticsService.trackEvent('quote_expired', { quoteId });
      return;
    }

    // Total de itens da cotação (para indicador de proposta parcial)
    const totalItems = quote.items.length;

    // ────────────────────────────────────────────────────────────────────
    // CO-4-02: roda pricing-engine e persiste correctedTotal/rank/breakdown
    // ────────────────────────────────────────────────────────────────────
    try {
      // Carrega settings do tenant para usar monthlyRate/dailyPenalty configurados
      const tenantSettings = await prisma.tenantSettings.findUnique({
        where: { tenantId: quote.tenantId },
        select: { paymentPolicy: true },
      });
      const pricingSettings: PricingSettings = {
        ...DEFAULT_PRICING_SETTINGS,
        ...(tenantSettings?.paymentPolicy as Partial<PricingSettings> | null ?? {}),
      };

      // Calcula deadlineDays: dias entre createdAt e deadline
      const deadlineDays = Math.max(
        0,
        Math.round(
          (quote.deadline.getTime() - quote.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );

      const proposalsForRanking = quote.proposals.map((p) => ({
        id: p.id,
        items: p.items.map((it: any) => ({
          totalPrice: it.totalPrice,
          available: it.available ?? true,
        })),
        freightMode: p.freightMode,
        freightValue: p.freightValue ?? 0,
        paymentTerms: p.paymentTerms,
        deliveryDays: p.deliveryDays,
      }));
      const ranked = rankProposals(proposalsForRanking, { deadlineDays }, pricingSettings);

      // Persiste em paralelo (each update independente)
      await Promise.all(
        ranked.map((r) =>
          prisma.proposal.update({
            where: { id: r.id },
            data: {
              correctedTotal: r.corrected as any, // Prisma.Decimal já compatível
              breakdown: r.breakdown as any,
              rank: r.rank,
            },
          }),
        ),
      );

      logWithContext('info', 'Pricing engine applied', {
        quoteId,
        proposalsCount: ranked.length,
        winnerId: ranked[0]?.id,
      });
    } catch (err: any) {
      logger.warn('Pricing engine failed during consolidation (continuing without)', {
        quoteId,
        err: err?.message,
      });
    }

    // Weighted score: price 60%, rating 25%, delivery 15%
    const maxPrice = Math.max(...quote.proposals.map(p => p.price), 1);
    const maxDays = Math.max(...quote.proposals.map(p => p.deliveryDays), 1);

    const sortedProposals = quote.proposals.sort((a, b) => {
      const scoreA = (1 - a.price / maxPrice) * 60 + (a.supplier.rating / 5) * 25 + (1 - a.deliveryDays / maxDays) * 15;
      const scoreB = (1 - b.price / maxPrice) * 60 + (b.supplier.rating / 5) * 25 + (1 - b.deliveryDays / maxDays) * 15;

      // Complete proposals before partial ones of similar score
      if (a.isPartial !== b.isPartial) return a.isPartial ? 1 : -1;

      if (Math.abs(scoreA - scoreB) > 0.01) return scoreB - scoreA; // Higher score first
      // Tie-breaker: own supplier preference
      return a.isOwnSupplier === b.isOwnSupplier ? 0 : a.isOwnSupplier ? -1 : 1;
    });

    // Formatar propostas para mensagem
    const formattedProposals = sortedProposals.map((p, index) => ({
      rank: index + 1,
      supplierName: p.supplier.name,
      isOwn: p.isOwnSupplier,
      totalPrice: p.totalPrice,
      deliveryDays: p.deliveryDays,
      paymentTerms: p.paymentTerms,
      observations: p.observations || undefined,
      rating: p.supplier.rating,
      isPartial: p.isPartial,
      coveredItems: p.items.length,
      totalItems,
    }));

    // Enviar resumo ao produtor + link para página de resultados
    const resultsLink = resultsUrl(quoteId);

    await whatsappService.sendMessage({
      to: quote.producer.phone,
      body: Messages.QUOTE_SUMMARY(formattedProposals),
    });

    await whatsappService.sendMessage({
      to: quote.producer.phone,
      body: `📊 *Veja o comparativo completo e escolha o vencedor:*\n\n🔗 ${resultsLink}`,
    });

    // Atualizar status e estado da conversa do produtor
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'SUMMARIZED', processedBy: 'consolidate' },
    });

    await prisma.conversationState.update({
      where: { producerId: quote.producerId },
      data: {
        step: 'AWAITING_CHOICE',
        context: { quoteId },
      },
    });

    logWithContext('info', 'Quote consolidated successfully', {
      quoteId,
      proposalsCount: sortedProposals.length,
    });

    // Emitir evento SSE para dashboard em tempo real
    sseManager.emit(quote.tenantId, 'quote_consolidated', {
      quoteId,
      proposalsCount: sortedProposals.length,
      bestPrice: sortedProposals[0]?.totalPrice,
    });
    analyticsService.trackEvent('quote_consolidated', { quoteId, proposalsCount: sortedProposals.length });
  } catch (error) {
    logger.error('Error consolidating quote', { error, quoteId });
    throw error;
  } finally {
    await JobLockService.release(quoteId, 'consolidate');
  }
}

/**
 * FEAT-EARLY-CLOSE — Marca que um fornecedor respondeu a uma cotação
 * (com proposta ou recusa formal). Update idempotente: chamada repetida
 * não move o `respondedAt` original (preserva timestamp da 1ª resposta).
 *
 * Tipos:
 *  - 'PROPOSAL': supplier enviou proposta (Proposal criada no DB)
 *  - 'DECLINED': supplier recusou formalmente ("2" / "não tenho interesse")
 *
 * Se não houver QuoteSupplierNotification para esse par, é no-op (não
 * deveria acontecer no fluxo normal — supplier que recebeu o convite
 * tem registro garantido).
 */
export async function markQuoteResponse(
  quoteId: string,
  supplierId: string,
  responseType: 'PROPOSAL' | 'DECLINED',
): Promise<void> {
  try {
    const result = await prisma.quoteSupplierNotification.updateMany({
      where: { quoteId, supplierId, respondedAt: null }, // só atualiza se ainda não respondeu
      data: { respondedAt: new Date(), responseType },
    });

    if (result.count === 0) {
      // Pode ser supplier sem notification (race/fluxo manual) ou já
      // respondeu antes. Não é erro — só loga em debug.
      logger.debug('markQuoteResponse no-op', { quoteId, supplierId, responseType });
    } else {
      logger.info('Quote response tracked', { quoteId, supplierId, responseType });
    }
  } catch (err) {
    // Tracking nunca pode quebrar o fluxo do supplier. Pior caso, o
    // cron de expiração continua cobrindo o fechamento.
    logger.warn('Failed to mark quote response', {
      quoteId,
      supplierId,
      responseType,
      error: (err as Error).message,
    });
  }
}

/**
 * FEAT-EARLY-CLOSE — Verifica se todos os fornecedores convidados de
 * uma cotação já responderam. Se sim, consolida imediatamente (sem
 * esperar o expiresAt).
 *
 * Eager check, chamado após cada `markQuoteResponse`. O lock dentro
 * do `consolidateQuote` garante que múltiplas chamadas concorrentes
 * não causam consolidação dupla.
 *
 * No-op se:
 *  - Quote não está em COLLECTING (já foi consolidada/expirada)
 *  - Algum convidado ainda não respondeu
 *  - Sem fornecedores convidados (edge raro)
 */
export async function tryConsolidateEarly(quoteId: string): Promise<void> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true },
    });
    if (!quote || quote.status !== 'COLLECTING') {
      return;
    }

    const notifications = await prisma.quoteSupplierNotification.findMany({
      where: { quoteId },
      select: { respondedAt: true },
    });

    if (notifications.length === 0) {
      logger.warn('tryConsolidateEarly: quote sem notifications — pulando', { quoteId });
      return;
    }

    const allResponded = notifications.every((n) => n.respondedAt !== null);
    if (!allResponded) {
      return; // ainda esperando alguém — cron pegará no expiresAt
    }

    logger.info('All suppliers responded — consolidating early', {
      quoteId,
      total: notifications.length,
    });

    await consolidateQuote(quoteId);
  } catch (err) {
    // Falha aqui NÃO pode derrubar o caller (supplier flow). Cron
    // continua como safety net.
    logger.error('tryConsolidateEarly failed (cron pegará no expiresAt)', {
      quoteId,
      error: (err as Error).message,
    });
  }
}
