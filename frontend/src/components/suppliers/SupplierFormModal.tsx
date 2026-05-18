import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { useCreateSupplier, useUpdateSupplier } from '../../hooks/useSuppliers';
import { SUPPLIER_CATEGORIES } from '../../types/supplier';
import { useToast } from '../../hooks/use-toast';
import { X } from 'lucide-react';
import { BRAZIL_STATES } from '../../data/brazil-locations';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: any;
}

export function SupplierFormModal({ isOpen, onClose, supplier }: SupplierFormModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    company: '',
    email: '',
    regions: [] as string[],
    categories: [] as string[],
    isNetworkSupplier: false,
  });

  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const { toast } = useToast();

  useEffect(() => {
    if (supplier) {
      // Suporte a regiões salvas como array de UFs ou como string legada separada por vírgula
      let regions: string[] = [];
      if (Array.isArray(supplier.regions)) {
        regions = supplier.regions;
      } else if (typeof supplier.regions === 'string') {
        regions = supplier.regions.split(',').map((r: string) => r.trim()).filter(Boolean);
      }
      setFormData({
        name: supplier.name || '',
        phone: supplier.phone || '',
        company: supplier.company || '',
        email: supplier.email || '',
        regions,
        categories: supplier.categories || [],
        isNetworkSupplier: supplier.isNetworkSupplier || false,
      });
    } else {
      setFormData({ name: '', phone: '', company: '', email: '', regions: [], categories: [], isNetworkSupplier: false });
    }
  }, [supplier, isOpen]);

  const handleToggleCategory = (category: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleToggleRegion = (uf: string) => {
    setFormData((prev) => ({
      ...prev,
      regions: prev.regions.includes(uf)
        ? prev.regions.filter((r) => r !== uf)
        : [...prev.regions, uf],
    }));
  };

  const handleSelectAllRegions = () => {
    const allUfs = BRAZIL_STATES.map((s) => s.uf);
    const allSelected = allUfs.every((uf) => formData.regions.includes(uf));
    setFormData((prev) => ({ ...prev, regions: allSelected ? [] : allUfs }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rawPhone = formData.phone.replace(/\D/g, '');
    const phone = rawPhone.startsWith('55') ? `+${rawPhone}` : `+55${rawPhone}`;

    const payload = {
      name: formData.name,
      phone,
      company: formData.company || undefined,
      email: formData.email || undefined,
      regions: formData.regions,
      categories: formData.categories,
      isNetworkSupplier: formData.isNetworkSupplier,
    };

    try {
      if (supplier) {
        await updateMutation.mutateAsync({ id: supplier.id, data: payload });
        toast({ title: 'Fornecedor atualizado com sucesso!', variant: 'success' });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: 'Fornecedor cadastrado com sucesso!', variant: 'success' });
      }
      onClose();
    } catch (error: any) {
      toast({ title: 'Erro ao salvar fornecedor', description: error.response?.data?.message, variant: 'destructive' });
    }
  };

  if (!isOpen) return null;

  const inputClass = 'w-full px-3 py-2 text-foreground bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring';
  const allUfs = BRAZIL_STATES.map((s) => s.uf);
  const allSelected = allUfs.every((uf) => formData.regions.includes(uf));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">
            {supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Nome do Fornecedor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              placeholder="Ex: João Silva"
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Telefone (com DDD) <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className={inputClass}
              placeholder="Ex: 64999999999 ou +5564999999999"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Digite apenas números, com ou sem o +55
            </p>
          </div>

          {/* Empresa */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Empresa (opcional)
            </label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className={inputClass}
              placeholder="Ex: AgroSupply Ltda"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              E-mail (opcional)
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputClass}
              placeholder="Ex: contato@empresa.com.br"
            />
          </div>

          {/* Estados Atendidos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-foreground">
                Estados Atendidos <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllRegions}
                className="text-xs text-primary hover:underline"
              >
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {formData.regions.length === 0
                ? 'Nenhum estado selecionado'
                : `${formData.regions.length} estado(s): ${formData.regions.join(', ')}`}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 bg-muted/30 p-3 rounded-lg max-h-48 overflow-y-auto">
              {BRAZIL_STATES.map((s) => (
                <label
                  key={s.uf}
                  className="flex items-center gap-1.5 cursor-pointer hover:bg-background p-1.5 rounded transition"
                >
                  <input
                    type="checkbox"
                    checked={formData.regions.includes(s.uf)}
                    onChange={() => handleToggleRegion(s.uf)}
                    className="w-3.5 h-3.5 text-primary rounded focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-foreground font-medium">{s.uf}</span>
                </label>
              ))}
            </div>
            {formData.regions.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Selecione pelo menos um estado</p>
            )}
          </div>

          {/* Categorias */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Áreas de Atuação <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              Selecione todas as áreas em que o fornecedor atua
            </p>
            <div className="grid grid-cols-2 gap-3 bg-muted/30 p-4 rounded-lg">
              {SUPPLIER_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className="flex items-center gap-2 cursor-pointer hover:bg-background p-2 rounded transition"
                >
                  <input
                    type="checkbox"
                    checked={formData.categories.includes(category.value)}
                    onChange={() => handleToggleCategory(category.value)}
                    className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm text-foreground">{category.label}</span>
                </label>
              ))}
            </div>
            {formData.categories.length === 0 && (
              <p className="text-xs text-red-500 mt-2">Selecione pelo menos uma área de atuação</p>
            )}
          </div>

          {/* Tipo de fornecedor */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isNetworkSupplier}
                onChange={(e) => setFormData({ ...formData, isNetworkSupplier: e.target.checked })}
                className="w-5 h-5 text-primary rounded focus:ring-2 focus:ring-ring"
              />
              <div>
                <span className="font-medium text-foreground">Fornecedor da Rede CotaObra</span>
                <p className="text-sm text-muted-foreground">
                  Marque esta opção se o fornecedor faz parte da rede da plataforma. Caso
                  contrário, será considerado como seu fornecedor pessoal.
                </p>
              </div>
            </label>
          </div>

          {/* Dica WhatsApp */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground">
              <strong>💡 Dica:</strong> Você também pode cadastrar fornecedores diretamente pelo
              WhatsApp! Basta compartilhar o contato do fornecedor e ele será automaticamente
              cadastrado como seu fornecedor pessoal.
            </p>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                formData.categories.length === 0 ||
                formData.regions.length === 0
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Salvando...'
                : supplier ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
