import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useSubscriptions, useCancelSubscription } from '../hooks/useSubscriptions';
import { formatDate, formatCurrency } from '../lib/utils';
import { formatCpfCnpj } from '../lib/validators';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Building2,
  MapPin,
  Phone,
  Calendar,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Ban
} from 'lucide-react';
import { SubscriptionFormModal } from '../components/subscriptions/SubscriptionFormModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { ConfirmModal } from '../components/ui/confirm-modal';

const planLabels: Record<string, string> = {
  BASIC: 'Basic',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

const planPrices: Record<string, number> = {
  BASIC: 79,
  PRO: 149,
  ENTERPRISE: 299,
};

const planLimits: Record<string, string> = {
  BASIC: '20 cotações/mês',
  PRO: '100 cotações/mês',
  ENTERPRISE: 'Ilimitado',
};

export function Subscriptions() {
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [search, setSearch] = useState('');
  const [confirmCancel, setConfirmCancel] = useState<{ id: string; producerName: string } | null>(null);
  const limit = 15;

  const { data, isLoading, error } = useSubscriptions(page, limit, {
    status: statusFilter,
    plan: planFilter,
    search,
  });

  const cancelMutation = useCancelSubscription();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const handleCancel = async () => {
    if (!confirmCancel) return;
    try {
      await cancelMutation.mutateAsync({
        id: confirmCancel.id,
        data: { immediate: false },
      });
      toast({ title: 'Assinatura cancelada com sucesso!', variant: 'success' });
      setConfirmCancel(null);
    } catch {
      toast({ title: 'Erro ao cancelar assinatura', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleEdit = (subscription: any) => {
    setEditingSubscription(subscription);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSubscription(null);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPlanFilter('');
    setPage(1);
  };

  const hasFilters = search || statusFilter || planFilter;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Assinaturas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie planos e cobranças dos produtores
            </p>
          </div>
        </div>

        {/* Skeleton KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
              </CardHeader>
              <CardContent>
                <div className="h-6 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Assinaturas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie planos e cobranças dos produtores
          </p>
        </div>
        <div className="bg-[hsl(var(--error-bg))] border-0.5 border-[hsl(var(--error))] rounded-md p-4">
          <p className="text-sm text-[hsl(var(--error))]">Erro ao carregar assinaturas</p>
        </div>
      </div>
    );
  }

  const subscriptions = data?.data || [];
  const pagination = data?.pagination;
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Assinaturas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie planos e cobranças dos produtores
          </p>
        </div>
        {isAdmin() && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus className="w-3.5 h-3.5" />
            Nova Assinatura
          </Button>
        )}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Assinaturas Ativas
              </CardTitle>
              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-medium text-foreground">
                {stats.activeSubscriptions}
              </div>
              <p className="text-xs text-muted-foreground mt-1">produtores com plano</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Receita Mensal
              </CardTitle>
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-medium text-foreground">
                {formatCurrency(stats.monthlyRevenue || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">recorrente este mês</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Taxa de Renovação
              </CardTitle>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-medium text-foreground">{stats.renewalRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">renovações automáticas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Cancelamentos
              </CardTitle>
              <Ban className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-medium text-foreground">
                {stats.cancellationsThisMonth}
              </div>
              <p className="text-xs text-muted-foreground mt-1">este mês</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plan Distribution */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['BASIC', 'PRO', 'ENTERPRISE'] as const).map((plan) => (
            <Card key={plan} className="hover:bg-secondary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="default" className="text-xs">
                    {planLabels[plan]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {stats.planDistribution[plan] || 0} assinantes
                  </span>
                </div>
                <CardTitle className="text-xl font-medium text-primary">
                  {formatCurrency(planPrices[plan] || 0)}
                  <span className="text-sm text-muted-foreground">/mês</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                  <span>{planLimits[plan]}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                  <span>Rede de fornecedores</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                  <span>Suporte via WhatsApp</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="Buscar por produtor, CPF/CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-3 py-2 text-sm bg-background border-0.5 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 text-sm border-0.5 border-border rounded-md px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativa</option>
            <option value="EXPIRED">Expirada</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 text-sm border-0.5 border-border rounded-md px-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos os planos</option>
            <option value="BASIC">Basic</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1.5">
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Subscriptions Grid */}
      {subscriptions.length === 0 ? (
        <Card className="p-16 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-base font-medium text-foreground mb-2">
            Nenhuma assinatura encontrada
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {hasFilters
              ? 'Tente ajustar os filtros de busca'
              : 'As assinaturas aparecem aqui quando produtores criarem suas primeiras cotações'}
          </p>
          {isAdmin() && !hasFilters && (
            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Nova Assinatura
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subscriptions.map((subscription: any) => {
              const showWarning = subscription.daysUntilRenewal <= 7 && subscription.active;
              const showLimitWarning = subscription.usagePercentage >= 90;

              return (
                <Card
                  key={subscription.id}
                  className="hover:bg-secondary/50 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-base font-medium">
                            {subscription.producer.name}
                          </CardTitle>
                          {subscription.active ? (
                            <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
                              <CheckCircle className="w-3 h-3" />
                              Ativa
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs gap-1 bg-red-50 text-red-700 border-red-200">
                              <XCircle className="w-3 h-3" />
                              Expirada
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          CPF/CNPJ: {formatCpfCnpj(subscription.producer.cpfCnpj)}
                        </p>
                      </div>
                      {isAdmin() && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(subscription)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Plan info */}
                    <div className="flex items-start gap-3">
                      <div className="bg-primary/10 text-primary px-3 py-2 rounded-md">
                        <div className="text-xs font-normal">{planLabels[subscription.plan]}</div>
                        <div className="text-sm font-medium">
                          {formatCurrency(planPrices[subscription.plan] || 0)}/mês
                        </div>
                      </div>
                      <div className="flex-1 text-xs text-muted-foreground space-y-1">
                        {subscription.producer.farm && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="truncate">{subscription.producer.farm}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{subscription.producer.city}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{subscription.producer.phone}</span>
                        </div>
                      </div>
                    </div>

                    {/* Usage progress */}
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">Uso mensal</span>
                        <span className="text-xs font-normal text-foreground">
                          {subscription.quotesUsed}/{subscription.quotesLimit} cotações
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            subscription.usagePercentage >= 100
                              ? 'bg-red-600'
                              : subscription.usagePercentage >= 90
                              ? 'bg-yellow-600'
                              : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(subscription.usagePercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {subscription.usagePercentage}% utilizado
                      </p>

                      {/* Limit warning */}
                      {showLimitWarning && subscription.usagePercentage < 100 && (
                        <div className="bg-yellow-50 border-0.5 border-yellow-200 rounded-md p-2 mt-2">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                            <span className="text-xs text-yellow-700">
                              Próximo do limite mensal
                            </span>
                          </div>
                        </div>
                      )}
                      {subscription.usagePercentage >= 100 && (
                        <div className="bg-red-50 border-0.5 border-red-200 rounded-md p-2 mt-2">
                          <div className="flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5 text-red-600" />
                            <span className="text-xs text-red-700">Limite mensal atingido</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border text-xs">
                      <div className="flex items-start gap-1.5 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 mt-0.5" />
                        <div>
                          <span className="text-xs text-muted-foreground">Início</span>
                          <p className="text-xs font-normal text-foreground">
                            {formatDate(subscription.startDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5 text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5 mt-0.5" />
                        <div>
                          <span className="text-xs text-muted-foreground">Renovação</span>
                          <p className="text-xs font-normal text-foreground">
                            {formatDate(subscription.endDate)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Renewal warning */}
                    {showWarning && (
                      <div className="bg-yellow-50 border-0.5 border-yellow-200 rounded-md p-2">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-yellow-600" />
                          <span className="text-xs text-yellow-700">
                            Renovação em {subscription.daysUntilRenewal} dia
                            {subscription.daysUntilRenewal !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {isAdmin() && (
                      <div className="flex gap-2 pt-3 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => handleEdit(subscription)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Editar
                        </Button>
                        {subscription.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() =>
                              setConfirmCancel({ id: subscription.id, producerName: subscription.producer.name })
                            }
                            disabled={cancelMutation.isPending}
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancelar
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages} • Mostrando{' '}
                {(pagination.page - 1) * limit + 1}-
                {Math.min(pagination.page * limit, pagination.total)} de {pagination.total}{' '}
                assinaturas
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="gap-1.5"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <SubscriptionFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        subscription={editingSubscription}
      />

      <ConfirmModal
        isOpen={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancel}
        title="Cancelar assinatura"
        description={`Tem certeza que deseja cancelar a assinatura de "${confirmCancel?.producerName}"? O acesso será mantido até o fim do período atual.`}
        confirmLabel="Cancelar assinatura"
        variant="warning"
        isLoading={cancelMutation.isPending}
      />
    </div>
  );
}
