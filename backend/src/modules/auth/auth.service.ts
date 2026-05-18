import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { redis } from '../../config/redis';
import { AuthTokenService } from '../../services/auth-token.service';
import { emailService } from '../../services/email.service';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { analyticsService } from '../../services/analytics.service';
import { normalizePhoneBR } from '../../utils/phone';
import { validatePasswordStrength } from '../../utils/password-strength';
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from '../../utils/totp';

const REFRESH_SECRET = env.JWT_REFRESH_SECRET ?? `${env.JWT_SECRET}:refresh`;
const RESET_TOKEN_PREFIX = 'reset:';
const RESET_TOKEN_TTL = 3600; // 1 hora
const OTP_2FA_PREFIX = 'otp:2fa:';
const OTP_2FA_TTL = 300; // 5 minutos
const OTP_2FA_MAX_ATTEMPTS = 3;

interface LoginDTO {
  email: string;
  password: string;
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: string;
  jti: string; // ID único para blacklist
  // FEAT-008 (FF-BE-028): "força troca de senha" no primeiro login após
  // criação/reset pelo super admin. Middleware forcePasswordChange lê dessa
  // claim (evita query extra a cada request). Default false ou ausente
  // preserva tokens emitidos antes do schema novo.
  mustChangePassword?: boolean;
  // FEAT-008 (FF-BE-031): "pendingSetup" indica que o user (SUPER_ADMIN)
  // ainda não fez enrollment de 2FA. Token só vale para /auth/2fa/setup-*.
  // Middleware require2FAEnrolledForSuperAdmin lê dessa claim.
  pendingSetup?: boolean;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // ID do refresh token armazenado no Redis
  type: 'refresh';
}

/**
 * Converte string de duração (e.g. "15m", "90d") para segundos.
 */
function durationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w|y)$/);
  if (!match) return 900; // fallback 15min
  const value = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000,
  };
  return value * (multipliers[unit] || 60);
}

