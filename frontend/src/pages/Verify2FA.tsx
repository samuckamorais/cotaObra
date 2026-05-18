import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { LogoFull } from '../components/ui/logo';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export function Verify2FA() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // FEAT-008 (FF-FE-001): TOTP não tem expiração de "código enviado".
  // Mantemos o timer só pro fluxo WhatsApp legado (OTP por mensagem).
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutos
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();

  const state = (location.state as { userId?: string; method?: 'TOTP' | 'WHATSAPP_OTP' }) ?? {};
  const userId = state.userId ?? '';
  const method = state.method ?? 'WHATSAPP_OTP';
  const isTotp = method === 'TOTP';

  useEffect(() => {
    if (!userId) {
      navigate('/login', { replace: true });
      return;
    }
    inputRefs.current[0]?.focus();
  }, [userId, navigate]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i] ?? '';
    }
    setOtp(newOtp);
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Digite o código completo de 6 dígitos.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/verify-2fa', { userId, otp: code });
      const { accessToken, refreshToken, user } = response.data.data;

      // FEAT-008 (FF-FE-001): usa setSession do AuthContext em vez de salvar
      // direto no localStorage. Sem isso o React state do AuthProvider fica
      // dessincronizado e o ProtectedLayout redireciona pra /login (loop).
      setSession({ accessToken, refreshToken }, user);

      // SUPER_ADMIN → /admin/dashboard; demais → /dashboard.
      // Lê role do user retornado pelo backend (o estado React ainda não
      // foi atualizado pelo setSession nesse mesmo render).
      const dest = user?.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard';
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Código inválido. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoFull iconSize={52} layout="vertical" className="mb-1" />
        </div>

        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="text-center mb-7">
          <h2 className="text-2xl font-semibold text-foreground mb-1">Verificação em 2 etapas</h2>
          <p className="text-sm text-muted-foreground">
            {isTotp
              ? 'Digite o código de 6 dígitos do seu app autenticador.'
              : 'Enviamos um código de 6 dígitos para o seu WhatsApp.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3.5">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-xl font-semibold bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                disabled={isLoading || (!isTotp && timeLeft <= 0)}
              />
            ))}
          </div>

          {/* TOTP não expira no servidor — válido enquanto o app mostrar o
              código atual. Mantemos o timer só para o caminho WhatsApp. */}
          {isTotp ? (
            <p className="text-center text-xs text-muted-foreground">
              O código muda a cada 30 segundos no seu app autenticador.
            </p>
          ) : timeLeft > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Código expira em <strong>{formatTime(timeLeft)}</strong>
            </p>
          ) : (
            <p className="text-center text-xs text-destructive">
              Código expirado. Faça login novamente.
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-11 text-sm font-medium"
            disabled={isLoading || (!isTotp && timeLeft <= 0)}
          >
            {isLoading ? 'Verificando...' : 'Verificar'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}
