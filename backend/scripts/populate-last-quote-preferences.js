/**
 * FF-BE-015 — Populador retroativo de lastQuotePreferences.
 *
 * Para produtores que NÃO têm lastQuotePreferences gravado, busca a
 * cotação CLOSED mais recente e usa ela como base para alimentar
 * smart defaults futuros (frete, pagamento, região).
 *
 * Idempotente — pula produtores que já têm preferences.
 *
 * Uso:
 *   docker compose cp backend/scripts/populate-last-quote-preferences.js \
 *     backend:/app/populate-last-quote-preferences.js
 *   docker compose exec backend node /app/populate-last-quote-preferences.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Populando lastQuotePreferences retroativo\n');

  const producers = await prisma.producer.findMany({
    where: { lastQuotePreferences: { equals: null } },
    select: { id: true, name: true, phone: true },
  });

  console.log(`📊 ${producers.length} produtor(es) sem preferences\n`);

  let populated = 0;
  let skipped = 0;

  for (const p of producers) {
    const lastQuote = await prisma.quote.findFirst({
      where: { producerId: p.id, status: 'CLOSED' },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { select: { product: true, quantity: true, unit: true } },
      },
    });

    if (!lastQuote) {
      console.log(`   ⏭  ${p.name.padEnd(20)} (${p.phone}) — sem CLOSED histórico`);
      skipped++;
      continue;
    }

    const prefs = {
      category: lastQuote.category ?? null,
      items: lastQuote.items.map((it) => ({
        product: it.product,
        quantity: Number(it.quantity),
        unit: it.unit,
      })),
      region: lastQuote.region,
      deadline: lastQuote.deadline ? lastQuote.deadline.toISOString().slice(0, 10) : null,
      freight: lastQuote.freight ?? null,
      paymentTerms: lastQuote.paymentTerms ?? null,
    };

    await prisma.producer.update({
      where: { id: p.id },
      data: { lastQuotePreferences: prefs },
    });

    console.log(
      `   ✨ ${p.name.padEnd(20)} (${p.phone}) — quoteId=${lastQuote.id.slice(0, 8)} categoria="${lastQuote.category ?? '∅'}" frete=${lastQuote.freight ?? '∅'}`,
    );
    populated++;
  }

  console.log(`\n📊 Resumo: ${populated} populados, ${skipped} sem histórico.\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro:', err);
  await prisma.$disconnect();
  process.exit(1);
});
