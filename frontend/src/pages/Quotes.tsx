import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useQuotes, useQuoteStats } from '../hooks/useQuotes';
import { formatDate } from '../lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  User,
  Calendar,
  MessageSquare,
  MapPin,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  BarChart3,
} from 'lucide-react';

// ─── Configurações de status ────────────────────────────────────────────────

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  PENDING: 'default',
  COLLECTING: 'warning',
  SUMMARIZED: 'info',
  CLOSED: 'success',
  EXPIRED: 'error',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  COLLECTING: 'Coletando',
  SUMMARIZED: 'Com propostas',
  CLOSED: 'Fechada',
  EXPIRED: 'Expirada',
};

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'ativas' | 'fechadas' | 'expiradas' | 'todas';

const tabs: { key: TabKey; label: string; statusFilter?: string }[] = [
  { key: 'ativas', label: 'Ativas' },
  { key: 'fechadas', label: 'Fechadas', statusFilter: 'CLOSED' },
  { key: 'expiradas', label: 'Expiradas', statusFilter: 'EXPIRED' },
  { key: 'todas', label: 'Todas' },
];

// Status considerados "ativos" (sem statusFilter passado ao backend — filtramos no cliente)
const activeStatuses = new Set(['PENDING', 'COLLECTING', 'SUMMARIZED']);

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  accent?: 'warning' | 'info' | 'success' | 'default';
}) {
  const colors = {
    warning: 'text-[hsl(var(--warning))]',
    info: 'text-[hsl(var(--info))]',
    success: 'text-[hsl(var(--success))]',
    default: 'text-primary',
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`${colors[accent ?? 'default']} shrink-0`}>{icon}</div>
        <div>
          <p className="text-xl font-semibold text-foreground leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quote Card ──────────────────────────────────────────────────────────────

function QuoteCard({ quote, onClick }: { quote: any; onClick: () => void }) {
  const isSummarized = quote.status === 'SUMMARIZED';
  const isClosed = quote.status === 'CLOSED';

  return (
    <div
      onClick={onClick}
      className={`group relative border-0.5 rounded-lg p-4 cursor-pointer transition-colors hover:bg-secondary/50 ${
        isSummarized
          ? 'border-[hsl(var(--info))]/40 bg-[hsl(var(--info-bg))]/30'
          : isClosed
          ? 'border-[hsl(var(--success))]/30 bg-transparent'
          : 'border-border bg-transparent'
      }`}
    >
      {/* Indicador "Aguardando decisão" */}
      {isSummarized && (
        <div className="flex items-center gap-1.5 mb-3">
          <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--info))]" />
          <span className="text-xs font-medium text-[hsl(var(--info))]">Aguardando decisão</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{quote.product}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {quote.quantity} {quote.unit}
          </p>
        </div>
        <Badge variant={statusColors[quote.status]} className="shrink-0">
          {statusLabels[quote.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{quote.producer?.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{quote.region || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3 shrink-0" />
          <span>
            {quote._count?.proposals ?? 0}{' '}
            {(quote._count?.proposals ?? 0) === 1 ? 'proposta' : 'propostas'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{formatDate(quote.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <span className="text-xs text-muted-foreground font-mono">
          #{quote.id.substring(0, 8)}
        </span>
        <span className="text-xs text-primary flex items-center gap-1 group-hover:underline">
          {isSummarized ? 'Ver propostas' : 'Ver detalhes'}
          <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function QuoteCardSkeleton() {
  return (
    <div className="border-0.5 border-border rounded-lg p-4 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="space-y-1.5">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-16" />
        </div>
        <div className="h-5 bg-muted rounded w-20" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-3 bg-muted rounded w-20" />
        <div className="h-3 bg-muted rounded w-16" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export function Quotes() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('ativas');
  const [page, setPage] = useState(1);
  const limit = 20;

  const currentTab = tabs.find((t) => t.key === activeTab)!;

  // Para a tab "ativas" não passamos statusFilter — buscamos todas e filtramos no cliente
  const statusParam = activeTab === 'todas' ? undefined : currentTab.statusFilter;

  const { data, isLoading } = useQuotes(page, limit, statusParam ? { status: statusParam } : {});
  const { data: stats, isLoading: statsLoading } = useQuoteStats();

  // Filtragem client-side para a tab "ativas" (múltiplos status)
  const allQuotes: any[] = data?.data ?? [];
  const quotes =
    activeTab === 'ativas'
      ? allQuotes.filter((q) => activeStatuses.has(q.status))
      : allQuotes;

  const pagination = data?.pagination;

  // Contagens derivadas das stats
  const activeCount =
    stats ? (stats.pendingQuotes ?? 0) + (stats.collectingQuotes ?? 0) : null;
  const summarizedCount = stats
    ? (stats.totalQuotes ?? 0) -
      (stats.pendingQuotes ?? 0) -
      (stats.collectingQuotes ?? 0) -
      (stats.closedQuotes ?? 0) -
      (stats.expiredQuotes ?? 0)
    : null;

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-medium text-foreground">Cotações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe as cotações solicitadas via WhatsApp
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-12 mb-1" />
                  <div className="h-3 bg-muted rounded w-24" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              icon={<Clock className="w-5 h-5" />}
              label="Em andamento"
              value={activeCount ?? '—'}
              accent="default"
            />
            <StatCard
              icon={<AlertCircle className="w-5 h-5" />}
              label="Aguardando decisão"
              value={summarizedCount !== null && summarizedCount >= 0 ? summarizedCount : '—'}
              accent="info"
            />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              label="Fechadas"
              value={stats?.closedQuotes ?? '—'}
              accent="success"
            />
            <StatCard
              icon={<BarChart3 className="w-5 h-5" />}
              label="Total"
              value={stats?.totalQuotes ?? '—'}
              accent="default"
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm transition-colors relative ${
              activeTab === tab.key
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <QuoteCardSkeleton key={i} />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            {activeTab === 'ativas'
              ? 'Nenhuma cotação ativa no momento'
              : activeTab === 'fechadas'
              ? 'Nenhuma cotação fechada ainda'
              : activeTab === 'expiradas'
              ? 'Nenhuma cotação expirada'
              : 'Nenhuma cotação encontrada'}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            As cotações aparecem aqui quando criadas via WhatsApp
          </p>
          {activeTab === 'ativas' && (
            <Button
              onClick={() => navigate('/whatsapp')}
              className="gap-2"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Criar cotação via WhatsApp
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes.map((quote: any) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                onClick={() => navigate(`/quotes/${quote.id}`)}
              />
            ))}
          </div>

          {/* Paginação */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages} &middot; {pagination.total} resultado{pagination.total !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="gap-1">
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
