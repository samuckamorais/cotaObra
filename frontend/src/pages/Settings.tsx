import { useEffect, useState } from 'react';
import { Settings2, Clock, CalendarDays, Users, Package, Save, CheckCircle, ShieldCheck } from 'lucide-react';
import { useSettings, useUpdateSettings, ProducerSettings } from '../hooks/useSettings';
import { SkeletonSettings } from '../components/ui/skeleton';
import { TwoFactorSection } from '../components/settings/TwoFactorSection';
import { useAuth } from '../contexts/AuthContext';

const SCOPE_LABELS: Record<ProducerSettings['defaultSupplierScope'], string> = {
  MINE: 'Apenas meus fornecedores',
  NETWORK: 'Apenas rede CotaObra',
  ALL: 'Todos (meus + rede)',
};

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings, isPending, isSuccess } = useUpdateSettings();

  const [form, setForm] = useState<ProducerSettings>({
    proposalLinkExpiryHours: 24,
    quoteDeadlineDays: 3,
    defaultSupplierScope: 'ALL' as const,
    maxItemsPerQuote: 10,
    winnerNotificationType: 'NONE',
    quoteExpiryHours: 2,
    approvalThreshold: null,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!isSuccess) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [isSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
  };

  const field = (key: keyof ProducerSettings, value: number | string | null) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading) {
    return <SkeletonSettings />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-medium text-foreground">Painel de Controle</h1>
          <p className="text-sm text-muted-foreground">Personalize o comportamento do sistema para sua operação</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bloco: Cotação */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            Cotação
          </h2>

          {/* Prazo padrão */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              Prazo padrão de entrega
            </label>
            <p className="text-xs text-muted-foreground">Sugerido ao criar uma cotação no WhatsApp</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={form.quoteDeadlineDays}
                onChange={(e) => field('quoteDeadlineDays', parseInt(e.target.value))}
                className="w-24 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
          </div>

          {/* Máximo de itens */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Máximo de itens por cotação
            </label>
            <p className="text-xs text-muted-foreground">Limite de produtos em uma única cotação</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxItemsPerQuote}
                onChange={(e) => field('maxItemsPerQuote', parseInt(e.target.value))}
                className="w-24 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-sm text-muted-foreground">itens</span>
            </div>
          </div>

          {/* Tempo de expiração da cotação */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Tempo de expiração da cotação
            </label>
            <p className="text-xs text-muted-foreground">
              Tempo que a cotação permanece aberta para receber propostas dos fornecedores
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={720}
                value={form.quoteExpiryHours}
                onChange={(e) => field('quoteExpiryHours', parseInt(e.target.value))}
                className="w-24 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-sm text-muted-foreground">horas (máx. 720h = 30 dias)</span>
            </div>
          </div>

          {/* Escopo padrão de fornecedores */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Fornecedores padrão
            </label>
            <p className="text-xs text-muted-foreground">Comportamento padrão ao definir para quem enviar a cotação</p>
            <div className="space-y-2">
              {(['MINE', 'NETWORK', 'ALL'] as const).map((scope) => (
                <label key={scope} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="defaultSupplierScope"
                    value={scope}
                    checked={form.defaultSupplierScope === scope}
                    onChange={() => field('defaultSupplierScope', scope)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm text-foreground group-hover:text-foreground/80">
                    {SCOPE_LABELS[scope]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Bloco: Link de Proposta */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Link de Proposta
          </h2>

          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Tempo de expiração do link
            </label>
            <p className="text-xs text-muted-foreground">
              Tempo que o fornecedor tem para acessar e preencher o formulário de proposta após receber o link
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={168}
                value={form.proposalLinkExpiryHours}
                onChange={(e) => field('proposalLinkExpiryHours', parseInt(e.target.value))}
                className="w-24 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-sm text-muted-foreground">horas (máx. 168h = 7 dias)</span>
            </div>
          </div>
        </div>

        {/* CO-6-05: Bloco Aprovação hierárquica */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            Aprovação hierárquica
          </h2>

          <div className="space-y-1.5">
            <label className="text-sm text-foreground flex items-center gap-2">
              Teto de aprovação automática
            </label>
            <p className="text-xs text-muted-foreground">
              Cotações com valor total acima deste valor exigirão aprovação manual de um diretor (role APPROVER ou ADMIN) antes de gerar Ordem de Compra. Deixe em branco para desativar.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">R$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="ex: 50000.00"
                value={form.approvalThreshold ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  field('approvalThreshold', v === '' ? null : parseFloat(v));
                }}
                className="w-40 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {form.approvalThreshold !== null && (
                <button
                  type="button"
                  onClick={() => field('approvalThreshold', null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  desativar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Botão salvar */}
        <div className="flex items-center justify-between pt-1">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Configurações salvas
            </span>
          )}
          {!saved && <span />}
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>

      {/* FEAT-008 (FF-FE-001) — Seção de Segurança / 2FA */}
      <SettingsSecuritySection />
    </div>
  );
}

/**
 * Seção de Segurança da página Settings — opt-in de 2FA para qualquer
 * usuário autenticado. SUPER_ADMIN gerencia 2FA aqui também (mas a
 * desativação simplesmente re-bloqueia o painel admin até nova activação).
 */
function SettingsSecuritySection() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span>Segurança</span>
      </h2>
      <TwoFactorSection />
    </div>
  );
}
