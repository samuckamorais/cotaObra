import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, ShieldCheck, ClipboardList, ArrowRight } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { listTenants, listUsers, listAuditLog } from '../../api/admin';
import type { AdminAuditLogRow } from '../../api/admin';

/**
 * FEAT-008 (FF-FE-001) — Overview do super admin.
 * Mostra contadores agregados (tenants, users) + últimas ações no AuditLog.
 */
export function AdminDashboard() {
  const [tenantCount, setTenantCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [activeTenants, setActiveTenants] = useState<number | null>(null);
  const [recentActions, setRecentActions] = useState<AdminAuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tenantsAll, tenantsActive, usersAll, audit] = await Promise.all([
          listTenants({ page: 1, limit: 1 }),
          listTenants({ page: 1, limit: 1, active: true }),
          listUsers({ page: 1, limit: 1 }),
          listAuditLog({ page: 1, limit: 10 }),
        ]);
        if (!cancelled) {
          setTenantCount(tenantsAll.pagination.total);
          setActiveTenants(tenantsActive.pagination.total);
          setUserCount(usersAll.pagination.total);
          setRecentActions(audit.data);
        }
      } catch {
        // ignora — UI mostra "—" nos counters
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Painel do Super Admin"
        description="Visão consolidada da plataforma CotaObra"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Card
          icon={<Building2 className="w-5 h-5" />}
          label="Tenants no sistema"
          value={loading ? '—' : String(tenantCount ?? '—')}
          sub={
            activeTenants !== null
              ? `${activeTenants} ativo${activeTenants === 1 ? '' : 's'}`
              : undefined
          }
          to="/admin/tenants"
        />
        <Card
          icon={<Users className="w-5 h-5" />}
          label="Usuários cadastrados"
          value={loading ? '—' : String(userCount ?? '—')}
          to="/admin/usuarios"
        />
        <Card
          icon={<ClipboardList className="w-5 h-5" />}
          label="Ações registradas"
          value={loading ? '—' : String(recentActions.length === 10 ? '10+' : recentActions.length)}
          sub="últimas 10"
          to="/admin/audit-log"
        />
      </div>

      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Ações recentes
          </h2>
          <Link
            to="/admin/audit-log"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver tudo
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : recentActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {recentActions.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between text-sm border-b border-border last:border-b-0 pb-2 last:pb-0"
              >
                <div>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {row.action}
                  </span>
                  <span className="ml-2 text-muted-foreground">por {row.user.email}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  to?: string;
}) {
  const inner = (
    <div className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
