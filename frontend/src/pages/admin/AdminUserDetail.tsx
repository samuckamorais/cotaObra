import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { KeyRound, XCircle, CheckCircle2, AlertTriangle, Copy, Check } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/button';
import { listUsers, resetUserPassword, deactivateUser, reactivateUser } from '../../api/admin';
import type { AdminUserRow } from '../../api/admin';

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reasonOpen, setReasonOpen] = useState<'reset' | 'deactivate' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetResult, setResetResult] = useState<{ generatedPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Reusa o endpoint de lista filtrando por ID — backend não tem GET /admin/users/:id
      // pra detalhe (premissa da spec é só list cross-tenant). Listamos todos e filtramos.
      const result = await listUsers({ page: 1, limit: 200 });
      const found = result.data.find((u) => u.id === id) ?? null;
      setUser(found);
      if (!found) setError('Usuário não encontrado.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao carregar usuário.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAction = async () => {
    if (!id || !reasonOpen) return;
    if (reason.trim().length < 10) {
      setError('Motivo deve ter pelo menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (reasonOpen === 'reset') {
        const r = await resetUserPassword(id, reason.trim());
        setResetResult({ generatedPassword: r.generatedPassword });
        setReasonOpen(null);
        setReason('');
        await load();
      } else if (reasonOpen === 'deactivate') {
        await deactivateUser(id, reason.trim());
        setReasonOpen(null);
        setReason('');
        await load();
      } else {
        await reactivateUser(id, reason.trim());
        setReasonOpen(null);
        setReason('');
        await load();
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Erro ao executar ação.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPwd = async () => {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.generatedPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading && !user) {
    return <div className="p-6 text-muted-foreground">Carregando...</div>;
  }
  if (!user) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error || 'Usuário não encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AdminPageHeader
        title={user.name}
        description={user.email}
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Usuários', to: '/admin/usuarios' },
          { label: user.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReasonOpen('reset')}>
              <KeyRound className="w-4 h-4 mr-1" /> Resetar senha
            </Button>
            {user.active ? (
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
            )}
          </div>
        }
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5">
        <dl className="space-y-3 text-sm">
          <Row label="Papel" value={user.role} mono />
          <Row label="Tenant" value={user.tenant ? user.tenant.name : 'sem tenant'} />
          <Row
            label="Status"
            value={user.active ? 'Ativo' : 'Inativo'}
            valueClass={user.active ? 'text-green-600' : 'text-destructive'}
          />
          <Row
            label="Senha"
            value={user.mustChangePassword ? 'Pendente troca' : 'Definida pelo usuário'}
            valueClass={user.mustChangePassword ? 'text-amber-600' : ''}
          />
          <Row
            label="Senha alterada em"
            value={
              user.passwordChangedAt
                ? new Date(user.passwordChangedAt).toLocaleString('pt-BR')
                : '—'
            }
          />
          <Row label="Criado em" value={new Date(user.createdAt).toLocaleString('pt-BR')} />
        </dl>
      </div>

      {/* Modal de motivo */}
      {reasonOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full">
            <h3 className="font-semibold mb-2">
              {reasonOpen === 'reset'
                ? 'Resetar senha'
                : reasonOpen === 'deactivate'
                  ? 'Inativar usuário'
                  : 'Reativar usuário'}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {reasonOpen === 'reset'
                ? 'Será gerada nova senha temporária. O usuário precisará trocar no próximo login.'
                : 'Esta ação será registrada no log de auditoria.'}
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-input bg-background rounded-md p-2 text-sm"
              placeholder="Motivo (mín. 10 caracteres)"
            />
            <p className="text-xs text-muted-foreground mt-1">{reason.length}/10</p>
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
                onClick={handleAction}
                disabled={submitting || reason.trim().length < 10}
                className="flex-1"
              >
                {submitting ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pós-reset com senha gerada */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full">
            <h3 className="font-semibold mb-2">Senha temporária gerada</h3>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-xs text-amber-900 mb-3">
              ⚠️ Esta senha aparece apenas uma vez. Copie agora.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded text-base font-mono break-all">
                {resetResult.generatedPassword}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={copyPwd}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button className="w-full mt-4" onClick={() => setResetResult(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={() => navigate('/admin/usuarios')}
        className="mt-6"
      >
        ← Voltar à lista
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  valueClass = '',
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`${mono ? 'font-mono text-xs' : 'text-sm'} ${valueClass}`}>{value}</dd>
    </div>
  );
}
