import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { OnboardingService } from '../../services/onboarding.service';
import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';

export class OnboardingController {
  /**
   * GET /api/onboarding/progress
   * Retorna progresso de onboarding do produtor vinculado ao usuário logado
   */
  static getProgress = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { producerId: true },
      });

      if (!user?.producerId) {
        throw createError.badRequest('Usuário não vinculado a um produtor');
      }

      const progress = await OnboardingService.getProgress(user.producerId);

      res.json({
        success: true,
        data: progress,
      });
    }
  );
}
