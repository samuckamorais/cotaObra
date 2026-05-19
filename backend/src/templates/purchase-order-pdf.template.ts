/**
 * CO-5-04 — Template do PDF da Ordem de Compra (OC).
 *
 * Layout (§5 do backlog v2):
 *   1. Cabeçalho — logo + nome da construtora + CNPJ + endereço
 *   2. Bloco "Obra" — nome + endereço + CNO + responsável
 *   3. Bloco "Fornecedor" — razão social + CNPJ + contato
 *   4. Tabela de itens — # | Descrição | Qtd | Unid | Preço unit | Total
 *   5. Rodapé — Subtotal | Frete | Total | Pagamento | Prazo | Observações
 *   6. Assinatura — 2 linhas (Comprador / Fornecedor) com data
 *
 * Marca d'água "CotaObra" tênue.
 * A4 portrait, margem 2cm. Helvetica nativa.
 */
import PDFDocument from 'pdfkit';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  Quote,
  Site,
  Supplier,
  Tenant,
} from '@prisma/client';

// ────── Cores e layout ──────
const COLOR_PRIMARY = '#0F172A'; // construção: neutro escuro
const COLOR_TEXT = '#1F2937';
const COLOR_MUTED = '#6B7280';
const COLOR_BORDER = '#E5E7EB';
const COLOR_TABLE_HEAD = '#F3F4F6';

const PAGE_WIDTH = 595; // A4 portrait
const MARGIN = 50; // ~1.7cm

export interface PurchaseOrderPdfData {
  tenant: Pick<Tenant, 'name' | 'cnpj' | 'email'>;
  site: Pick<Site, 'name' | 'address' | 'city' | 'state' | 'zip' | 'cno' | 'manager' | 'managerPhone'>;
  supplier: Pick<Supplier, 'name' | 'company' | 'phone' | 'email'>;
  quote: Pick<Quote, 'id' | 'deadline' | 'observations'>;
  purchaseOrder: Pick<
    PurchaseOrder,
    | 'id'
    | 'number'
    | 'totalValue'
    | 'paymentTerms'
    | 'deliveryDays'
    | 'freightMode'
    | 'freightValue'
    | 'observations'
    | 'createdAt'
  >;
  items: Array<
    Pick<PurchaseOrderItem, 'description' | 'qty' | 'unit' | 'unitPrice' | 'totalPrice' | 'spec'>
  >;
}

function brCurrency(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n);
}

function brDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR');
}

export function generatePurchaseOrderPdf(data: PurchaseOrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: `Ordem de Compra #${data.purchaseOrder.number}`,
          Author: 'CotaObra',
          Creator: 'CotaObra',
          Producer: 'CotaObra',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Marca d'água tênue
      drawWatermark(doc);

      // Cabeçalho
      drawHeader(doc, data);

      // Bloco obra + fornecedor (lado a lado)
      drawObraSupplierBlocks(doc, data);

      // Tabela de itens
      drawItemsTable(doc, data);

      // Rodapé com totais
      drawTotalsBlock(doc, data);

      // Assinaturas
      drawSignatures(doc, data);

      // Footer de página
      drawPageFooter(doc, data);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.fillColor('#F1F5F9');
  doc.fontSize(80);
  doc.font('Helvetica-Bold');
  doc.rotate(-45, { origin: [PAGE_WIDTH / 2, 400] });
  doc.text('CotaObra', 80, 380, { width: 500, align: 'center' });
  doc.restore();
}

