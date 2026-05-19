import { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Inbox,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User as UserIcon,
} from 'lucide-react';
import {
  useQuoteRequests,
  type QuoteRequest,
  type QuoteRequestStatus,
} from '../hooks/useQuoteRequests';
import { QuoteRequestReviewModal } from '../components/quote-requests/QuoteRequestReviewModal';

const STATUS_BADGE: Record<QuoteRequestStatus, { label: string; className: string }> = {
  PENDING_REVIEW: { label: 'Pendente', className: 'bg-amber-100 text-amber-800' },
  PROMOTED: { label: 'Promovida', className: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Recusada', className: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Expirada', className: 'bg-gray-100 text-gray-800' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

const PAGE_SIZE = 20;

export default function QuoteRequests() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QuoteRequestStatus | 'ALL'>('PENDING_REVIEW');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const filters = status !== 'ALL' ? { status } : {};
  const { data, isLoading, error } = useQuoteRequests(page, PAGE_SIZE, filters);

  const items = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  function openReview(qr: QuoteRequest) {
    setReviewingId(qr.id);
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <Inbox className="size-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-medium text-foreground">Solicitações</h1>
          <p className="text-sm text-muted-foreground">
            Solicitações de obra recebidas via WhatsApp — aguardando revisão antes
            de virar cotação.
          </p>
        </div>
      </header>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2">
        {(['PENDING_REVIEW', 'PROMOTED', 'REJECTED', 'EXPIRED', 'ALL'] as const).map((s) => (
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
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5">
                <div className="h-5 bg-muted rounded w-2/3 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Erro ao carregar solicitações.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <Inbox className="size-12 mx-auto text-muted-foreground" />
            <h2 className="font-medium">
              {status === 'PENDING_REVIEW' ? 'Nada pendente 🎉' : 'Sem solicitações'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {status === 'PENDING_REVIEW'
                ? 'Quando um engenheiro abrir uma solicitação pelo WhatsApp, ela aparecerá aqui.'
                : 'Tente trocar o filtro.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((qr) => (
            <Card key={qr.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{qr.id.slice(0, 8)}
                    </span>
                    <Badge className={STATUS_BADGE[qr.status].className}>
                      {STATUS_BADGE[qr.status].label}
                    </Badge>
                    {qr.source === 'whatsapp' && (
                      <Badge className="bg-green-50 text-green-700 border border-green-200">
                        WhatsApp
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" /> {timeAgo(qr.createdAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-sm">
                  {qr.site && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="size-4 shrink-0" />
                      <span className="truncate">
                        {qr.site.name} · {qr.site.city}/{qr.site.state}
                      </span>
                    </div>
                  )}
                  {qr.requester && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserIcon className="size-4 shrink-0" />
                      <span className="truncate">{qr.requester.name}</span>
                    </div>
                  )}
                  {qr.deadlineAt && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-4 shrink-0" />
                      <span>
                        Prazo: {new Date(qr.deadlineAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Itens (preview até 3) */}
                <div className="bg-muted/30 rounded p-3 text-sm space-y-1">
                  {qr.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>
                        {[item.qty, item.unit, item.description]
                          .filter(Boolean)
                          .join(' ')}
                        {item.spec ? ` (${item.spec})` : ''}
                      </span>
                    </div>
                  ))}
                  {qr.items.length > 3 && (
                    <div className="text-xs text-muted-foreground italic">
                      … e mais {qr.items.length - 3} item(ns)
                    </div>
                  )}
                </div>

                {qr.rejectionReason && (
                  <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    <strong>Recusada:</strong> {qr.rejectionReason}
                  </div>
                )}

                {qr.status === 'PENDING_REVIEW' && (
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t">
                    <Button size="sm" onClick={() => openReview(qr)}>
                      Revisar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginação */}
      {items.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {data?.pagination.total} solicitações
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

      <QuoteRequestReviewModal
        isOpen={!!reviewingId}
        onClose={() => setReviewingId(null)}
        requestId={reviewingId}
      />
    </div>
  );
}
