import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { formatCurrency } from '../lib/utils';
import {
  useReportFunnel,
  useReportOperational,
  useReportSavings,
  useReportSupplierPerformance,
  useReportCategoryRegion,
} from '../hooks/useReports';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ArrowRight,
  Package,
  Building2,
  MapPin,
  BarChart2,
  PiggyBank,
  Users,
} from 'lucide-react';

type Tab = 'funnel' | 'operational' | 'savings' | 'suppliers' | 'category';

// Utilitário para montar datas padrão
function defaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return {
    from: from.toISOString().substring(0, 10),
    to: to.toISOString().substring(0, 10),
  };
}

// ─── Filtro de datas reutilizável ───────────────────────────────────────────
function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">De</span>
      <input
        type="date"
        value={from}
        max={to}
        onChange={(e) => onChange(e.target.value, to)}
        className="px-2 py-1 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="text-muted-foreground">até</span>
      <input
        type="date"
        value={to}
        min={from}
        max={new Date().toISOString().substring(0, 10)}
        onChange={(e) => onChange(from, e.target.value)}
        className="px-2 py-1 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────
function ReportSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-4 bg-muted rounded w-1/3" />
          </CardHeader>
          <CardContent>
            <div className="h-32 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── 1. FUNIL DE COTAÇÃO ────────────────────────────────────────────────────
