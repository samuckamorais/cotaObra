import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { createError } from '../utils/error-handler';
import { prisma } from '../config/database';
import { AuthTokenService } from '../services/auth-token.service';
import { forcePasswordChange } from './force-password-change.middleware';

// Estender interface Request para incluir userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userPhone?: string;
      user?: {
        id: string;
        email: string;
        // FEAT-008 (FF-BE-027): SUPER_ADMIN é cross-tenant. ADMIN/USER são
        // por-tenant. CO-0-04 adicionou BUYER/REQUESTER/APPROVER (CotaObra).
        // O middleware requireSuperAdmin valida o role explicitamente;
        // aqui só ampliamos o tipo para casar com o enum UserRole do Prisma.
        role:
          | 'SUPER_ADMIN'
          | 'ADMIN'
          | 'BUYER'
          | 'REQUESTER'
          | 'APPROVER'
          | 'USER';
        tenantId?: string;
        // FF-BE-023: producerId define se o user é um produtor (vínculo 1:1)
        // ou um operador/admin (null). CO-0-05: supplier listing não filtra
        // mais por ProducerSupplier (removido); fornecedores são por tenantId.
        producerId?: string | null;
        // FEAT-008 (FF-BE-027): "força troca de senha" no primeiro login após
        // criação/reset pelo super admin. Vai ser usado pelo middleware
        // forcePasswordChange (próximo checkpoint) para bloquear endpoints
        // diferentes de /auth/change-password, /auth/logout e /auth/me.
        mustChangePassword?: boolean;
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  phone?: string;
  email?: string;
  role?: string;
  jti?: string;
  // FEAT-008 (FF-BE-028): claim para força de troca de senha. Default
  // ausente preserva tokens antigos.
  mustChangePassword?: boolean;
}

/**
 * Middleware de autenticação JWT
 * Verifica blacklist em Redis antes de aceitar token.
 * Verifica token no header Authorization: Bearer <token>
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extrair token do header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError.unauthorized('Token não fornecido');
    }

    const token = authHeader.substring(7);

    // 1. Verificar blacklist ANTES de jwt.verify (evita trabalho desnecessário)
    //    Decodifica sem verificar assinatura só para extrair jti
    const preDecoded = jwt.decode(token) as JwtPayload | null;
    if (preDecoded?.jti) {
      const isBlacklisted = await AuthTokenService.isBlacklisted(preDecoded.jti);
      if (isBlacklisted) {
        throw createError.unauthorized('Token revogado');
      }
    }

    // 2. Verificar assinatura e expiração
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw createError.unauthorized('Token expirado');
      }
      throw createError.unauthorized('Token inválido');
    }

    // 3. Verificar se usuário ainda existe
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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

    // Adicionar informações ao request
    req.userId = decoded.userId;
    req.userPhone = decoded.phone;
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
      producerId: user.producerId,
      // FEAT-008: claim do JWT (não do banco — evita query extra a cada
      // request). Atualizada quando o user troca a senha, faz refresh ou
      // o super admin reseta.
      mustChangePassword: decoded.mustChangePassword === true,
    };

    // FEAT-008 (FF-BE-028) — Guard de "força troca de senha" embutido aqui
    // para garantir que toda rota autenticada herde a proteção sem ter que
    // ser adicionado em cada chamada de rota (risco crítico 2 da spec).
    // O middleware é idempotente: passa direto se mustChangePassword=false
    // ou path estiver na whitelist.
    return forcePasswordChange(req, _res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware opcional de autenticação
 * Não retorna erro se token não for fornecido
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      // Verificar blacklist
      const preDecoded = jwt.decode(token) as JwtPayload | null;
      if (preDecoded?.jti) {
        const isBlacklisted = await AuthTokenService.isBlacklisted(preDecoded.jti);
        if (isBlacklisted) return next(); // token revogado — tratar como não autenticado
      }

      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.userId = decoded.userId;
      req.userPhone = decoded.phone;
    } catch {
      // Ignora erros de token em auth opcional
    }

    next();
  } catch (error) {
    next(error);
  }
};
