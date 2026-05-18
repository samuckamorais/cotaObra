import { exportToPdf } from '../../../src/modules/reports/exporters/pdf.exporter';

describe('PDF Exporter', () => {
  const sampleData = [
    { fornecedor: 'Fornecedor A', preco: 14850, prazo: 5, status: 'aceito' },
    { fornecedor: 'Fornecedor B', preco: 14200, prazo: 3, status: 'pendente' },
  ];

  const sampleObjectData = {
    totalQuotes: 50,
    items: [
      { produto: 'Soja', quantidade: 100 },
      { produto: 'Milho', quantidade: 50 },
    ],
  };

  it('gera Buffer válido para dados em array', async () => {
    const buffer = await exportToPdf('funnel', sampleData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gera Buffer válido para dados em objeto', async () => {
    const buffer = await exportToPdf('savings', sampleObjectData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('começa com assinatura PDF (%PDF)', async () => {
    const buffer = await exportToPdf('funnel', sampleData);
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('lida com dados vazios sem erro', async () => {
    const buffer = await exportToPdf('operational', {});
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('lida com array vazio sem erro', async () => {
    const buffer = await exportToPdf('funnel', []);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('lida com null sem erro', async () => {
    const buffer = await exportToPdf('funnel', null);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('funciona para todos os 6 tipos de relatório', async () => {
    const types = ['funnel', 'operational', 'savings', 'supplier-performance', 'category-region', 'compare'];
    for (const type of types) {
      const buffer = await exportToPdf(type, [{ col1: 'val1', col2: 123 }]);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
  });

  it('gera PDF com tamanho razoável (> 500 bytes para conteúdo real)', async () => {
    const buffer = await exportToPdf('funnel', sampleData);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('gera PDFs diferentes para dados diferentes', async () => {
    const buf1 = await exportToPdf('funnel', [{ x: 1 }]);
    const buf2 = await exportToPdf('savings', [{ y: 999 }]);
    // PDFs devem ter tamanhos diferentes (conteúdo diferente)
    expect(buf1.length).not.toBe(buf2.length);
  });
});
