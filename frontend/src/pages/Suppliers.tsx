import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useSuppliers, useDeleteSupplier } from '../hooks/useSuppliers';
import { formatDate } from '../lib/utils';
import { getCategoryLabel } from '../types/supplier';
import { useToast } from '../hooks/use-toast';
import { ConfirmModal } from '../components/ui/confirm-modal';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  Building2,
  Mail,
  Phone,
  Package,
  Users,
  FileText,
  Search,
} from 'lucide-react';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal';

type FilterType = 'all' | 'own' | 'network';

export function Suppliers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const limit = 15;

  const filters =
    activeFilter === 'own'
      ? { isNetworkSupplier: 'false' }
      : activeFilter === 'network'
        ? { isNetworkSupplier: 'true' }
        : undefined;

  const { data, isLoading, error } = useSuppliers(page, limit, filters);
  const deleteMutation = useDeleteSupplier();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMutation.mutateAsync(confirmDelete.id);
      toast({ title: 'Fornecedor excluído', variant: 'success' });
      setConfirmDelete(null);
    } catch {
      toast({ title: 'Erro ao excluir fornecedor', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
  };

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Fornecedores</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie sua rede de fornecedores</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie sua rede de fornecedores</p>
        </div>
        <div className="bg-[hsl(var(--error-bg))] border-0.5 border-[hsl(var(--error))] rounded-md p-4">
          <p className="text-sm text-[hsl(var(--error))]">Erro ao carregar fornecedores</p>
        </div>
      </div>
    );
  }

  const allSuppliers = data?.data || [];
  const pagination = data?.pagination;

  const suppliers = search.trim()
    ? allSuppliers.filter((s: any) =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.phone?.includes(search) ||
        s.company?.toLowerCase().includes(search.toLowerCase())
      )
    : allSuppliers;

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-medium text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie sua rede de fornecedores</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 self-start sm:self-auto shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <Badge
            variant={activeFilter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => handleFilterChange('all')}
          >
            Todos ({pagination?.total || 0})
          </Badge>
          <Badge
            variant={activeFilter === 'own' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => handleFilterChange('own')}
          >
            Meus Fornecedores
          </Badge>
          <Badge
            variant={activeFilter === 'network' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => handleFilterChange('network')}
          >
            Rede CotaObra
          </Badge>
        </div>
      </div>

      {/* Empty State ou Grid de Cards */}
      {suppliers.length === 0 ? (
        <Card className="p-16 text-center">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-base font-medium text-foreground mb-2">
            {search ? 'Nenhum resultado encontrado' : 'Nenhum fornecedor cadastrado'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {search
              ? `Nenhum fornecedor corresponde a "${search}"`
              : 'Cadastre o primeiro fornecedor para começar'}
          </p>
          {!search && (
            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" />
              Cadastrar Fornecedor
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Grid de Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((supplier: any) => (
              <Card
                key={supplier.id}
                className="hover:bg-secondary/50 transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-base font-medium">
                          {supplier.name}
                        </CardTitle>
                      </div>
                      <Badge
                        variant={supplier.isNetworkSupplier ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {supplier.isNetworkSupplier ? 'Rede' : 'Próprio'}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(supplier)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete({ id: supplier.id, name: supplier.name })}
                        disabled={deleteMutation.isPending}
                        className="h-8 w-8 p-0 text-[hsl(var(--error))] hover:text-[hsl(var(--error))] hover:bg-[hsl(var(--error-bg))]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Informações de contato */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{supplier.phone}</span>
                    </div>
                    {supplier.company && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="truncate">{supplier.company}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Categorias */}
                  {supplier.categories && supplier.categories.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Categorias:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {supplier.categories.slice(0, 3).map((category: string) => (
                          <Badge key={category} variant="secondary" className="text-xs">
                            {getCategoryLabel(category)}
                          </Badge>
                        ))}
                        {supplier.categories.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{supplier.categories.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Estatísticas */}
                  {supplier._count && (
                    <div className="flex gap-2 pt-3 border-t border-border">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Users className="w-3 h-3" />
                        {supplier._count.producers || 0}
                      </Badge>
                      <Badge variant="outline" className="text-xs gap-1">
                        <FileText className="w-3 h-3" />
                        {supplier._count.proposals || 0}
                      </Badge>
                    </div>
                  )}

                  {/* Data de cadastro */}
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Cadastrado em {formatDate(supplier.createdAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Paginação */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages} • {pagination.total} fornecedores
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="gap-1"
                >
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de cadastro/edição */}
      <SupplierFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        supplier={editingSupplier}
      />

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir fornecedor"
        description={`Tem certeza que deseja excluir "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
