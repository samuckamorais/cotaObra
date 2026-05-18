import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { LogoFull } from '../components/ui/logo';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';

type Step = 1 | 2 | 3;

export function Signup() {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    region: '',
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateStep1 = (): boolean => {
    if (!formData.name || !formData.email || !formData.phone || !formData.password) {
      setError('Preencha todos os campos obrigatórios.');
      return false;
    }
    if (formData.password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(3, s + 1) as Step);
  };

  const handleBack = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1) as Step);
  };

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/signup', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        region: formData.region || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Conta criada!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sua conta foi criada com sucesso. Faça login para começar.
          </p>
          <Link to="/login">
            <Button className="w-full h-11">Ir para o login</Button>
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full px-3.5 py-2.5 text-sm text-foreground bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <LogoFull iconSize={44} layout="vertical" className="mb-1" />
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6 justify-center">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                s <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-1 text-center">
            {step === 1 && 'Seus dados'}
            {step === 2 && 'Sua região'}
            {step === 3 && 'Confirme seus dados'}
          </h2>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3.5 mb-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {/* Step 1: Dados pessoais */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">Nome completo</label>
              <input id="name" type="text" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className={inputClass} placeholder="João da Silva" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">E-mail</label>
              <input id="email" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} className={inputClass} placeholder="joao@fazenda.com" />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">WhatsApp</label>
              <input id="phone" type="tel" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} className={inputClass} placeholder="(64) 99999-9999" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">Senha</label>
              <input id="password" type="password" value={formData.password} onChange={(e) => updateField('password', e.target.value)} className={inputClass} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">Confirme a senha</label>
              <input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} className={inputClass} placeholder="Repita a senha" />
            </div>
          </div>
        )}

        {/* Step 2: Região */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-foreground mb-1">Região / Cidade</label>
              <input id="region" type="text" value={formData.region} onChange={(e) => updateField('region', e.target.value)} className={inputClass} placeholder="Ex: Rio Verde - GO" />
              <p className="text-xs text-muted-foreground mt-1">Opcional. Ajuda a encontrar fornecedores na sua região.</p>
            </div>
          </div>
        )}

        {/* Step 3: Confirmação */}
        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Nome:</span><span className="font-medium">{formData.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">E-mail:</span><span className="font-medium">{formData.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp:</span><span className="font-medium">{formData.phone}</span></div>
              {formData.region && <div className="flex justify-between"><span className="text-muted-foreground">Região:</span><span className="font-medium">{formData.region}</span></div>}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Ao confirmar, você concorda com os{' '}
              <span className="text-primary hover:underline cursor-pointer">Termos de Uso</span>
              {' '}e a{' '}
              <span className="text-primary hover:underline cursor-pointer">Política de Privacidade</span>.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1 gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={handleNext} className="flex-1 gap-1">
              Próximo <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isLoading} className="flex-1">
              {isLoading ? 'Criando conta...' : 'Criar minha conta'}
            </Button>
          )}
        </div>

        <div className="mt-6 text-center">
          <span className="text-sm text-muted-foreground">Já tem conta? </span>
          <Link to="/login" className="text-sm text-primary hover:underline">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
