import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { ReferralService } from '../../services/referral.service';
import { prisma } from '../../config/database';

export class ReferralController {
  /**
   * GET /api/referral/stats
   * Retorna estatísticas de referral do produtor vinculado ao usuário logado.
   */
  static getStats = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: userId } = (req as any).user;

    // Buscar o produtor vinculado ao usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { producerId: true },
    });

    if (!user?.producerId) {
      res.status(400).json({
        success: false,
        error: { message: 'Usuário não possui produtor vinculado' },
      });
      return;
    }

    const stats = await ReferralService.getStats(user.producerId);
    res.json({ success: true, data: stats });
  });

  /**
   * POST /api/referral/create
   * Cria um novo convite de referral.
   * Body: { referredEmail: string }
   */
  static create = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id: userId } = (req as any).user;
    const { referredEmail } = req.body;

    if (!referredEmail) {
      res.status(400).json({
        success: false,
        error: { message: 'Email do indicado é obrigatório' },
      });
      return;
    }

    // Buscar o produtor vinculado ao usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { producerId: true },
    });

    if (!user?.producerId) {
      res.status(400).json({
        success: false,
        error: { message: 'Usuário não possui produtor vinculado' },
      });
      return;
    }

    const referral = await ReferralService.createReferral(user.producerId, referredEmail);
    res.status(201).json({ success: true, data: referral });
  });
}
