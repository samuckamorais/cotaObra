import { exportToXlsx } from '../../../src/modules/reports/exporters/xlsx.exporter';
import ExcelJS from 'exceljs';

describe('XLSX Exporter', () => {
  const sampleFunnelData = {
    totalQuotes: 50,
    proposals: [
      { supplier: 'Fornecedor A', price: 14850, deliveryDays: 5, status: 'accepted' },
      { supplier: 'Fornecedor B', price: 14200, deliveryDays: 3, status: 'pending' },
      { supplier: 'Fornecedor C', price: 15500, deliveryDays: 7, status: 'rejected' },
    ],
  };

  const sampleArrayData = [
    { produto: 'Soja', quantidade: 100, unidade: 'sacas', preco: 14200 },
    { produto: 'Milho', quantidade: 50, unidade: 'sacas', preco: 8900 },
  ];

  it('gera Buffer válido para dados de relatório (objeto com array)', async () => {
    const buffer = await exportToXlsx('funnel', sampleFunnelData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gera Buffer válido para dados de relatório (array direto)', async () => {
    const buffer = await exportToXlsx('savings', sampleArrayData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gera XLSX parseável pelo ExcelJS', async () => {
    const buffer = await exportToXlsx('funnel', sampleFunnelData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);
  });

  it('usa título correto na aba para tipo funnel', async () => {
    const buffer = await exportToXlsx('funnel', sampleFunnelData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]?.name).toBe('Funil de Cotações');
  });

  it('usa título correto para tipo savings', async () => {
    const buffer = await exportToXlsx('savings', sampleArrayData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]?.name).toBe('Economia Gerada');
  });

  it('contém cabeçalho CotaObra na célula A1', async () => {
    const buffer = await exportToXlsx('funnel', sampleFunnelData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const cell = workbook.worksheets[0]?.getCell('A1');
    expect(String(cell?.value)).toContain('CotaObra');
    expect(String(cell?.value)).toContain('Funil');
  });

  it('contém data de geração na célula A2', async () => {
    const buffer = await exportToXlsx('operational', { metrics: [] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const cell = workbook.worksheets[0]?.getCell('A2');
    expect(String(cell?.value)).toContain('Gerado em');
  });

  it('cria header row com colunas do array de dados', async () => {
    const buffer = await exportToXlsx('savings', sampleArrayData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    // Header na linha 4
    const headerRow = sheet.getRow(4);
    const headers = [1, 2, 3, 4].map(i => String(headerRow.getCell(i).value));
    expect(headers).toContain('Produto');
    expect(headers).toContain('Quantidade');
  });

  it('preenche linhas de dados corretamente', async () => {
    const buffer = await exportToXlsx('savings', sampleArrayData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    // Dados na linha 5 (primeira linha de dados)
    const row5 = sheet.getRow(5);
    expect(row5.getCell(1).value).toBe('Soja');
    expect(row5.getCell(2).value).toBe(100);
  });

  it('lida com dados vazios sem erro', async () => {
    const buffer = await exportToXlsx('funnel', {});
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('lida com array vazio sem erro', async () => {
    const buffer = await exportToXlsx('funnel', []);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('lida com null sem erro', async () => {
    const buffer = await exportToXlsx('funnel', null);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('define creator como CotaObra no workbook', async () => {
    const buffer = await exportToXlsx('funnel', sampleFunnelData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.creator).toBe('CotaObra');
  });

  it('funciona para todos os 6 tipos de relatório', async () => {
    const types = ['funnel', 'operational', 'savings', 'supplier-performance', 'category-region', 'compare'];
    for (const type of types) {
      const buffer = await exportToXlsx(type, { items: [{ col1: 'val1' }] });
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});
