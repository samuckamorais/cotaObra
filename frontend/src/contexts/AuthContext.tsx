import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { api, STORAGE_KEYS } from '../api/client';

// FEAT-008: role SUPER_ADMIN cross-tenant + flags de força de troca/2FA.
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  permissions: Permission[];
  // FEAT-008
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  tenantId?: string | null;
  producerId?: string | null;
}

interface Permission {
  id: string;
  resource: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// FEAT-008 — três caminhos pós-login:
//   normal  → { } sem flags
//   2FA     → { requires2FA: true, userId, method: 'TOTP' | 'WHATSAPP_OTP' }
//   setup   → { requires2FASetup: true, userId } + tokens salvos no localStorage
interface LoginResult {
  requires2FA?: boolean;
  requires2FASetup?: boolean;
  userId?: string;
  method?: 'TOTP' | 'WHATSAPP_OTP';
}

interface AuthContextData {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  hasPermission: (resource: string, action: 'view' | 'create' | 'edit' | 'delete') => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  /** Atualiza o user no contexto sem precisar de re-login (depois de 2FA setup, change-password etc). */
  refreshUser: (user: User) => void;
  /** Atualiza tokens locais (depois de change-password / 2FA setup-confirm). */
  setSession: (tokens: { accessToken: string; refreshToken: string }, user?: User) => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

// Intervalo de renovação: 14 minutos (access token expira em 15min)
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Agenda renovação automática do access token a cada 14 minutos.
   */
  const scheduleRefresh = useCallback(() => {
    // Limpar timer anterior
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    refreshTimerRef.current = setInterval(async () => {
      const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) return;

      try {
        const response = await api.post('/auth/refresh', { refreshToken });
        const { accessToken: newAccess, refreshToken: newRefresh } = response.data.data;

        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccess);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
        setToken(newAccess);
      } catch {
        // Se refresh falhar, o interceptor do client.ts já faz logout
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Recuperar tokens do localStorage
    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      scheduleRefresh();
    }

    setLoading(false);

    return () => stopRefresh();
  }, [scheduleRefresh, stopRefresh]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const response = await api.post('/auth/login', { email, password });
    const data = response.data.data;

    // Caminho 2FA challenge — sem tokens, frontend redireciona pra /verify-2fa
    if (data.requires2FA) {
      return { requires2FA: true, userId: data.userId, method: data.method };
    }

    // Caminho 2FA setup (SUPER_ADMIN sem enrollment) — recebemos tokens com
    // claim pendingSetup. Persistimos pra rodar /auth/2fa/setup-* depois.
    if (data.requires2FASetup) {
      const { accessToken, refreshToken, userId } = data;
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      setToken(accessToken);
      // O backend não retorna user nesse fluxo — temos só o userId. Vamos
      // setar um user "stub" só com ID/role pra App.tsx conseguir tomar
      // decisão de rota. Os dados completos vêm depois do setup-confirm.
      const stubUser: User = {
        id: userId,
        email,
        name: '',
        role: 'SUPER_ADMIN',
        active: true,
        permissions: [],
        twoFactorEnabled: false,
      };
      setUser(stubUser);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(stubUser));
      return { requires2FASetup: true, userId };
    }

    // Caminho normal — sem 2FA challenge
    const { accessToken, refreshToken, user: newUser } = data;

    setToken(accessToken);
    setUser(newUser);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));

    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

    // Iniciar renovação automática
    scheduleRefresh();

    return {};
  };

  const logout = async () => {
    // Chamar backend para invalidar tokens
    try {
      const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Mesmo se o backend falhar, limpar localmente
    }

    stopRefresh();

    setToken(null);
    setUser(null);

    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);

    delete api.defaults.headers.common['Authorization'];
  };

  const hasPermission = (resource: string, action: 'view' | 'create' | 'edit' | 'delete'): boolean => {
    if (!user) return false;

    // SUPER_ADMIN e ADMIN têm acesso total
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;

    // Buscar permissão específica
    const permission = user.permissions.find(
      (p) => p.resource.toLowerCase() === resource.toLowerCase()
    );

    if (!permission) return false;

    switch (action) {
      case 'view':
        return permission.canView;
      case 'create':
        return permission.canCreate;
      case 'edit':
        return permission.canEdit;
      case 'delete':
        return permission.canDelete;
      default:
        return false;
    }
  };

  const isAdmin = (): boolean => {
    return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  };

  const isSuperAdmin = (): boolean => user?.role === 'SUPER_ADMIN';

  const refreshUser = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
  };

  const setSession = (
    tokens: { accessToken: string; refreshToken: string },
    newUser?: User,
  ) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
    setToken(tokens.accessToken);
    if (newUser) {
      setUser(newUser);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
    }
    scheduleRefresh();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        hasPermission,
        isAdmin,
        isSuperAdmin,
        refreshUser,
        setSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
