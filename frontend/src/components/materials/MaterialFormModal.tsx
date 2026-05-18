import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  useCreateMaterial,
  useUpdateMaterial,
  type CreateMaterialDTO,
  type Material,
} from '../../hooks/useMaterials';
import { useToast } from '../../hooks/use-toast';
import { MATERIAL_CATEGORIES, UNITS } from '../../data/material-categories';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editing?: Material | null;
}

const empty: CreateMaterialDTO = {
  sku: '',
  name: '',
  category: 'cimento',
  defaultUnit: 'saca',
  spec: '',
};

export function MaterialFormModal({ isOpen, onClose, editing }: Props) {
  const [form, setForm] = useState<CreateMaterialDTO>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = useCreateMaterial();
  const updateMut = useUpdateMaterial();
  const { toast } = useToast();

  useEffect(() => {
    if (editing) {
      setForm({
        sku: editing.sku,
        name: editing.name,
        category: editing.category,
        defaultUnit: editing.defaultUnit,
        spec: editing.spec ?? '',
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [editing, isOpen]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.sku.trim()) e.sku = 'SKU obrigatório';
    if (form.name.trim().length < 2) e.name = 'Nome obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;

    const payload: CreateMaterialDTO = {
      ...form,
      sku: form.sku.trim().toUpperCase(),
      spec: form.spec?.trim() || undefined,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast({ title: 'Material atualizado', variant: 'success' });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: 'Material cadastrado', variant: 'success' });
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
        className="bg-background rounded-lg shadow-xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">
            {editing ? 'Editar Material' : 'Novo Material'}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sku">SKU *</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="CIM-CPII-Z32-50"
                disabled={!!editing?.tenantId === false && !!editing}
                required
              />
              {errors.sku && <p className="text-xs text-red-600 mt-1">{errors.sku}</p>}
            </div>

            <div>
              <Label htmlFor="category">Categoria *</Label>
              <select
                id="category"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="name">Nome do Material *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cimento Portland CP-II-Z 32 (saco 50kg)"
                required
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="defaultUnit">Unidade padrão *</Label>
              <select
                id="defaultUnit"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.defaultUnit}
                onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="spec">Especificação técnica</Label>
              <Input
                id="spec"
                value={form.spec ?? ''}
                onChange={(e) => setForm({ ...form, spec: e.target.value })}
                placeholder="NBR 11578"
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
