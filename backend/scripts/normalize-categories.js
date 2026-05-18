/**
 * Script one-shot — Normaliza categorias existentes para "Capitalizada".
 *
 * Atualiza:
 *   - Quote.category                    (string)
 *   - Supplier.categories[]             (string[])
 *   - Producer.lastQuotePreferences.category (JSON)
 *
 * Regra: trim + primeira letra maiúscula + restante em minúsculas.
 * Idempotente — registros já normalizados são pulados.
 *
 * Uso na VPS (versão JS standalone para o container de produção):
 *   docker compose cp backend/scripts/normalize-categories.js backend:/app/normalize-categories.js
 *   docker compose exec backend node /app/normalize-categories.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalize(s) {
  const trimmed = (s ?? '').trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

async function migrateQuotes() {
  console.log('\n📦 Quote.category');

  const quotes = await prisma.quote.findMany({
    where: { category: { not: null } },
    select: { id: true, category: true },
  });

  let touched = 0;
  let skipped = 0;

  for (const q of quotes) {
    const next = normalize(q.category);
    if (next === q.category) {
      skipped++;
      continue;
    }
    await prisma.quote.update({ where: { id: q.id }, data: { category: next } });
    touched++;
  }

  console.log(`   ✅ Atualizados: ${touched}`);
  console.log(`   ⏭  Já normalizados: ${skipped}`);
  console.log(`   📊 Total: ${quotes.length}`);
}

async function migrateSuppliers() {
  console.log('\n🏪 Supplier.categories[]');

  const suppliers = await prisma.supplier.findMany({
    select: { id: true, categories: true, name: true },
  });

  let touched = 0;
  let skipped = 0;

  for (const s of suppliers) {
    const before = s.categories || [];
    if (before.length === 0) {
      skipped++;
      continue;
    }

    // Normalizar e deduplicar (case-insensitive)
    const seen = new Set();
    const next = [];
    for (const c of before) {
      const norm = normalize(c);
      const key = norm.toLowerCase();
      if (!seen.has(key) && norm) {
        seen.add(key);
        next.push(norm);
      }
    }

    const changed =
      next.length !== before.length ||
      next.some((v, i) => v !== before[i]);

    if (!changed) {
      skipped++;
      continue;
    }

    await prisma.supplier.update({
      where: { id: s.id },
      data: { categories: next },
    });
    touched++;
  }

  console.log(`   ✅ Atualizados: ${touched}`);
  console.log(`   ⏭  Já normalizados: ${skipped}`);
  console.log(`   📊 Total: ${suppliers.length}`);
}

async function migrateProducerLastQuote() {
  console.log('\n👤 Producer.lastQuotePreferences.category');

  const producers = await prisma.producer.findMany({
    where: { lastQuotePreferences: { not: null } },
    select: { id: true, lastQuotePreferences: true },
  });

  let touched = 0;
  let skipped = 0;

  for (const p of producers) {
    const prefs = p.lastQuotePreferences;
    if (!prefs || typeof prefs !== 'object' || !('category' in prefs) || !prefs.category) {
      skipped++;
      continue;
    }

    const next = normalize(prefs.category);
    if (next === prefs.category) {
      skipped++;
      continue;
    }

    await prisma.producer.update({
      where: { id: p.id },
      data: { lastQuotePreferences: { ...prefs, category: next } },
    });
    touched++;
  }

  console.log(`   ✅ Atualizados: ${touched}`);
  console.log(`   ⏭  Já normalizados ou sem categoria: ${skipped}`);
  console.log(`   📊 Total: ${producers.length}`);
}

async function main() {
  console.log('🔧 Normalização de categorias (capitalize first letter)');
  console.log('   Regra: trim + primeira letra maiúscula + restante em minúsculas\n');

  await migrateQuotes();
  await migrateSuppliers();
  await migrateProducerLastQuote();

  console.log('\n✅ Migração concluída.\n');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro durante a migração:', err);
  await prisma.$disconnect();
  process.exit(1);
});
