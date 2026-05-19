import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  useQuoteRequest,
  usePromoteQuoteRequest,
  useRejectQuoteRequest,
  type QuoteRequest,
} from '../../hooks/useQuoteRequests';
import { useToast } from '../../hooks/use-toast';
import { Trash2, Plus, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  requestId: string | null;
}

interface EditableItem {
  description: string;
  qty: string; // string para input livre, parse no submit
  unit: string;
  spec: string;
}

function loadEditableItems(qr: QuoteRequest | undefined): EditableItem[] {
  if (!qr) return [{ description: '', qty: '', unit: '', spec: '' }];
  return qr.items.map((it) => ({
    description: it.description ?? '',
    qty: it.qty != null ? String(it.qty) : '',
    unit: it.unit ?? '',
    spec: it.spec ?? '',
  }));
}

export function QuoteRequestReviewModal({ isOpen, onClose, requestId }: Props) {
  const { data: qr, isLoading } = useQuoteRequest(requestId ?? undefined);
  const promoteMut = usePromoteQuoteRequest();
  const rejectMut = useRejectQuoteRequest();
  const { toast } = useToast();

  const [items, setItems] = useState<EditableItem[]>([]);
  const [deadline, setDeadline] = useState('');
  const [region, setRegion] = useState('');
  const [observations, setObservations] = useState('');
  const [freight, setFreight] = useState<'CIF' | 'FOB' | ''>('CIF');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [supplierScope, setSupplierScope] = useState<'MINE' | 'NETWORK' | 'ALL'>('MINE');
  const [expiryHours, setExpiryHours] = useState(24);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (qr) {
      setItems(loadEditableItems(qr));
      setDeadline(qr.deadlineAt ? qr.deadlineAt.substring(0, 10) : '');
      setRegion(qr.site?.city ? `${qr.site.city}/${qr.site.state}` : '');
      setObservations(qr.observation ?? '');
      setFreight('CIF');
      setPaymentTerms('');
      setSupplierScope('MINE');
      setRejectMode(false);
      setRejectReason('');
    }
  }, [qr]);

  function updateItem(i: number, patch: Partial<EditableItem>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((arr) => [...arr, { description: '', qty: '', unit: '', spec: '' }]);
  }
  function removeItem(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function handlePromote(ev: FormEvent) {
    ev.preventDefault();
    if (!requestId) return;
    if (!deadline) {
      toast({ title: 'Defina o prazo', variant: 'destructive' });
      return;
    }
    const cleanedItems = items
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description.trim(),
        qty: parseFloat(it.qty.replace(',', '.')) || 0,
        unit: it.unit.trim() || 'un',
        spec: it.spec.trim() || undefined,
      }));

    if (cleanedItems.length === 0) {
      toast({ title: 'Adicione pelo menos 1 item', variant: 'destructive' });
      return;
    }
    if (cleanedItems.some((it) => it.qty <= 0)) {
      toast({ title: 'Quantidade deve ser > 0 em todos os itens', variant: 'destructive' });
      return;
    }

    try {
      const result = await promoteMut.mutateAsync({
        id: requestId,
        data: {
          items: cleanedItems,
          region: region || undefined,
          deadline: new Date(deadline).toISOString(),
          observations: observations || undefined,
          freight: (freight || undefined) as 'CIF' | 'FOB' | undefined,
          paymentTerms: paymentTerms || undefined,
          supplierScope,
          expiryHours,
        },
      });
      toast({
        title: 'Solicitação promovida ✅',
        description: `Cotação ${result.quoteId.slice(0, 8)} criada e pronta para disparo.`,
        variant: 'success',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Erro ao promover',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function handleReject() {
    if (!requestId || !rejectReason.trim()) {
      toast({ title: 'Informe o motivo da recusa', variant: 'destructive' });
      return;
    }
    try {
      await rejectMut.mutateAsync({ id: requestId, reason: rejectReason.trim() });
      toast({ title: 'Solicitação recusada', variant: 'default' });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Erro ao recusar',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  if (!isOpen) return null;

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
              <h2 className="text-xl font-semibold">Revisar solicitação</h2>
              {qr?.site && (
                <p className="text-sm text-muted-foreground mt-1">
                  Obra: <strong>{qr.site.name}</strong> · {qr.site.city}/{qr.site.state}
                </p>
              )}
              {qr?.requester && (
                <p className="text-xs text-muted-foreground">
                  Solicitante: {qr.requester.name}
                  {qr.requester.phone && ` · ${qr.requester.phone}`}
                </p>
              )}
            </div>
            <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground">
              <X className="size-5" />
            </button>
          </header>

          {qr?.rawText && (
            <div className="bg-muted/40 border border-border rounded p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Mensagem original (WhatsApp)
              </p>
              <p className="text-sm mt-1 italic">"{qr.rawText}"</p>
            </div>
          )}

          {isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : !qr ? (
            <p className="text-red-600">Solicitação não encontrada.</p>
          ) : rejectMode ? (
            <div className="space-y-3">
              <Label htmlFor="rejectReason">Motivo da recusa *</Label>
              <textarea
                id="rejectReason"
                className="w-full min-h-[100px] rounded-md border border-input bg-background p-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: obra Aurora não está mais ativa; pediu material errado…"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectMode(false)}>
                  Voltar
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={rejectMut.isPending || !rejectReason.trim()}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  {rejectMut.isPending ? 'Recusando…' : 'Confirmar recusa'}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePromote} className="space-y-4">
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Itens da cotação</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1">
                    <Plus className="size-3" />
                    Adicionar item
                  </Button>
                </div>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start">
                      <Input
                        className="col-span-6"
                        placeholder="Descrição do material"
                        value={it.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                      />
                      <Input
                        className="col-span-2"
                        placeholder="Qty"
                        inputMode="decimal"
                        value={it.qty}
                        onChange={(e) => updateItem(i, { qty: e.target.value })}
                      />
                      <Input
                        className="col-span-2"
                        placeholder="Unidade"
                        value={it.unit}
                        onChange={(e) => updateItem(i, { unit: e.target.value })}
                      />
                      <Input
                        className="col-span-2"
                        placeholder="Spec/NBR (opcional)"
                        value={it.spec}
                        onChange={(e) => updateItem(i, { spec: e.target.value })}
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="col-span-12 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 -mt-1"
                          onClick={() => removeItem(i)}
                        >
                          <Trash2 className="size-3" /> remover linha
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="deadline">Prazo de entrega *</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="region">Região (cidade/UF)</Label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="São Paulo/SP"
                  />
                </div>
                <div>
                  <Label htmlFor="freight">Frete</Label>
                  <select
                    id="freight"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value as 'CIF' | 'FOB' | '')}
                  >
                    <option value="">A definir</option>
                    <option value="CIF">CIF (entrega na obra)</option>
                    <option value="FOB">FOB (retira no fornecedor)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="paymentTerms">Condição de pagamento</Label>
                  <Input
                    id="paymentTerms"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="à vista, 28dd, 28/56dd, …"
                  />
                </div>
                <div>
                  <Label htmlFor="scope">Fornecedores</Label>
                  <select
                    id="scope"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={supplierScope}
                    onChange={(e) => setSupplierScope(e.target.value as 'MINE' | 'NETWORK' | 'ALL')}
                  >
                    <option value="MINE">Meus fornecedores</option>
                    <option value="NETWORK">Rede CotaObra</option>
                    <option value="ALL">Todos</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="expiryHours">Expira em (horas)</Label>
                  <Input
                    id="expiryHours"
                    type="number"
                    min={1}
                    max={720}
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(parseInt(e.target.value) || 24)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="obs">Observações para fornecedores</Label>
                <textarea
                  id="obs"
                  className="w-full min-h-[60px] rounded-md border border-input bg-background p-2 text-sm"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </div>

              <footer className="flex justify-between gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setRejectMode(true)}
                >
                  Recusar
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={promoteMut.isPending}>
                    {promoteMut.isPending ? 'Criando cotação…' : 'Promover → Cotação'}
                  </Button>
                </div>
              </footer>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
