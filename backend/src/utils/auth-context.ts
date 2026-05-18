import type { Request } from 'express';
import { createError } from './error-handler';

/**
 * FF-BE-023 — Contexto de autorização para queries com isolamento por papel.
 *
 * Resolve duas dimensões do user logado:
 *   - tenantId  : empresa dona dos dados
 *   - producerId: quando preenchido, indica que o user é um PRODUTOR (vínculo
 *                 1:1 com Producer no schema). Quando null, é admin/operador.
 *
 * Risco 2 do PO: se user.role === ADMIN, ignoramos producerId mesmo que
 * exista — admin sempre vê tudo do tenant. Isso protege o caso edge em que
 * um admin tem producerId definido por algum motivo histórico/operacional.
 */
export type AuthContext = {
  userId: string;
  tenantId: string;
  producerId: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
};

export function getAuthContext(req: Request): AuthContext {
  const user = req.user;
  if (!user) {
    throw createError.unauthorized('Não autenticado');
  }
  if (!user.tenantId) {
    // SUPER_ADMIN puro (sem tenant) cai aqui — endpoints por-tenant exigem
    // que ele use os endpoints /api/admin/* específicos (próximo checkpoint).
    throw createError.forbidden('Usuário não possui tenant associado');
  }

  // Regra do PO (FF-BE-023): admin/super-admin não é tratado como produtor
  // mesmo se producerId existir.
  const producerId =
    user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
      ? null
      : (user.producerId ?? null);

  return {
    userId: user.id,
    tenantId: user.tenantId,
    producerId,
    role: user.role,
  };
}
