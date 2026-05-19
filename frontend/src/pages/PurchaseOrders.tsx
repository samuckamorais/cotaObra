import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Building2,
} from 'lucide-react';
import {
  usePurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '../hooks/usePurchaseOrders';
import { formatCurrency, formatDate } from '../lib/utils';

const STATUS_BADGE: Record<
  PurchaseOrderStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: 'Em geração', className: 'bg-gray-100 text-gray-700' },
  EMITTED: { label: 'Emitida', className: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};

const PAGE_SIZE = 20;

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PurchaseOrderStatus | 'ALL'>('ALL');

  const filters = status !== 'ALL' ? { status } : {};
  const { data, isLoading, error } = usePurchaseOrders(page, PAGE_SIZE, filters);

  const items = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <FileText className="size-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-medium text-foreground">Ordens de Compra</h1>
          <p className="text-sm text-muted-foreground">
            POs geradas a partir do fechamento de cotações. PDF anexável ao ERP.
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'EMITTED', 'DRAFT', 'CANCELLED'] as const).map((s) => (
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
            Erro ao carregar ordens de compra.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <FileText className="size-12 mx-auto text-muted-foreground" />
            <h2 className="font-medium">Nenhuma OC ainda</h2>
            <p className="text-sm text-muted-foreground">
              Quando você fechar uma cotação, a Ordem de Compra aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((po) => (
            <PurchaseOrderCard
              key={po.id}
              po={po}
              onClick={() => navigate(`/purchase-orders/${po.id}`)}
            />
          ))}
        </div>
      )}

      {/* Paginação */}
      {items.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {data?.pagination.total} OCs
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

function PurchaseOrderCard({
  po,
  onClick,
}: {
  po: PurchaseOrder;
  onClick: () => void;
}) {
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold text-sm">
              OC #{String(po.number).padStart(6, '0')}
            </span>
            <Badge className={STATUS_BADGE[po.status].className}>
              {STATUS_BADGE[po.status].label}
            </Badge>
          </div>
          <span className="text-lg font-semibold">
            {formatCurrency(Number(po.totalValue))}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {po.supplier && (
            <div className="flex items-center gap-2">
              <Building2 className="size-4 shrink-0" />
              <span className="truncate">{po.supplier.name}</span>
            </div>
          )}
          {po.quote?.site && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{po.quote.site.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs">Emitida em {formatDate(po.createdAt)}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            {po._count?.items ?? 0} item(ns) · {po.paymentTerms} · {po.deliveryDays} dias
          </span>
          {po.pdfUrl && (
            <a
              href={po.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download className="size-3" />
              Baixar PDF
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
