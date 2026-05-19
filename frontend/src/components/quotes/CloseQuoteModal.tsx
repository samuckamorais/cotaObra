import { useState } from 'react';
import { Button } from '../ui/button';
import { useCloseQuote, type CloseQuoteInput } from '../../hooks/usePurchaseOrders';
import { useToast } from '../../hooks/use-toast';
import { formatCurrency } from '../../lib/utils';
import { Trophy, Split, X } from 'lucide-react';
import type { ComparativeData } from '../../hooks/useComparative';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  comparative: ComparativeData;
  onClosed?: (purchaseOrderIds: string[]) => void;
}

/**
 * CO-5-03 — Modal de escolha do modo de fechamento (winner / split).
 *
 * Modo "winner": fornece supplierId opcional (default = rank 1).
 * Modo "split": cada quoteItem precisa ter um supplier escolhido.
 */
export function CloseQuoteModal({
  isOpen,
  onClose,
  quoteId,
  comparative,
  onClosed,
}: Props) {
  const [mode, setMode] = useState<'winner' | 'split'>('winner');
  const [winnerSupplierId, setWinnerSupplierId] = useState<string>(
    comparative.summary.winnerSupplierId ?? '',
  );
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const closeMut = useCloseQuote();
  const { toast } = useToast();

  if (!isOpen) return null;

  const { quote, proposals } = comparative;

  async function handleClose() {
    const input: CloseQuoteInput = {
      mode,
      reason: reason.trim() || undefined,
      ...(mode === 'winner'
        ? { supplierId: winnerSupplierId || undefined }
        : { selections }),
    };

    // Valida split: todos os items precisam ter supplier
    if (mode === 'split') {
      const missing = quote.items.filter((it) => !selections[it.id]);
      if (missing.length > 0) {
        toast({
          title: 'Items sem fornecedor',
          description: `Escolha um fornecedor para: ${missing.map((i) => i.description).slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const result = await closeMut.mutateAsync({ quoteId, input });
      toast({
        title: `${result.purchaseOrders.length} OC(s) criada(s) ✅`,
        description: `Total: ${formatCurrency(result.totalValue)} · PDFs em geração.`,
        variant: 'success',
      });
      onClosed?.(result.purchaseOrderIds);
      onClose();
    } catch (err: any) {
      toast({
        title: 'Erro ao fechar cotação',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <header className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">Fechar cotação</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Gera Ordem(ns) de Compra + notifica vencedor(es) e perdedores.
              </p>
            </div>
            <button onClick={onClose} aria-label="Fechar">
              <X className="size-5" />
            </button>
          </header>

          {/* Toggle de modo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('winner')}
              className={`p-4 rounded-lg border text-left transition-colors ${
                mode === 'winner'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <Trophy className="size-5 mb-2" />
              <p className="font-medium">1 fornecedor único</p>
              <p className="text-xs text-muted-foreground mt-1">
                Vencedor leva tudo. Cria 1 OC.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode('split')}
              className={`p-4 rounded-lg border text-left transition-colors ${
                mode === 'split'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <Split className="size-5 mb-2" />
              <p className="font-medium">Split por item</p>
              <p className="text-xs text-muted-foreground mt-1">
                Escolhe fornecedor por item. Cria N OCs.
              </p>
            </button>
          </div>

          {mode === 'winner' ? (
            <div>
              <label className="text-sm font-medium">Fornecedor vencedor</label>
              <select
                className="w-full h-10 mt-1 rounded-md border border-input bg-background px-3 text-sm"
                value={winnerSupplierId}
                onChange={(e) => setWinnerSupplierId(e.target.value)}
              >
                {proposals.map((p) => (
                  <option key={p.supplierId} value={p.supplierId}>
                    {p.rank}º · {p.supplierName} ·{' '}
                    {p.correctedTotal !== null
                      ? formatCurrency(p.correctedTotal)
                      : formatCurrency(p.totalValue)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Default = rank 1 (menor preço corrigido).
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Escolha um fornecedor por item</p>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-left">Fornecedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.qty} {item.unit}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs"
                            value={selections[item.id] ?? ''}
                            onChange={(e) =>
                              setSelections((s) => ({ ...s, [item.id]: e.target.value }))
                            }
                          >
                            <option value="">Selecione…</option>
                            {proposals.map((p) => {
                              const propItem = p.items.find(
                                (i) => i.quoteItemId === item.id,
                              );
                              if (!propItem || !propItem.available) return null;
                              return (
                                <option key={p.supplierId} value={p.supplierId}>
                                  {p.supplierName} · {formatCurrency(propItem.totalPrice)}
                                  {propItem.rank === 1 ? ' (1º)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Observação (opcional)</label>
            <textarea
              className="w-full min-h-[60px] mt-1 rounded-md border border-input bg-background p-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo da escolha (visível no audit log)"
            />
          </div>

          <footer className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleClose} disabled={closeMut.isPending}>
              {closeMut.isPending ? 'Fechando…' : 'Confirmar fechamento'}
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
