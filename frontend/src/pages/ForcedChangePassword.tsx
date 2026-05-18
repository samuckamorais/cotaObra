import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogOut, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { LogoFull } from '../components/ui/logo';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

/**
 * FEAT-008 (FF-FE-001) — Tela bloqueante de troca de senha.
 *
 * Acessada quando o JWT tem mustChangePassword=true (login pós-criação
 * pelo super admin OU reset). NÃO mostra menu lateral, header ou link
 * pra outras telas. Único caminho out é trocar a senha — ou logout.
 *
 * O endpoint /auth/change-password retorna par novo de tokens sem a
 * claim; o setSession do AuthContext atualiza localStorage e habilita
 * /dashboard.
 */

interface StrengthCheck {
  ok: boolean;
  message: string;
}

function evaluateStrength(pwd: string): StrengthCheck[] {
  return [
    { ok: pwd.length >= 10, message: 'Pelo menos 10 caracteres' },
    { ok: /[A-Z]/.test(pwd), message: 'Pelo menos 1 letra maiúscula' },
    { ok: /[a-z]/.test(pwd), message: 'Pelo menos 1 letra minúscula' },
    { ok: /[0-9]/.test(pwd), message: 'Pelo menos 1 dígito' },
    { ok: /[^A-Za-z0-9]/.test(pwd), message: 'Pelo menos 1 símbolo' },
  ];
}

export function ForcedChangePassword() {
  const navigate = useNavigate();
  const { logout, setSession, user, isSuperAdmin } = useAuth();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = evaluateStrength(newPassword);
  const isStrong = strength.every((s) => s.ok);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isStrong) {
      setError('A nova senha não atende aos critérios mínimos.');
      return;
    }
    if (!passwordsMatch) {
      setError('As senhas não coincidem.');
      return;
    }
    if (oldPassword === newPassword) {
      setError('A nova senha deve ser diferente da senha temporária.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/auth/change-password', {
        oldPassword,
        newPassword,
      });
      // Backend retorna { success, message, accessToken, refreshToken }
      const tokens = response.data;
      setSession(
        { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        // O user atual continua válido — só o mustChangePassword fica false
        // automaticamente porque o JWT novo não tem mais a claim.
        user ? { ...user, mustChangePassword: false } : undefined,
      );

      // Próximo passo: se for SUPER_ADMIN sem 2FA, força setup; senão, dashboard.
      if (isSuperAdmin()) {
        navigate('/admin/2fa-setup', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(
        e.response?.data?.error?.message ||
          'Erro ao trocar senha. Verifique a senha atual.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LogoFull iconSize={40} layout="horizontal" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Defina sua nova senha</h1>
          <p className="text-sm text-muted-foreground">
            Por segurança, você precisa criar uma senha pessoal antes de acessar o sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6 shadow-sm">
          {/* Senha atual (temp) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Senha temporária
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showOld ? 'text' : 'password'}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="A senha que o administrador te passou"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nova senha */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Nova senha
            </label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Crie uma senha forte"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Indicador de força em tempo real */}
            {newPassword.length > 0 && (
              <ul className="mt-2 space-y-1">
                {strength.map((s) => (
                  <li
                    key={s.message}
                    className={`text-xs flex items-center gap-1 ${
                      s.ok ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    {s.ok ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3" />}
                    {s.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confirmar */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Confirmar nova senha
            </label>
            <input
              type={showNew ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Repita a senha"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-destructive">As senhas não coincidem</p>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !isStrong || !passwordsMatch}
          >
            {submitting ? 'Salvando...' : 'Salvar e entrar'}
          </Button>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className="w-full mt-2 text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
          >
            <LogOut className="w-4 h-4" />
            Esqueci a senha temporária / Sair
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Se você esqueceu a senha temporária, entre em contato com o administrador.
        </p>
      </div>
    </div>
  );
}
