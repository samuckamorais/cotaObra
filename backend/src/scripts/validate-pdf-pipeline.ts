/**
 * Script de validação E2E do pipeline PDF → MinIO → WhatsApp (FEAT-PDF-001).
 *
 * Cria uma cotação fake para o producer informado, gera propostas
 * fictícias dos suppliers já vinculados a ele, fecha a cotação no
 * vencedor de menor preço e enfileira o job de PDF. Depois faz polling
 * nos FSMEvents para confirmar que o PDF foi gerado, enviado pelo
 * Twilio e o producer recebeu no WhatsApp.
 *
 * Uso (dentro do container backend):
 *   node dist/scripts/validate-pdf-pipeline.js --cpf 02340766150
 *
 * Ou via docker compose exec:
 *   docker compose exec backend node dist/scripts/validate-pdf-pipeline.js --cpf 02340766150
 *
 * Flags:
 *   --cpf <cpf>      CPF do producer (com ou sem máscara)
 *   --dry-run        Só mostra o plano, não cria nada
 *   --no-cleanup     Mantém a cotação no banco após o teste (default: remove)
 *   --timeout <s>    Timeout do polling do PDF (default: 60s)
 */
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { QuoteResultsService } from '../services/quote-results.service';
import { env } from '../config/env';

interface ProductSpec {
  product: string;
  quantity: number;
  unit: string;
  /** Preço unitário base (Proposal A — vencedora). Default: 100. */
  basePrice?: number;
}

interface CliArgs {
  cpf: string;
  category: string;
  products: ProductSpec[];
  dryRun: boolean;
  cleanup: boolean;
  timeoutSec: number;
}

const DEFAULT_PRODUCTS: ProductSpec[] = [
  { product: 'Glifosato Atanor 48', quantity: 10, unit: 'litros', basePrice: 80 },
  { product: 'Roundup Original Di', quantity: 5, unit: 'galões', basePrice: 140 },
];

/**
 * Parsea a flag --products no formato:
 *   "Nome do Produto:quantidade:unidade[:basePrice],Outro Produto:...,...".
 * Exemplos:
 *   --products "Ureia 46%:50:sacas:180,KCl 60%:30:sacas:220"
 */
function parseProductsFlag(raw: string): ProductSpec[] {
  return raw.split(',').map((item, idx) => {
    const parts = item.split(':').map((p) => p.trim());
    if (parts.length < 3) {
      console.error(
        `❌ Item ${idx + 1} de --products malformado: "${item}". Esperado "nome:quantidade:unidade[:basePrice]".`,
      );
      process.exit(1);
    }
    const [product, qtyStr, unit, priceStr] = parts;
    const quantity = parseFloat(qtyStr);
    if (Number.isNaN(quantity) || quantity <= 0) {
      console.error(`❌ Quantidade inválida em "${item}": ${qtyStr}`);
      process.exit(1);
    }
    const basePrice = priceStr ? parseFloat(priceStr) : 100;
    return { product, quantity, unit, basePrice };
  });
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let cpf = '';
  let category = 'defensivo';
  let products: ProductSpec[] | null = null;
  let dryRun = false;
  let cleanup = true;
  let timeoutSec = 60;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cpf') cpf = argv[++i];
    else if (a === '--category') category = argv[++i];
    else if (a === '--products') products = parseProductsFlag(argv[++i]);
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--no-cleanup') cleanup = false;
    else if (a === '--timeout') timeoutSec = parseInt(argv[++i], 10);
    else if (a === '-h' || a === '--help') {
      console.log(
        'Uso: node dist/scripts/validate-pdf-pipeline.js --cpf <cpf>\n' +
          '       [--category defensivo|fertilizante|...]\n' +
          '       [--products "Nome:qtd:unidade[:basePrice],..."]\n' +
          '       [--dry-run] [--no-cleanup] [--timeout 60]',
      );
      process.exit(0);
    }
  }

  if (!cpf) {
    console.error('❌ --cpf é obrigatório');
    process.exit(1);
  }

  return {
    cpf,
    category,
    products: products ?? DEFAULT_PRODUCTS,
    dryRun,
    cleanup,
    timeoutSec,
  };
}

function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

