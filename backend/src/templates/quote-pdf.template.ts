/**
 * FEAT-PDF-001 — Template visual do PDF de resultado de cotação.
 *
 * Layout (§6 da spec):
 *   1. Cabeçalho — logo + título + data
 *   2. Dados do produtor (sem CPF/telefone — LGPD §8)
 *   3. Dados da cotação (ID curto, categoria, frete, prazo, observações)
 *   4. Itens cotados (tabela produto/qtd/unidade)
 *   5. Tabela comparativa (vencedor destacado verde claro)
 *   6. Detalhamento por item (multi-item)
 *   7. Fornecedor escolhido (box)
 *   Rodapé — geração + página + versão
 *
 * PDFKit (já em deps). A4 595x842, Helvetica nativa, sem fonts customizadas.
 */
import PDFDocument from 'pdfkit';
import type { QuoteResultsData } from '../services/quote-results.service';

// --- Cores ---
const COLOR_PRIMARY = '#1B5E20';   // verde primário CotaObra
const COLOR_WINNER_BG = '#E8F5E9'; // fundo do vencedor
const COLOR_ZEBRA = '#FAFAFA';     // alternância de linha
const COLOR_BORDER = '#E0E0E0';
const COLOR_TEXT = '#212121';
const COLOR_MUTED = '#757575';

// --- Layout ---
const PAGE_WIDTH = 595;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const fmtBRL = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (d: Date): string => {
  // Não usar locale BR via toLocaleString — em containers Alpine pode não
  // existir os locales. Faz manualmente em UTC-3 (America/Sao_Paulo).
  const date = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
};

const shortenId = (id: string): string => id.slice(0, 8).toUpperCase();

// --- Input principal do template ---
export interface QuotePdfInput {
  data: QuoteResultsData;
  producerCity?: string;
  producerRegion?: string;
}

/**
 * Gera o PDF em memória e retorna o Buffer.
 * Não toca em I/O nem em rede — caller faz upload depois.
 */
export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `Resultado de Cotação ${shortenId(input.data.quoteId)}`,
        Author: 'CotaObra',
        Producer: 'CotaObra PDF v1.0',
        CreationDate: new Date(),
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      renderHeader(doc);
      renderProducerSection(doc, input);
      renderQuoteSection(doc, input.data);
      renderItemsSection(doc, input.data);
      renderRankingSection(doc, input.data);
      if (input.data.itemWinners.some((iw) => iw.winner)) {
        renderItemBreakdownSection(doc, input.data);
      }
      renderWinnerBoxSection(doc, input.data);
      renderFooter(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================
// Seções
// ============================================================

function renderHeader(doc: PDFKit.PDFDocument): void {
  // Logo "FF" estilizado (sem SVG externo — desenhado com primitivas pra
  // evitar dependência de asset no runtime).
  doc.save();
  doc.roundedRect(MARGIN, MARGIN, 36, 36, 6).fill(COLOR_PRIMARY);
  doc
    .fillColor('white')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('FF', MARGIN, MARGIN + 9, { width: 36, align: 'center' });
  doc.restore();

  // Título
  doc
    .fillColor(COLOR_TEXT)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('Resultado de Cotação', MARGIN + 50, MARGIN + 4);

  doc
    .fillColor(COLOR_MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(`Gerado em ${fmtDate(new Date())}`, MARGIN + 50, MARGIN + 26);

  // Linha separadora
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(1)
    .moveTo(MARGIN, MARGIN + 50)
    .lineTo(MARGIN + CONTENT_WIDTH, MARGIN + 50)
    .stroke();

  doc.y = MARGIN + 60;
}

function renderProducerSection(doc: PDFKit.PDFDocument, input: QuotePdfInput): void {
  sectionTitle(doc, 'Dados do Produtor');

  const data = input.data;
  drawKV(doc, 'Nome', data.producerName);
  if (input.producerCity) drawKV(doc, 'Cidade', input.producerCity);
  if (input.producerRegion) drawKV(doc, 'Região', input.producerRegion);

  doc.moveDown(0.5);
}

function renderQuoteSection(doc: PDFKit.PDFDocument, data: QuoteResultsData): void {
  sectionTitle(doc, 'Dados da Cotação');

  drawKV(doc, 'ID', shortenId(data.quoteId));
  if (data.category) drawKV(doc, 'Categoria', data.category);
  if (data.freight) drawKV(doc, 'Frete', data.freight);
  if (data.region) drawKV(doc, 'Região', data.region);
  drawKV(doc, 'Prazo', fmtDate(new Date(data.deadline)));

  doc.moveDown(0.5);
}

function renderItemsSection(doc: PDFKit.PDFDocument, data: QuoteResultsData): void {
  sectionTitle(doc, 'Itens Cotados');

  const rows = data.items.map((i) => [i.product, `${i.quantity} ${i.unit}`]);
  drawTable(doc, ['Produto', 'Quantidade'], rows, [CONTENT_WIDTH * 0.6, CONTENT_WIDTH * 0.4]);

  doc.moveDown(0.7);
}

function renderRankingSection(doc: PDFKit.PDFDocument, data: QuoteResultsData): void {
  if (data.totalPriceRanking.length === 0) {
    // Caso edge: sem propostas completas — pula
    return;
  }
  sectionTitle(doc, 'Ranking por Preço Total');

  const winnerId = data.closedSupplierId;
  const rows = data.totalPriceRanking.map((r, idx) => [
    String(idx + 1),
    r.supplierName,
    fmtBRL(r.totalPrice),
    `${r.paymentTerms} · ${r.deliveryDays}d`,
  ]);

  // Tabela com destaque verde no vencedor.
  drawTable(
    doc,
    ['#', 'Fornecedor', 'Total', 'Pagamento · Entrega'],
    rows,
    [
      CONTENT_WIDTH * 0.06,
      CONTENT_WIDTH * 0.44,
      CONTENT_WIDTH * 0.2,
      CONTENT_WIDTH * 0.3,
    ],
    (rowIdx) => {
      const supplier = data.totalPriceRanking[rowIdx];
      return supplier.supplierId === winnerId ? COLOR_WINNER_BG : undefined;
    },
  );

  if (data.partialProposals.length > 0) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(
        `${data.partialProposals.length} proposta(s) parcial(is) excluída(s) do ranking.`,
        MARGIN,
        doc.y + 5,
      );
  }

  doc.moveDown(0.7);
}

function renderItemBreakdownSection(doc: PDFKit.PDFDocument, data: QuoteResultsData): void {
  sectionTitle(doc, 'Vencedor por Item');

  for (const item of data.itemWinners) {
    if (!item.winner) continue;

    // ⚠️ Quebra de página se necessário
    if (doc.y > 720) {
      doc.addPage();
    }

    doc
      .fillColor(COLOR_TEXT)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`${item.product} — ${item.quantity} ${item.unit}`, MARGIN, doc.y);

    const offerRows = item.allOffers.map((o, idx) => [
      idx === 0 ? '★' : String(idx + 1),
      o.supplierName,
      fmtBRL(o.unitPrice),
      fmtBRL(o.totalPrice),
    ]);
    drawTable(
      doc,
      ['', 'Fornecedor', 'Unitário', 'Total'],
      offerRows,
      [
        CONTENT_WIDTH * 0.06,
        CONTENT_WIDTH * 0.44,
        CONTENT_WIDTH * 0.25,
        CONTENT_WIDTH * 0.25,
      ],
      (idx) => (idx === 0 ? COLOR_WINNER_BG : undefined),
    );

    doc.moveDown(0.5);
  }
}

