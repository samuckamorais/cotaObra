import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, AlertCircle, Copy, Check, LogOut } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { LogoFull } from '../../components/ui/logo';
import { startTotpSetup, confirmTotpSetup } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';

/**
 * FEAT-008 (FF-FE-001) — Enrollment de 2FA TOTP.
 *
 * Acessada quando:
 *   - SUPER_ADMIN sem 2FA loga (redirecionado pelo Login depois de
 *     receber requires2FASetup=true)
 *   - Usuário comum opta por ativar 2FA via /settings (futuro)
 *
 * Fluxo:
 *   1. Chama /auth/2fa/setup-start → recebe { secret, otpauthUrl }
 *   2. Mostra QR code + secret pra digitação manual
 *   3. Usuário escaneia no app autenticador (Google Authenticator, Authy)
 *   4. Digita os 6 dígitos do app
 *   5. /auth/2fa/setup-confirm valida + persiste secret + emite tokens novos
 *   6. AuthContext.setSession atualiza local storage e libera o resto da UI
 */
export function TwoFactorSetup() {
  const navigate = useNavigate();
  const { setSession, logout, user, isSuperAdmin } = useAuth();

  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingStart, setLoadingStart] = useState(true);
  const [copied, setCopied] = useState(false);

  // Inicia o setup ao montar — gera o secret no backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await startTotpSetup();
        if (!cancelled) {
          setSecret(result.secret);
          setOtpauthUrl(result.otpauthUrl);
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: { message?: string } } } };
        if (!cancelled) {
          setError(
            e.response?.data?.error?.message ||
              'Erro ao iniciar configuração de 2FA. Tente recarregar a página.',
          );
        }
      } finally {
        if (!cancelled) setLoadingStart(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de clipboard — silenciosamente ignora
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;
    if (!/^\d{6}$/.test(otp)) {
      setError('O código deve ter exatamente 6 dígitos.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const response = await confirmTotpSetup(secret, otp);
      setSession(
        { accessToken: response.accessToken, refreshToken: response.refreshToken },
        user ? { ...user, twoFactorEnabled: true } : undefined,
      );
      // Acesso liberado — vai pro dashboard apropriado.
      navigate(isSuperAdmin() ? '/admin/dashboard' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(
        e.response?.data?.error?.message ||
          'Código inválido. Verifique o app autenticador e tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <LogoFull iconSize={36} layout="horizontal" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1 inline-flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Configure a autenticação em duas etapas
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin()
              ? 'Obrigatório para super administradores — protege o painel cross-tenant.'
              : 'Adiciona uma camada extra de segurança à sua conta.'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
          {/* Passo 1: instalar app */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2">
              1. Instale um app autenticador
            </h2>
            <p className="text-xs text-muted-foreground">
              Use Google Authenticator, Authy, 1Password ou qualquer app compatível com TOTP.
            </p>
          </section>

          {/* Passo 2: QR ou chave manual */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2">
              2. Escaneie o QR code (ou digite a chave)
            </h2>

            {loadingStart && (
              <div className="text-sm text-muted-foreground">Gerando QR code...</div>
            )}

            {!loadingStart && otpauthUrl && secret && (
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="bg-white p-3 rounded-lg border">
                  <QRCodeSVG value={otpauthUrl} size={180} />
                </div>
                <div className="flex-1 w-full">
                  <p className="text-xs text-muted-foreground mb-2">
                    Sem câmera? Digite manualmente esta chave no app:
                  </p>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                      {secret}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copySecret}
                      className="shrink-0"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Passo 3: confirmar OTP */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2">
              3. Digite o código de 6 dígitos do app
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="000000"
                autoComplete="one-time-code"
              />

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || otp.length !== 6 || !secret}
              >
                {submitting ? 'Ativando...' : 'Ativar 2FA e entrar'}
              </Button>
            </form>
          </section>
        </div>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );
}
