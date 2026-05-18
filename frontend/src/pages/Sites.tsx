import { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ConfirmModal } from '../components/ui/confirm-modal';
import {
  Plus,
  Edit,
  Archive,
  HardHat,
  MapPin,
  Construction,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useSites,
  useArchiveSite,
  type Site,
  type SiteStatus,
} from '../hooks/useSites';
import { useToast } from '../hooks/use-toast';
import { SiteFormModal } from '../components/sites/SiteFormModal';
import { formatCurrency } from '../lib/utils';

const STATUS_BADGE: Record<SiteStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Ativa', className: 'bg-green-100 text-green-800' },
  PAUSED: { label: 'Pausada', className: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Concluída', className: 'bg-gray-100 text-gray-800' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

const PAGE_SIZE = 20;

export default function Sites() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiteStatus | 'ALL'>('ACTIVE');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Site | null>(null);

  const filters = {
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
    ...(search.trim() && { q: search.trim() }),
  };

  const { data, isLoading, error } = useSites(page, PAGE_SIZE, filters);
  const archiveMut = useArchiveSite();
  const { toast } = useToast();

  const sites = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(site: Site) {
    setEditing(site);
    setModalOpen(true);
  }

  async function doArchive() {
    if (!confirmArchive) return;
    try {
      await archiveMut.mutateAsync(confirmArchive.id);
      toast({ title: 'Obra arquivada (status: Concluída)', variant: 'success' });
      setConfirmArchive(null);
    } catch (err: any) {
      toast({
        title: 'Erro ao arquivar',
        description: err?.response?.data?.error?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <HardHat className="size-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-medium text-foreground">Obras</h1>
            <p className="text-sm text-muted-foreground">
              Gestão dos canteiros da sua construtora
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          Nova Obra
        </Button>
      </header>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => {
                  setPage(1);
                  setStatusFilter(s);
                }}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {s === 'ALL' ? 'Todas' : STATUS_BADGE[s].label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Erro ao carregar obras. Recarregue a página.
          </CardContent>
        </Card>
      ) : sites.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Construction className="size-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-medium">Nenhuma obra cadastrada</h2>
            <p className="text-sm text-muted-foreground">
              Cadastre a primeira obra para começar a abrir cotações por canteiro.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              Cadastrar primeira obra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <Card key={site.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate" title={site.name}>
                      {site.name}
                    </h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="size-3" />
                      {site.city}/{site.state}
                    </p>
                  </div>
                  <Badge className={STATUS_BADGE[site.status].className}>
                    {STATUS_BADGE[site.status].label}
                  </Badge>
                </div>

                {site.manager && (
                  <p className="text-sm text-muted-foreground mb-1">
                    Eng.: {site.manager}
                  </p>
                )}
                {site.budget && (
                  <p className="text-sm font-medium">
                    {formatCurrency(Number(site.budget))}
                  </p>
                )}

                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(site)}
                    className="gap-1"
                  >
                    <Edit className="size-3" />
                    Editar
                  </Button>
                  {site.status !== 'COMPLETED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmArchive(site)}
                      className="gap-1 text-muted-foreground"
                    >
                      <Archive className="size-3" />
                      Arquivar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginação */}
      {sites.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {data?.pagination.page} de {totalPages} · {data?.pagination.total}{' '}
            obras
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

      <SiteFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />

      <ConfirmModal
        isOpen={!!confirmArchive}
        title="Arquivar obra"
        description={
          confirmArchive
            ? `Tem certeza? A obra "${confirmArchive.name}" será marcada como Concluída. O histórico de cotações é preservado.`
            : ''
        }
        confirmLabel="Arquivar"
        variant="warning"
        isLoading={archiveMut.isPending}
        onConfirm={doArchive}
        onClose={() => setConfirmArchive(null)}
      />
    </div>
  );
}