function renderWinnerBoxSection(doc: PDFKit.PDFDocument, data: QuoteResultsData): void {
  const winner =
    data.totalPriceRanking.find((r) => r.supplierId === data.closedSupplierId) ?? null;
  if (!winner) return;

  if (doc.y > 700) doc.addPage();

  sectionTitle(doc, 'Fornecedor Escolhido');

  const boxY = doc.y;
  doc
    .roundedRect(MARGIN, boxY, CONTENT_WIDTH, 60, 4)
    .fillAndStroke(COLOR_WINNER_BG, COLOR_PRIMARY);

  doc
    .fillColor(COLOR_PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(winner.supplierName, MARGIN + 12, boxY + 12);

  doc
    .fillColor(COLOR_TEXT)
    .font('Helvetica')
    .fontSize(10)
    .text(
      `Total: ${fmtBRL(winner.totalPrice)}  ·  ${winner.paymentTerms}  ·  Entrega em ${winner.deliveryDays} dia(s)`,
      MARGIN + 12,
      boxY + 34,
    );

  doc.y = boxY + 70;
}

function renderFooter(doc: PDFKit.PDFDocument): void {
  // Footer aplicado em todas as páginas. PDFKit não tem suporte nativo a
  // footer fixo, então usamos os hooks de bufferPages.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = 800;
    doc
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .font('Helvetica')
      .text(
        `Gerado por CotaObra · ${fmtDate(new Date())}`,
        MARGIN,
        y,
        { width: CONTENT_WIDTH, align: 'left' },
      );
    doc.text(`Página ${i - range.start + 1}/${range.count}`, MARGIN, y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    doc.text('CotaObra PDF v1.0', MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
  }
}

// ============================================================
// Primitivas reutilizáveis
// ============================================================

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  if (doc.y > 740) doc.addPage();
  doc.moveDown(0.5);
  doc
    .fillColor(COLOR_PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title.toUpperCase(), MARGIN, doc.y);
  doc.moveDown(0.3);
}

function drawKV(doc: PDFKit.PDFDocument, key: string, value: string): void {
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(key, MARGIN, doc.y, { continued: true })
    .fillColor(COLOR_TEXT)
    .font('Helvetica-Bold')
    .text(`  ${value}`);
}

/**
 * Tabela compacta. `colWidths` deve somar CONTENT_WIDTH.
 * `rowBgFn(idx)` opcional retorna cor de fundo para destacar linha (vencedor).
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  rowBgFn?: (rowIdx: number) => string | undefined,
): void {
  const HEADER_HEIGHT = 18;
  const ROW_HEIGHT = 16;

  let y = doc.y;

  // Header
  doc.save();
  doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(COLOR_PRIMARY);
  let x = MARGIN;
  for (let i = 0; i < headers.length; i++) {
    doc
      .fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(headers[i], x + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
    x += colWidths[i];
  }
  doc.restore();
  y += HEADER_HEIGHT;

  // Rows
  for (let r = 0; r < rows.length; r++) {
    if (y > 780) {
      doc.addPage();
      y = MARGIN;
    }
    const customBg = rowBgFn?.(r);
    const bg = customBg ?? (r % 2 === 0 ? '#FFFFFF' : COLOR_ZEBRA);
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(bg);
    if (customBg) {
      // Borda esquerda destacada para vencedor
      doc.rect(MARGIN, y, 3, ROW_HEIGHT).fill(COLOR_PRIMARY);
    }
    doc.restore();

    let cx = MARGIN;
    for (let c = 0; c < rows[r].length; c++) {
      doc
        .fillColor(COLOR_TEXT)
        .font(customBg ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(rows[r][c], cx + 4, y + 4, { width: colWidths[c] - 8, ellipsis: true });
      cx += colWidths[c];
    }
    y += ROW_HEIGHT;
  }

  doc.y = y + 4;
}