async function main() {
  const args = parseArgs();
  const cpfNorm = normalizeCpf(args.cpf);

  console.log('\n===========================================');
  console.log(' Validação E2E: PDF → MinIO → WhatsApp');
  console.log('===========================================');
  console.log(`CPF (normalizado):     ${cpfNorm}`);
  console.log(`Categoria:             ${args.category}`);
  console.log(`Produtos:              ${args.products.length}`);
  args.products.forEach((p, i) =>
    console.log(
      `   ${i + 1}. ${p.product} — ${p.quantity} ${p.unit} (preço base R$ ${p.basePrice})`,
    ),
  );
  console.log(`Dry-run:               ${args.dryRun}`);
  console.log(`Cleanup pós-teste:     ${args.cleanup}`);
  console.log(`Timeout do PDF:        ${args.timeoutSec}s`);
  console.log(`MinIO public URL:      ${env.MINIO_PUBLIC_URL}`);
  console.log(`PDF generation:        ${env.PDF_GENERATION_ENABLED}`);
  console.log(`Twilio number:         ${env.TWILIO_WHATSAPP_NUMBER}`);
  console.log('');

  // -------------------------------------------------------------------
  // 1. Acha o producer
  // -------------------------------------------------------------------
  const producer = await prisma.producer.findFirst({
    where: { cpfCnpj: cpfNorm },
    include: {
      suppliers: { include: { supplier: true } },
    },
  });

  if (!producer) {
    console.error(`❌ Producer com CPF ${cpfNorm} não encontrado.`);
    process.exit(1);
  }

  console.log(`✅ Producer encontrado:`);
  console.log(`   id:      ${producer.id}`);
  console.log(`   nome:    ${producer.name}`);
  console.log(`   phone:   ${producer.phone}`);
  console.log(`   tenant:  ${producer.tenantId}`);
  console.log(`   suppliers vinculados: ${producer.suppliers.length}`);
  console.log('');

  if (producer.suppliers.length < 2) {
    console.error(
      `❌ Producer precisa ter pelo menos 2 suppliers vinculados (tem ${producer.suppliers.length}).`,
    );
    process.exit(1);
  }

  // Pega os 2 primeiros suppliers para gerar propostas distintas
  const [supA, supB] = producer.suppliers.slice(0, 2).map((ps) => ps.supplier);

  console.log(`✅ Suppliers do teste:`);
  console.log(`   A: ${supA.id}  ${supA.name}  ${supA.phone}`);
  console.log(`   B: ${supB.id}  ${supB.name}  ${supB.phone}`);
  console.log('');

  if (args.dryRun) {
    console.log('🟡 --dry-run: encerrando antes de criar a cotação.');
    process.exit(0);
  }

  // -------------------------------------------------------------------
  // 2. Cria a Quote em COLLECTING (não passa por PENDING porque já vamos
  //    "popular" as propostas direto)
  // -------------------------------------------------------------------
  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const quote = await prisma.quote.create({
    data: {
      tenantId: producer.tenantId,
      producerId: producer.id,
      category: args.category,
      region: producer.city || 'Rio Verde-GO',
      deadline,
      expiresAt,
      supplierScope: 'MINE',
      status: 'COLLECTING',
      paymentTerms: '30 dias',
      freight: 'CIF',
      observations: `[Validação E2E FEAT-PDF-001] cotação de teste — ${args.category}`,
      items: {
        create: args.products.map((p) => ({
          product: p.product,
          quantity: p.quantity,
          unit: p.unit,
        })),
      },
    },
    include: { items: true },
  });

  console.log(`✅ Quote criada: ${quote.id}`);
  console.log(`   categoria: ${args.category}`);
  console.log(`   items: ${quote.items.map((i) => i.product).join(', ')}`);
  console.log('');

  // -------------------------------------------------------------------
  // 3. Cria QuoteSupplierNotifications (com respondedAt — já respondeu)
  // -------------------------------------------------------------------
  await prisma.quoteSupplierNotification.createMany({
    data: [supA, supB].map((s) => ({
      quoteId: quote.id,
      supplierId: s.id,
      respondedAt: now,
      responseType: 'PROPOSAL',
    })),
  });

  // -------------------------------------------------------------------
  // 4. Cria as Proposals (supplier A é mais barato → será o vencedor)
  //
  // Supplier A usa basePrice direto. Supplier B aplica markup de 12%
  // para garantir um vencedor claro em qualquer combinação de produtos.
  // -------------------------------------------------------------------
  const MARKUP_B = 1.12;

  const itemsA = quote.items.map((qi, idx) => {
    const basePrice = args.products[idx]?.basePrice ?? 100;
    return {
      quoteItemId: qi.id,
      unitPrice: basePrice,
      totalPrice: basePrice * qi.quantity,
    };
  });
  const totalA = itemsA.reduce((sum, i) => sum + i.totalPrice, 0);

  const itemsB = quote.items.map((qi, idx) => {
    const basePrice = (args.products[idx]?.basePrice ?? 100) * MARKUP_B;
    const unitPrice = Math.round(basePrice * 100) / 100;
    return {
      quoteItemId: qi.id,
      unitPrice,
      totalPrice: Math.round(unitPrice * qi.quantity * 100) / 100,
    };
  });
  const totalB = itemsB.reduce((sum, i) => sum + i.totalPrice, 0);

  const propA = await prisma.proposal.create({
    data: {
      tenantId: producer.tenantId,
      quoteId: quote.id,
      supplierId: supA.id,
      price: totalA,
      totalPrice: totalA,
      paymentTerms: '30 dias',
      deliveryDays: 5,
      isPartial: false,
      items: { create: itemsA },
    },
  });

  const propB = await prisma.proposal.create({
    data: {
      tenantId: producer.tenantId,
      quoteId: quote.id,
      supplierId: supB.id,
      price: totalB,
      totalPrice: totalB,
      paymentTerms: '15 dias',
      deliveryDays: 3,
      isPartial: false,
      items: { create: itemsB },
    },
  });

  console.log(`✅ Propostas criadas:`);
  console.log(`   ${supA.name}: R$ ${propA.totalPrice.toFixed(2)}  (vencedor esperado)`);
  console.log(`   ${supB.name}: R$ ${propB.totalPrice.toFixed(2)}`);
  console.log('');

  // -------------------------------------------------------------------
  // 5. Fecha a cotação com o vencedor (Supplier A) — isto enfileira o
  //    job de PDF automaticamente. O processor do job está no backend
  //    principal e vai consumir essa fila.
  // -------------------------------------------------------------------
  console.log(`🚀 Fechando cotação com vencedor ${supA.name}...`);
  await QuoteResultsService.closeWithTotalWinner(producer.tenantId, quote.id, supA.id);
  console.log(`✅ Cotação fechada (status=CLOSED), job de PDF enfileirado.\n`);

  // -------------------------------------------------------------------
  // 6. Polling nos FSMEvents pra acompanhar o pipeline
  // -------------------------------------------------------------------
  console.log(`⏳ Aguardando pipeline (timeout ${args.timeoutSec}s)...`);
  const targets = [
    'pdf_generation_started',
    'pdf_generation_completed',
    'pdf_delivery_completed',
  ];
  const failureEvents = [
    'pdf_generation_failed',
    'pdf_delivery_failed',
    'pdf_fallback_text_sent',
  ];

  const seen = new Set<string>();
  const startedAt = Date.now();
  let finalEvent: 'success' | 'fallback' | 'timeout' = 'timeout';

  while (Date.now() - startedAt < args.timeoutSec * 1000) {
    const events = await prisma.fSMEvent.findMany({
      where: {
        producerId: producer.id,
        eventType: { in: [...targets, ...failureEvents] },
        timestamp: { gte: startedAt ? new Date(startedAt - 5000) : undefined },
        payload: { path: ['quoteId'], equals: quote.id },
      },
      orderBy: { timestamp: 'asc' },
    });

    for (const ev of events) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        console.log(
          `   [${new Date(ev.timestamp).toISOString()}] ${ev.eventType}  ${JSON.stringify(ev.payload)}`,
        );
      }
    }

    if (events.some((e) => e.eventType === 'pdf_delivery_completed')) {
      finalEvent = 'success';
      break;
    }
    if (events.some((e) => e.eventType === 'pdf_fallback_text_sent')) {
      finalEvent = 'fallback';
      break;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('');
  if (finalEvent === 'success') {
    console.log('✅ SUCESSO: pdf_delivery_completed — producer recebeu o PDF no WhatsApp.');
  } else if (finalEvent === 'fallback') {
    console.log(
      '⚠️  FALLBACK: Twilio retornou erro 4xx e o sistema enviou texto com link.',
    );
    console.log(
      '   Verifique TWILIO_WHATSAPP_NUMBER, status do Twilio, e se o número do producer fez opt-in no sandbox.',
    );
  } else {
    console.log(
      `❌ TIMEOUT após ${args.timeoutSec}s. O job pode ainda estar processando ou falhou silenciosamente.`,
    );
    console.log(
      `   Cheque os logs do backend:  docker compose logs backend --tail=100 | grep ${quote.id}`,
    );
  }

  // -------------------------------------------------------------------
  // 7. Cleanup opcional (default: remove a cotação de teste)
  // -------------------------------------------------------------------
  if (args.cleanup) {
    console.log('\n🧹 Limpando cotação de teste...');
    await prisma.proposalItem.deleteMany({ where: { proposal: { quoteId: quote.id } } });
    await prisma.proposal.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quoteSupplierNotification.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    console.log('✅ Cotação de teste removida.');
  } else {
    console.log(`\n📌 Cotação mantida no banco: ${quote.id}`);
  }

  console.log('\n===========================================');
  console.log(' Validação concluída');
  console.log('===========================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Validation script failed', { error: err });
    console.error('\n❌ Erro:', err);
    process.exit(1);
  });
