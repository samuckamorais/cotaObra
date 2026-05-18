import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuote, useQuoteResults, useCloseTotalWinner, useCloseByItem } from '../hooks/useQuotes';
import { Trophy, Package, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { ConfirmModal } from '../components/ui/confirm-modal';

type ViewMode = 'total' | 'byItem';

export function QuoteResults() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote } = useQuote(id!);
  const { data: results, isLoading, error } = useQuoteResults(id!, quote?.status);
  const closeTotalMutation = useCloseTotalWinner();
  const closeByItemMutation = useCloseByItem();
  const { toast } = useToast();

  const [mode, setMode] = useState<ViewMode>('total');
  const [itemSelections, setItemSelections] = useState<Record<string, string>>({});
  const [confirmTotal, setConfirmTotal] = useState<{ supplierId: string; supplierName: string } | null>(null);
  const [confirmByItem, setConfirmByItem] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando resultados...</p>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <p className="text-red-600">Erro ao carregar resultados.</p>
      </div>
    );
  }

  const isClosed = results.status === 'CLOSED';

  const handleConfirmTotal = async () => {
    if (!confirmTotal) return;
    try {
      await closeTotalMutation.mutateAsync({ quoteId: id!, supplierId: confirmTotal.supplierId });
      toast({ title: 'Cotação fechada com sucesso!', variant: 'success' });
      setConfirmTotal(null);
    } catch (e: any) {
      toast({ title: 'Erro ao fechar cotação', description: e.response?.data?.error?.message, variant: 'destructive' });
    }
  };

  const handleConfirmByItem = async () => {
    const winners = Object.entries(itemSelections)
      .filter(([, supplierId]) => supplierId)
      .map(([quoteItemId, supplierId]) => ({ quoteItemId, supplierId }));
    try {
      await closeByItemMutation.mutateAsync({ quoteId: id!, winners });
      toast({ title: 'Cotação fechada com sucesso!', variant: 'success' });
      setConfirmByItem(false);
    } catch (e: any) {
      toast({ title: 'Erro ao fechar cotação', description: e.response?.data?.error?.message, variant: 'destructive' });
    }
  };

  const handleCloseByItemClick = () => {
    const winners = Object.entries(itemSelections).filter(([, s]) => s);
    if (winners.length === 0) {
      toast({ title: 'Selecione o vencedor de ao menos um item.', variant: 'destructive' });
      return;
    }
    setConfirmByItem(true);
  };

  const freightLabel = (f: string | null) => {
    if (f === 'CIF') return 'CIF (entrega inclusa)';
    if (f === 'FOB') return 'FOB (retira no fornecedor)';
    return '—';
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotes')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resultados da Cotação</h1>
          <p className="text-sm text-muted-foreground">{results.producerName} · {results.region}</p>
        </div>
        {isClosed && (
          <span className="ml-auto px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            ✅ Encerrada
          </span>
        )}
      </div>

      {/* Detalhes da cotação */}
      <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {results.category && <div><span className="text-muted-foreground">Categoria</span><p className="font-medium">{results.category}</p></div>}
        <div><span className="text-muted-foreground">Dt. Entrega</span><p className="font-medium">{new Date(results.deadline).toLocaleDateString('pt-BR')}</p></div>
        <div><span className="text-muted-foreground">Frete</span><p className="font-medium">{freightLabel(results.freight)}</p></div>
        <div><span className="text-muted-foreground">Propostas</span><p className="font-medium">{results.totalPriceRanking.length + results.partialProposals.length}</p></div>
      </div>

      {/* Itens */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
          <Package className="w-4 h-4" /> Itens cotados
        </h2>
        <div className="flex flex-wrap gap-2">
          {results.items.map((it: any) => (
            <span key={it.id} className="px-3 py-1 bg-muted rounded-full text-sm">
              {it.product} — {it.quantity} {it.unit}
            </span>
          ))}
        </div>
      </div>

      {/* Toggle de modo */}
      {!isClosed && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('total')}
            className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
              mode === 'total'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-muted'
            }`}
          >
            🏆 Vencedor — Melhor preço total
          </button>
          <button
            onClick={() => setMode('byItem')}
            className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
              mode === 'byItem'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-muted'
            }`}
          >
            📦 Vencedores por item
          </button>
        </div>
      )}

      {/* === MODO: MELHOR PREÇO TOTAL === */}
      {(mode === 'total' || isClosed) && (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Ranking — Melhor preço total
          </h2>

          {results.totalPriceRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma proposta completa recebida.</p>
          ) : (
            results.totalPriceRanking.map((r: any, idx: number) => {
              const isWinner = results.closedSupplierId === r.supplierId;
              return (
                <div
                  key={r.proposalId}
                  className={`bg-card border rounded-lg p-4 flex items-center justify-between gap-3 ${
                    isWinner ? 'border-green-400 bg-green-50' : idx === 0 ? 'border-yellow-400' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-muted-foreground w-8 text-center">
                      {isWinner ? '🏆' : `${idx + 1}º`}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{r.supplierName}</p>
                      <p className="text-xs text-muted-foreground">
                        Entrega em {r.deliveryDays} dias · {r.paymentTerms}
                      </p>
                      {r.observations && (
                        <p className="text-xs text-muted-foreground italic">"{r.observations}"</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-foreground">
                      R$ {r.totalPrice.toFixed(2).replace('.', ',')}
                    </p>
                    {!isClosed && (
                      <Button
                        size="sm"
                        className="mt-1"
                        disabled={closeTotalMutation.isPending}
                        onClick={() => setConfirmTotal({ supplierId: r.supplierId, supplierName: r.supplierName })}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Selecionar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Propostas parciais */}
          {results.partialProposals.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Fornecedores com proposta incompleta
              </h3>
              {results.partialProposals.map((r: any) => (
                <div
                  key={r.proposalId}
                  className="bg-card border border-dashed border-border rounded-lg p-3 flex items-center justify-between gap-3 opacity-75"
                >
                  <div>
                    <p className="font-medium text-foreground">{r.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      Proposta parcial ({r.itemsCovered}/{r.itemsTotal} itens) · Entrega {r.deliveryDays} dias
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    R$ {r.totalPrice.toFixed(2).replace('.', ',')}
                    <span className="text-xs text-muted-foreground block">parcial</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === MODO: VENCEDORES POR ITEM === */}
      {mode === 'byItem' && !isClosed && (
        <div className="space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4" /> Vencedores por item
          </h2>
          <p className="text-sm text-muted-foreground">
            Selecione o melhor fornecedor para cada item individualmente.
          </p>

          {results.itemWinners.map((iw: any) => (
            <div key={iw.quoteItemId} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 flex items-center justify-between">
                <span className="font-medium text-foreground">{iw.product}</span>
                <span className="text-sm text-muted-foreground">{iw.quantity} {iw.unit}</span>
              </div>

              {iw.allOffers.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma proposta para este item.</p>
              ) : (
                <div className="divide-y divide-border">
                  {iw.allOffers.map((offer: any, idx: number) => {
                    const isSelected = itemSelections[iw.quoteItemId] === offer.supplierId;
                    return (
                      <label
                        key={offer.proposalId}
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-green-50' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`item-${iw.quoteItemId}`}
                            checked={isSelected}
                            onChange={() =>
                              setItemSelections((prev) => ({ ...prev, [iw.quoteItemId]: offer.supplierId }))
                            }
                            className="w-4 h-4 text-green-600"
                          />
                          <div>
                            <p className="font-medium text-foreground">{offer.supplierName}</p>
                            {idx === 0 && (
                              <span className="text-xs text-yellow-600 font-medium">⭐ Melhor preço</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-foreground">
                            R$ {offer.unitPrice.toFixed(2).replace('.', ',')}/<span className="text-xs font-normal">{iw.unit}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Total: R$ {offer.totalPrice.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {Object.values(itemSelections).some(Boolean) && (
            <Button
              className="w-full"
              disabled={closeByItemMutation.isPending}
              onClick={handleCloseByItemClick}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirmar vencedores selecionados
            </Button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmTotal}
        onClose={() => setConfirmTotal(null)}
        onConfirm={handleConfirmTotal}
        title="Fechar cotação"
        description={`Deseja fechar a cotação com "${confirmTotal?.supplierName}"? Esta ação é irreversível. Os demais fornecedores serão notificados.`}
        confirmLabel="Fechar cotação"
        confirmText="FECHAR"
        delaySeconds={3}
        variant="danger"
        isLoading={closeTotalMutation.isPending}
      />

      <ConfirmModal
        isOpen={confirmByItem}
        onClose={() => setConfirmByItem(false)}
        onConfirm={handleConfirmByItem}
        title="Fechar cotação por item"
        description={`Deseja fechar a cotação com os fornecedores selecionados por item? Esta ação é irreversível.`}
        confirmLabel="Fechar cotação"
        confirmText="FECHAR"
        delaySeconds={3}
        variant="danger"
        isLoading={closeByItemMutation.isPending}
      />
    </div>
  );
}
