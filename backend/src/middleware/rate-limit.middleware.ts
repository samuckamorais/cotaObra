import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { createError } from '../utils/error-handler';
import { logger } from '../utils/logger';

/**
 * Rate limiter customizado baseado em número de telefone
 * Armazena contadores no Redis com TTL de 1 minuto
 */
export const rateLimitByPhone = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const phone = req.body.from || req.body.phone;

    if (!phone) {
      // Se não houver telefone, pula rate limiting
      return next();
    }

    const key = `rate_limit:${phone}`;
    const limit = env.MAX_MESSAGES_PER_PHONE_PER_MINUTE;

    // Incrementa contador
    const count = await redis.incr(key);

    // Define TTL na primeira requisição
    if (count === 1) {
      await redis.expire(key, 60); // 60 segundos
    }

    // Verifica se excedeu limite
    if (count > limit) {
      logger.warn(`Rate limit exceeded for phone ${phone}`, {
        phone,
        count,
        limit,
      });

      throw createError.badRequest(
        `Limite de ${limit} mensagens por minuto excedido. Aguarde alguns instantes.`
      );
    }

    // Adiciona headers de rate limit
    const ttl = await redis.ttl(key);
    _res.setHeader('X-RateLimit-Limit', limit);
    _res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    _res.setHeader('X-RateLimit-Reset', Date.now() + ttl * 1000);

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rate limiter global por IP (Express-rate-limit padrão)
 */
import rateLimit from 'express-rate-limit';

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: env.RATE_LIMIT_GLOBAL, // limite por IP (padrão 100)
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas requisições deste IP. Tente novamente mais tarde.',
    },
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Rate limiter para forgot-password: 3 solicitações por email a cada hora.
 * Usa Redis para rastrear por e-mail (não por IP), evitando abuso por e-mail.
 */
export const forgotPasswordRateLimit = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const email = req.body?.email?.toLowerCase();
    if (!email) return next();

    const key = `rate_limit:forgot_pwd:${email}`;
    const limit = 3;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 3600); // 1 hora
    }

    if (count > limit) {
      logger.warn('Forgot password rate limit exceeded', { email, count });
      throw createError.badRequest(
        'Muitas solicitações de recuperação de senha. Tente novamente em 1 hora.'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rate limiter de login (anti-bruteforce, por IP) — só conta tentativas
 * que FALHARAM. Login bem-sucedido não consome o budget — assim usuários
 * legítimos que erram a senha e depois acertam não ficam presos. Defesa
 * primária contra varredura de credenciais de um IP malicioso.
 *
 * Janela: 15 min. Limite: env.RATE_LIMIT_AUTH (padrão 10).
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_AUTH,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Login OK não consome budget — só erros (4xx/5xx). Resolve UX em que
  // tentativas erradas em um e-mail bloqueiam o login correto de outro
  // usuário do mesmo IP (ex: shared NAT do escritório).
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter de login POR E-MAIL (anti-bruteforce focado, em Redis).
 *
 * AUD-03 (CO-0-10): chave inclui IP + tenantSlug + email para impedir que um
 * atacante bloqueie a conta de admin@x.com num tenant ao tentar login com o
 * mesmo email em outro tenant (situação válida em multi-tenant compartilhado).
 *
 * Cobre o cenário de atacante distribuído (múltiplos IPs no mesmo email).
 *
 * Janela: 15 min. Limite: 8 falhas por (ip, tenant, email).
 * Idempotente em SUCESSO: o post-handler do controller limpa a chave
 * quando o login dá certo (TODO opcional — por enquanto só monitora).
 */
export const loginRateLimitByEmail = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const email = (req.body?.email || '').toString().toLowerCase().trim();
    if (!email) return next();

    // AUD-03: compõe a chave com IP + tenantSlug + email.
    // tenantSlug pode vir no body (login form), num header (X-Tenant-Slug),
    // ou no subdomínio. Se nenhum dos três, usa 'unknown' (ainda válido).
    const ip = (req.ip ?? req.socket.remoteAddress ?? 'noip').toString();
    const tenantSlug =
      (req.body?.tenantSlug as string | undefined) ??
      (req.headers['x-tenant-slug'] as string | undefined) ??
      'unknown';

    const key = `rate_limit:login:${ip}:${tenantSlug}:${email}`;
    const limit = 8;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 15 * 60); // 15 min
    }

    if (count > limit) {
      logger.warn('login rate limit per (ip, tenant, email) exceeded', {
        ip,
        tenantSlug,
        email,
        count,
      });
      throw createError.badRequest(
        'Muitas tentativas para este e-mail. Aguarde 15 minutos.',
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rate limiter para rotas públicas (formulários de proposta/cotação): por IP, 1 minuto.
 */
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: env.RATE_LIMIT_PUBLIC, // requisições por IP (padrão 10)
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas requisições. Tente novamente em instantes.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * FEAT-PDF-001 — Rate limiter para POST /api/quotes/:id/pdf/resend.
 * 3 reenvios por minuto POR USER. Chave: req.userId.
 */
export const pdfResendRateLimit = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) return next();

    const key = `rate_limit:pdf_resend:${userId}`;
    const limit = 3;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60);
    }
    if (count > limit) {
      logger.warn('PDF resend rate limit exceeded', { userId, count });
      throw createError.badRequest(
        'Muitos reenvios. Aguarde 1 minuto antes de tentar novamente.',
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};
