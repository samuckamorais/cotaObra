import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ProviderSelector } from './ProviderSelector';
import { ConfigForm } from './ConfigForm';
import {
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Zap,
  DollarSign,
  Cloud
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SetupWizardProps {
  onComplete: (data: { provider: string; credentials: any }) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

type Step = 1 | 2 | 3;

interface ProviderInfo {
  name: string;
  badge: string;
  badgeVariant: 'success' | 'warning' | 'info';
  pros: string[];
  cons: string[];
  bestFor: string;
  icon: React.ReactNode;
}

const providersInfo: Record<string, ProviderInfo> = {
  evolution: {
    name: 'Evolution API',
    badge: 'Recomendado',
    badgeVariant: 'success',
    pros: ['Totalmente gratuito', 'QR Code simples', 'Sem limites de mensagens', 'Open source'],
    cons: ['Requer servidor próprio', 'Setup inicial mais técnico'],
    bestFor: 'Começar rapidamente sem custos',
    icon: <Zap className="w-5 h-5" />,
  },
  twilio: {
    name: 'Twilio',
    badge: 'Pago',
    badgeVariant: 'warning',
    pros: ['Infraestrutura robusta', 'Suporte 24/7', 'Alta disponibilidade', 'Documentação excelente'],
    cons: ['Custo mensal', 'Aprovação de número pode demorar', 'Mais complexo'],
    bestFor: 'Grandes volumes e produção',
    icon: <Cloud className="w-5 h-5" />,
  },
  meta: {
    name: 'Meta WhatsApp Business',
    badge: 'Em breve',
    badgeVariant: 'info',
    pros: ['Oficial do WhatsApp', 'Altamente escalável', 'Recursos avançados'],
    cons: ['Processo de aprovação longo', 'Requer verificação de negócio'],
    bestFor: 'Empresas estabelecidas',
    icon: <DollarSign className="w-5 h-5" />,
  },
};

export function SetupWizard({ onComplete, onCancel, isLoading }: SetupWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'evolution' | 'meta'>('evolution');
  const [credentials, setCredentials] = useState<any>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      // Validate credentials
      const errors = validateCredentials(selectedProvider, credentials);
      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
      setValidationErrors([]);
    }
  };

  const handleFinish = () => {
    onComplete({ provider: selectedProvider, credentials });
  };

  const validateCredentials = (provider: string, creds: any): string[] => {
    const errors: string[] = [];

    if (provider === 'twilio') {
      if (!creds.accountSid) errors.push('Account SID é obrigatório');
      if (!creds.authToken) errors.push('Auth Token é obrigatório');
      if (!creds.whatsappNumber) errors.push('Número WhatsApp é obrigatório');
    } else if (provider === 'evolution') {
      if (!creds.apiUrl) errors.push('URL da API é obrigatória');
      if (!creds.instanceName) errors.push('Nome da instância é obrigatório');
    }

    return errors;
  };

  const providerInfo: ProviderInfo = (providersInfo[selectedProvider] || providersInfo.evolution) as ProviderInfo;

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all',
                step >= s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground'
              )}
            >
              {step > s ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <span className="text-xs font-medium">{s}</span>
              )}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  'w-12 h-0.5 mx-2 transition-colors',
                  step > s ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Labels */}
      <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground">
        <span className={step === 1 ? 'text-foreground font-medium' : ''}>Escolher Provider</span>
        <span className={step === 2 ? 'text-foreground font-medium' : ''}>Configurar</span>
        <span className={step === 3 ? 'text-foreground font-medium' : ''}>Confirmar</span>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">
              {step === 1 && 'Escolha seu Provider'}
              {step === 2 && 'Configure as Credenciais'}
              {step === 3 && 'Pronto para Conectar!'}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          {/* Step 1: Provider Selection with Comparison */}
          {step === 1 && (
            <div className="space-y-4">
              <ProviderSelector
                value={selectedProvider}
                onChange={setSelectedProvider}
              />

              {/* Provider Details */}
              <Card className="bg-secondary/30 border-secondary">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    {providerInfo.icon}
                    <h3 className="font-medium">{providerInfo.name}</h3>
                    <Badge variant={providerInfo.badgeVariant} className="ml-auto">
                      {providerInfo.badge}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Vantagens</p>
                      <ul className="space-y-1">
                        {providerInfo.pros.map((pro, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                            <span className="text-xs">{pro}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Desvantagens</p>
                      <ul className="space-y-1">
                        {providerInfo.cons.map((con, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <div className="w-3 h-3 rounded-full bg-muted flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-muted-foreground">{con}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Melhor para:</span> {providerInfo.bestFor}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && (
            <div className="space-y-4">
              {validationErrors.length > 0 && (
                <div className="bg-[hsl(var(--error-bg))] border-0.5 border-[hsl(var(--error))]/20 rounded-md p-3">
                  <p className="text-sm font-medium text-[hsl(var(--error))] mb-2">
                    Corrija os seguintes erros:
                  </p>
                  <ul className="text-xs text-[hsl(var(--error))] space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <ConfigForm
                provider={selectedProvider}
                values={credentials}
                onChange={setCredentials}
                onSave={() => {}} // Não salva aqui, apenas coleta dados
                isLoading={false}
              />
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-success/10 border border-success/20 rounded-md p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-success">Configuração válida!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      As credenciais do {providerInfo.name} foram preenchidas corretamente.
                    </p>
                  </div>
                </div>
              </div>

              <Card className="bg-secondary/30">
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium mb-3">Resumo da Configuração</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Provider:</dt>
                      <dd className="font-medium">{providerInfo.name}</dd>
                    </div>
                    {selectedProvider === 'evolution' && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">API URL:</dt>
                          <dd className="font-mono text-xs">{credentials.apiUrl}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Instância:</dt>
                          <dd className="font-mono text-xs">{credentials.instanceName}</dd>
                        </div>
                      </>
                    )}
                    {selectedProvider === 'twilio' && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Account SID:</dt>
                          <dd className="font-mono text-xs">{credentials.accountSid?.slice(0, 10)}...</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Número:</dt>
                          <dd className="font-mono text-xs">{credentials.whatsappNumber}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>

              <div className="bg-info/10 border border-info/20 rounded-md p-4">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Próximo passo:</span> Após salvar, você poderá testar a conexão e{' '}
                  {selectedProvider === 'evolution' && 'escanear o QR Code para conectar seu WhatsApp.'}
                  {selectedProvider === 'twilio' && 'enviar mensagens de teste.'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={step === 1 ? onCancel : handleBack}
          disabled={isLoading}
        >
          {step === 1 ? (
            'Cancelar'
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Voltar
            </>
          )}
        </Button>

        <Button
          size="sm"
          onClick={step === 3 ? handleFinish : handleNext}
          disabled={isLoading || (step === 1 && selectedProvider === 'meta')}
        >
          {step === 3 ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Salvar Configuração
            </>
          ) : (
            <>
              Próximo
              <ChevronRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
