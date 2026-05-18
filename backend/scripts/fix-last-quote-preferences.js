/**
 * Script one-shot — Corrige a unidade salva em lastQuotePreferences
 * do produtor de teste. Antes do fix de unit-normalizer (FF-BE-008-quant),
 * "10 bag" era persistido como "10 unidades". O REPEAT_LAST_QUOTE então
 * exibe a unidade errada para esse produtor.
 *
 * Idempotente — se já estiver "Big Bags", não toca.
 *
 * Uso:
 *   docker compose cp backend/scripts/fix-last-quote-preferences.js \
 *     backend:/app/fix-last-quote-preferences.js
 *   docker compose exec backend node /app/fix-last-quote-preferences.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCER_PHONE = '+5564999696787';
const FROM_UNIT = 'unidades';
const TO_UNIT = 'Big Bags';

async function main() {
  console.log(`🔧 Corrigindo lastQuotePreferences do produtor ${PRODUCER_PHONE}`);
  console.log(`   "${FROM_UNIT}" → "${TO_UNIT}"\n`);

  const producer = await prisma.producer.findFirst({
    where: { phone: PRODUCER_PHONE },
    select: { id: true, name: true, lastQuotePreferences: true },
  });

  if (!producer) {
    console.error(`❌ Produtor ${PRODUCER_PHONE} não encontrado.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const prefs = producer.lastQuotePreferences;
  if (!prefs || typeof prefs !== 'object') {
    console.log('⚠️  Produtor não tem lastQuotePreferences. Nada para fazer.');
    await prisma.$disconnect();
    return;
  }

  console.log('Estado atual:', JSON.stringify(prefs, null, 2), '\n');

  let touched = false;
  const next = { ...prefs };

  // items[0] (estrutura atual)
  if (Array.isArray(next.items)) {
    next.items = next.items.map((it, idx) => {
      if (idx === 0 && it && it.unit && it.unit.toLowerCase() === FROM_UNIT.toLowerCase()) {
        touched = true;
        return { ...it, unit: TO_UNIT };
      }
      return it;
    });
  }

  // Campos legados (fallback)
  if (next.unit && next.unit.toLowerCase() === FROM_UNIT.toLowerCase()) {
    next.unit = TO_UNIT;
    touched = true;
  }

  if (!touched) {
    console.log('⏭  Nenhuma unidade "unidades" encontrada — já está correto.');
    await prisma.$disconnect();
    return;
  }

  await prisma.producer.update({
    where: { id: producer.id },
    data: { lastQuotePreferences: next },
  });

  console.log('✅ Atualizado:');
  console.log(JSON.stringify(next, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro:', err);
  await prisma.$disconnect();
  process.exit(1);
});