function drawHeader(doc: PDFKit.PDFDocument, data: PurchaseOrderPdfData) {
  const startY = MARGIN;

  // Logo placeholder (futuro: ler tenant.logo)
  doc
    .fillColor(COLOR_PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('ORDEM DE COMPRA', MARGIN, startY);

  doc
    .fillColor(COLOR_MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(`Nº ${String(data.purchaseOrder.number).padStart(6, '0')}`, MARGIN, startY + 28)
    .text(`Emitida: ${brDate(data.purchaseOrder.createdAt)}`, MARGIN, startY + 42);

  // Construtora info no canto direito
  const rightX = PAGE_WIDTH - MARGIN - 200;
  doc
    .fillColor(COLOR_TEXT)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(data.tenant.name, rightX, startY, { width: 200, align: 'right' });
  if (data.tenant.cnpj) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(`CNPJ: ${data.tenant.cnpj}`, rightX, startY + 16, { width: 200, align: 'right' });
  }
  if (data.tenant.email) {
    doc.text(data.tenant.email, rightX, startY + 30, { width: 200, align: 'right' });
  }

  // Linha separadora
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(MARGIN, startY + 70)
    .lineTo(PAGE_WIDTH - MARGIN, startY + 70)
    .stroke();

  doc.y = startY + 85;
}

function drawObraSupplierBlocks(doc: PDFKit.PDFDocument, data: PurchaseOrderPdfData) {
  const startY = doc.y;
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - 20) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + 20;

  // OBRA
  doc
    .fillColor(COLOR_PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('OBRA', leftX, startY);

  let y = startY + 16;
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11).text(data.site.name, leftX, y, { width: colWidth });
  y += 18;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
  if (data.site.address) {
    doc.text(data.site.address, leftX, y, { width: colWidth });
    y += 12;
  }
  doc.text(`${data.site.city}/${data.site.state}${data.site.zip ? ' · CEP ' + data.site.zip : ''}`, leftX, y, { width: colWidth });
  y += 12;
  if (data.site.cno) {
    doc.text(`CNO: ${data.site.cno}`, leftX, y, { width: colWidth });
    y += 12;
  }
  if (data.site.manager) {
    doc.text(`Resp.: ${data.site.manager}${data.site.managerPhone ? ' · ' + data.site.managerPhone : ''}`, leftX, y, { width: colWidth });
  }

  // FORNECEDOR
  doc
    .fillColor(COLOR_PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('FORNECEDOR', rightX, startY);

  y = startY + 16;
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11).text(data.supplier.name, rightX, y, { width: colWidth });
  y += 18;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
  if (data.supplier.company) {
    doc.text(data.supplier.company, rightX, y, { width: colWidth });
    y += 12;
  }
  doc.text(`Tel.: ${data.supplier.phone}`, rightX, y, { width: colWidth });
  y += 12;
  if (data.supplier.email) {
    doc.text(data.supplier.email, rightX, y, { width: colWidth });
  }

  doc.y = Math.max(startY + 100, y + 20);
}

function drawItemsTable(doc: PDFKit.PDFDocument, data: PurchaseOrderPdfData) {
  const startY = doc.y;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;

  // Cabeçalho da tabela
  doc
    .fillColor(COLOR_TABLE_HEAD)
    .rect(MARGIN, startY, tableWidth, 22)
    .fill();

  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(9);

  const cols = {
    n: { x: MARGIN + 4, width: 22 },
    desc: { x: MARGIN + 30, width: 230 },
    qty: { x: MARGIN + 264, width: 50 },
    unit: { x: MARGIN + 318, width: 40 },
    unitPrice: { x: MARGIN + 362, width: 65 },
    total: { x: MARGIN + 431, width: 64 },
  };

  doc.text('#', cols.n.x, startY + 7);
  doc.text('Descrição', cols.desc.x, startY + 7);
  doc.text('Qtd', cols.qty.x, startY + 7);
  doc.text('Unid', cols.unit.x, startY + 7);
  doc.text('Preço unit.', cols.unitPrice.x, startY + 7, { width: cols.unitPrice.width, align: 'right' });
  doc.text('Total', cols.total.x, startY + 7, { width: cols.total.width, align: 'right' });

  // Linhas
  let y = startY + 26;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT);

  data.items.forEach((item, idx) => {
    const rowHeight = 22;
    if (idx % 2 === 1) {
      doc.fillColor('#F9FAFB').rect(MARGIN, y - 4, tableWidth, rowHeight).fill();
      doc.fillColor(COLOR_TEXT);
    }
    doc.text(String(idx + 1), cols.n.x, y);
    doc.text(item.description, cols.desc.x, y, { width: cols.desc.width });
    if (item.spec) {
      doc.fillColor(COLOR_MUTED).fontSize(7).text(item.spec, cols.desc.x, y + 10, { width: cols.desc.width });
      doc.fillColor(COLOR_TEXT).fontSize(9);
    }
    doc.text(String(item.qty), cols.qty.x, y);
    doc.text(item.unit, cols.unit.x, y);
    doc.text(brCurrency(Number(item.unitPrice)), cols.unitPrice.x, y, { width: cols.unitPrice.width, align: 'right' });
    doc.text(brCurrency(Number(item.totalPrice)), cols.total.x, y, { width: cols.total.width, align: 'right' });
    y += rowHeight;
  });

  // Linha separadora
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .stroke();

  doc.y = y + 10;
}

