import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react';
import { usePurchaseOrder } from '../hooks/usePurchaseOrders';
import { formatCurrency, formatDate } from '../lib/utils';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Em geração', className: 'bg-gray-100 text-gray-700' },
  EMITTED: { label: 'Emitida', className: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: po, isLoading, error } = usePurchaseOrder(id);

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground animate-pulse">
          Carregando OC…
        </p>
      </div>
    );
  }
  if (error || !po) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-600">OC não encontrada.</p>
        <Button variant="outline" onClick={() => navigate('/purchase-orders')}>
          Voltar
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_LABEL[po.status] ?? {
    label: po.status,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-5 p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/purchase-orders')}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-medium">
              OC #{String(po.number).padStart(6, '0')}
            </h1>
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Emitida em {formatDate(po.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.pdfUrl ? (
            <a
              href={po.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm hover:bg-muted"
            >
              <Download className="size-4" /> Baixar PDF
            </a>
          ) : (
            <span className="text-xs text-muted-foreground italic">PDF em geração…</span>
          )}
          {po.quote && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/quotes/${po.quote!.id}`)}
              className="gap-1"
            >
              <ExternalLink className="size-3" /> Cotação
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fornecedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{po.supplier?.name}</p>
            {po.supplier?.company && (
              <p className="text-muted-foreground">{po.supplier.company}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Obra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{po.quote?.site?.name ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Itens</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Descrição</th>
                <th className="px-4 py-2 text-right">Qtd</th>
                <th className="px-4 py-2 text-left">Unid</th>
                <th className="px-4 py-2 text-right">Preço unit.</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(po.items ?? []).map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2">
                    <p>{it.description}</p>
                    {it.spec && (
                      <p className="text-xs text-muted-foreground">{it.spec}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{String(it.qty)}</td>
                  <td className="px-4 py-2">{it.unit}</td>
                  <td className="px-4 py-2 text-right">
                    {formatCurrency(Number(it.unitPrice))}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCurrency(Number(it.totalPrice))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-green-50">
                <td colSpan={4} className="px-4 py-2 text-right font-semibold">
                  TOTAL:
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {formatCurrency(Number(po.totalValue))}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Condições</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wide">
              Pagamento
            </p>
            <p>{po.paymentTerms}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wide">
              Prazo entrega
            </p>
            <p>{po.deliveryDays} dias</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wide">
              Frete
            </p>
            <p>
              {po.freightMode === 'CIF'
                ? 'CIF (incluso)'
                : po.freightMode === 'FOB'
                  ? `FOB · ${formatCurrency(Number(po.freightValue ?? 0))}`
                  : '—'}
            </p>
          </div>
          {po.observations && (
            <div className="md:col-span-3">
              <p className="text-xs uppercase text-muted-foreground tracking-wide">
                Observações
              </p>
              <p>{po.observations}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!po.pdfUrl && po.status === 'DRAFT' && (
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm flex items-center gap-2">
          <FileText className="size-4 text-amber-600" />
          O PDF está sendo gerado. Recarregue a página em alguns segundos.
        </div>
      )}
    </div>
  );
}
