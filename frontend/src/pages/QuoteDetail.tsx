import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useQuote, useCloseQuote } from '../hooks/useQuotes';
import { formatDate, formatCurrency } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import {
  ArrowLeft,
  CheckCircle,
  MapPin,
  Package,
  User,
  Hash,
  Calendar,
  FileText,
  MessageCircle,
} from 'lucide-react';
import { SupplierStatusGrid } from '../components/quotes/SupplierStatusGrid';
import { PricingComparator } from '../components/quotes/PricingComparator';
import { api } from '../api/client';

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
  SUMMARIZED: 'Resumida',
  CLOSED: 'Fechada',
  EXPIRED: 'Expirada',
};

export function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote, isLoading, error } = useQuote(id!);
  const closeQuoteMutation = useCloseQuote();
  const { toast } = useToast();

  const handleCloseQuote = async (supplierId: string) => {
    if (!id) return;

    try {
      await closeQuoteMutation.mutateAsync({ quoteId: id, supplierId });
      toast({ title: 'Cotação fechada com sucesso!', variant: 'success' });
    } catch {
      toast({ title: 'Erro ao fechar cotação', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotes')} className="gap-2 -ml-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </Button>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Carregando detalhes...</div>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotes')} className="gap-2 -ml-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </Button>
        <div className="bg-[hsl(var(--error-bg))] border-0.5 border-[hsl(var(--error))] rounded-md p-4">
          <p className="text-sm text-[hsl(var(--error))]">Erro ao carregar detalhes da cotação</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotes')} className="gap-2 mb-4 -ml-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-2xl font-medium text-foreground">
              Cotação #{quote.id.substring(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detalhes e propostas recebidas
            </p>
          </div>
          <Badge variant={statusColors[quote.status]} className="shrink-0 mt-1">{statusLabels[quote.status]}</Badge>
        </div>
      </div>

      {/* Informações da Cotação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">
            Informações da Cotação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6">
            {/* Produto */}
            <div className="flex items-start gap-2">
              <Package className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Produto</p>
                <p className="text-sm font-normal text-foreground mt-1">{quote.product}</p>
              </div>
            </div>

            {/* Produtor */}
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Produtor</p>
                <p className="text-sm font-normal text-foreground mt-1">{quote.producer.name}</p>
                {quote.producer.phone && (
                  <p className="text-xs text-muted-foreground mt-0.5">{quote.producer.phone}</p>
                )}
              </div>
            </div>

            {/* Quantidade */}
            <div className="flex items-start gap-2">
              <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Quantidade</p>
                <p className="text-sm font-normal text-foreground mt-1">
                  {quote.quantity} {quote.unit}
                </p>
              </div>
            </div>

            {/* Região/Município */}
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Município</p>
                <p className="text-sm font-normal text-foreground mt-1">{quote.region}</p>
              </div>
            </div>

            {/* Criada em */}
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Criada em</p>
                <p className="text-sm font-normal text-foreground mt-1">
                  {formatDate(quote.createdAt)}
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={statusColors[quote.status]} className="mt-1">
                  {statusLabels[quote.status]}
                </Badge>
              </div>
            </div>
          </div>

          {quote.observations && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Observações</p>
              <div className="bg-muted rounded-md p-3">
                <p className="text-sm text-foreground">{quote.observations}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CO-3-09 — Quadro de status dos fornecedores convidados */}
      {(quote.status === 'COLLECTING' || quote.status === 'SUMMARIZED') && (
        <SupplierStatusGrid quoteId={quote.id} />
      )}

      {/* CO-4-05 — Quadro comparativo (pricing engine) */}
      {(quote.status === 'SUMMARIZED' || quote.status === 'CLOSED') && (
        <PricingComparator
          quoteId={quote.id}
          onClickExport={async () => {
            try {
              const res = await api.get(`/quotes/${quote.id}/export?format=xlsx`, {
                responseType: 'blob',
              });
              const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cotacao-${quote.id.slice(0, 8)}-comparativo.xlsx`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (err) {
              toast({
                title: 'Erro ao exportar',
                description: 'Tente novamente.',
                variant: 'destructive',
              });
            }
          }}
        />
      )}

      {/* Propostas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground">
              Propostas Recebidas
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {quote.proposals?.length || 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!quote.proposals || quote.proposals.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Aguardando propostas dos fornecedores
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                As propostas aparecem automaticamente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {quote.proposals.map((proposal: any, index: number) => (
                <div
                  key={proposal.id}
                  className={`border-0.5 rounded-md p-4 transition-colors ${
                    quote.closedSupplierId === proposal.supplierId
                      ? 'bg-primary/5 border-primary'
                      : 'border-border hover:bg-secondary/50'
                  }`}
                >
                  {/* Header da Proposta */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-foreground">
                          {proposal.supplier.name}
                        </h3>
                        {proposal.supplier.phone && (
                          <p className="text-xs text-muted-foreground">{proposal.supplier.phone}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {proposal.isOwnSupplier && (
                        <Badge variant="default" className="text-xs">Próprio</Badge>
                      )}
                      {quote.closedSupplierId === proposal.supplierId && (
                        <Badge variant="success" className="text-xs gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Selecionada
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Valores */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-base font-medium text-primary mt-1">
                        {formatCurrency(proposal.totalPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Preço Unit.</p>
                      <p className="text-sm font-normal text-foreground mt-1">
                        {formatCurrency(proposal.price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Prazo Entrega</p>
                      <p className="text-sm font-normal text-foreground mt-1">
                        {proposal.deliveryDays} dias
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pagamento</p>
                      <p className="text-sm font-normal text-foreground mt-1">
                        {proposal.paymentTerms}
                      </p>
                    </div>
                  </div>

                  {/* Observações */}
                  {proposal.observations && (
                    <div className="bg-muted rounded-md p-2 mb-3">
                      <p className="text-xs text-muted-foreground mb-1">Observações:</p>
                      <p className="text-xs text-foreground">{proposal.observations}</p>
                    </div>
                  )}

                  {/* Ação: Selecionar */}
                  {quote.status === 'SUMMARIZED' && !quote.closedSupplierId && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleCloseQuote(proposal.supplierId)}
                        disabled={closeQuoteMutation.isPending}
                        className="gap-1.5"
                      >
                        {closeQuoteMutation.isPending ? (
                          'Processando...'
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Selecionar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(`https://wa.me/${proposal.supplier.phone}`, '_blank')
                        }
                        className="gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações sobre origem WhatsApp */}
      <div className="bg-secondary/50 border-0.5 border-border rounded-md p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Cotação criada via WhatsApp</span>
        </div>
      </div>
    </div>
  );
}
