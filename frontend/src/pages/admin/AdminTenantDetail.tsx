import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, Users, Tractor, Truck, FileText, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/button';
import { getTenantDetail, deactivateTenant, reactivateTenant } from '../../api/admin';
import type { AdminTenantDetail as TenantDetail } from '../../api/admin';

export function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reasonOpen, setReasonOpen] = useState<'deactivate' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getTenantDetail(id);
      setTenant(result);
      setError('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao carregar tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggle = async () => {
    if (!id || !reasonOpen) return;
    if (reason.trim().length < 10) {
      setError('Motivo deve ter pelo menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      if (reasonOpen === 'deactivate') {
        await deactivateTenant(id, reason.trim());
      } else {
        await reactivateTenant(id, reason.trim());
      }
      setReasonOpen(null);
      setReason('');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao atualizar tenant.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !tenant) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error || 'Tenant não encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AdminPageHeader
        title={tenant.name}
        description={`Slug: ${tenant.slug}${tenant.email ? ` · ${tenant.email}` : ''}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Tenants', to: '/admin/tenants' },
          { label: tenant.name },
        ]}
        actions={
          tenant.active ? (
            <Button
              variant="outline"
              onClick={() => setReasonOpen('deactivate')}
              className="text-destructive border-destructive/40 hover:bg-destructive/5"
            >
              <XCircle className="w-4 h-4 mr-1" /> Inativar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setReasonOpen('reactivate')}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Reativar
            </Button>
          )
        }
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat icon={<Users className="w-4 h-4" />} label="Users" value={tenant.stats.users} />
        <Stat icon={<Tractor className="w-4 h-4" />} label="Produtores" value={tenant.stats.producers} />
        <Stat icon={<Truck className="w-4 h-4" />} label="Fornecedores" value={tenant.stats.suppliers} />
        <Stat
          icon={<FileText className="w-4 h-4" />}
          label="Cotações"
          value={tenant.stats.quotesTotal}
          sub={`${tenant.stats.quotesLast30d} nos últimos 30d`}
        />
        <Stat
          icon={<FileText className="w-4 h-4" />}
          label="Propostas"
          value={tenant.stats.proposalsTotal}
          sub={`${tenant.stats.proposalsLast30d} nos últimos 30d`}
        />
        <Stat
          icon={<Building2 className="w-4 h-4" />}
          label="Status"
          value={tenant.active ? 'Ativo' : 'Inativo'}
          valueClass={tenant.active ? 'text-green-600' : 'text-destructive'}
        />
      </div>

      {/* Users do tenant */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-3">Usuários ({tenant.users.length})</h2>
        {tenant.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário neste tenant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tenant.users.map((u) => (
              <li key={u.id} className="py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.email} · <span className="font-mono">{u.role}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {!u.active && (
                    <span className="text-destructive inline-flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Inativo
                    </span>
                  )}
                  {u.mustChangePassword && (
                    <span className="text-amber-600 inline-flex items-center gap-1">
                      ⚠️ Aguarda troca de senha
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modal de motivo */}
      {reasonOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full">
            <h3 className="font-semibold mb-2">
              {reasonOpen === 'deactivate' ? 'Inativar' : 'Reativar'} tenant
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Esta ação será registrada no log de auditoria. Descreva o motivo (mínimo 10 caracteres).
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-input bg-background rounded-md p-2 text-sm"
              placeholder="Ex: Cliente solicitou cancelamento via WhatsApp em 13/05"
            />
            <p className="text-xs text-muted-foreground mt-1">{reason.length}/10 caracteres</p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReasonOpen(null);
                  setReason('');
                  setError('');
                }}
                disabled={submitting}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleToggle}
                disabled={submitting || reason.trim().length < 10}
                className="flex-1"
              >
                {submitting ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  valueClass = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-xl font-semibold mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