export class AuthService {
  /**
   * Faz login do usuário — retorna par de tokens (access + refresh)
   */
  static async login(data: LoginDTO) {
    const { email, password } = data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { permissions: true },
    });

    if (!user) {
      throw createError.unauthorized('E-mail ou senha inválidos');
    }

    if (!user.active) {
      throw createError.forbidden('Usuário inativo');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw createError.unauthorized('E-mail ou senha inválidos');
    }

    // FEAT-008 (FF-BE-031) — duas vias de 2FA:
    //   a) twoFactorSecret presente → TOTP (app autenticador). User pega o
    //      código no app; nada é enviado pelo backend.
    //   b) twoFactorEnabled sem secret → caminho legado WhatsApp OTP.
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      logger.info('TOTP challenge required', { userId: user.id });
      return {
        requires2FA: true as const,
        userId: user.id,
        method: 'TOTP' as const,
      };
    }

    if (user.twoFactorEnabled) {
      // Caminho legado — OTP via WhatsApp (não-SUPER_ADMIN com 2FA antigo)
      const producer = user.producerId
        ? await prisma.producer.findUnique({ where: { id: user.producerId }, select: { phone: true } })
        : null;

      if (!producer?.phone) {
        throw createError.badRequest('2FA habilitado mas nenhum telefone associado ao usuário');
      }

      await this.send2FA(user.id, producer.phone);
      logger.info('2FA OTP sent', { userId: user.id });

      return {
        requires2FA: true as const,
        userId: user.id,
        method: 'WHATSAPP_OTP' as const,
      };
    }

    // FEAT-008 (FF-BE-031) — SUPER_ADMIN sem 2FA é OBRIGADO a fazer enrollment
    // antes de qualquer outra ação (RN-06). O token emitido aqui carrega a
    // claim pendingSetup=true, que é aceita apenas em /auth/2fa/setup-*.
    // Tudo o mais retorna 403.
    if (user.role === 'SUPER_ADMIN') {
      const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
        mustChangePassword: user.mustChangePassword,
        pendingSetup: true,
      });
      logger.warn('SUPER_ADMIN login without 2FA — enrollment required', {
        userId: user.id,
      });
      return {
        requires2FASetup: true as const,
        userId: user.id,
        ...tokens,
      };
    }

    // Gerar par de tokens (FEAT-008: propaga mustChangePassword pro JWT)
    const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
      mustChangePassword: user.mustChangePassword,
    });

    logger.info('User logged in', { userId: user.id, email: user.email });
    analyticsService.trackEvent('user_login', { userId: user.id, email: user.email });

    const { password: _, ...userWithoutPassword } = user;

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }

  /**
   * Gera par access token (curto) + refresh token (longo).
   *
   * FEAT-008 (FF-BE-028): aceita mustChangePassword no opts — o middleware
   * forcePasswordChange (próximo PR) lê essa claim direto do JWT em vez de
   * consultar o banco a cada request. Quando o user troca a senha via
   * /api/auth/change-password, o controller emite um par de tokens NOVO
   * com a claim ausente/false.
   */
  static async generateTokenPair(
    userId: string,
    email: string,
    role: string,
    opts: { mustChangePassword?: boolean; pendingSetup?: boolean } = {},
  ) {
    const jti = AuthTokenService.generateTokenId();
    const tokenId = AuthTokenService.generateTokenId();

    // Access token (15min por padrão)
    const accessPayload: AccessTokenPayload = {
      userId,
      email,
      role,
      jti,
      ...(opts.mustChangePassword ? { mustChangePassword: true } : {}),
      ...(opts.pendingSetup ? { pendingSetup: true } : {}),
    };
    const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    // Refresh token (90 dias por padrão)
    const refreshPayload: RefreshTokenPayload = { userId, tokenId, type: 'refresh' };
    const refreshToken = jwt.sign(refreshPayload, REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
    });

    // Armazenar refresh token no Redis (falha silenciosa — login não deve quebrar se Redis cair)
    try {
      const refreshTtlSeconds = durationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
      await AuthTokenService.storeRefreshToken(userId, tokenId, refreshTtlSeconds);
    } catch (err) {
      logger.warn('Failed to store refresh token in Redis — login continues without refresh', {
        userId, error: String(err),
      });
    }

    return { accessToken, refreshToken };
  }

  /**
   * Renova access token usando refresh token válido.
   * Implementa rotação: o refresh token antigo é revogado e um novo é emitido.
   */
  static async refreshAccessToken(refreshTokenStr: string) {
    // Verificar e decodificar refresh token
    let payload: RefreshTokenPayload;
    try {
      payload = jwt.verify(refreshTokenStr, REFRESH_SECRET) as RefreshTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw createError.unauthorized('Refresh token expirado. Faça login novamente.');
      }
      throw createError.unauthorized('Refresh token inválido');
    }

    if (payload.type !== 'refresh') {
      throw createError.unauthorized('Token inválido — tipo incorreto');
    }

    // Verificar se refresh token existe no Redis (não foi revogado)
    const isValid = await AuthTokenService.validateRefreshToken(payload.userId, payload.tokenId);
    if (!isValid) {
      throw createError.unauthorized('Refresh token revogado. Faça login novamente.');
    }

    // Verificar se usuário ainda existe e está ativo
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, active: true, mustChangePassword: true },
    });

    if (!user || !user.active) {
      // Revogar refresh token se usuário não existe mais
      await AuthTokenService.revokeRefreshToken(payload.userId, payload.tokenId);
      throw createError.unauthorized('Usuário não encontrado ou inativo');
    }

    // Rotação: revogar refresh token antigo
    await AuthTokenService.revokeRefreshToken(payload.userId, payload.tokenId);

    // Gerar novo par de tokens (FEAT-008: re-emite com mustChangePassword
    // do banco — refresh é o momento natural pra atualizar a claim).
    const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
      mustChangePassword: user.mustChangePassword,
    });

    logger.info('Access token refreshed', { userId: user.id });

    return tokens;
  }

  /**
   * Logout: revoga refresh token + blacklista access token atual.
   */
  static async logout(
    accessToken: string,
    refreshTokenStr?: string,
  ): Promise<void> {
    // Blacklistar access token (tempo restante do JWT como TTL)
    try {
      const decoded = jwt.decode(accessToken) as AccessTokenPayload & { exp?: number };
      if (decoded?.jti && decoded?.exp) {
        const ttlSeconds = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
        await AuthTokenService.blacklistAccessToken(decoded.jti, ttlSeconds);
      }
    } catch {
      // Access token inválido — segue com revogação do refresh
    }

    // Revogar refresh token
    if (refreshTokenStr) {
      try {
        const refreshPayload = jwt.decode(refreshTokenStr) as RefreshTokenPayload;
        if (refreshPayload?.userId && refreshPayload?.tokenId) {
          await AuthTokenService.revokeRefreshToken(refreshPayload.userId, refreshPayload.tokenId);
        }
      } catch {
        // Refresh token inválido — já foi revogado ou expirou
      }
    }

    logger.info('User logged out');
  }

  /**
   * Verifica e decodifica um token JWT (access token)
   */
  static async verifyToken(token: string): Promise<AccessTokenPayload> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
      return decoded;
    } catch (error) {
      throw createError.unauthorized('Token inválido ou expirado');
    }
  }

  /**
   * Busca usuário com permissões
   */
  static async getUserWithPermissions(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user) {
      throw createError.notFound('Usuário não encontrado');
    }

    if (!user.active) {
      throw createError.forbidden('Usuário inativo');
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Altera senha do usuário — revoga todos os refresh tokens existentes.
   *
   * FEAT-008 (FF-BE-030): aplica força mínima compartilhada e zera o
   * mustChangePassword. Emite um par de tokens NOVO já sem a claim para
   * o frontend desbloquear o acesso imediatamente após a troca (Cenário 4).
   *
   * Retorna o par de tokens. O caller (controller) repassa ao cliente.
   */
  static async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw createError.notFound('Usuário não encontrado');
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw createError.unauthorized('Senha atual inválida');
    }

    // RN-01b/05 — mesma regra do super admin (custom) e do change-password.
    // Não inflar tickets de senha fraca: o validador retorna o motivo
    // específico que o cliente pode ler no frontend.
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      throw createError.badRequest(strength.reason ?? 'Senha não atende força mínima');
    }

    // RN-05: nova senha não pode ser igual à anterior (especialmente
    // relevante para o caso "trocar a temp pela mesma temp por engano").
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      throw createError.badRequest('A nova senha deve ser diferente da atual');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    // Revogar todos os refresh tokens ao trocar senha
    await AuthTokenService.revokeAllRefreshTokens(userId);

    // Emitir par NOVO já sem a claim mustChangePassword (Cenário 4 da spec)
    const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
      mustChangePassword: false,
    });

    logger.info('User password changed — all refresh tokens revoked', { userId });

    return tokens;
  }

  /**
   * Verifica se usuário tem permissão para uma ação
   */
  static async checkPermission(
    userId: string,
    resource: string,
    action: 'view' | 'create' | 'edit' | 'delete'
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        permissions: {
          where: { resource: resource as any },
        },
      },
    });

    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const permission = user.permissions[0];
    if (!permission) return false;

    switch (action) {
      case 'view': return permission.canView;
      case 'create': return permission.canCreate;
      case 'edit': return permission.canEdit;
      case 'delete': return permission.canDelete;
      default: return false;
    }
  }

  /**
   * Gera token de reset de senha e envia e-mail.
   * Retorna mensagem genérica independente de o e-mail existir (previne enumeração).
   */
  static async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, name: true, email: true, active: true },
    });

    // Resposta genérica — não revelar se e-mail existe
    if (!user || !user.active) {
      logger.info('Password reset requested for unknown/inactive email', { email });
      return;
    }

    // Gerar token seguro
    const resetToken = crypto.randomBytes(32).toString('hex');
    const key = `${RESET_TOKEN_PREFIX}${resetToken}`;

    // Armazenar no Redis com TTL de 1 hora
    await redis.setex(key, RESET_TOKEN_TTL, JSON.stringify({
      userId: user.id,
      email: user.email,
      used: false,
    }));

    // Montar URL de reset
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Enviar e-mail
    await emailService.sendPasswordResetEmail(user.email, user.name, resetUrl);

    logger.info('Password reset email sent', { userId: user.id, email: user.email });
  }

  /**
   * Gera OTP de 6 dígitos, armazena no Redis e envia via WhatsApp.
   */
  static async send2FA(userId: string, phone: string): Promise<void> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const key = `${OTP_2FA_PREFIX}${userId}`;

    await redis.setex(key, OTP_2FA_TTL, JSON.stringify({ otp, attempts: 0 }));

    await whatsappService.sendMessage({
      to: phone,
      body: `Seu código de verificação CotaObra: *${otp}*\n\nVálido por 5 minutos. Não compartilhe este código.`,
    });

    logger.info('2FA OTP generated and sent', { userId });
  }

  /**
   * Valida OTP do 2FA. Máximo 3 tentativas. Retorna par de tokens em caso de sucesso.
   */
  static async verify2FA(userId: string, otp: string) {
    // FEAT-008 (FF-BE-031): se o user tem twoFactorSecret, usa TOTP.
    // Senão, cai no caminho legado (WhatsApp OTP via Redis).
    const totpUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        mustChangePassword: true,
      },
    });

    if (!totpUser || !totpUser.active) {
      throw createError.unauthorized('Usuário não encontrado ou inativo');
    }

    if (totpUser.twoFactorSecret) {
      // Caminho TOTP — valida contra o secret do user.
      if (!verifyTotp(totpUser.twoFactorSecret, otp)) {
        throw createError.unauthorized('Código TOTP inválido');
      }

      const tokens = await this.generateTokenPair(
        totpUser.id,
        totpUser.email,
        totpUser.role,
        { mustChangePassword: totpUser.mustChangePassword },
      );
      logger.info('TOTP verified successfully', { userId });
      const { twoFactorSecret: _t, ...userWithoutSecret } = totpUser;
      return { ...tokens, user: userWithoutSecret };
    }

    // Caminho legado — OTP via WhatsApp (Redis)
    const key = `${OTP_2FA_PREFIX}${userId}`;
    const data = await redis.get(key);

    if (!data) {
      throw createError.badRequest('Código expirado ou inválido. Faça login novamente.');
    }

    const payload = JSON.parse(data) as { otp: string; attempts: number };

    // Verificar tentativas
    if (payload.attempts >= OTP_2FA_MAX_ATTEMPTS) {
      await redis.del(key);
      throw createError.badRequest('Número máximo de tentativas excedido. Faça login novamente.');
    }

    // Verificar OTP
    if (payload.otp !== otp) {
      // Incrementar tentativas
      payload.attempts += 1;
      const ttl = await redis.ttl(key);
      if (ttl > 0) {
        await redis.setex(key, ttl, JSON.stringify(payload));
      }
      const remaining = OTP_2FA_MAX_ATTEMPTS - payload.attempts;
      throw createError.unauthorized(
        `Código incorreto. ${remaining} tentativa(s) restante(s).`
      );
    }

    // OTP válido — remover do Redis
    await redis.del(key);

    // Buscar usuário para gerar tokens
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || !user.active) {
      throw createError.unauthorized('Usuário não encontrado ou inativo');
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
      mustChangePassword: user.mustChangePassword,
    });

    logger.info('2FA verified successfully', { userId });

    const { password: _, ...userWithoutPassword } = user;

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }

  /**
   * Cadastro de novo usuário — cria tenant, producer, user e subscription (pending_payment)
   */
  static async signup(data: { name: string; email: string; phone: string; password: string; region?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw createError.conflict('E-mail já cadastrado');

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.email.split('@')[0] + '-' + Date.now(),
          email: data.email.toLowerCase(),
        },
      });

      const producer = await tx.producer.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          phone: normalizePhoneBR(data.phone),
          cpfCnpj: '',
          city: data.region || '',
          region: data.region || '',
        },
      });

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email.toLowerCase(),
          password: hashedPassword,
          role: 'ADMIN',
          tenantId: tenant.id,
          producerId: producer.id,
        },
      });

      // Subscription criada como inativa (pending_payment)
      // Será ativada após confirmação do pagamento
      const subscriptionEnd = new Date();
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 30); // 30 dias (garantia de reembolso)
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          producerId: producer.id,
          plan: 'BASIC',
          quotesLimit: 20,
          startDate: new Date(),
          endDate: subscriptionEnd,
          active: false, // pending_payment — ativada após pagamento
        },
      });

      await tx.conversationState.create({
        data: {
          tenantId: tenant.id,
          producerId: producer.id,
          step: 'IDLE',
          context: {},
        },
      });

      return { user, tenant };
    });

    logger.info('New signup', { userId: result.user.id, tenantId: result.tenant.id });
    return { userId: result.user.id, email: data.email };
  }

  /**
   * Valida token de reset e atualiza a senha.
   * Token é single-use: invalidado após uso.
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const key = `${RESET_TOKEN_PREFIX}${token}`;

    // Buscar token no Redis
    const data = await redis.get(key);
    if (!data) {
      throw createError.badRequest('Token inválido ou expirado');
    }

    const payload = JSON.parse(data) as { userId: string; email: string; used: boolean };

    // Verificar se já foi usado
    if (payload.used) {
      throw createError.badRequest('Este link já foi utilizado. Solicite um novo.');
    }

    // Verificar se usuário existe
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, active: true },
    });

    if (!user || !user.active) {
      throw createError.badRequest('Usuário não encontrado ou inativo');
    }

    // Atualizar senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Marcar token como usado e reduzir TTL para limpeza rápida
    await redis.setex(key, 60, JSON.stringify({ ...payload, used: true }));

    // Revogar todos os refresh tokens (forçar re-login)
    await AuthTokenService.revokeAllRefreshTokens(user.id);

    logger.info('Password reset completed', { userId: user.id });
  }

  // ===================================================================
  // FEAT-008 (FF-BE-031) — TOTP enrollment / disable
  // ===================================================================

  /**
   * Inicia o enrollment TOTP: gera um secret e a URL otpauth. NÃO persiste
   * o secret ainda — o cliente deve devolvê-lo em /auth/2fa/setup-confirm
   * junto com um OTP válido (prova que o app autenticador foi configurado).
   *
   * Decisão: secret no client durante o setup. Reduz estado intermediário
   * no backend (sem Redis pra TTL de "setup pendente") e dá ao cliente
   * controle pra refazer o QR se errar o scan.
   */
  static async startTotpSetup(userId: string): Promise<{
    secret: string;
    otpauthUrl: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    if (!user) throw createError.notFound('Usuário não encontrado');

    // Se já tem 2FA ativo, exigir disable primeiro evita confusão.
    if (user.twoFactorEnabled) {
      throw createError.badRequest(
        '2FA já está ativo. Use /auth/2fa/disable antes de re-enrollar.',
      );
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    return { secret, otpauthUrl };
  }

  /**
   * Conclui o enrollment: cliente envia o secret recebido + OTP que o app
   * autenticador está exibindo. Se o OTP bate, persistimos o secret e
   * marcamos twoFactorEnabled=true. Emite par novo de tokens já SEM a
   * claim pendingSetup (libera acesso a /api/admin/*).
   */
  static async confirmTotpSetup(
    userId: string,
    secret: string,
    otp: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!verifyTotp(secret, otp)) {
      throw createError.unauthorized('Código TOTP inválido — verifique o app autenticador');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, mustChangePassword: true, twoFactorEnabled: true },
    });
    if (!user) throw createError.notFound('Usuário não encontrado');
    if (user.twoFactorEnabled) {
      throw createError.badRequest('2FA já está ativo');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: true,
      },
    });

    // Re-emite tokens SEM a claim pendingSetup → libera acesso normal.
    // Mantém mustChangePassword se ainda for o caso (RN: senha primeiro,
    // 2FA depois, depois acesso normal — em ordem encadeada).
    const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
      mustChangePassword: user.mustChangePassword,
    });

    logger.info('TOTP enrolled', { userId: user.id, role: user.role });
    return tokens;
  }

  /**
   * Desativa 2FA. Exige OTP atual (prova de posse). Não exigimos senha
   * adicional aqui porque a rota só é alcançada com user autenticado.
   *
   * SUPER_ADMIN é OBRIGADO a ter 2FA (RN-06). Quando desativa, o middleware
   * require2FAEnrolledForSuperAdmin volta a bloquear /api/admin/* até
   * fazer enrollment de novo.
   */
  static async disableTotp(userId: string, otp: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user) throw createError.notFound('Usuário não encontrado');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw createError.badRequest('2FA não está ativo');
    }

    if (!verifyTotp(user.twoFactorSecret, otp)) {
      throw createError.unauthorized('Código TOTP inválido');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    logger.info('TOTP disabled', { userId: user.id });
  }
}
