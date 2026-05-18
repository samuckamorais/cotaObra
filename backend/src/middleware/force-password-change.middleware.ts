import { Request, Response, NextFunction } from 'express';

/**
 * FEAT-008 (FF-BE-028) — Força troca de senha no primeiro login após
 * criação/reset pelo super admin.
 *
 * RN-04: quando JWT.mustChangePassword=true, qualquer endpoint exceto
 * a whitelist abaixo retorna 403 com header X-Force-Password-Change=true.
 * O frontend lê esse header e redireciona para /forced-change-password.
 *
 * Decisão de design: este middleware é montado UMA vez no apiRouter (em
 * app.ts), antes do registro das rotas. Isso garante que TODA rota nova
 * herde a proteção automaticamente — sem risco de esquecer (risco crítico
 * 2 da spec).
 *
 * Lê do JWT (req.user.mustChangePassword) — populado pelo authenticate.
 * Se o middleware authenticate não rodou ainda (rota pública), passa.
 * Após o user trocar a senha, o endpoint emite tokens novos sem a claim.
 */

/**
 * Rotas isentas da exigência de troca. Match contra req.path (sem query
 * string). Devem incluir tudo que o user PRECISA fazer pra trocar a senha.
 *
 * - /auth/change-password: a troca em si
 * - /auth/logout:          permitir desconectar
 * - /auth/me:              user info pra UI do formulário
 *
 * IMPORTANTE: incluir nessa lista qualquer endpoint que o frontend chama
 * implicitamente na tela de forced-change-password (ex: tradução, csrf).
 * Atualmente NÃO há outros — se mudar, atualizar aqui.
 */
const FORCE_PASSWORD_CHANGE_WHITELIST = new Set<string>([
  '/auth/change-password',
  '/auth/logout',
  '/auth/me',
  // FEAT-008 (FF-BE-031): setup de 2FA também é etapa "obrigatória antes
  // do acesso normal" (ordem: senha primeiro, 2FA depois, acesso normal).
  // Quando o user tem mustChangePassword=true E pendingSetup=true, o
  // change-password roda primeiro e desbloqueia; aí o setup TOTP fica
  // disponível. Quando só pendingSetup=true (senha já trocada), o user
  // já não é bloqueado pelo forcePasswordChange — vai pro require-2fa.
  '/auth/2fa/setup-start',
  '/auth/2fa/setup-confirm',
  '/auth/2fa/disable',
]);

export function forcePasswordChange(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Sem usuário autenticado (rota pública): segue normal.
  if (!req.user) {
    return next();
  }

  // Sem flag: segue normal.
  if (!req.user.mustChangePassword) {
    return next();
  }

  // Whitelist: deixa passar para o user conseguir trocar a senha.
  // req.path é relativo ao mount point do router (que é /api), então aqui
  // vem "/auth/change-password" (sem o /api prefix).
  if (FORCE_PASSWORD_CHANGE_WHITELIST.has(req.path)) {
    return next();
  }

  res.setHeader('X-Force-Password-Change', 'true');
  res.status(403).json({
    success: false,
    error: {
      code: 'FORCE_PASSWORD_CHANGE',
      message: 'Troca de senha obrigatória antes de acessar o sistema.',
    },
  });
}
