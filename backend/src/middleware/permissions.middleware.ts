import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { Resource } from '@prisma/client';
import { createError } from '../utils/error-handler';

type PermissionAction = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

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

      // ADMIN tem acesso total
      if (user.role === 'ADMIN') {
        next();
        return;
      }

      const permission = user.permissions[0];
      if (!permission || !permission[action]) {
        throw createError.forbidden('Sem permissão para esta ação');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
