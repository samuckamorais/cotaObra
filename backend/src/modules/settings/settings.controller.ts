import { Request, Response } from 'express';
import { z } from 'zod';
import { TenantSettingsService } from '../../services/tenant-settings.service';
import { ErrorHandler, createError } from '../../utils/error-handler';

const updateSettingsSchema = z.object({
  proposalLinkExpiryHours: z.number().int().min(1).max(168).optional(), // 1h a 7 dias
  quoteDeadlineDays: z.number().int().min(1).max(30).optional(),
  defaultSupplierScope: z.enum(['MINE', 'NETWORK', 'ALL']).optional(),
  maxItemsPerQuote: z.number().int().min(1).max(20).optional(),
  winnerNotificationType: z
    .enum(['SELECTED', 'PRODUCER_WILL_CONTACT', 'NONE'])
    .optional(),
  quoteExpiryHours: z.number().int().min(1).max(720).optional(), // 1h a 30 dias
  // CO-6-05: teto de aprovação (null = desabilita workflow)
  approvalThreshold: z.number().min(0).max(99_999_999.99).nullable().optional(),
});

export class SettingsController {
  /**
   * GET /api/settings
   * Retorna as configurações do tenant do usuário logado.
   * (CO-0-04: settings agora são por tenant, não por produtor — todos os usuários
   *  da mesma construtora compartilham.)
   */
  static get = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = SettingsController.resolveTenantId(req);
      const settings = await TenantSettingsService.getOrCreate(tenantId);
      res.json({ success: true, data: settings });
    },
  );

  /**
   * PUT /api/settings
   * Atualiza as configurações do tenant do usuário logado.
   * Requer role ADMIN do tenant (RBAC) — middleware deve validar antes.
   */
  static update = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = SettingsController.resolveTenantId(req);

      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            details: parsed.error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }

      const settings = await TenantSettingsService.update(tenantId, parsed.data);
      res.json({ success: true, data: settings });
    },
  );

  /**
   * Resolve o tenantId do usuário logado. Sempre disponível via auth middleware.
   */
  private static resolveTenantId(req: Request): string {
    const user = req.user!;
    if (!user.tenantId) {
      throw createError.forbidden('Usuário não está vinculado a um tenant');
    }
    return user.tenantId;
  }
}
