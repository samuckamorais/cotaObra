import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { Resource, UserRole } from '@prisma/client';
import { createError } from '../utils/error-handler';

type PermissionAction = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

/**
 * Middleware RBAC genérico
 * Verifica se o usuário tem permissão para acessar um recurso com uma ação específica
 */
export const requirePermission = (resource: Resource, action: PermissionAction) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        throw createError.unauthorized('Não autenticado');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: { permissions: { where: { resource } } },
      });

      if (!user) {
        throw createError.unauthorized('Usuário não encontrado');
      }

      if (!user.active) {
        throw createError.unauthorized('Usuário inativo');
      }

      // ADMIN e SUPER_ADMIN (FEAT-008) têm acesso total
      if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        // Adicionar informações do usuário ao request
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId || undefined,
          producerId: user.producerId,
        };
        next();
        return;
      }

      // Verificar permissão específica
      const permission = user.permissions[0];
      if (!permission || !permission[action]) {
        throw createError.forbidden('Sem permissão para esta ação');
      }

      // Adicionar informações do usuário ao request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || undefined,
        producerId: user.producerId,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware que exige role ADMIN
 * Usado para rotas administrativas sensíveis.
 *
 * FEAT-008 (FF-BE-028): SUPER_ADMIN também passa neste guard — qualquer
 * coisa que ADMIN pode fazer, super admin também pode (super-bypass).
 */
export const requireAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw createError.unauthorized('Não autenticado');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        tenantId: true,
        producerId: true,
      },
    });

    if (!user) {
      throw createError.unauthorized('Usuário não encontrado');
    }

    if (!user.active) {
      throw createError.unauthorized('Usuário inativo');
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw createError.forbidden('Acesso restrito a administradores');
    }

    // Adicionar informações do usuário ao request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
      producerId: user.producerId,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * FEAT-008 (FF-BE-028) — Middleware que exige role SUPER_ADMIN.
 *
 * Usado em rotas /api/admin/* cross-tenant. ADMIN comum recebe 403
 * (Cenário 7 da spec). Diferente de requireAdmin, NÃO aceita ADMIN.
 *
 * NÃO usa requireAdmin + checagem extra porque a UX da resposta precisa
 * ser específica: ADMIN tentando rota de super admin deve ver "restrito a
 * super admins", não "restrito a admins" (que daria a impressão errada).
 */
export const requireSuperAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      throw createError.unauthorized('Não autenticado');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        tenantId: true,
        producerId: true,
      },
    });

    if (!user) {
      throw createError.unauthorized('Usuário não encontrado');
    }

    if (!user.active) {
      throw createError.unauthorized('Usuário inativo');
    }

    if (user.role !== UserRole.SUPER_ADMIN) {
      throw createError.forbidden('Acesso restrito a super administradores');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
      producerId: user.producerId,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para WhatsApp Config
 * Requer ADMIN OU permissão específica de WHATSAPP_CONFIG
 */
export const requireWhatsAppConfigAccess = (action: PermissionAction) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        throw createError.unauthorized('Não autenticado');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: {
          permissions: {
            where: { resource: Resource.WHATSAPP_CONFIG },
          },
        },
      });

      if (!user) {
        throw createError.unauthorized('Usuário não encontrado');
      }

      if (!user.active) {
        throw createError.unauthorized('Usuário inativo');
      }

      // ADMIN e SUPER_ADMIN (FEAT-008) têm acesso total
      if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId || undefined,
          producerId: user.producerId,
        };
        next();
        return;
      }

      // Verificar permissão específica de WhatsApp Config
      const permission = user.permissions[0];
      if (!permission || !permission[action]) {
        throw createError.forbidden(
          'Sem permissão para configurar WhatsApp. Entre em contato com o administrador.'
        );
      }

      // Adicionar informações do usuário ao request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || undefined,
        producerId: user.producerId,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};
