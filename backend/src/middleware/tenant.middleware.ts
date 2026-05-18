import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createError } from '../utils/error-handler';

const prisma = new PrismaClient();

/**
 * Middleware que garante que o usuário tem um tenant associado
 * Deve ser usado APÓS o middleware authenticate
 */
export const requireTenant = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;

    // FEAT-008 (FF-BE-028): SUPER_ADMIN é cross-tenant — pode operar sem
    // tenant associado. ADMIN sem tenant também já era aceito (super-bypass
    // legado, antes de existir SUPER_ADMIN).
    if (!tenantId && (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN')) {
      return next();
    }

    // FEAT-008: SUPER_ADMIN COM tenant (operador que também usa o produto —
    // RN-11) ainda passa, mas o tenant precisa existir/estar ativo (queda
    // de volta para o caminho padrão abaixo).

    if (!tenantId) {
      throw createError.forbidden('Usuário não possui tenant associado');
    }

    // Verificar se o tenant está ativo
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, active: true },
    });

    if (!tenant) {
      throw createError.notFound('Tenant não encontrado');
    }

    if (!tenant.active) {
      throw createError.forbidden('Tenant inativo. Entre em contato com o suporte.');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware que valida se um recurso pertence ao tenant do usuário
 * Uso: validateTenantOwnership('producer', 'producerId')
 */
export const validateTenantOwnership = (
  model: 'producer' | 'supplier' | 'quote' | 'proposal' | 'subscription',
  paramName: string = 'id'
) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userTenantId = (req as any).user?.tenantId;
      const resourceId = req.params[paramName];

      if (!userTenantId) {
        throw createError.unauthorized('Tenant não identificado');
      }

      if (!resourceId) {
        throw createError.badRequest(`Parâmetro ${paramName} não fornecido`);
      }

      // @ts-ignore - Dynamic model access
      const resource = await prisma[model].findUnique({
        where: { id: resourceId },
        select: { tenantId: true },
      });

      if (!resource) {
        throw createError.notFound(`${model} não encontrado`);
      }

      // Fornecedores da rede (tenantId null) são acessíveis por todos
      if (model === 'supplier' && resource.tenantId === null) {
        next();
        return;
      }

      if (resource.tenantId !== userTenantId) {
        throw createError.forbidden('Você não tem permissão para acessar este recurso');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
