import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/button';
import { createUser } from '../../api/admin';
import type { CreateUserResponse } from '../../api/admin';
import type { UserRole } from '../../contexts/AuthContext';

type PwdMode = 'generated' | 'custom';

/**
 * FEAT-008 (FF-FE-001) — Cadastro direto de usuário pelo super admin.
 *
 * UX da spec (RN-14): default destacado "Gerar senha automaticamente";
 * "Definir manualmente" fica como link discreto com aviso antes de abrir.
 *
 * Submit → modal de senha (exibida UMA VEZ) com botão copiar.
 */
export function AdminNewUser() {
  const navigate = useNavigate();

  // Form fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('ADMIN');
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenantMode, setTenantMode] = useState<'new' | 'existing' | 'none'>('new');
  const [reason, setReason] = useState('');

  const [pwdMode, setPwdMode] = useState<PwdMode>('generated');
  const [showCustomPwd, setShowCustomPwd] = useState(false);
  const [customPwd, setCustomPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const isSuperAdminRole = role === 'SUPER_ADMIN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (reason.trim().length < 10) {
      setError('Motivo deve ter pelo menos 10 caracteres.');
      return;
    }
    if (!isSuperAdminRole && tenantMode === 'none') {
      setError('Selecione novo tenant ou existente.');
      return;
    }
    if (tenantMode === 'new' && !tenantName.trim()) {
      setError('Informe o nome do tenant.');
      return;
    }
    if (tenantMode === 'existing' && !tenantId.trim()) {
      setError('Informe o ID do tenant existente.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createUser({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role,
        tenantName: tenantMode === 'new' ? tenantName.trim() : undefined,
        tenantId: tenantMode === 'existing' ? tenantId.trim() : undefined,
        password: pwdMode === 'custom' ? customPwd : undefined,
        reason: reason.trim(),
      });
      setResult(res);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string }; details?: Array<{ message: string }> } } };
      const detail = e.response?.data?.details?.[0]?.message;
      setError(detail || e.response?.data?.error?.message || 'Erro ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPwd = async () => {
    if (!result?.generatedPassword) return;
    try {
      await navigator.clipboard.writeText(result.generatedPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Tela 2: modal de senha gerada
  if (result) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <AdminPageHeader
          title="Usuário criado"
          breadcrumbs={[
            { label: 'Admin', to: '/admin/dashboard' },
            { label: 'Usuários', to: '/admin/usuarios' },
            { label: 'Novo' },
          ]}
        />

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-900">
              <strong>Anote a senha agora.</strong> Ela não será mostrada novamente. Envie ao cliente pelo
              canal de preferência (WhatsApp, telefone).
            </p>
          </div>

          <dl className="space-y-3 text-sm">
            <Row label="Nome" value={result.user.name} />
            <Row label="E-mail" value={result.user.email} />
            <Row label="Papel" value={result.user.role} mono />
            {result.tenant && <Row label="Tenant" value={result.tenant.name} />}
            <div>
              <dt className="text-xs text-muted-foreground mb-1">
                Senha temporária (modo: {result.passwordMode === 'generated' ? 'gerada' : 'custom'})
              </dt>
              <dd className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-base font-mono break-all">
                  {showPwd ? result.generatedPassword : '••••••••••••••••'}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={copyPwd}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </dd>
              <p className="text-xs text-muted-foreground mt-1">
                {result.user.mustChangePassword
                  ? 'O usuário será obrigado a trocar a senha no primeiro login.'
                  : 'Sem força de troca.'}
              </p>
            </div>
          </dl>

          <div className="flex gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/usuarios')}
              className="flex-1"
            >
              Voltar à lista
            </Button>
            <Button
              onClick={() => {
                setResult(null);
                setEmail('');
                setName('');
                setReason('');
                setTenantName('');
                setTenantId('');
                setCustomPwd('');
                setPwdMode('generated');
              }}
              className="flex-1"
            >
              Criar outro
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Tela 1: formulário
  return (
    <div className="p-6 max-w-xl mx-auto">
      <AdminPageHeader
        title="Novo usuário"
        description="Cadastro direto. Senha temporária aparece UMA vez após salvar."
        breadcrumbs={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Usuários', to: '/admin/usuarios' },
          { label: 'Novo' },
        ]}
      />

      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <Field label="E-mail">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            placeholder="cliente@empresa.com.br"
          />
        </Field>

        <Field label="Nome">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            placeholder="João Silva"
          />
        </Field>

        <Field label="Papel">
          <select
            value={role}
            onChange={(e) => {
              const r = e.target.value as UserRole;
              setRole(r);
              if (r === 'SUPER_ADMIN') setTenantMode('none');
              else if (tenantMode === 'none') setTenantMode('new');
            }}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
          >
            <option value="ADMIN">ADMIN (gestor do tenant)</option>
            <option value="USER">USER (com permissões granulares)</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN (cross-tenant)</option>
          </select>
        </Field>

        {!isSuperAdminRole && (
          <Field label="Tenant">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tenantMode"
                  checked={tenantMode === 'new'}
                  onChange={() => setTenantMode('new')}
                />
                Criar tenant novo
              </label>
              {tenantMode === 'new' && (
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  placeholder="Ex: Fazenda ABC"
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tenantMode"
                  checked={tenantMode === 'existing'}
                  onChange={() => setTenantMode('existing')}
                />
                Vincular a tenant existente
              </label>
              {tenantMode === 'existing' && (
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-mono text-xs"
                  placeholder="UUID do tenant (pegue na lista de tenants)"
                />
              )}
            </div>
          </Field>
        )}

        {isSuperAdminRole && (
          <div className="bg-primary/5 border border-primary/20 rounded-md p-3 text-xs">
            SUPER_ADMIN não tem tenant (operador da plataforma — RN-11).
          </div>
        )}

        <Field label="Senha">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={pwdMode === 'generated'}
                onChange={() => {
                  setPwdMode('generated');
                  setShowCustomPwd(false);
                }}
              />
              <span className="font-medium">Gerar senha automaticamente</span>
              <span className="text-xs text-muted-foreground">(recomendado)</span>
            </label>

            {!showCustomPwd && pwdMode === 'generated' && (
              <button
                type="button"
                onClick={() => {
                  setShowCustomPwd(true);
                  setPwdMode('custom');
                }}
                className="text-xs text-primary hover:underline ml-6"
              >
                Definir manualmente
              </button>
            )}

            {showCustomPwd && (
              <>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-xs text-amber-900">
                  ⚠️ Você conhecerá a senha até o cliente trocar no primeiro login.
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={pwdMode === 'custom'}
                    onChange={() => setPwdMode('custom')}
                  />
                  Definir manualmente
                </label>
                <input
                  type="password"
                  value={customPwd}
                  onChange={(e) => setCustomPwd(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  placeholder="Mín. 10 chars, maiúscula, minúscula, dígito, símbolo"
                />
              </>
            )}
          </div>
        </Field>

        <Field label="Motivo (auditoria)">
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            placeholder="Ex: Onboarded via WhatsApp 13/05/2026"
          />
          <p className="text-xs text-muted-foreground mt-1">{reason.length} chars (mín. 10)</p>
        </Field>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/usuarios')}
            disabled={submitting}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting ? 'Criando...' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</dd>
    </div>
  );
}
