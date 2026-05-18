/**
 * FF-BE-011 — Seed inicial do mapeamento Produto → Categoria.
 *
 * Baseado no FEAT-007 § 4 (US-04). Categorias usam o label canônico
 * de SUPPLIER_CATEGORIES (singular). Keywords ficam em lowercase
 * sem acentos — o service normaliza ambos para casar.
 *
 * Idempotente — usa upsert por keyword.
 *
 * Uso:
 *   docker compose cp backend/scripts/seed-product-category-mappings.js \
 *     backend:/app/seed-product-category-mappings.js
 *   docker compose exec backend node /app/seed-product-category-mappings.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function strip(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const MAPPINGS_BY_CATEGORY = {
  Fertilizante: [
    'npk', 'ureia', 'kcl', 'map', 'dap', 'ssp', 'tsp',
    'calcario', 'gesso', 'adubo', 'fertilizante',
  ],
  Defensivo: [
    'herbicida', 'fungicida', 'inseticida', 'acaricida',
    'glifosato', 'roundup', '2,4-d', 'atrazina',
  ],
  Semente: [
    'soja', 'milho', 'algodao', 'sorgo', 'girassol',
    'sementes', 'semente', 'bmx', 'tmg', 'intacta',
  ],
  Foliar: [
    'foliar', 'micronutriente', 'boro', 'zinco', 'manganes',
  ],
  // "Ração" não está no SUPPLIER_CATEGORIES canônico atual; vou usar
  // assim mesmo com label simples. Pode ser editado via admin depois.
  Ração: [
    'racao', 'farelo', 'torta de soja', 'premix', 'nucleo',
  ],
  Combustível: [
    'diesel', 'gasolina', 'etanol', 's10', 's500',
  ],
};

async function main() {
  console.log('🔧 Seed de mapeamentos Produto → Categoria\n');

  let created = 0;
  let updated = 0;

  for (const [category, keywords] of Object.entries(MAPPINGS_BY_CATEGORY)) {
    for (const raw of keywords) {
      const keyword = strip(raw);
      if (!keyword || keyword.length < 2) {
        console.warn(`   ⚠️  Skipping invalid keyword "${raw}"`);
        continue;
      }
      const result = await prisma.productCategoryMapping.upsert({
        where: { keyword },
        create: { keyword, category },
        update: { category },
      });
      // Decide create vs update by checking createdAt vs updatedAt freshness
      const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
      if (isNew) {
        console.log(`   ✨ ${keyword.padEnd(20)} → ${category}`);
        created++;
      } else {
        console.log(`   ⏭  ${keyword.padEnd(20)} → ${category} (já existia)`);
        updated++;
      }
    }
  }

  console.log(`\n📊 Resumo: ${created} criados, ${updated} já existentes.\n`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro:', err);
  await prisma.$disconnect();
  process.exit(1);
});
