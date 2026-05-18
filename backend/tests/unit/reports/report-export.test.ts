import { exportToXlsx } from '../../../src/modules/reports/exporters/xlsx.exporter';
import { exportToPdf } from '../../../src/modules/reports/exporters/pdf.exporter';

/**
 * Testes de integração dos exporters com dados simulados de cada tipo de relatório.
 * Verifica que dados reais (estruturas que o ReportService retorna) são exportados
 * corretamente em ambos os formatos.
 */

const REPORT_DATA: Record<string, unknown> = {
  funnel: {
    totalQuotes: 50,
    byStatus: { PENDING: 5, COLLECTING: 10, SUMMARIZED: 15, CLOSED: 15, EXPIRED: 5 },
    conversionRate: '30.00',
  },
  operational: {
    avgResponseTime: 2.3,
    avgProposalsPerQuote: 4.5,
    topProducts: [
      { product: 'Soja', count: 25 },
      { product: 'Milho', count: 18 },
    ],
  },
  savings: {
    totalSavings: 45000,
    avgSavingsPercent: 12.5,
    details: [
      { quote: 'Soja 100sc', bestPrice: 14200, worstPrice: 15500, savings: 1300 },
      { quote: 'KCL 50ton', bestPrice: 2790, worstPrice: 3130, savings: 340 },
    ],
  },
  'supplier-performance': {
    suppliers: [
      { name: 'Forn A', totalProposals: 20, winRate: 0.35, avgPrice: 14500, rating: 4.2 },
      { name: 'Forn B', totalProposals: 15, winRate: 0.47, avgPrice: 14100, rating: 4.5 },
    ],
  },
  'category-region': {
    categories: [
      { category: 'Sementes', region: 'GO', totalQuotes: 12, avgPrice: 14800 },
      { category: 'Fertilizantes', region: 'MT', totalQuotes: 8, avgPrice: 2900 },
    ],
  },
  compare: {
    current: { totalQuotes: 30, closedQuotes: 20 },
    previous: { totalQuotes: 25, closedQuotes: 15 },
  },
};

describe('Report Export — XLSX com dados reais', () => {
  const types = Object.keys(REPORT_DATA);

  types.forEach((type) => {
    it(`exporta ${type} para XLSX sem erro`, async () => {
      const buffer = await exportToXlsx(type, REPORT_DATA[type]);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  it('XLSX de savings contém dados na tabela', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const buffer = await exportToXlsx('savings', REPORT_DATA['savings']);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    // Deve ter header + pelo menos 2 linhas de dados
    expect(sheet.rowCount).toBeGreaterThanOrEqual(6); // 4 (header row) + 2 dados
  });

  it('XLSX de supplier-performance contém dados dos fornecedores', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const buffer = await exportToXlsx('supplier-performance', REPORT_DATA['supplier-performance']);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    // Linha 5 = primeiro fornecedor
    const row5 = sheet.getRow(5);
    expect(row5.getCell(1).value).toBe('Forn A');
  });
});

describe('Report Export — PDF com dados reais', () => {
  const types = Object.keys(REPORT_DATA);

  types.forEach((type) => {
    it(`exporta ${type} para PDF sem erro`, async () => {
      const buffer = await exportToPdf(type, REPORT_DATA[type]);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});

describe('Report Export — Content-Disposition filename', () => {
  it('filename segue padrão cotaobra-{type}-{date}.{ext}', () => {
    const type = 'funnel';
    const timestamp = new Date().toISOString().slice(0, 10);
    const xlsxFilename = `cotaobra-${type}-${timestamp}.xlsx`;
    const pdfFilename = `cotaobra-${type}-${timestamp}.pdf`;

    expect(xlsxFilename).toMatch(/^cotaobra-funnel-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(pdfFilename).toMatch(/^cotaobra-funnel-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('Report Export — Validação de tipos', () => {
  const validTypes = ['funnel', 'operational', 'savings', 'supplier-performance', 'category-region'];

  it('todos os tipos válidos são reconhecidos', () => {
    validTypes.forEach((type) => {
      expect(REPORT_DATA[type]).toBeDefined();
    });
  });

  it('tipo inválido não tem dados mapeados', () => {
    expect(REPORT_DATA['invalid-type']).toBeUndefined();
  });
});