function drawTotalsBlock(doc: PDFKit.PDFDocument, data: PurchaseOrderPdfData) {
  const startY = doc.y;
  const rightX = PAGE_WIDTH - MARGIN - 200;
  let y = startY;

  const itemsSum = data.items.reduce((sum, i) => sum + Number(i.totalPrice), 0);

  // Subtotal
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED).text('Subtotal:', rightX, y, { width: 100 });
  doc.fillColor(COLOR_TEXT).text(brCurrency(itemsSum), rightX + 100, y, { width: 100, align: 'right' });
  y += 16;

  // Frete
  const freightLabel =
    data.purchaseOrder.freightMode === 'CIF'
      ? 'Frete (CIF, incluso):'
      : data.purchaseOrder.freightMode === 'FOB'
        ? 'Frete (FOB):'
        : 'Frete:';
  const freightValue =
    data.purchaseOrder.freightMode === 'CIF'
      ? 'R$ 0,00'
      : brCurrency(Number(data.purchaseOrder.freightValue ?? 0));
  doc.fillColor(COLOR_MUTED).text(freightLabel, rightX, y, { width: 130 });
  doc.fillColor(COLOR_TEXT).text(freightValue, rightX + 100, y, { width: 100, align: 'right' });
  y += 20;

  // Total geral em destaque
  doc.strokeColor(COLOR_PRIMARY).lineWidth(1).moveTo(rightX, y - 2).lineTo(PAGE_WIDTH - MARGIN, y - 2).stroke();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_PRIMARY).text('TOTAL:', rightX, y + 4, { width: 100 });
  doc.text(brCurrency(Number(data.purchaseOrder.totalValue)), rightX + 100, y + 4, { width: 100, align: 'right' });
  y += 30;

  // Condições à esquerda
  const leftX = MARGIN;
  let yLeft = startY;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY).text('PAGAMENTO', leftX, yLeft);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT).text(data.purchaseOrder.paymentTerms, leftX, yLeft + 14);
  yLeft += 32;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY).text('PRAZO DE ENTREGA', leftX, yLeft);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT).text(`${data.purchaseOrder.deliveryDays} dias`, leftX, yLeft + 14);
  yLeft += 32;

  if (data.purchaseOrder.observations) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY).text('OBSERVAÇÕES', leftX, yLeft);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT).text(
      data.purchaseOrder.observations,
      leftX,
      yLeft + 14,
      { width: 290 },
    );
  }

  doc.y = Math.max(y, yLeft) + 40;
}

function drawSignatures(doc: PDFKit.PDFDocument, _data: PurchaseOrderPdfData) {
  const startY = doc.y;
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - 40) / 2;
  const lineY = startY + 30;

  doc.strokeColor(COLOR_TEXT).lineWidth(0.5);
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + colWidth, lineY).stroke();
  doc.moveTo(MARGIN + colWidth + 40, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY).stroke();

  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
  doc.text('Comprador (construtora)', MARGIN, lineY + 6, { width: colWidth, align: 'center' });
  doc.text('Fornecedor', MARGIN + colWidth + 40, lineY + 6, { width: colWidth, align: 'center' });

  doc.y = lineY + 30;
}

function drawPageFooter(doc: PDFKit.PDFDocument, _data: PurchaseOrderPdfData) {
  const footerY = 842 - 30;
  doc.font('Helvetica').fontSize(7).fillColor(COLOR_MUTED);
  doc.text(
    `Gerado por CotaObra em ${new Date().toLocaleString('pt-BR')} · documento sem valor fiscal — usar como referência interna`,
    MARGIN,
    footerY,
    { width: PAGE_WIDTH - MARGIN * 2, align: 'center' },
  );
}
