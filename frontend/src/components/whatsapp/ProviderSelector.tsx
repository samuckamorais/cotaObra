import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Check } from 'lucide-react';

interface ProviderSelectorProps {
  value: 'twilio' | 'evolution' | 'meta';
  onChange: (provider: 'twilio' | 'evolution' | 'meta') => void;
  disabled?: boolean;
}

const providers = [
  {
    value: 'evolution' as const,
    label: 'Evolution API',
    description: 'Open source, gratuito, ideal para desenvolvimento',
    free: true,
    recommended: true,
  },
  {
    value: 'twilio' as const,
    label: 'Twilio',
    description: 'Comercial, alta confiabilidade, ideal para produção',
    free: false,
    recommended: false,
  },
  {
    value: 'meta' as const,
    label: 'Meta WhatsApp',
    description: 'Oficial do WhatsApp (em breve)',
    free: false,
    recommended: false,
    disabled: true,
  },
];

export function ProviderSelector({ value, onChange, disabled }: ProviderSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Provider WhatsApp</label>
      <div className="grid gap-3">
        {providers.map((provider) => (
          <Card
            key={provider.value}
            className={`p-4 cursor-pointer transition-all hover:border-primary ${
              value === provider.value ? 'border-primary bg-primary/5' : ''
            } ${provider.disabled || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => {
              if (!provider.disabled && !disabled) {
                onChange(provider.value);
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">{provider.label}</h4>
                  {provider.free && (
                    <Badge variant="secondary" className="text-xs">
                      Gratuito
                    </Badge>
                  )}
                  {provider.recommended && (
                    <Badge variant="default" className="text-xs">
                      Recomendado
                    </Badge>
                  )}
                  {provider.disabled && (
                    <Badge variant="outline" className="text-xs">
                      Em breve
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{provider.description}</p>
              </div>
              {value === provider.value && (
                <div className="ml-4">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
