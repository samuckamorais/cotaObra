import { Request, Response, NextFunction } from 'express';

/**
 * FEAT-008 (FF-BE-028) — Middleware que exige campo `reason` no body.
 *
 * RN-08: ações sensíveis do SUPER_ADMIN exigem motivo (>= 10 chars).
 * Lista de ações sensíveis (da spec): deactivate tenant/user, reset
 * password, promote to SUPER_ADMIN, view tenant data.
 *
 * Uso típico:
 *   apiRouter.post(
 *     '/admin/tenants/:id/deactivate',
 *     requireSuperAdmin,
 *     withReason(),
 *     AdminTenantController.deactivate,
 *   );
 *
 * Retorna 400 se reason vazio, não-string ou < 10 chars (após trim).
 */

export const REASON_MIN_LENGTH = 10;

export function withReason(minLength: number = REASON_MIN_LENGTH) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = (req.body ?? {}).reason;
    const reason = typeof raw === 'string' ? raw.trim() : '';

    if (!reason || reason.length < minLength) {
      res.status(400).json({
        success: false,
        error: {
          code: 'REASON_REQUIRED',
          message: `Motivo obrigatório para esta ação (mínimo ${minLength} caracteres).`,
        },
      });
      return;
    }

    // Normaliza para os controllers consumirem sem checar trim de novo.
    req.body.reason = reason;
    next();
  };
}
