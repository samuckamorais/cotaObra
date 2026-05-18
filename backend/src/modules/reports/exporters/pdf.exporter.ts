import PDFDocument from 'pdfkit';

const REPORT_TITLES: Record<string, string> = {
  funnel: 'Funil de Cotações',
  operational: 'Relatório Operacional',
  savings: 'Economia Gerada',
  'supplier-performance': 'Performance de Fornecedores',
  'category-region': 'Análise por Categoria e Região',
  compare: 'Comparativo entre Períodos',
};

/**
 * Exporta dados de relatório para PDF usando PDFKit.
 */
export async function exportToPdf(reportType: string, data: unknown): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const title = REPORT_TITLES[reportType] || reportType;

    // Cabeçalho
    doc.fontSize(18).fillColor('#1a56a0').text(`CotaObra — ${title}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#888888').text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, { align: 'right' });
    doc.moveDown(1.5);

    // Linha separadora
    doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Dados
    const rows = flattenData(data);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0] as Record<string, unknown>);
      const colWidth = Math.min(120, (495 / headers.length));

      // Header
      doc.fontSize(8).fillColor('#1a56a0').font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(formatHeaderLabel(h), 50 + i * colWidth, doc.y, {
          width: colWidth,
          continued: i < headers.length - 1,
        });
      });
      doc.moveDown(0.5);

      // Rows
      doc.font('Helvetica').fillColor('#333333').fontSize(8);
      for (const row of rows) {
        const r = row as Record<string, unknown>;
        if (doc.y > 750) {
          doc.addPage();
          doc.y = 50;
        }
        headers.forEach((h, i) => {
          const val = r[h];
          doc.text(formatValue(val), 50 + i * colWidth, doc.y, {
            width: colWidth,
            continued: i < headers.length - 1,
          });
        });
        doc.moveDown(0.3);
      }
    } else {
      doc.fontSize(12).fillColor('#555555').text('Nenhum dado disponível para este relatório.', { align: 'center' });
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#aaaaaa').text('CotaObra — Plataforma de Cotações Agrícolas', { align: 'center' });

    doc.end();
  });
}

function flattenData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && val.length > 0) return val;
    }
    return [data];
  }
  return [];
}

function formatHeaderLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).replace(/_/g, ' ').trim();
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toLocaleString('pt-BR');
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
