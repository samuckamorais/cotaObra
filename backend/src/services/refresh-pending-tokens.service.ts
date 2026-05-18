import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const QUOTE_TOKEN_EXPIRY_HOURS = 2;
const PROPOSAL_TOKEN_EXPIRY_HOURS = 24;

/**
 * Estende expiresAt de tokens pendentes ao iniciar o servidor.
 *
 * Motivo: expiresAt é wall-clock; durante um restart/deploy o tempo
 * offline ainda conta contra o prazo do produtor/fornecedor. Esta
 * rotina garante que tokens não usados nem cancelados tenham o prazo
 * cheio após cada boot.
 *
 * Atualiza apenas tokens cujo expiresAt está aquém do novo padrão,
 * evitando reduzir prazos de tokens criados com TTL maior.
 */
export async function refreshPendingTokensOnStartup(): Promise<void> {
  const now = Date.now();
  const newQuoteExpiresAt = new Date(now + QUOTE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const newProposalExpiresAt = new Date(now + PROPOSAL_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  try {
    const quoteResult = await prisma.quoteToken.updateMany({
      where: {
        used: false,
        cancelled: false,
        expiresAt: { lt: newQuoteExpiresAt },
      },
      data: { expiresAt: newQuoteExpiresAt },
    });

    const proposalResult = await prisma.proposalToken.updateMany({
      where: {
        used: false,
        expiresAt: { lt: newProposalExpiresAt },
      },
      data: { expiresAt: newProposalExpiresAt },
    });

    logger.info('Pending tokens expiry refreshed on startup', {
      quoteTokensExtended: quoteResult.count,
      proposalTokensExtended: proposalResult.count,
      newQuoteExpiresAt: newQuoteExpiresAt.toISOString(),
      newProposalExpiresAt: newProposalExpiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to refresh pending tokens on startup', { error });
  }
}
