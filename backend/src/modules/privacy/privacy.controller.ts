import { Request, Response } from 'express';
import { PrivacyService } from './privacy.service';
import { ErrorHandler } from '../../utils/error-handler';
import { z } from 'zod';

const entityTypeSchema = z.enum(['producer', 'supplier']);

export class PrivacyController {
  /**
   * GET /api/privacy/export/:id?type=producer|supplier
   * Exporta todos os dados de uma entidade (LGPD - direito de portabilidade)
   */
  static exportData = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const entityType = entityTypeSchema.parse(req.query.type);

    const result = await PrivacyService.exportData(id, entityType);

    res.json({
      success: true,
      data: result,
    });
  });

  /**
   * DELETE /api/privacy/forget/:id?type=producer|supplier
   * Anonimiza dados pessoais (LGPD - direito ao esquecimento)
   */
  static forgetData = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const entityType = entityTypeSchema.parse(req.query.type);

    const result = await PrivacyService.forgetData(id, entityType);

    res.json({
      success: true,
      data: result,
    });
  });
}
