import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { listTenants } from '../../api/admin';
import type { AdminTenantRow } from '../../api/admin';

export function AdminTenants() {
  const [data, setData] = useState<AdminTenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  // Debounce search input
  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await listTenants({
          page,
          limit,
          search: searchDebounced || undefined,
          active:
            activeFilter === 'all' ? undefined : activeFilter === 'active',
        });
        if (!cancelled) {
          setData(result.data);
          setTotal(result.pagination.total);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, searchDebounced, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Tenants"
        description="Empresas cadastradas na plataforma"
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Tenants' },
        ]}
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome, slug ou e-mail..."
            className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value as typeof activeFilter);
            setPage(1);
          }}
          className="border border-input bg-background rounded-md px-3 py-2 text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="active">Apenas ativos</option>
          <option value="inactive">Apenas inativos</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Slug</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Users</th>
              <th className="text-right px-4 py-2 font-medium">Produtores</th>
              <th className="text-right px-4 py-2 font-medium">Cotações</th>
              <th className="text-left px-4 py-2 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum tenant encontrado.
                </td>
              </tr>
            )}
            {!loading &&
              data.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/admin/tenants/${t.id}`}
                      className="text-primary hover:underline inline-flex items-center gap-1.5"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {t.slug}
                  </td>
                  <td className="px-4 py-2">
                    {t.active ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs">
                        <XCircle className="w-3 h-3" /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{t._count.users}</td>
                  <td className="px-4 py-2 text-right">{t._count.producers}</td>
                  <td className="px-4 py-2 text-right">{t._count.quotes}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-muted-foreground">
          {total} resultado{total === 1 ? '' : 's'} — página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 border border-input rounded disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 border border-input rounded disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
