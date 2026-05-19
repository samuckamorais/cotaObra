import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  ShieldCheck,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  MapPin,
  User as UserIcon,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  useApproval,
  useApproveApproval,
  useRejectApproval,
} from '../hooks/useApprovals';
import { formatCurrency, formatDate } from '../lib/utils';

/**
 * CO-6-03 — Detalhe + decisão de uma Approval.
 */
export default function ApprovalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useApproval(id);
  const approve = useApproveApproval();
  const reject = useRejectApproval();

  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground animate-pulse">
            Carregando…
          </CardContent>
        </Card>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Aprovação não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = Number(data.totalAmount);
  const threshold = Number(data.thresholdAmount);
  const over = total - threshold;
  const pct = threshold > 0 ? (over / threshold) * 100 : 0;
  const pending = data.status === 'PENDING';

  const onApprove = async () => {
    if (!id) return;
    if (!confirm(`Aprovar cotação no valor de ${formatCurrency(total)}? Isso irá gerar a(s) Ordem(ns) de Compra.`)) {
      return;
    }
    try {
      const result = await approve.mutateAsync(id);
      if (result.purchaseOrderIds?.length) {
        alert(
          `Aprovado! ${result.purchaseOrderIds.length} Ordem(ns) de Compra geradas. Total: ${formatCurrency(result.totalValue ?? 0)}`,
        );
      } else {
        alert('Aprovação registrada.');
      }
      navigate('/approvals');
    } catch (err: any) {
      alert('Erro ao aprovar: ' + (err?.response?.data?.error?.message ?? err?.message));
    }
  };

  const onReject = async () => {
    if (!id) return;
    if (reason.trim().length < 5) {
      alert('Informe um motivo (mínimo 5 caracteres).');
      return;
    }
    try {
      await reject.mutateAsync({ id, reason: reason.trim() });
      navigate('/approvals');
    } catch (err: any) {
      alert('Erro ao rejeitar: ' + (err?.response?.data?.error?.message ?? err?.message));
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/approvals')}>
          <ChevronLeft className="size-4" />
          Voltar
        </Button>
      </div>

      <header className="flex items-start gap-3">
        <ShieldCheck className="size-8 text-amber-500 mt-1" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-medium text-foreground">
              Aprovação #{data.id.slice(0, 8)}
            </h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Criada em {formatDate(data.createdAt)} por{' '}
            <strong>{data.requestedBy?.name}</strong> ({data.requestedBy?.email})
          </p>
        </div>
      </header>

      {/* Resumo financeiro */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex justify-between items-center pb-3 border-b">
            <span className="text-sm text-muted-foreground">Valor da cotação</span>
            <span className="text-2xl font-semibold">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Teto de aprovação do tenant</span>
            <span>{formatCurrency(threshold)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Excedente</span>
            <span className="font-semibold text-amber-700">
              +{formatCurrency(over)} ({pct.toFixed(0)}%)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Obra + cotação */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-medium mb-2">Cotação</h2>
          <div className="space-y-2 text-sm">
            {data.quote?.site && (
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" />
                <span>{data.quote.site.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <UserIcon className="size-4 text-muted-foreground" />
              <span>Solicitante: {data.requestedBy?.name}</span>
            </div>
            <Link
              to={`/quotes/${data.quoteId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
            >
              Ver detalhes da cotação
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Propostas resumo */}
      {data.quote?.proposals && data.quote.proposals.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-medium mb-3">Propostas</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2">Fornecedor</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2">Pagamento</th>
                  <th className="py-2">Prazo</th>
                  <th className="py-2">Frete</th>
                  <th className="py-2 text-right">Rank</th>
                </tr>
              </thead>
              <tbody>
                {data.quote.proposals.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2 font-medium">{p.supplier.name}</td>
                    <td className="py-2 text-right">
                      {formatCurrency(Number(p.totalValue))}
                    </td>
                    <td className="py-2">{p.paymentTerms}</td>
                    <td className="py-2">{p.deliveryDays} dias</td>
                    <td className="py-2">{p.freightMode ?? '—'}</td>
                    <td className="py-2 text-right">
                      {p.rank ? <Badge>{p.rank}º</Badge> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Motivo da rejeição (se aplicável) */}
      {data.status === 'REJECTED' && data.reason && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="size-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-900">Aprovação rejeitada</p>
              <p className="text-red-800 mt-1">{data.reason}</p>
              {data.decidedAt && (
                <p className="text-xs text-red-600 mt-1">
                  em {formatDate(data.decidedAt)} por {data.approver?.name ?? '—'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      {pending && !showReject && (
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            className="text-red-700 border-red-300 hover:bg-red-50"
            onClick={() => setShowReject(true)}
            disabled={approve.isPending || reject.isPending}
          >
            <XCircle className="size-4 mr-1" />
            Rejeitar
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={onApprove}
            disabled={approve.isPending || reject.isPending}
          >
            <CheckCircle2 className="size-4 mr-1" />
            {approve.isPending ? 'Aprovando…' : 'Aprovar e gerar OC'}
          </Button>
        </div>
      )}

      {pending && showReject && (
        <Card className="border-red-200">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-medium">Motivo da rejeição</h3>
            <textarea
              className="w-full border rounded-md p-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique brevemente porque a cotação está sendo rejeitada (mínimo 5 caracteres)"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowReject(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={onReject}
                disabled={reason.trim().length < 5 || reject.isPending}
              >
                {reject.isPending ? 'Rejeitando…' : 'Confirmar rejeição'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const map = {
    PENDING: { label: 'Aguardando', className: 'bg-amber-100 text-amber-800' },
    APPROVED: { label: 'Aprovada', className: 'bg-green-100 text-green-700' },
    REJECTED: { label: 'Rejeitada', className: 'bg-red-100 text-red-700' },
  } as const;
  return <Badge className={map[status].className}>{map[status].label}</Badge>;
}
