import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { useCreateSubscription, useUpdatePlan, useRenewSubscription } from '../../hooks/useSubscriptions';
import { useProducers } from '../../hooks/useProducers';
import { useToast } from '../../hooks/use-toast';

interface SubscriptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription?: any;
}

export function SubscriptionFormModal({ isOpen, onClose, subscription }: SubscriptionFormModalProps) {
  const [producerId, setProducerId] = useState('');
  const [plan, setPlan] = useState<'BASIC' | 'PRO' | 'ENTERPRISE'>('BASIC');
  const [duration, setDuration] = useState<1 | 3 | 6 | 12>(1);
  const [applyImmediately, setApplyImmediately] = useState(true);
  const [mode, setMode] = useState<'create' | 'edit' | 'renew'>('create');

  const createMutation = useCreateSubscription();
  const updatePlanMutation = useUpdatePlan();
  const renewMutation = useRenewSubscription();
  const { toast } = useToast();

  const { data: producersData } = useProducers(1, 100);
  const producers = producersData?.data || [];

  useEffect(() => {
    if (subscription) {
      setMode('edit');
      setProducerId(subscription.producerId);
      setPlan(subscription.plan);
    } else {
      setMode('create');
      setProducerId('');
      setPlan('BASIC');
      setDuration(1);
    }
  }, [subscription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({
          producerId,
          plan,
          duration,
          isTrial: false,
        });
        toast({ title: 'Assinatura criada com sucesso!', variant: 'success' });
      } else if (mode === 'edit') {
        await updatePlanMutation.mutateAsync({
          id: subscription.id,
          data: {
            newPlan: plan,
            applyImmediately,
          },
        });
        toast({ title: 'Plano atualizado com sucesso!', variant: 'success' });
      } else if (mode === 'renew') {
        await renewMutation.mutateAsync({
          id: subscription.id,
          data: {
            duration,
            paymentMethod: 'PIX',
          },
        });
        toast({ title: 'Assinatura renovada com sucesso!', variant: 'success' });
      }

      onClose();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar assinatura', description: error.response?.data?.error, variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  const planPrices: Record<string, number> = {
    BASIC: 79,
    PRO: 149,
    ENTERPRISE: 299,
  };

  const calculatePrice = () => {
    const monthlyPrice = planPrices[plan] || 0;
    const discount =
      duration === 3 ? 0.05 : duration === 6 ? 0.1 : duration === 12 ? 0.15 : 0;
    return monthlyPrice * duration * (1 - discount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-md max-w-lg w-full max-h-[90vh] overflow-y-auto border-0.5 border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-medium text-foreground">
            {mode === 'create'
              ? 'Nova Assinatura'
              : mode === 'renew'
              ? 'Renovar Assinatura'
              : 'Editar Plano'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {mode === 'create' && (
            <>
              {/* Producer selection */}
              <div>
                <label className="text-sm font-normal text-foreground mb-2 block">
                  Produtor *
                </label>
                <select
                  value={producerId}
                  onChange={(e) => setProducerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm text-foreground bg-background border-0.5 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione um produtor</option>
                  {producers.map((producer: any) => (
                    <option key={producer.id} value={producer.id}>
                      {producer.name} - {producer.city}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trial removido — modelo exclusivamente pago */}
            </>
          )}

          {mode === 'edit' && subscription && (
            <div className="bg-secondary/50 border-0.5 border-border rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-1">Produtor:</p>
              <p className="text-sm font-normal text-foreground">{subscription.producer.name}</p>
              <p className="text-xs text-muted-foreground mt-2 mb-1">Plano Atual:</p>
              <p className="text-sm font-normal text-foreground">
                {subscription.plan} - R$ {planPrices[subscription.plan]}/mês
              </p>
            </div>
          )}

          {/* Plan selection */}
          {(mode === 'create' || mode === 'edit') && (
            <div>
              <label className="text-sm font-normal text-foreground mb-2 block">
                {mode === 'edit' ? 'Novo Plano' : 'Selecione o Plano'} *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['BASIC', 'PRO', 'ENTERPRISE'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`p-3 border-0.5 rounded-md text-center transition-colors ${
                      plan === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-secondary/50'
                    }`}
                  >
                    <div className="text-xs font-normal mb-1">{p}</div>
                    <div className="text-sm font-medium">R$ {planPrices[p]}</div>
                    <div className="text-xs text-muted-foreground">/mês</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Apply immediately (edit mode) */}
          {mode === 'edit' && (
            <div>
              <label className="text-sm font-normal text-foreground mb-2 block">
                Quando aplicar? *
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={applyImmediately}
                    onChange={() => setApplyImmediately(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Imediatamente (valor proporcional)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!applyImmediately}
                    onChange={() => setApplyImmediately(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    Próxima renovação ({subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString('pt-BR') : ''})
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Duration (create and renew modes) */}
          {(mode === 'create' || mode === 'renew') && (
            <div>
              <label className="text-sm font-normal text-foreground mb-2 block">
                Duração *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { months: 1, discount: 0 },
                  { months: 3, discount: 5 },
                  { months: 6, discount: 10 },
                  { months: 12, discount: 15 },
                ].map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    onClick={() => setDuration(option.months as 1 | 3 | 6 | 12)}
                    className={`p-3 border-0.5 rounded-md text-left transition-colors ${
                      duration === option.months
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-secondary/50'
                    }`}
                  >
                    <div className="text-sm font-normal">
                      {option.months} {option.months === 1 ? 'mês' : 'meses'}
                    </div>
                    {option.discount > 0 && (
                      <div className="text-xs text-primary">
                        {option.discount}% desconto
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price summary */}
          {(mode === 'create' || mode === 'renew') && (
            <div className="bg-primary/5 border-0.5 border-primary/20 rounded-md p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground">Total:</span>
                <span className="text-lg font-medium text-primary">
                  R$ {calculatePrice().toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {duration} {duration === 1 ? 'mês' : 'meses'} • R${' '}
                {planPrices[plan]}/mês
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                createMutation.isPending ||
                updatePlanMutation.isPending ||
                renewMutation.isPending
              }
              className="flex-1"
            >
              {mode === 'create'
                ? 'Criar Assinatura'
                : mode === 'renew'
                ? 'Confirmar Renovação'
                : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
