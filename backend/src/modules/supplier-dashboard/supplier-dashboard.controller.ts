import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { ProposalTokenService } from '../../services/proposal-token.service';
import { SupplierDashboardService } from './supplier-dashboard.service';

export class SupplierDashboardController {
  /**
   * GET /api/supplier-dashboard/:token
   * Endpoint público que usa token de proposta para autenticar o fornecedor
   * e retornar suas métricas consolidadas.
   */
  static getMetrics = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { token } = req.params;

      // Validar token para obter supplierId
      let tokenData;
      try {
        tokenData = await ProposalTokenService.validate(token);
      } catch (error: any) {
        // Mesmo com token expirado/usado, tentamos extrair o supplierId
        // para dashboards de consulta
        const record = await (await import('../../config/database')).prisma.proposalToken.findUnique({
          where: { token },
          select: { supplierId: true },
        });

        if (!record) {
          res.status(404).json({
            success: false,
            error: { message: 'Token inválido' },
          });
          return;
        }

        const metrics = await SupplierDashboardService.getMetrics(
          record.supplierId,
        );
        res.json({ success: true, data: metrics });
        return;
      }

      const metrics = await SupplierDashboardService.getMetrics(
        tokenData.supplierId,
      );
      res.json({ success: true, data: metrics });
    },
  );
}
