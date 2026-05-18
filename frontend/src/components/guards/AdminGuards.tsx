import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * FEAT-008 (FF-FE-001) — Guards de rota para fluxos forçados.
 *
 * Política de redirecionamento (ordem da spec 13.2.5):
 *   1) Sem user / sem token → /login
 *   2) mustChangePassword=true → /forced-change-password (exceto se já estiver lá)
 *   3) SUPER_ADMIN sem 2FA → /admin/2fa-setup (exceto se já estiver lá)
 *   4) Acesso normal liberado
 *
 * O fluxo de change-password e 2fa-setup também precisam de user/token —
 * o backend valida via JWT. Aceitar quando a rota é exatamente a esperada.
 */
export function ForcedFlowGuard({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  if (!user) {
    // Sem user, ProtectedLayout já lida com isso. Aqui só fallback defensivo.
    return <Navigate to="/login" replace />;
  }

  // Etapa 1: força troca de senha. /forced-change-password fica livre
  // pra própria troca rodar. Login/logout também.
  if (user.mustChangePassword && path !== '/forced-change-password') {
    return <Navigate to="/forced-change-password" replace />;
  }

  // Etapa 2: SUPER_ADMIN sem 2FA. /admin/2fa-setup fica livre pra setup.
  if (
    isSuperAdmin() &&
    !user.twoFactorEnabled &&
    path !== '/admin/2fa-setup' &&
    path !== '/forced-change-password'
  ) {
    return <Navigate to="/admin/2fa-setup" replace />;
  }

  return <>{children}</>;
}

/**
 * Guard que exige role SUPER_ADMIN. Usado em todas as rotas /admin/*.
 * Aceita também ADMIN comum acessar /admin/2fa-setup (opt-in opcional).
 */
export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
