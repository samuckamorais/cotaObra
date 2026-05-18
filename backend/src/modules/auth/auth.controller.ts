import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ErrorHandler } from '../../utils/error-handler';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Senha atual é obrigatória'),
  // FEAT-008 (FF-BE-030): validação detalhada de força é feita no service
  // (validatePasswordStrength). Aqui só o mínimo "não-vazio" para evitar
  // chegar ao service com lixo. Mensagem amigável vem da service.
  newPassword: z.string().min(1, 'Nova senha é obrigatória'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  newPassword: z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres'),
});

const verify2faSchema = z.object({
  userId: z.string().min(1, 'userId é obrigatório'),
  otp: z.string().length(6, 'OTP deve ter 6 dígitos'),
});

// FEAT-008 (FF-BE-030): signupSchema removido junto com o endpoint
// /api/auth/signup (vira 410 Gone). Cadastro agora é exclusivamente
// via /api/admin/users (super admin).

export class AuthController {
  /**
   * POST /api/auth/login
   * Retorna accessToken + refreshToken + user
   */
  static login = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = loginSchema.parse(req.body);

    const result = await AuthService.login(data);

    if ('requires2FA' in result && result.requires2FA) {
      res.json({
        success: true,
        data: {
          requires2FA: true,
          userId: result.userId,
          method: result.method, // FEAT-008 (FF-BE-031): "TOTP" | "WHATSAPP_OTP"
        },
      });
      return;
    }

    // FEAT-008 (FF-BE-031): SUPER_ADMIN sem 2FA → token de setup limitado
    if ('requires2FASetup' in result && result.requires2FASetup) {
      res.json({
        success: true,
        data: {
          requires2FASetup: true,
          userId: result.userId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
      return;
    }

    // Caminho normal — tem user porque não é 2FA challenge nem setup
    if ('user' in result) {
      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        },
      });
      return;
    }

    // Fallback defensivo — não deveria chegar aqui
    res.status(500).json({ success: false, error: { code: 'LOGIN_PATH_NOT_HANDLED' } });
  });

  /**
   * POST /api/auth/refresh
   * Renova access token usando refresh token válido.
   * Implementa rotação de refresh token.
   */
  static refresh = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = refreshSchema.parse(req.body);

    const tokens = await AuthService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  /**
   * POST /api/auth/logout
   * Invalida refresh token e blacklista access token atual.
   */
  static logout = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

    const refreshToken = req.body?.refreshToken;

    await AuthService.logout(accessToken, refreshToken);

    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  });

  /**
   * GET /api/auth/me
   */
  static me = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;

    const user = await AuthService.getUserWithPermissions(userId);

    res.json({
      success: true,
      data: user,
    });
  });

  /**
   * POST /api/auth/forgot-password
   * Gera token de reset e envia e-mail. Resposta genérica (não revela se e-mail existe).
   */
  static forgotPassword = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { email } = forgotPasswordSchema.parse(req.body);

      await AuthService.forgotPassword(email);

      res.json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.',
      });
    }
  );

  /**
   * POST /api/auth/reset-password
   * Valida token e atualiza senha.
   */
  static resetPassword = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);

      await AuthService.resetPassword(token, newPassword);

      res.json({
        success: true,
        message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
      });
    }
  );

  /**
   * POST /api/auth/verify-2fa
   * Valida OTP do 2FA e retorna tokens.
   */
  static verify2fa = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { userId, otp } = verify2faSchema.parse(req.body);

      const result = await AuthService.verify2FA(userId, otp);

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        },
      });
    }
  );

  /**
   * POST /api/auth/change-password
   *
   * FEAT-008 (FF-BE-030): retorna par novo de tokens já sem a claim
   * mustChangePassword. O frontend precisa SUBSTITUIR o token atual pelo
   * accessToken retornado — senão o JWT antigo continua bloqueando rotas.
   */
  static changePassword = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const data = changePasswordSchema.parse(req.body);

      const tokens = await AuthService.changePassword(
        userId,
        data.oldPassword,
        data.newPassword,
      );

      res.json({
        success: true,
        message: 'Senha alterada com sucesso',
        ...tokens,
      });
    }
  );

  // ============================================================
  // FEAT-008 (FF-BE-031) — Endpoints de enrollment TOTP
  // ============================================================

  /** POST /api/auth/2fa/setup-start — gera secret + URL otpauth */
  static setupTotpStart = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const result = await AuthService.startTotpSetup(userId);
      res.json({ success: true, data: result });
    },
  );

  /** POST /api/auth/2fa/setup-confirm — valida OTP e persiste secret */
  static setupTotpConfirm = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const data = z
        .object({
          secret: z.string().min(16, 'secret obrigatório'),
          otp: z.string().regex(/^\d{6}$/, 'otp deve ter 6 dígitos'),
        })
        .parse(req.body);

      const tokens = await AuthService.confirmTotpSetup(userId, data.secret, data.otp);
      res.json({
        success: true,
        message: '2FA ativado com sucesso',
        ...tokens,
      });
    },
  );

  /** POST /api/auth/2fa/disable — desativa 2FA (exige OTP atual) */
  static disableTotp = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.userId!;
      const data = z
        .object({ otp: z.string().regex(/^\d{6}$/, 'otp deve ter 6 dígitos') })
        .parse(req.body);
      await AuthService.disableTotp(userId, data.otp);
      res.json({ success: true, message: '2FA desativado' });
    },
  );

  /**
   * POST /api/auth/signup — REMOVIDO em FEAT-008 (FF-BE-030).
   *
   * Cadastro público de tenant+admin estava aberto sem moderação. Agora,
   * o único caminho para criar conta é via POST /api/admin/users (super
   * admin). Mantemos o handler retornando 410 Gone (não 404) para que
   * clientes antigos vejam uma mensagem clara em vez de "rota não existe"
   * (decisão da seção 13.2.1 da spec). AuthService.signup permanece no
   * código para evitar deletar muito de uma vez — pode ser removido em
   * cleanup futuro junto com o schema correspondente.
   */
  static signup = ErrorHandler.asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
      res.status(410).json({
        success: false,
        error: {
          code: 'endpoint_removed',
          message:
            'Para criar conta no CotaObra, solicite acesso em contato@cotaobra.com.br',
          helpUrl: 'https://cotaobra.com.br/solicitar-acesso',
        },
      });
    },
  );
}
