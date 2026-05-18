import { quoteDispatchQueue } from './queue.config';
import { prisma } from '../config/database';
import { SupplierFSM } from '../flows/supplier.flow';
import { logger, logWithContext } from '../utils/logger';
import { getPlanLimits } from '../config/plans';

/**
 * Job para disparar cotação para fornecedores elegíveis
 * Adiciona job na fila Bull para processamento assíncrono
 */
export async function dispatchQuoteJob(quoteId: string, selectedSupplierIds?: string[]): Promise<number> {
  // Adicionar job na fila
  await quoteDispatchQueue.add({ quoteId, selectedSupplierIds });

  logger.info('Quote dispatch job added to queue', { quoteId, selectedSupplierIds });

  // CO-0-05: contagem de fornecedores agora é por tenant (não mais via ProducerSupplier).
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: { tenantId: true, region: true, supplierScope: true },
  });

  let suppliersCount = 0;

  if (quote.supplierScope === 'MINE' || quote.supplierScope === 'ALL') {
    // Se tem lista de IDs selecionados, contar apenas esses
    if (selectedSupplierIds && selectedSupplierIds.length > 0) {
      suppliersCount += selectedSupplierIds.length;
    } else {
      suppliersCount += await prisma.supplier.count({
        where: { tenantId: quote.tenantId, isNetworkSupplier: false },
      });
    }
  }

  if (quote.supplierScope === 'NETWORK' || quote.supplierScope === 'ALL') {
    const networkSuppliers = await prisma.supplier.count({
      where: {
        isNetworkSupplier: true,
        regions: { has: quote.region },
      },
    });
    suppliersCount += networkSuppliers;
  }

  return suppliersCount;
}

/**
 * Processor do job - executa o disparo efetivamente
 */
quoteDispatchQueue.process(async (job) => {
  const { quoteId, selectedSupplierIds } = job.data;

  logWithContext('info', 'Processing quote dispatch job', { quoteId });

  try {
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { producer: true },
    });

    const supplierFSM = new SupplierFSM();
    const notifiedSuppliers = new Set<string>();

    // Coletar todos os fornecedores elegíveis antes de notificar
    const eligibleSuppliers: Array<{ id: string; isOwn: boolean; supplier: any }> = [];

    // 1. Fornecedores próprios da construtora (tenant)
    // CO-0-05: sem mais ProducerSupplier; buscamos via Supplier.tenantId direto.
    if (quote.supplierScope === 'MINE' || quote.supplierScope === 'ALL') {
      if (selectedSupplierIds && selectedSupplierIds.length > 0) {
        // Buscar dados completos dos fornecedores selecionados
        const selected = await prisma.supplier.findMany({
          where: { id: { in: selectedSupplierIds } },
        });
        for (const supplier of selected) {
          eligibleSuppliers.push({ id: supplier.id, isOwn: true, supplier });
        }
      } else {
        const tenantSuppliers = await prisma.supplier.findMany({
          where: { tenantId: quote.tenantId, isNetworkSupplier: false },
        });
        for (const supplier of tenantSuppliers) {
          eligibleSuppliers.push({ id: supplier.id, isOwn: true, supplier });
        }
      }
    }

    // 2. Fornecedores da rede
    if (quote.supplierScope === 'NETWORK' || quote.supplierScope === 'ALL') {
      const networkSuppliers = await prisma.supplier.findMany({
        where: {
          isNetworkSupplier: true,
          regions: { has: quote.region },
        },
      });

      for (const supplier of networkSuppliers) {
        if (!eligibleSuppliers.some(s => s.id === supplier.id)) {
          eligibleSuppliers.push({ id: supplier.id, isOwn: false, supplier });
        }
      }
    }

    // Calcular affinity score e ordenar fornecedores
    const scoredSuppliers = eligibleSuppliers.map(({ id, isOwn, supplier }) => {
      const affinityScore =
        (supplier.totalProposals > 0 ? supplier.acceptedProposals / supplier.totalProposals : 0) * 0.4
        + (supplier.rating / 5) * 0.3
        + (supplier.categories?.includes(quote.category || '') ? 1 : 0) * 0.3;
      return { id, isOwn, supplier, affinityScore };
    });

    scoredSuppliers.sort((a, b) => b.affinityScore - a.affinityScore);

    // Enforcement do limite de fornecedores por plano
    const subscription = await prisma.subscription.findFirst({
      where: { producerId: quote.producerId, active: true },
    });
    const planName = subscription?.plan ?? 'BASIC';
    const planLimits = getPlanLimits(planName);
    const maxSuppliers = planLimits.suppliersPerQuote;

    const limitedSuppliers = isFinite(maxSuppliers)
      ? scoredSuppliers.slice(0, maxSuppliers)
      : scoredSuppliers;

    if (limitedSuppliers.length < scoredSuppliers.length) {
      logWithContext('info', 'Suppliers truncated by plan limit', {
        quoteId,
        plan: planName,
        limit: maxSuppliers,
        eligible: scoredSuppliers.length,
        dispatched: limitedSuppliers.length,
      });
    }

    logWithContext('info', 'Suppliers prioritized by affinity score', {
      quoteId,
      order: limitedSuppliers.map(s => ({
        id: s.id,
        name: s.supplier.name,
        score: parseFloat(s.affinityScore.toFixed(3)),
      })),
    });

    // Notificar fornecedores na ordem de afinidade (respeitando limite do plano)
    for (const { id, isOwn } of limitedSuppliers) {
      if (!notifiedSuppliers.has(id)) {
        await supplierFSM.notifyNewQuote(id, quoteId, isOwn);
        notifiedSuppliers.add(id);
      }
    }

    // Registrar quais fornecedores foram notificados (para envio de aviso de expiração)
    if (notifiedSuppliers.size > 0) {
      await prisma.quoteSupplierNotification.createMany({
        data: Array.from(notifiedSuppliers).map((supplierId) => ({ quoteId, supplierId })),
        skipDuplicates: true,
      });
    }

    // Atualizar status da cotação
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'COLLECTING' },
    });

    logWithContext('info', 'Quote dispatched successfully', {
      quoteId,
      suppliersCount: notifiedSuppliers.size,
    });

    return { success: true, suppliersCount: notifiedSuppliers.size };
  } catch (error) {
    logger.error('Error dispatching quote', { error, quoteId });
    throw error;
  }
});
