import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { createError } from '../utils/error-handler';
import { QuoteResultsService } from './quote-results.service';
import { renderQuotePdf } from '../templates/quote-pdf.template';

/**
 * FEAT-PDF-001 — Orquestrador da geração do PDF.
 *
 * Responsabilidades:
 *   1. Buscar dados completos da cotação fechada (via QuoteResultsService)
 *   2. Buscar metadados complementares do produtor (cidade, região)
 *      sem violar LGPD §8 (NÃO inclui CPF/telefone)
 *   3. Renderizar via template → Buffer
 *
 * NÃO faz upload nem envio — caller (job de Bull) faz isso. Mantém o
 * service puro/testável.
 */
export class PdfGenerationService {
  /**
   * Gera o Buffer do PDF para a cotação informada.
   * Lança caso a cotação não exista ou não pertença ao tenant.
   */
  static async generateQuoteResultPdf(input: {
    tenantId: string;
    quoteId: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const startedAt = Date.now();

    // 1. Dados completos da cotação + propostas
    const data = await QuoteResultsService.getResults(input.tenantId, input.quoteId);

    // 2. Metadata complementar do produtor (apenas cidade/região — LGPD)
    const producer = await prisma.producer.findFirst({
      where: { tenantId: input.tenantId, name: data.producerName },
      select: { city: true, region: true },
    });

    // 3. Renderiza
    const buffer = await renderQuotePdf({
      data,
      producerCity: producer?.city ?? undefined,
      producerRegion: producer?.region ?? undefined,
    });

    if (buffer.length === 0) {
      throw createError.badRequest('PDF gerado está vazio');
    }

    const filename = this.buildFilename(input.quoteId);
    const durationMs = Date.now() - startedAt;
    logger.info('PDF generated', {
      quoteId: input.quoteId,
      tenantId: input.tenantId,
      sizeBytes: buffer.length,
      durationMs,
    });

    return { buffer, filename };
  }

  /**
   * Convenção AC-04 da spec: cotacao_<ID-8chars>_<YYYY-MM-DD>.pdf
   */
  static buildFilename(quoteId: string, today: Date = new Date()): string {
    const short = quoteId.slice(0, 8).toLowerCase();
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, '0');
    const d = String(today.getUTCDate()).padStart(2, '0');
    return `cotacao_${short}_${y}-${m}-${d}.pdf`;
  }
}
