import { Request, Response } from 'express';
import { ErrorHandler, createError } from '../../utils/error-handler';
import { OnboardingService } from '../../services/onboarding.service';

export class OnboardingController {
  /**
   * GET /api/onboarding/progress
   * CO-7-05 — checklist de onboarding por tenant (CotaObra).
   */
  static getProgress = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) {
        throw createError.badRequest('Usuário não vinculado a um tenant');
      }
      const progress = await OnboardingService.getProgress(tenantId);
      res.json({ success: true, data: progress });
    },
  );
}
