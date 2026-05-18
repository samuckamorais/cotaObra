/**
 * FF-BE-026 — Script de migração idempotente para producers/users legacy
 * sem vínculo via User.producerId.
 *
 * Estratégia: para cada tenant, se houver match único (1 USER órfão + 1
 * Producer órfão), faz o auto-link. Casos ambíguos vão para log WARN —
 * super admin resolve manualmente depois (futuro endpoint /api/admin/users/:id/link-producer).
 *
 * Roda 1x após deploy. Pode ser re-executado sem efeito (idempotente):
 * users já vinculados não são reprocessados; producers já linkados não
 * aparecem na lista de candidatos.
 *
 * Uso: npm run migrate:producer-links
 */
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export async function migrate() {
  const startedAt = Date.now();
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  let autoLinked = 0;
  let needsManual = 0;
  let scanned = 0;

  for (const tenant of tenants) {
    scanned++;

    const unlinkedUsers = await prisma.user.findMany({
      where: { tenantId: tenant.id, role: 'USER', producerId: null },
      select: { id: true, email: true, name: true },
    });

    // Producers já vinculados a algum user
    const linkedProducerRows = await prisma.user.findMany({
      where: { tenantId: tenant.id, producerId: { not: null } },
      select: { producerId: true },
    });
    const linkedProducerIds = linkedProducerRows
      .map((u) => u.producerId)
      .filter((id): id is string => id !== null);

    const unlinkedProducers = await prisma.producer.findMany({
      where: {
        tenantId: tenant.id,
        ...(linkedProducerIds.length > 0 ? { id: { notIn: linkedProducerIds } } : {}),
      },
      select: { id: true, name: true, phone: true },
    });

    if (unlinkedUsers.length === 1 && unlinkedProducers.length === 1) {
      // Match único — auto-link
      const targetUser = unlinkedUsers[0];
      const targetProducer = unlinkedProducers[0];

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: targetUser.id },
          data: { producerId: targetProducer.id },
        });
        await tx.fSMEvent.create({
          data: {
            producerId: targetProducer.id,
            eventType: 'producer_auto_linked_to_user_legacy_migration',
            payload: {
              userId: targetUser.id,
              userEmail: targetUser.email,
              tenantId: tenant.id,
            },
          },
        });
      });

      logger.info('Auto-linked legacy user-producer', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        userId: targetUser.id,
        userEmail: targetUser.email,
        producerId: targetProducer.id,
        producerName: targetProducer.name,
      });
      autoLinked++;
    } else if (unlinkedUsers.length > 0 || unlinkedProducers.length > 0) {
      // Ambíguo — log para revisão manual
      logger.warn('Tenant requires manual review', {
        tenantId: tenant.id,
        tenantName: tenant.name,
        unlinkedUsersCount: unlinkedUsers.length,
        unlinkedProducersCount: unlinkedProducers.length,
        unlinkedUserEmails: unlinkedUsers.map((u) => u.email),
        unlinkedProducerNames: unlinkedProducers.map((p) => p.name),
      });
      needsManual++;
    }
    // Se ambos 0: tenant está limpo, nada a fazer.
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info('Migration complete', {
    tenantsScanned: scanned,
    autoLinked,
    needsManual,
    elapsedMs,
  });

  console.log(
    `\nMigration complete:\n` +
      `  tenants escaneados: ${scanned}\n` +
      `  auto-linkados:     ${autoLinked}\n` +
      `  precisam revisão:  ${needsManual}\n` +
      `  tempo:             ${elapsedMs}ms\n`,
  );
}

// Só executa automaticamente se rodado direto (não via import em testes)
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
