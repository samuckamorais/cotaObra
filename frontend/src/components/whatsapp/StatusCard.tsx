import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Activity, MessageCircle, AlertCircle, Webhook } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StatusCardProps {
  isConnected: boolean;
  provider: string;
  lastMessageAt?: string;
  messagesSentToday: number;
  messagesReceivedToday: number;
  connectionError?: string;
  onTest: () => void;
  onReconnect: () => void;
  onRegisterWebhook?: () => void;
  isLoading?: boolean;
}

export function StatusCard({
  isConnected,
  provider,
  lastMessageAt,
  messagesSentToday,
  messagesReceivedToday,
  connectionError,
  onTest,
  onReconnect,
  onRegisterWebhook,
  isLoading,
}: StatusCardProps) {
  const providerNames = {
    twilio: 'Twilio',
    evolution: 'Evolution API',
    meta: 'Meta WhatsApp',
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Status da Conexão</h3>
          <p className="text-sm text-muted-foreground">
            Provider: {providerNames[provider as keyof typeof providerNames] || provider}
          </p>
        </div>
        <Badge variant={isConnected ? 'success' : 'error'} className="h-6">
          <Activity className="w-3 h-3 mr-1" />
          {isConnected ? 'Conectado' : 'Desconectado'}
        </Badge>
      </div>

      {connectionError && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Erro de Conexão</p>
            <p className="text-xs text-muted-foreground mt-1">{connectionError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <MessageCircle className="w-5 h-5 mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold">{messagesSentToday}</p>
          <p className="text-xs text-muted-foreground">Enviadas hoje</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <MessageCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold">{messagesReceivedToday}</p>
          <p className="text-xs text-muted-foreground">Recebidas hoje</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <Activity className="w-5 h-5 mx-auto mb-1 text-purple-500" />
          <p className="text-sm font-medium">
            {lastMessageAt
              ? formatDistanceToNow(new Date(lastMessageAt), {
                  addSuffix: true,
                  locale: ptBR,
                })
              : 'Nunca'}
          </p>
          <p className="text-xs text-muted-foreground">Última mensagem</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button onClick={onTest} variant="outline" size="sm" disabled={isLoading} className="flex-1">
            <Activity className="w-4 h-4 mr-2" />
            Testar Conexão
          </Button>
          {!isConnected && (
            <Button
              onClick={onReconnect}
              variant="default"
              size="sm"
              disabled={isLoading}
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reconectar
            </Button>
          )}
        </div>
        {onRegisterWebhook && (
          <Button
            onClick={onRegisterWebhook}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="w-full"
          >
            <Webhook className="w-4 h-4 mr-2" />
            Registrar Webhook
          </Button>
        )}
      </div>
    </Card>
  );
}
