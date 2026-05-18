import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserPlus, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/button';
import { listUsers } from '../../api/admin';
import type { AdminUserRow } from '../../api/admin';
import type { UserRole } from '../../contexts/AuthContext';

export function AdminUsers() {
  const [data, setData] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await listUsers({
          page,
          limit,
          search: searchDebounced || undefined,
          role: roleFilter === 'all' ? undefined : roleFilter,
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
  }, [page, searchDebounced, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Usuários"
        description="Cross-tenant — todos os usuários da plataforma"
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Usuários' },
        ]}
        actions={
          <Link to="/admin/usuarios/novo">
            <Button>
              <UserPlus className="w-4 h-4 mr-1" />
              Novo usuário
            </Button>
          </Link>
        }
      />

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
            placeholder="Buscar por nome ou e-mail..."
            className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as UserRole | 'all');
            setPage(1);
          }}
          className="border border-input bg-background rounded-md px-3 py-2 text-sm"
        >
          <option value="all">Todos os papéis</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="ADMIN">ADMIN</option>
          <option value="USER">USER</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nome / e-mail</th>
              <th className="text-left px-4 py-2 font-medium">Papel</th>
              <th className="text-left px-4 py-2 font-medium">Tenant</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Senha</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
            {!loading &&
              data.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link to={`/admin/usuarios/${u.id}`} className="block hover:text-primary">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {u.tenant ? (
                      <Link to={`/admin/tenants/${u.tenant.id}`} className="text-primary hover:underline">
                        {u.tenant.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic">— sem tenant</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.active ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs">
                        <XCircle className="w-3 h-3" /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.mustChangePassword ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        <AlertTriangle className="w-3 h-3" /> Pendente
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">OK</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

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
