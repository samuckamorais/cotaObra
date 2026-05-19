import { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  useComparative,
  type ComparativeData,
  type ComparativeProposal,
  type ComparativeBreakdown,
} from '../../hooks/useComparative';
import { formatCurrency } from '../../lib/utils';
import { Trophy, FileSpreadsheet, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CloseQuoteModal } from './CloseQuoteModal';

interface Props {
  quoteId: string;
  onClickExport?: () => void;
  /** Mostrar botão "Fechar cotação" (visível apenas quando SUMMARIZED) */
  allowClose?: boolean;
}

/**
 * CO-4-04 — Quadro comparativo lado a lado.
 *
 * Layout:
 *   - Linhas: 1 por QuoteItem.
 *   - Colunas: 1 por Proposal (fornecedor) com rank.
 *   - Células: unitPrice + totalPrice. Badge "1º" no menor por item.
 *   - Rodapé: totalValue (bruto) + correctedTotal + breakdown ao hover.
 *   - Linhas extras: Frete, Pagamento, Prazo.
 *   - Coluna do vencedor (rank=1) com fundo verde.
 *   - Mobile: scroll horizontal com coluna "Item" sticky.
 */
export function PricingComparator({ quoteId, onClickExport, allowClose }: Props) {
  const { data, isLoading, error } = useComparative(quoteId);
  const [hoverBreakdownFor, setHoverBreakdownFor] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground animate-pulse">
          Carregando quadro comparativo…
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Erro ao carregar comparativo.
        </CardContent>
      </Card>
    );
  }

  if (data.proposals.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
          <AlertCircle className="size-8 mx-auto" />
          <p>Ainda não há propostas para comparar.</p>
        </CardContent>
      </Card>
    );
  }

  const { quote, proposals, summary } = data;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <CompareHeader
          summary={summary}
          onClickExport={onClickExport}
          onClickClose={allowClose ? () => setShowCloseModal(true) : undefined}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background border-b px-3 py-2 text-left text-xs uppercase text-muted-foreground min-w-[200px] z-10">
                  Item
                </th>
                {proposals.map((p) => (
                  <ProposalHeaderCell key={p.supplierId} proposal={p} />
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="sticky left-0 bg-inherit border-b px-3 py-2 align-top z-10">
                    <p className="font-medium leading-tight">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.qty != null && item.unit
                        ? `${item.qty} ${item.unit}`
                        : ''}
                    </p>
                  </td>
                  {proposals.map((p) => {
                    const pi = p.items.find((x) => x.quoteItemId === item.id);
                    const isWinner = pi && pi.available && pi.rank === 1;
                    return (
                      <td
                        key={p.supplierId}
                        className={`border-b px-3 py-2 align-top ${
                          isWinner ? 'bg-green-50' : ''
                        }`}
                      >
                        {!pi || !pi.available ? (
                          <span className="text-xs text-muted-foreground italic">
                            indisponível
                          </span>
                        ) : summary.redacted ? (
                          <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                            <EyeOff className="size-3" /> oculto
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="font-medium">
                              {formatCurrency(pi.totalPrice)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(pi.unitPrice)}/un
                            </p>
                            {isWinner && (
                              <Badge className="bg-green-600 text-white text-[10px] mt-0.5">
                                1º preço
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Linhas globais: frete / pagamento / prazo / total / corrigido */}
              <FooterRow
                label="Frete"
                values={proposals.map((p) =>
                  p.freightMode === 'CIF'
                    ? 'CIF (incluso)'
                    : summary.redacted
                      ? '—'
                      : `FOB · ${formatCurrency(p.freightValue ?? 0)}`,
                )}
              />
              <FooterRow
                label="Pagamento"
                values={proposals.map((p) => p.paymentTerms)}
              />
              <FooterRow
                label="Prazo entrega"
                values={proposals.map((p) => `${p.deliveryDays} dias`)}
              />
              <FooterRow
                label="Total bruto"
                bold
                values={proposals.map((p) =>
                  summary.redacted ? '—' : formatCurrency(p.totalValue),
                )}
              />
              <FooterRow
                label="Total CORRIGIDO"
                bold
                highlight
                values={proposals.map((p) => {
                  if (summary.redacted) return '—';
                  return p.correctedTotal !== null
                    ? formatCurrency(p.correctedTotal)
                    : '(pendente)';
                })}
                onHoverProposalIndex={(i) =>
                  setHoverBreakdownFor(proposals[i]?.supplierId ?? null)
                }
              />
            </tbody>
          </table>
        </div>

        {/* Tooltip de breakdown */}
        {hoverBreakdownFor &&
          (() => {
            const p = proposals.find((x) => x.supplierId === hoverBreakdownFor);
            if (!p || !p.breakdown) return null;
            return (
              <div
                className="bg-muted/40 border border-border rounded p-3 text-xs space-y-1"
                onMouseLeave={() => setHoverBreakdownFor(null)}
              >
                <p className="font-medium">
                  Breakdown — {p.supplierName}
                </p>
                <BreakdownDetail breakdown={p.breakdown} />
              </div>
            );
          })()}
      </CardContent>

      {/* CO-5-03 — modal de fechamento */}
      {allowClose && showCloseModal && (
        <CloseQuoteModal
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          quoteId={quoteId}
          comparative={data}
        />
      )}
    </Card>
  );
}

function CompareHeader({
  summary,
  onClickExport,
  onClickClose,
}: {
  summary: ComparativeData['summary'];
  onClickExport?: () => void;
  onClickClose?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-medium">Quadro comparativo</h3>
        {summary.redacted ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <EyeOff className="size-3" /> Preços ocultos para seu perfil.
          </p>
        ) : summary.savings !== null && summary.savings > 0 ? (
          <p className="text-xs text-green-700 flex items-center gap-1">
            <Trophy className="size-3" />
            Diferença max-min: <strong>{formatCurrency(summary.savings)}</strong>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Compare valor bruto, corrigido e condições lado a lado.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {onClickExport && !summary.redacted && (
          <Button variant="outline" size="sm" className="gap-1" onClick={onClickExport}>
            <FileSpreadsheet className="size-4" />
            Exportar XLSX
          </Button>
        )}
        {onClickClose && !summary.redacted && (
          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={onClickClose}>
            <CheckCircle2 className="size-4" />
            Fechar cotação
          </Button>
        )}
      </div>
    </div>
  );
}

function ProposalHeaderCell({ proposal }: { proposal: ComparativeProposal }) {
  const isWinner = proposal.rank === 1;
  return (
    <th
      className={`border-b px-3 py-2 text-left text-xs uppercase min-w-[160px] ${
        isWinner ? 'bg-green-100 text-green-900' : 'text-muted-foreground'
      }`}
    >
      <div className="space-y-1">
        <p className="font-semibold normal-case text-sm">{proposal.supplierName}</p>
        {proposal.supplierCompany && (
          <p className="normal-case text-[10px] text-muted-foreground truncate">
            {proposal.supplierCompany}
          </p>
        )}
        {proposal.rank !== null && (
          <Badge
            className={
              isWinner
                ? 'bg-green-600 text-white text-[10px]'
                : 'bg-gray-200 text-gray-800 text-[10px]'
            }
          >
            {proposal.rank}º lugar
          </Badge>
        )}
        {proposal.isPartial && (
          <Badge className="bg-amber-100 text-amber-800 text-[10px]">parcial</Badge>
        )}
      </div>
    </th>
  );
}

function FooterRow({
  label,
  values,
  bold,
  highlight,
  onHoverProposalIndex,
}: {
  label: string;
  values: string[];
  bold?: boolean;
  highlight?: boolean;
  onHoverProposalIndex?: (i: number) => void;
}) {
  return (
    <tr className={highlight ? 'bg-green-50/60' : ''}>
      <td
        className={`sticky left-0 bg-inherit border-b px-3 py-2 text-xs uppercase tracking-wide ${
          bold ? 'font-semibold text-foreground' : 'text-muted-foreground'
        } z-10`}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`border-b px-3 py-2 ${bold ? 'font-semibold' : ''}`}
          onMouseEnter={() => onHoverProposalIndex?.(i)}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

function BreakdownDetail({ breakdown }: { breakdown: ComparativeBreakdown }) {
  const rows: Array<[string, string]> = [
    ['Base', breakdown.base],
    ['Frete', breakdown.freight],
    ['Custo financeiro', breakdown.financialCost],
    ['Ajuste de prazo', breakdown.deliveryAdjustment],
    ['Corrigido', breakdown.corrected],
  ];
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={k} className={i === rows.length - 1 ? 'font-semibold border-t' : ''}>
            <td className="py-0.5 pr-3">{k}</td>
            <td className="py-0.5 text-right">{formatCurrency(parseFloat(v))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
