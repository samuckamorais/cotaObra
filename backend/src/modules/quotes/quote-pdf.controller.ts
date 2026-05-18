import { Request, Response } from 'express';
import { ErrorHandler, createError } from '../../utils/error-handler';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { MinioStorage } from '../../services/storage/minio.storage';
import { PdfGenerationService } from '../../services/pdf-generation.service';
import { enqueueQuotePdfJob } from '../../jobs/generate-quote-pdf.job';
import { logger } from '../../utils/logger';

/**
 * FEAT-PDF-001 (FF-PDF) — Endpoints para o dashboard consumir o PDF
 * da cotação fechada.
 *
 * GET  /api/quotes/:id/pdf           — baixa (302 → presigned URL)
 * POST /api/quotes/:id/pdf/resend    — reenfileira envio via WhatsApp
 *
 * Ambos exigem authenticate + requireTenant + validateTenantOwnership
 * (registrados em app.ts). Permissão granular (§14.2):
 *  - SUPER_ADMIN: qualquer cotação
 *  - ADMIN:       cotações do próprio tenant (já filtrado por validateTenantOwnership)
 *  - USER:        cotações do próprio Producer (validado aqui no controller)
 */
export class QuotePdfController {
  /**
   * GET /api/quotes/:id/pdf
   *
   * Retorna 302 redirecionando para uma presigned URL do MinIO. O browser
   * faz o download direto. Alternativa: stream do PDF — mas redirect é
   * mais eficiente (não passa pelo backend) e permite usar a mesma URL
   * que vai pro Twilio.
   *
   * Se o objeto não existe no MinIO (cotação fechou antes da feature,
   * ou foi deletado pelo lifecycle), gera o PDF on-demand e armazena.
   */
  static download = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const quoteId = req.params.id;
      const tenantId = req.user?.tenantId;
      if (!tenantId) throw createError.unauthorized('Tenant não identificado');

      await assertPermission(req, quoteId, tenantId);

      const key = MinioStorage.buildQuotePdfKey(tenantId, quoteId);

      // Se o PDF ainda não existe, gera on-demand (cotação fechada antes
      // da feature, ou objeto deletado pelo lifecycle de 365d).
      const exists = await MinioStorage.exists(key);
      if (!exists) {
        const { buffer } = await PdfGenerationService.generateQuoteResultPdf({
          tenantId,
          quoteId,
        });
        await MinioStorage.uploadPdf(key, buffer);
      }

      const ttlSeconds = env.PDF_PRESIGN_TTL_DAYS * 24 * 60 * 60;
      const url = await MinioStorage.getPresignedUrl(key, ttlSeconds);

      // 302 com X-Filename pra Content-Disposition no consumidor (opcional).
      const filename = PdfGenerationService.buildFilename(quoteId);
      res.setHeader('X-Filename', filename);
      res.redirect(302, url);
    },
  );

  /**
   * POST /api/quotes/:id/pdf/resend
   *
   * Reenfileira o job de envio. Reusa o objeto MinIO existente (§14.8 —
   * NÃO regenera se já existe; só renova a presigned URL no job).
   * Rate limit 3/min/user (configurado em app.ts).
   */
  static resend = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const quoteId = req.params.id;
      const tenantId = req.user?.tenantId;
      if (!tenantId) throw createError.unauthorized('Tenant não identificado');

      await assertPermission(req, quoteId, tenantId);

      const quote = await prisma.quote.findFirst({
        where: { id: quoteId, tenantId },
        include: { producer: { select: { id: true, phone: true } } },
      });
      if (!quote) throw createError.notFound('Cotação não encontrada');
      if (quote.status !== 'CLOSED') {
        throw createError.badRequest('Só é possível reenviar PDF de cotações fechadas');
      }

      await enqueueQuotePdfJob({
        quoteId,
        tenantId,
        producerId: quote.producer.id,
        producerPhone: quote.producer.phone,
        resent: true,
      });

      logger.info('PDF resend requested', { quoteId, userId: req.user?.id });

      res.json({ success: true, message: 'Reenvio agendado' });
    },
  );
}

/**
 * §14.2 — Permission gate granular:
 *  - SUPER_ADMIN: passa direto
 *  - ADMIN do tenant: validateTenantOwnership já garantiu — passa
 *  - USER: precisa ser dono do Producer da cotação
 */
async function assertPermission(req: Request, quoteId: string, tenantId: string): Promise<void> {
  const user = req.user;
  if (!user) throw createError.unauthorized('Não autenticado');
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;

  // role === 'USER': verifica vínculo de Producer
  if (!user.producerId) {
    throw createError.forbidden('Usuário não está vinculado a um produtor');
  }

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    select: { producerId: true },
  });
  // Mesmo comportamento de validateTenantOwnership: 404 em vez de 403
  // pra não vazar existência da cotação (Cenário 5 da spec).
  if (!quote) throw createError.notFound('Cotação não encontrada');
  if (quote.producerId !== user.producerId) {
    throw createError.notFound('Cotação não encontrada');
  }
}