function FunnelReport() {
  const defaults = defaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const { data, isLoading } = useReportFunnel({ from, to });

  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--primary))', 'hsl(var(--primary))', 'hsl(var(--primary))'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Acompanhe em qual etapa as cotações estão convertendo ou sendo perdidas.
        </p>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Criadas</p>
            <p className="text-2xl font-medium mt-1">{data.funnel[0]?.count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Taxa de fechamento</p>
            <p className="text-2xl font-medium mt-1 text-primary">{data.funnel[3]?.rate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Média propostas/cotação</p>
            <p className="text-2xl font-medium mt-1">{data.avgProposalsPerClosed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Tempo 1ª proposta</p>
            <p className="text-2xl font-medium mt-1">{data.avgTimeToFirstProposalHours}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Funil visual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Funil de Conversão</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.funnel} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={110} />
              <Tooltip
                formatter={(value: any, _name: any, props: any) => [
                  `${value} cotações (${props.payload.rate}%)`,
                  props.payload.stage,
                ]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.funnel.map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} opacity={1 - index * 0.18} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Taxas de conversão entre etapas */}
          <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
            {data.funnel.map((stage: any, i: number) => (
              <div key={stage.stage} className="flex items-center gap-1">
                <div className="text-center px-3 py-2 bg-secondary rounded-md">
                  <p className="text-xs text-muted-foreground">{stage.stage}</p>
                  <p className="text-sm font-medium">{stage.count}</p>
                  <p className="text-xs text-primary">{stage.rate}%</p>
                </div>
                {i < data.funnel.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.expired > 0 && (
        <div className="bg-[hsl(var(--warning-bg))] border border-[hsl(var(--warning))] rounded-md p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
          <p className="text-sm text-[hsl(var(--warning))]">
            <strong>{data.expired}</strong> cotações expiraram sem ser fechadas no período.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 2. PAINEL OPERACIONAL ──────────────────────────────────────────────────
function OperationalReport() {
  const { data, isLoading } = useReportOperational();
  const navigate = useNavigate();

  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const urgentCount = data.noProposals.length + data.expiringSoon.length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cotações que precisam de atenção agora. Atualizado a cada 5 minutos.
      </p>

      {urgentCount === 0 && data.readyToClose.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="w-10 h-10 mx-auto text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">Tudo em ordem!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhuma cotação precisa de atenção no momento.
          </p>
        </Card>
      ) : (
        <>
          {/* Sem propostas há +24h */}
          {data.noProposals.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <CardTitle className="text-sm font-medium">
                    Sem propostas há mais de 24h ({data.noProposals.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.noProposals.map((q: any) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md"
                  >
                    <div>
                      <p className="text-sm font-medium">{q.producerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.category || q.items?.[0]?.product || '—'} · {q.region}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="error" className="text-xs">
                        {q.hoursOpen}h aberta
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/quotes/${q.id}`)}
                        className="h-7 px-2 text-xs"
                      >
                        Ver <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Expirando em 48h */}
          {data.expiringSoon.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <CardTitle className="text-sm font-medium">
                    Expirando em 48h ({data.expiringSoon.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.expiringSoon.map((q: any) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
                  >
                    <div>
                      <p className="text-sm font-medium">{q.producerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.category || q.items?.[0]?.product || '—'} · {q.proposalsCount} proposta(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="warning" className="text-xs">
                        {q.hoursLeft}h restantes
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/quotes/${q.id}`)}
                        className="h-7 px-2 text-xs"
                      >
                        Ver <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Prontas para fechar */}
          {data.readyToClose.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <CardTitle className="text-sm font-medium">
                    Aguardando decisão ({data.readyToClose.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.readyToClose.map((q: any) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-md"
                  >
                    <div>
                      <p className="text-sm font-medium">{q.producerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.category || q.items?.[0]?.product || '—'} · {q.proposalsCount} proposta(s)
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/quotes/${q.id}/resultados`)}
                      className="h-7 px-3 text-xs gap-1"
                    >
                      <CheckCircle className="w-3 h-3" /> Escolher
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── 3. ECONOMIA GERADA ─────────────────────────────────────────────────────
function SavingsReport() {
  const defaults = defaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const { data, isLoading } = useReportSavings({ from, to });

  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Diferença entre a proposta mais cara e a vencedora em cada cotação fechada.
        </p>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Economia total</p>
            <p className="text-xl font-medium mt-1 text-primary">
              {formatCurrency(data.totalSavings)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Economia média</p>
            <p className="text-xl font-medium mt-1">{data.avgSavingsPercent}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Cotações analisadas</p>
            <p className="text-xl font-medium mt-1">{data.quotesAnalyzed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total fechadas</p>
            <p className="text-xl font-medium mt-1">{data.totalClosed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Por categoria */}
      {data.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Economia por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.byCategory} margin={{ bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="totalSavings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Economia total" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabela por cotação */}
      {data.perQuote.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detalhe por Cotação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left pb-2 pr-4">Produtor</th>
                    <th className="text-left pb-2 pr-4">Produtos</th>
                    <th className="text-right pb-2 pr-4">Melhor preço</th>
                    <th className="text-right pb-2 pr-4">Preço mais alto</th>
                    <th className="text-right pb-2 pr-4">Economia</th>
                    <th className="text-right pb-2">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.perQuote.map((q: any) => (
                    <tr key={q.quoteId} className="hover:bg-secondary/30">
                      <td className="py-2 pr-4 font-medium">{q.producerName}</td>
                      <td className="py-2 pr-4 text-muted-foreground truncate max-w-[160px]">
                        {q.products}
                      </td>
                      <td className="py-2 pr-4 text-right text-primary font-medium">
                        {formatCurrency(q.winnerPrice)}
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {formatCurrency(q.maxPrice)}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-green-600">
                        {formatCurrency(q.savings)}
                      </td>
                      <td className="py-2 text-right">
                        <Badge variant={q.savingsPercent >= 10 ? 'success' : 'outline'} className="text-xs">
                          {q.savingsPercent}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.perQuote.length === 0 && (
        <Card className="p-12 text-center">
          <PiggyBank className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma cotação fechada com múltiplas propostas no período.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── 4. PERFORMANCE DE FORNECEDORES ────────────────────────────────────────
function SupplierPerformanceReport() {
  const defaults = defaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const { data, isLoading } = useReportSupplierPerformance({ from, to });

  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const suppliers: any[] = data.suppliers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Taxa de vitória, ticket médio e prazo de entrega de cada fornecedor.
        </p>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {suppliers.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum fornecedor com propostas no período selecionado.
          </p>
        </Card>
      ) : (
        <>
          {/* Top 5 por taxa de vitória */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Taxa de vitória por fornecedor</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(180, suppliers.slice(0, 10).length * 40)}>
                <BarChart
                  data={suppliers.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 8, right: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Taxa de vitória" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabela completa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Todos os Fornecedores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left pb-2 pr-4">Fornecedor</th>
                      <th className="text-left pb-2 pr-4">Tipo</th>
                      <th className="text-right pb-2 pr-4">Propostas</th>
                      <th className="text-right pb-2 pr-4">Vitórias</th>
                      <th className="text-right pb-2 pr-4">Taxa vitória</th>
                      <th className="text-right pb-2 pr-4">Ticket médio</th>
                      <th className="text-right pb-2">Prazo médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suppliers.map((s: any) => (
                      <tr key={s.id} className="hover:bg-secondary/30">
                        <td className="py-2 pr-4">
                          <p className="font-medium">{s.name}</p>
                          {s.company && (
                            <p className="text-xs text-muted-foreground">{s.company}</p>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={s.isNetworkSupplier ? 'default' : 'outline'} className="text-xs">
                            {s.isNetworkSupplier ? 'Rede' : 'Próprio'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right">{s.totalProposals}</td>
                        <td className="py-2 pr-4 text-right">{s.wins}</td>
                        <td className="py-2 pr-4 text-right">
                          <Badge
                            variant={s.winRate >= 30 ? 'success' : s.winRate >= 10 ? 'warning' : 'outline'}
                            className="text-xs"
                          >
                            {s.winRate}%
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(s.avgTicket)}</td>
                        <td className="py-2 text-right">{s.avgDeliveryDays} dias</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── 5. ANÁLISE POR CATEGORIA E REGIÃO ─────────────────────────────────────
function CategoryRegionReport() {
  const defaults = defaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const { data, isLoading } = useReportCategoryRegion({ from, to });

  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const demandWithoutSupply = data.byRegion.filter((r: any) => r.demandWithoutSupply);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Volume de cotações por categoria e região — identifica oportunidades de mercado.
        </p>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {/* Por categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4" /> Volume por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byCategory.slice(0, 8)} margin={{ bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="quotesCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Cotações" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Volume por Região
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.byRegion.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byRegion.slice(0, 8)} margin={{ bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="region" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="quotesCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Cotações" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de categorias */}
      {data.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detalhe por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left pb-2 pr-4">Categoria</th>
                    <th className="text-right pb-2 pr-4">Cotações</th>
                    <th className="text-right pb-2 pr-4">Fechadas</th>
                    <th className="text-right pb-2 pr-4">Taxa fechamento</th>
                    <th className="text-right pb-2 pr-4">Média propostas</th>
                    <th className="text-right pb-2">Preço médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byCategory.map((c: any) => (
                    <tr key={c.category} className="hover:bg-secondary/30">
                      <td className="py-2 pr-4 font-medium">{c.category}</td>
                      <td className="py-2 pr-4 text-right">{c.quotesCount}</td>
                      <td className="py-2 pr-4 text-right">{c.closedCount}</td>
                      <td className="py-2 pr-4 text-right">
                        <Badge
                          variant={c.closureRate >= 50 ? 'success' : c.closureRate >= 25 ? 'warning' : 'outline'}
                          className="text-xs"
                        >
                          {c.closureRate}%
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">{c.avgProposals}</td>
                      <td className="py-2 text-right">
                        {c.avgPrice > 0 ? formatCurrency(c.avgPrice) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerta de demanda reprimida */}
      {demandWithoutSupply.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
              Demanda sem resposta por região
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Regiões com cotações que não receberam nenhuma proposta — oportunidade de recrutar
              fornecedores.
            </p>
            <div className="flex flex-wrap gap-2">
              {demandWithoutSupply.map((r: any) => (
                <Badge key={r.region} variant="warning" className="text-xs gap-1">
                  <MapPin className="w-3 h-3" />
                  {r.region} ({r.noProposals} sem proposta)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ───────────────────────────────────────────────────────
export function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('operational');

  const tabs: { id: Tab; label: string; icon: any; description: string }[] = [
    { id: 'operational', label: 'Operacional', icon: Clock, description: 'Cotações que precisam de ação' },
    { id: 'funnel', label: 'Funil', icon: BarChart2, description: 'Taxa de conversão por etapa' },
    { id: 'savings', label: 'Economia', icon: PiggyBank, description: 'Valor economizado nas cotações' },
    { id: 'suppliers', label: 'Fornecedores', icon: Users, description: 'Performance por fornecedor' },
    { id: 'category', label: 'Categoria/Região', icon: MapPin, description: 'Volume e demanda por mercado' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análises para gestão e tomada de decisão
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-normal whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      <div>
        {activeTab === 'funnel' && <FunnelReport />}
        {activeTab === 'operational' && <OperationalReport />}
        {activeTab === 'savings' && <SavingsReport />}
        {activeTab === 'suppliers' && <SupplierPerformanceReport />}
        {activeTab === 'category' && <CategoryRegionReport />}
      </div>
    </div>
  );
}
