import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Job de limpeza de estados de conversa de fornecedores expirados.
 *
 * Roda diariamente às 02:00 e remove registros da tabela
 * supplier_conversation_states cujo expiresAt já passou.
 * Estados expirados também são ignorados por SupplierStateService.get(),
 * mas esta limpeza mantém a tabela compacta.
 */
export function startExpireSupplierStatesJob(): void {
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running expire supplier states job');

    try {
      const result = await prisma.supplierConversationState.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired supplier conversation state(s)`);
      }
    } catch (error) {
      logger.error('Error in expire supplier states job', { error });
    }
  });

  logger.info('✅ Expire supplier states job scheduled (daily at 02:00)');
}
