import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { listAuditLog } from '../../api/admin';
import type { AdminAuditLogRow } from '../../api/admin';

const ACTION_LABELS: Record<string, string> = {
  create_user: 'Criar usuário',
  create_user_with_custom_password: 'Criar usuário (senha custom)',
  reset_password: 'Resetar senha',
  deactivate_user: 'Inativar usuário',
  reactivate_user: 'Reativar usuário',
  deactivate_tenant: 'Inativar tenant',
  reactivate_tenant: 'Reativar tenant',
  promote_to_super_admin: 'Promover a super admin',
  view_tenant_data: 'Visualizar dados do tenant',
  list_tenants: 'Listar tenants',
  list_users: 'Listar usuários',
  list_audit_log: 'Listar audit log',
};

export function AdminAuditLog() {
  const [data, setData] = useState<AdminAuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const limit = 25;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await listAuditLog({
          page,
          limit,
          action: filterAction || undefined,
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
  }, [page, filterAction]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Log de auditoria"
        description="Histórico imutável de ações sensíveis. Senhas são automaticamente mascaradas."
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Audit Log' },
        ]}
      />

      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value);
            setPage(1);
          }}
          className="border border-input bg-background rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Data</th>
              <th className="text-left px-4 py-2 font-medium">Ator</th>
              <th className="text-left px-4 py-2 font-medium">Ação</th>
              <th className="text-left px-4 py-2 font-medium">Alvo</th>
              <th className="text-left px-4 py-2 font-medium">Motivo</th>
              <th className="text-left px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma ação registrada com esses filtros.
                </td>
              </tr>
            )}
            {!loading &&
              data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.user.email}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {row.targetType ? (
                      <span>
                        {row.targetType}
                        {row.targetId && (
                          <span className="text-muted-foreground"> · {row.targetId.slice(0, 8)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs max-w-xs truncate" title={row.reason ?? ''}>
                    {row.reason ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">
                    {row.ip ?? '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-muted-foreground">
          {total} entrada{total === 1 ? '' : 's'} — página {page} de {totalPages}
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
