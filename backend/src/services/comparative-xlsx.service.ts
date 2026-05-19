import ExcelJS from 'exceljs';
import type { ComparativePayload } from './comparative.service';

/**
 * CO-4-07 — Geração de XLSX do quadro comparativo.
 *
 * 2 sheets:
 *   - "Resumo": fornecedor por linha, totais bruto+corrigido+breakdown.
 *   - "Detalhe": item × fornecedor (matriz) com preços por célula.
 *
 * `correctedTotal` em destaque (negrito + cor verde no vencedor).
 */
export class ComparativeXlsxService {
  static async generate(data: ComparativePayload): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CotaObra';
    wb.created = new Date();

    this.buildResumoSheet(wb, data);
    this.buildDetalheSheet(wb, data);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private static buildResumoSheet(
    wb: ExcelJS.Workbook,
    data: ComparativePayload,
  ) {
    const ws = wb.addWorksheet('Resumo');

    ws.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Fornecedor', key: 'supplier', width: 30 },
      { header: 'Empresa', key: 'company', width: 24 },
      { header: 'Frete', key: 'freight', width: 14 },
      { header: 'Pagamento', key: 'payment', width: 14 },
      { header: 'Prazo (dias)', key: 'delivery', width: 14 },
      { header: 'Total bruto', key: 'totalValue', width: 16 },
      { header: 'Base', key: 'base', width: 14 },
      { header: 'Frete (R$)', key: 'freightValue', width: 14 },
      { header: 'Custo financeiro', key: 'financialCost', width: 16 },
      { header: 'Ajuste de prazo', key: 'deliveryAdj', width: 16 },
      { header: 'Total CORRIGIDO', key: 'corrected', width: 18 },
    ];

    // Estilo do header
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    for (const p of data.proposals) {
      const br = p.breakdown;
      ws.addRow({
        rank: p.rank ?? '—',
        supplier: p.supplierName,
        company: p.supplierCompany ?? '',
        freight: p.freightMode === 'CIF' ? 'CIF (incluso)' : 'FOB',
        payment: p.paymentTerms,
        delivery: p.deliveryDays,
        totalValue: p.totalValue,
        base: br ? parseFloat(br.base) : null,
        freightValue: p.freightValue ?? 0,
        financialCost: br ? parseFloat(br.financialCost) : null,
        deliveryAdj: br ? parseFloat(br.deliveryAdjustment) : null,
        corrected: p.correctedTotal,
      });
    }

    // Formatação de moeda BRL
    const moneyCols = ['totalValue', 'base', 'freightValue', 'financialCost', 'deliveryAdj', 'corrected'];
    moneyCols.forEach((col) => {
      ws.getColumn(col).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    });

    // Destaca vencedor: linha com rank=1 verde + negrito
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const rankVal = row.getCell('rank').value;
      if (rankVal === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD1FAE5' },
          };
          cell.font = { ...cell.font, bold: true };
        });
      }
    });

    // Header da coluna corrected em negrito sempre
    ws.getColumn('corrected').font = { bold: true };

    // Linha de resumo (Diferença max-min)
    if (
      data.summary.savings !== null &&
      data.summary.savings > 0 &&
      !data.summary.redacted
    ) {
      ws.addRow([]);
      const summaryRow = ws.addRow({
        rank: '',
        supplier: 'Diferença max-min (corrigido)',
        corrected: data.summary.savings,
      });
      summaryRow.font = { italic: true };
    }
  }

  private static buildDetalheSheet(
    wb: ExcelJS.Workbook,
    data: ComparativePayload,
  ) {
    const ws = wb.addWorksheet('Detalhe');

    // Cabeçalho: Item | Qty | Unid | <fornecedor 1> | <fornecedor 2> | ...
    const headerRow = ['Item', 'Qtd', 'Unidade'];
    for (const p of data.proposals) {
      headerRow.push(p.supplierName);
    }
    ws.addRow(headerRow);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    ws.columns = [
      { width: 36 },
      { width: 10 },
      { width: 10 },
      ...data.proposals.map(() => ({ width: 18 })),
    ];

    for (const item of data.quote.items) {
      const row: any[] = [item.description, item.qty ?? '', item.unit ?? ''];
      for (const p of data.proposals) {
        const pi = p.items.find((x) => x.quoteItemId === item.id);
        if (!pi || !pi.available) {
          row.push('indisponível');
        } else if (data.summary.redacted) {
          row.push('—');
        } else {
          row.push(pi.totalPrice);
        }
      }
      ws.addRow(row);
    }

    // Formatação numérica nas colunas dos fornecedores
    for (let i = 0; i < data.proposals.length; i++) {
      const col = ws.getColumn(4 + i);
      col.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    }

    // Linha de total bruto
    const totalRow: any[] = ['Total bruto', '', ''];
    for (const p of data.proposals) {
      totalRow.push(data.summary.redacted ? '' : p.totalValue);
    }
    const trRef = ws.addRow(totalRow);
    trRef.font = { bold: true };

    // Linha de total corrigido
    const correctedRow: any[] = ['Total CORRIGIDO', '', ''];
    for (const p of data.proposals) {
      correctedRow.push(data.summary.redacted ? '' : p.correctedTotal);
    }
    const cr = ws.addRow(correctedRow);
    cr.font = { bold: true };
    cr.eachCell((cell, idx) => {
      if (idx > 3) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' },
        };
      }
    });

    // Linha de pagamento e prazo
    ws.addRow([]);
    const paymentRow: any[] = ['Pagamento', '', ''];
    for (const p of data.proposals) paymentRow.push(p.paymentTerms);
    ws.addRow(paymentRow);

    const deliveryRow: any[] = ['Prazo entrega', '', ''];
    for (const p of data.proposals) deliveryRow.push(`${p.deliveryDays} dias`);
    ws.addRow(deliveryRow);
  }
}
