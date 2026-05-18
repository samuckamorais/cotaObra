import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whatsappConfigApi, type WhatsAppConfig } from '../api/whatsapp-config';
import { StatusCard } from '../components/whatsapp/StatusCard';
import { ProviderSelector } from '../components/whatsapp/ProviderSelector';
import { ConfigForm } from '../components/whatsapp/ConfigForm';
import { QRCodeModal } from '../components/whatsapp/QRCodeModal';
import { SetupGuide } from '../components/whatsapp/SetupGuide';
import { Card } from '../components/ui/card';
import { Breadcrumb } from '../components/ui/breadcrumb';
import { Skeleton } from '../components/ui/skeleton';
import { useToast } from '../hooks/use-toast';
import { Settings, MessageSquare, BarChart3, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function WhatsAppConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<'twilio' | 'evolution' | 'meta'>('evolution');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [credentials, setCredentials] = useState<any>({});
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCode, setQrCode] = useState<string>();
  const [activeTab, setActiveTab] = useState<'status' | 'config' | 'stats'>('status');

  // Query: Obter configuração atual
  const { data: config, isLoading: isLoadingConfig, error: configError } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: whatsappConfigApi.getConfig,
    retry: 1,
  });

  // Query: Obter estatísticas
  const { data: stats } = useQuery({
    queryKey: ['whatsapp-stats'],
    queryFn: () => whatsappConfigApi.getStats('24h'),
    refetchInterval: 60000, // Atualizar a cada 1 minuto
  });

  // Mutation: Salvar configuração
  const saveMutation = useMutation({
    mutationFn: (data: { provider: any; credentials: any }) =>
      whatsappConfigApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
      toast({
        variant: 'success',
        title: 'Configuração salva!',
        description: 'As configurações do WhatsApp foram salvas com sucesso',
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar configuração',
        description: error.response?.data?.message || error.message,
        duration: 5000,
      });
    },
  });

  // Mutation: Testar conexão
  const testMutation = useMutation({
    mutationFn: whatsappConfigApi.testConnection,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
      toast({
        variant: result.success ? 'success' : 'destructive',
        title: result.success ? 'Conexão estabelecida!' : 'Falha ao conectar',
        description: result.message,
        duration: result.success ? 3000 : 5000,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao testar conexão',
        description: error.message,
        duration: 5000,
      });
    },
  });

  // Mutation: Reconectar
  const reconnectMutation = useMutation({
    mutationFn: whatsappConfigApi.reconnect,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
      toast({
        variant: result.success ? 'success' : 'warning',
        title: result.success ? 'Reconectado com sucesso!' : 'Tentativa de reconexão',
        description: result.message,
        duration: 4000,
      });
    },
  });

  // Mutation: Registrar webhook
  const registerWebhookMutation = useMutation({
    mutationFn: whatsappConfigApi.registerWebhook,
    onSuccess: (result) => {
      toast({
        variant: result.success ? 'success' : 'destructive',
        title: result.success ? 'Webhook registrado!' : 'Erro ao registrar webhook',
        description: result.message,
        duration: 4000,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar webhook',
        description: error.response?.data?.message || error.message,
        duration: 5000,
      });
    },
  });

  // Carregar config existente
  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setCredentials(config.credentials);
    }
  }, [config]);

  // Obter QR Code
  const handleShowQRCode = async () => {
    try {
      const result = await whatsappConfigApi.getQRCode();
      setQrCode(result.qrCode);
      setShowQRModal(true);

      if (!result.success) {
        toast({
          variant: 'warning',
          title: 'WhatsApp já conectado',
          description: result.message,
          duration: 3000,
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar QR Code',
        description: error.message,
        duration: 5000,
      });
    }
  };

  const handleRefreshQRCode = async () => {
    setQrCode(undefined);
    await handleShowQRCode();
  };

  const handleSave = () => {
    saveMutation.mutate({ provider, credentials });
  };

  if (isLoadingConfig) {
    return (
      <>
        <Breadcrumb items={[{ label: 'WhatsApp', icon: <MessageSquare className="w-3 h-3" /> }]} />
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-medium text-foreground mb-1">Configuração do WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Configure a integração com WhatsApp para envio e recebimento de mensagens
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-md" />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-32 w-full rounded-md" />
              <Skeleton className="h-96 w-full rounded-md" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (configError) {
    return (
      <>
        <Breadcrumb items={[{ label: 'WhatsApp', icon: <MessageSquare className="w-3 h-3" /> }]} />
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Configuração do WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerencie a integração WhatsApp</p>
          </div>
          <Card className="p-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-base font-medium text-foreground mb-2">Erro ao carregar configuração</h3>
            <p className="text-sm text-muted-foreground mb-4">Não foi possível carregar a configuração do WhatsApp. Verifique sua conexão.</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Tentar novamente
            </button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'WhatsApp', icon: <MessageSquare className="w-3 h-3" /> }]} />
      <div className="p-6 space-y-6">
      {/* Header + Status Banner */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Configuração do WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerencie a integração WhatsApp</p>
          </div>
          {config && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              config.isConnected
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
            }`}>
              {config.isConnected ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {config.isConnected ? 'Conectado' : 'Desconectado'}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
        {[
          { key: 'status' as const, label: 'Status', icon: MessageSquare },
          { key: 'config' as const, label: 'Configuração', icon: Settings },
          { key: 'stats' as const, label: 'Estatísticas', icon: BarChart3 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content: Status */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          {config && (
            <StatusCard
              isConnected={config.isConnected}
              provider={config.provider}
              lastMessageAt={config.lastMessageAt}
              messagesSentToday={stats?.sent || config.messagesSentToday}
              messagesReceivedToday={stats?.received || config.messagesReceivedToday}
              connectionError={config.connectionError}
              onTest={() => testMutation.mutate()}
              onReconnect={() => reconnectMutation.mutate()}
              onRegisterWebhook={config.provider === 'evolution' ? () => registerWebhookMutation.mutate() : undefined}
              isLoading={testMutation.isPending || reconnectMutation.isPending || registerWebhookMutation.isPending}
            />
          )}
          {!config && (
            <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">WhatsApp não configurado</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Vá para a aba "Configuração" para começar.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab Content: Configuração */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Provedor</h3>
            </div>
            <ProviderSelector
              value={provider}
              onChange={setProvider}
              disabled={saveMutation.isPending}
            />
          </Card>

          <ConfigForm
            provider={provider}
            values={credentials}
            onChange={setCredentials}
            onSave={handleSave}
            onShowQRCode={provider === 'evolution' ? handleShowQRCode : undefined}
            isLoading={saveMutation.isPending}
          />

          <SetupGuide provider={provider} />
        </div>
      )}

      {/* Tab Content: Estatísticas */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {stats ? (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Estatísticas (24h)</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-secondary/30 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{stats.sent}</p>
                  <p className="text-xs text-muted-foreground">Enviadas</p>
                </div>
                <div className="text-center p-4 bg-secondary/30 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{stats.received}</p>
                  <p className="text-xs text-muted-foreground">Recebidas</p>
                </div>
                <div className="text-center p-4 bg-secondary/30 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{stats.errors}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </div>
                <div className="text-center p-4 bg-secondary/30 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{stats.errorRate}%</p>
                  <p className="text-xs text-muted-foreground">Taxa de erro</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">Estatísticas não disponíveis</p>
            </Card>
          )}
        </div>
      )}

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        qrCode={qrCode}
        onRefresh={handleRefreshQRCode}
      />
      </div>
    </>
  );
}
