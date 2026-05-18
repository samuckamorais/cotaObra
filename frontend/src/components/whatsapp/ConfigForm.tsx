import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { QrCode, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface TwilioFormProps {
  values: {
    accountSid: string;
    authToken: string;
    whatsappNumber: string;
  };
  onChange: (values: any) => void;
  disabled?: boolean;
}

function TwilioForm({ values, onChange, disabled }: TwilioFormProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="accountSid">Account SID</Label>
        <Input
          id="accountSid"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxx"
          value={values.accountSid}
          onChange={(e) => onChange({ ...values, accountSid: e.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Encontre em:{' '}
          <a
            href="https://console.twilio.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            console.twilio.com
          </a>
        </p>
      </div>

      <div>
        <Label htmlFor="authToken">Auth Token</Label>
        <div className="relative">
          <Input
            id="authToken"
            type={showToken ? 'text' : 'password'}
            placeholder="••••••••••••••••"
            value={values.authToken}
            onChange={(e) => onChange({ ...values, authToken: e.target.value })}
            disabled={disabled}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <Label htmlFor="whatsappNumber">Número WhatsApp</Label>
        <Input
          id="whatsappNumber"
          placeholder="+14155238886"
          value={values.whatsappNumber}
          onChange={(e) => onChange({ ...values, whatsappNumber: e.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Formato: +[código país][número] (ex: +14155238886 para sandbox)
        </p>
      </div>
    </div>
  );
}

interface EvolutionFormProps {
  values: {
    apiUrl: string;
    apiKey: string;
    instanceName: string;
  };
  onChange: (values: any) => void;
  disabled?: boolean;
  onShowQRCode?: () => void;
}

function EvolutionForm({ values, onChange, disabled, onShowQRCode }: EvolutionFormProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="apiUrl">URL da Evolution API</Label>
        <Input
          id="apiUrl"
          placeholder="http://localhost:8080"
          value={values.apiUrl}
          onChange={(e) => onChange({ ...values, apiUrl: e.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground mt-1">
          URL completa da sua instância Evolution API
        </p>
      </div>

      <div>
        <Label htmlFor="apiKey">API Key (opcional)</Label>
        <div className="relative">
          <Input
            id="apiKey"
            type={showApiKey ? 'text' : 'password'}
            placeholder="••••••••••••••••"
            value={values.apiKey}
            onChange={(e) => onChange({ ...values, apiKey: e.target.value })}
            disabled={disabled}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Deixe vazio se não usar autenticação</p>
      </div>

      <div>
        <Label htmlFor="instanceName">Nome da Instância</Label>
        <Input
          id="instanceName"
          placeholder="cotaobra"
          value={values.instanceName}
          onChange={(e) => onChange({ ...values, instanceName: e.target.value })}
          disabled={disabled}
        />
      </div>

      {onShowQRCode && (
        <Button type="button" variant="outline" className="w-full" onClick={onShowQRCode}>
          <QrCode className="w-4 h-4 mr-2" />
          Conectar via QR Code
        </Button>
      )}
    </div>
  );
}

interface ConfigFormProps {
  provider: 'twilio' | 'evolution' | 'meta';
  values: any;
  onChange: (values: any) => void;
  onSave: () => void;
  onCancel?: () => void;
  onShowQRCode?: () => void;
  isLoading?: boolean;
}

export function ConfigForm({
  provider,
  values,
  onChange,
  onSave,
  onCancel,
  onShowQRCode,
  isLoading,
}: ConfigFormProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Configuração do Provider</h3>

      {provider === 'twilio' && (
        <TwilioForm values={values} onChange={onChange} disabled={isLoading} />
      )}

      {provider === 'evolution' && (
        <EvolutionForm
          values={values}
          onChange={onChange}
          disabled={isLoading}
          onShowQRCode={onShowQRCode}
        />
      )}

      {provider === 'meta' && (
        <div className="py-8 text-center text-muted-foreground">
          <p>Meta WhatsApp Business API em breve</p>
        </div>
      )}

      <div className="flex gap-2 mt-6">
        <Button onClick={onSave} disabled={isLoading || provider === 'meta'} className="flex-1">
          {isLoading ? 'Salvando...' : 'Salvar Configuração'}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="outline" disabled={isLoading}>
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  );
}
