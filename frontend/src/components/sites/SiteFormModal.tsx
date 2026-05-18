import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  useCreateSite,
  useUpdateSite,
  type CreateSiteDTO,
  type Site,
  type SiteStatus,
} from '../../hooks/useSites';
import { useToast } from '../../hooks/use-toast';

interface SiteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editing?: Site | null;
}

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const STATUS_LABELS: Record<SiteStatus, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const emptyForm: CreateSiteDTO = {
  name: '',
  cno: '',
  address: '',
  city: '',
  state: 'SP',
  zip: '',
  region: '',
  manager: '',
  managerPhone: '',
  budget: null,
  status: 'ACTIVE',
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function formatBudgetBR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBudgetBR(s: string): number | null {
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function SiteFormModal({ isOpen, onClose, editing }: SiteFormModalProps) {
  const [form, setForm] = useState<CreateSiteDTO>(emptyForm);
  const [budgetText, setBudgetText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = useCreateSite();
  const updateMut = useUpdateSite();
  const { toast } = useToast();

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        cno: editing.cno ?? '',
        address: editing.address ?? '',
        city: editing.city,
        state: editing.state,
        zip: editing.zip ?? '',
        region: editing.region,
        manager: editing.manager ?? '',
        managerPhone: editing.managerPhone ?? '',
        budget: editing.budget ? Number(editing.budget) : null,
        status: editing.status,
        startAt: editing.startAt ?? undefined,
        endAt: editing.endAt ?? undefined,
      });
      setBudgetText(editing.budget ? formatBudgetBR(Number(editing.budget)) : '');
    } else {
      setForm(emptyForm);
      setBudgetText('');
    }
    setErrors({});
  }, [editing, isOpen]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = 'Nome deve ter ao menos 3 caracteres';
    if (form.city.trim().length < 2) e.city = 'Cidade obrigatória';
    if (!BR_STATES.includes(form.state)) e.state = 'UF inválida';
    if (form.region.trim().length < 2) e.region = 'Região obrigatória';
    if (form.cno && !/^\d{12}$/.test(digitsOnly(form.cno))) {
      e.cno = 'CNO deve ter 12 dígitos';
    }
    if (form.zip && !/^\d{5}-?\d{3}$/.test(form.zip)) {
      e.zip = 'CEP inválido (use 12345-678)';
    }
    if (form.managerPhone && !/^\+\d{10,15}$/.test(form.managerPhone)) {
      e.managerPhone = 'Use formato E.164 (+5511999999999)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    const payload: CreateSiteDTO = {
      ...form,
      cno: form.cno ? digitsOnly(form.cno) : undefined,
      address: form.address || undefined,
      zip: form.zip || undefined,
      manager: form.manager || undefined,
      managerPhone: form.managerPhone || undefined,
      budget: parseBudgetBR(budgetText),
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast({ title: 'Obra atualizada', variant: 'success' });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: 'Obra cadastrada', variant: 'success' });
      }
      onClose();
    } catch (err: any) {
      toast({
        title: editing ? 'Erro ao atualizar' : 'Erro ao cadastrar',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  if (!isOpen) return null;

  const submitting = createMut.isPending || updateMut.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editing ? 'Editar Obra' : 'Nova Obra'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar"
            >
              ✕
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="name">Nome da Obra *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Residencial Aurora — Torre A"
                required
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="cno">CNO (opcional)</Label>
              <Input
                id="cno"
                value={form.cno}
                onChange={(e) => setForm({ ...form, cno: digitsOnly(e.target.value) })}
                placeholder="12 dígitos"
                maxLength={12}
              />
              {errors.cno && <p className="text-xs text-red-600 mt-1">{errors.cno}</p>}
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.status ?? 'ACTIVE'}
                onChange={(e) => setForm({ ...form, status: e.target.value as SiteStatus })}
              >
                {(Object.entries(STATUS_LABELS) as Array<[SiteStatus, string]>).map(
                  ([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua das Acácias, 1500"
              />
            </div>

            <div>
              <Label htmlFor="city">Cidade *</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="São Paulo"
                required
              />
              {errors.city && <p className="text-xs text-red-600 mt-1">{errors.city}</p>}
            </div>

            <div>
              <Label htmlFor="state">UF *</Label>
              <select
                id="state"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              >
                {BR_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {errors.state && <p className="text-xs text-red-600 mt-1">{errors.state}</p>}
            </div>

            <div>
              <Label htmlFor="zip">CEP</Label>
              <Input
                id="zip"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
                placeholder="04567-890"
              />
              {errors.zip && <p className="text-xs text-red-600 mt-1">{errors.zip}</p>}
            </div>

            <div>
              <Label htmlFor="region">Região *</Label>
              <Input
                id="region"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="SP-Capital-Sul"
                required
              />
              {errors.region && <p className="text-xs text-red-600 mt-1">{errors.region}</p>}
            </div>

            <div>
              <Label htmlFor="manager">Engenheiro responsável</Label>
              <Input
                id="manager"
                value={form.manager}
                onChange={(e) => setForm({ ...form, manager: e.target.value })}
                placeholder="Carlos Ramos"
              />
            </div>

            <div>
              <Label htmlFor="managerPhone">WhatsApp do engenheiro</Label>
              <Input
                id="managerPhone"
                value={form.managerPhone}
                onChange={(e) => setForm({ ...form, managerPhone: e.target.value })}
                placeholder="+5511999999999"
              />
              {errors.managerPhone && (
                <p className="text-xs text-red-600 mt-1">{errors.managerPhone}</p>
              )}
            </div>

            <div>
              <Label htmlFor="budget">Orçamento (R$)</Label>
              <Input
                id="budget"
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                placeholder="4.200.000,00"
                inputMode="decimal"
              />
            </div>

            <div>
              <Label htmlFor="startAt">Início da obra</Label>
              <Input
                id="startAt"
                type="date"
                value={form.startAt ? form.startAt.substring(0, 10) : ''}
                onChange={(e) =>
                  setForm({ ...form, startAt: e.target.value || undefined })
                }
              />
            </div>

            <div>
              <Label htmlFor="endAt">Previsão de término</Label>
              <Input
                id="endAt"
                type="date"
                value={form.endAt ? form.endAt.substring(0, 10) : ''}
                onChange={(e) =>
                  setForm({ ...form, endAt: e.target.value || undefined })
                }
              />
            </div>
          </div>

          <footer className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando…' : editing ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
