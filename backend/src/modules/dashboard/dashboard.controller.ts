import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { ErrorHandler } from '../../utils/error-handler';

export class DashboardController {
  /**
   * GET /api/dashboard/stats
   */
  static getStats = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId!;
    const stats = await DashboardService.getStats(tenantId);

    res.json({
      success: true,
      data: stats,
    });
  });

  /**
   * GET /api/dashboard/quotes-by-day
   */
  static getQuotesByDay = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId!;
    const days = req.query.days ? parseInt(req.query.days as string) : 30;

    const data = await DashboardService.getQuotesByDay(tenantId, days);

    res.json({
      success: true,
      data,
    });
  });

  /**
   * GET /api/dashboard/top-products
   */
  static getTopProducts = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId!;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;

    const data = await DashboardService.getTopProducts(tenantId, limit);

    res.json({
      success: true,
      data,
    });
  });

  /**
   * GET /api/dashboard
   */
  static getDashboard = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId!;
    const data = await DashboardService.getDashboardData(tenantId);

    res.json({
      success: true,
      data,
    });
  });
}
