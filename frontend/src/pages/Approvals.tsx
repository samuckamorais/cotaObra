import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  useApprovals,
  type ApprovalListItem,
  type ApprovalStatus,
} from '../hooks/useApprovals';
import { formatCurrency, formatDate } from '../lib/utils';

/**
 * CO-6-03 — Tela de Approvals (fila do APPROVER / ADMIN).
 *
 * Filtra por status (default = pendentes). Mostra:
 *   - obra, solicitante, total estimado, threshold ultrapassado, criada em.
 *   - badge de status + clique → detalhe.
 */

const STATUS_BADGE: Record<
  ApprovalStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PENDING: {
    label: 'Aguardando',
    className: 'bg-amber-100 text-amber-800',
    icon: Clock,
  },
  APPROVED: {
    label: 'Aprovada',
    className: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Rejeitada',
    className: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
};

const PAGE_SIZE = 20;

export default function Approvals() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ApprovalStatus | 'ALL'>('PENDING');

  const filters = status !== 'ALL' ? { status } : {};
  const { data, isLoading, error } = useApprovals(page, PAGE_SIZE, filters);

  const items = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <ShieldCheck className="size-8 text-amber-500" />
        <div>
          <h1 className="text-2xl font-medium text-foreground">Aprovações</h1>
          <p className="text-sm text-muted-foreground">
            Cotações acima do teto definido em Configurações precisam da sua decisão.
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setPage(1);
              setStatus(s);
            }}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              status === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            }`}
          >
            {s === 'ALL' ? 'Todas' : STATUS_BADGE[s].label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground animate-pulse">
            Carregando…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Erro ao carregar aprovações.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <AlertCircle className="size-12 mx-auto text-muted-foreground" />
            <h2 className="font-medium">Nada por aqui</h2>
            <p className="text-sm text-muted-foreground">
              Quando uma cotação ultrapassar o teto de aprovação, ela aparece nesta fila.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              onClick={() => navigate(`/approvals/${a.id}`)}
            />
          ))}
        </div>
      )}

      {/* Paginação */}
      {items.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {data?.pagination.total} aprovações
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  approval,
  onClick,
}: {
  approval: ApprovalListItem;
  onClick: () => void;
}) {
  const status = STATUS_BADGE[approval.status];
  const Icon = status.icon;
  const total = Number(approval.totalAmount);
  const threshold = Number(approval.thresholdAmount);
  const over = total - threshold;
  const pct = threshold > 0 ? (over / threshold) * 100 : 0;

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={status.className}>
              <Icon className="size-3 mr-1" />
              {status.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(approval.createdAt)}
            </span>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{formatCurrency(total)}</p>
            <p className="text-xs text-muted-foreground">
              +{formatCurrency(over)} sobre teto ({pct.toFixed(0)}%)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {approval.quote?.site && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{approval.quote.site.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <UserIcon className="size-4 shrink-0" />
            <span className="truncate">
              Solicitado por {approval.requestedBy?.name ?? '—'}
            </span>
          </div>
          {approval.approver && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0" />
              <span className="truncate">
                Aprovador: {approval.approver.name}
              </span>
            </div>
          )}
        </div>

        {approval.reason && approval.status === 'REJECTED' && (
          <div className="mt-3 pt-3 border-t text-xs text-red-700">
            <strong>Motivo da rejeição:</strong> {approval.reason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
