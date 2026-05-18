import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

/**
 * FEAT-008 (FF-BE-031) — Guard que exige SUPER_ADMIN ter 2FA TOTP ativo.
 *
 * Aplicado em todas as rotas /api/admin/* (depois de requireSuperAdmin).
 * Se o user é SUPER_ADMIN e ainda não tem twoFactorEnabled=true,
 * responde 403 com header X-Require-2FA-Setup=true — o frontend redireciona
 * para /admin/2fa-setup (Cenário 8 da spec).
 *
 * Lê do banco (uma query extra por request /admin/*), em vez do JWT. Razão:
 *   - Garante que após enrollment não precisa esperar refresh do token
 *   - O custo extra é baixo (rota /admin/* tem volume baixo + cache do Prisma)
 *
 * NÃO aplicar a non-SUPER_ADMIN: ADMIN comum NÃO é forçado a 2FA.
 */
export const require2FAEnrolledForSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      // Não autenticado — outro middleware já barra; aqui só passa.
      return next();
    }

    if (user.role !== 'SUPER_ADMIN') {
      // ADMIN/USER não são forçados a 2FA (decisão do PO + spec Cenário 8).
      return next();
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });

    if (!dbUser?.twoFactorEnabled) {
      res.setHeader('X-Require-2FA-Setup', 'true');
      res.status(403).json({
        success: false,
        error: {
          code: 'REQUIRE_2FA_SETUP',
          message: 'Super administrador precisa configurar 2FA antes de acessar o painel admin.',
        },
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
