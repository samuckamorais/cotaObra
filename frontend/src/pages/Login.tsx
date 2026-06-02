import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { LogoMark, LogoFull } from '../components/ui/logo';
import { Eye, EyeOff, TrendingUp, Building2, MessageSquare } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA) {
        navigate('/verify-2fa', {
          state: { userId: result.userId, method: result.method },
        });
      } else if (result.requires2FASetup) {
        // FEAT-008 — SUPER_ADMIN sem 2FA: força enrollment antes de qualquer
        // outra ação. O AuthContext já persistiu o token com claim
        // pendingSetup. A tela de setup usa esse token pra chamar
        // /auth/2fa/setup-start.
        navigate('/admin/2fa-setup', { replace: true });
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:flex-1 bg-primary relative overflow-hidden">
        {/* Background Pattern — LogoMark centralizado, opacidade baixa */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
          <LogoMark size={420} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          {/* Logo & Title */}
          <div>
            <LogoFull iconSize={40} textColor="white" layout="horizontal" />
            <p className="text-primary-foreground/60 text-xs mt-1 ml-[52px]">Cotação inteligente de materiais de construção</p>
          </div>

          {/* Features */}
          <div className="max-w-sm">
            <h2 className="text-3xl font-semibold leading-snug mb-2">
              Menos tempo negociando.<br />Mais tempo produzindo.
            </h2>
            <p className="text-primary-foreground/70 text-sm mb-10">
              Cotação de materiais de construção via WhatsApp — do pedido à Ordem de Compra.
            </p>

            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 bg-primary-foreground/10 rounded-xl border border-primary-foreground/10 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5">Cotações pelo WhatsApp</h3>
                  <p className="text-xs text-primary-foreground/70 leading-relaxed">
                    Engenheiro de obra solicita e fornecedores respondem direto no WhatsApp — sem app, sem cadastro.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 bg-primary-foreground/10 rounded-xl border border-primary-foreground/10 shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5">Comparativo em tempo real</h3>
                  <p className="text-xs text-primary-foreground/70 leading-relaxed">
                    Visualize e compare propostas lado a lado para tomar a melhor decisão de compra.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 bg-primary-foreground/10 rounded-xl border border-primary-foreground/10 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5">Gestão de Fornecedores</h3>
                  <p className="text-xs text-primary-foreground/70 leading-relaxed">
                    Organize sua carteira, acompanhe o histórico e identifique os fornecedores mais competitivos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-primary-foreground/40">
            © {new Date().getFullYear()} CotaObra. Todos os direitos reservados.
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <LogoFull iconSize={52} layout="vertical" className="mb-1" />
            <p className="text-sm text-muted-foreground mt-2">Cotação de Materiais de Construção</p>
          </div>

          {/* Welcome Message */}
          <div className="mb-7">
            <h2 className="text-2xl font-semibold text-foreground mb-1">Acesse sua conta</h2>
            <p className="text-sm text-muted-foreground">
              Informe suas credenciais para continuar
            </p>
          </div>

          {/* Form — sem card extra, fundo já é o background */}
          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Formulário de login">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3.5">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-foreground bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                placeholder="seu@email.com"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  Senha
                </label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm text-foreground bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all pr-11"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  tabIndex={-1}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium mt-2"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          {/* Footer Info */}
          <p className="mt-6 text-xs text-center text-muted-foreground">
            Ao entrar, você concorda com os{' '}
            <span className="text-primary hover:underline cursor-pointer">Termos de Uso</span>
            {' '}e a{' '}
            <span className="text-primary hover:underline cursor-pointer">Política de Privacidade</span>
          </p>
        </div>
      </div>
    </div>
  );
}
