import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Search,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useMaterials,
  useDeactivateMaterial,
  type Material,
} from '../hooks/useMaterials';
import { useToast } from '../hooks/use-toast';
import { ConfirmModal } from '../components/ui/confirm-modal';
import { MaterialFormModal } from '../components/materials/MaterialFormModal';
import { MaterialCsvImporter } from '../components/materials/MaterialCsvImporter';
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
} from '../data/material-categories';

const PAGE_SIZE = 50;

export default function Materials() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Material | null>(null);

  // Debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = {
    ...(search.trim() && { q: search.trim() }),
    ...(category && { category }),
  };

  const { data, isLoading, error } = useMaterials(page, PAGE_SIZE, filters);
  const deactivateMut = useDeactivateMaterial();
  const { toast } = useToast();

  const items = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;
  const total = data?.pagination?.total ?? 0;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(m: Material) {
    setEditing(m);
    setModalOpen(true);
  }

  async function doDelete() {
    if (!confirmDelete) return;
    try {
      await deactivateMut.mutateAsync(confirmDelete.id);
      toast({ title: 'Material desativado', variant: 'success' });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({
        title: 'Erro ao desativar',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="size-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-medium text-foreground">Materiais</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo de SKUs (compartilhado + personalizado)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setImporterOpen(true)} variant="outline" className="gap-2">
            <Upload className="size-4" />
            Importar CSV
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            Novo Material
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU ou nome..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as categorias</option>
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : error ? (
            <div className="p-8 text-center text-muted-foreground">
              Erro ao carregar materiais.
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Package className="size-12 mx-auto text-muted-foreground" />
              <h2 className="font-medium">Nenhum material encontrado</h2>
              <p className="text-sm text-muted-foreground">
                Cadastre individualmente ou importe um CSV com seu catálogo.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={openCreate}>Novo Material</Button>
                <Button variant="outline" onClick={() => setImporterOpen(true)}>
                  Importar CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Categoria</th>
                    <th className="px-4 py-2">Unidade</th>
                    <th className="px-4 py-2">Origem</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{m.sku}</td>
                      <td className="px-4 py-2">
                        <div>
                          <p className="font-medium">{m.name}</p>
                          {m.spec && (
                            <p className="text-xs text-muted-foreground">{m.spec}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {MATERIAL_CATEGORY_LABEL[m.category] ?? m.category}
                      </td>
                      <td className="px-4 py-2 text-sm">{m.defaultUnit}</td>
                      <td className="px-4 py-2">
                        {m.tenantId === null ? (
                          <Badge className="bg-blue-100 text-blue-800">Rede</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">Próprio</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(m)}
                            title="Editar"
                            disabled={m.tenantId === null}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDelete(m)}
                            title="Desativar"
                            disabled={m.tenantId === null}
                            className="text-muted-foreground"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {items.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {total} materiais
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <MaterialFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />

      <MaterialCsvImporter
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Desativar material"
        description={
          confirmDelete
            ? `Desativar "${confirmDelete.name}" (${confirmDelete.sku})? Histórico de cotações é preservado, mas o material some das listas de seleção.`
            : ''
        }
        confirmLabel="Desativar"
        variant="warning"
        isLoading={deactivateMut.isPending}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
