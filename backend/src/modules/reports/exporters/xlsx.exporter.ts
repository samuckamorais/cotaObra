import ExcelJS from 'exceljs';

const REPORT_TITLES: Record<string, string> = {
  funnel: 'Funil de Cotações',
  operational: 'Relatório Operacional',
  savings: 'Economia Gerada',
  'supplier-performance': 'Performance de Fornecedores',
  'category-region': 'Análise por Categoria e Região',
  compare: 'Comparativo entre Períodos',
};

/**
 * Exporta dados de relatório para XLSX usando ExcelJS.
 */
export async function exportToXlsx(reportType: string, data: unknown): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CotaObra';
  workbook.created = new Date();

  const title = REPORT_TITLES[reportType] || reportType;
  const sheet = workbook.addWorksheet(title);

  // Cabeçalho
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Relatório CotaObra — ${title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1a56a0' } };

  sheet.mergeCells('A2:F2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
  dateCell.font = { size: 9, color: { argb: 'FF888888' } };

  // Dados
  const rows = flattenData(data);
  if (rows.length > 0) {
    const headers = Object.keys(rows[0] as Record<string, unknown>);

    // Header row (linha 4)
    const headerRow = sheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = formatHeaderLabel(h);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a56a0' } };
      cell.alignment = { horizontal: 'center' };
    });
    headerRow.commit();

    // Data rows
    rows.forEach((row, rowIdx) => {
      const r = row as Record<string, unknown>;
      const excelRow = sheet.getRow(rowIdx + 5);
      headers.forEach((h, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        const val = r[h];
        cell.value = formatCellValue(val);
        // Linhas alternadas
        if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        }
      });
      excelRow.commit();
    });

    // Auto-width
    headers.forEach((_, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = 18;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function flattenData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    // Procurar primeiro array dentro do objeto
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && val.length > 0) return val;
    }
    // Se não tem array, retornar o próprio objeto como uma linha
    return [data];
  }
  return [];
}

function formatHeaderLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function formatCellValue(val: unknown): string | number | Date {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
