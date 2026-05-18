/**
 * Script one-shot — Ajusta a categoria dos 8 fornecedores de teste
 * (criados pelo seed-test-suppliers) para usar o value canônico do
 * cadastro web ("fertilizante"), em vez do label antigo
 * ("Fertilizantes").
 *
 * Compatível com:
 *  - Admin form (frontend/components/suppliers/SupplierFormModal): usa
 *    value "fertilizante" do SUPPLIER_CATEGORIES, então o checkbox
 *    "Fertilizante" passa a aparecer marcado.
 *  - WhatsApp filter (showSupplierListForSelection): comparação é
 *    case-insensitive contra context.category="Fertilizante", então
 *    o supplier continua aparecendo na lista.
 *
 * Idempotente — se já estiver normalizado, não toca no registro.
 *
 * Uso:
 *   docker compose cp backend/scripts/fix-test-suppliers-category.js \
 *     backend:/app/fix-test-suppliers-category.js
 *   docker compose exec backend node /app/fix-test-suppliers-category.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCER_PHONE = '+5564999696787';
const TARGET_CATEGORY = 'fertilizante';

const TEST_SUPPLIER_PHONES = [
  '11111111111',
  '22222222222',
  '33333333333',
  '44444444444',
  '55555555555',
  '66666666666',
  '77777777777',
  '88888888888',
];

async function main() {
  console.log(`🔧 Ajustando categoria dos fornecedores de teste`);
  console.log(`   Produtor: ${PRODUCER_PHONE}`);
  console.log(`   Categoria alvo: "${TARGET_CATEGORY}"\n`);

  const producer = await prisma.producer.findFirst({
    where: { phone: PRODUCER_PHONE },
    select: { id: true, name: true, tenantId: true },
  });

  if (!producer) {
    console.error(`❌ Produtor com telefone ${PRODUCER_PHONE} não encontrado.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Produtor: ${producer.name} (tenant=${producer.tenantId})\n`);

  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId: producer.tenantId,
      phone: { in: TEST_SUPPLIER_PHONES },
    },
    select: { id: true, name: true, phone: true, categories: true },
  });

  if (suppliers.length === 0) {
    console.log('⚠️  Nenhum fornecedor de teste encontrado neste tenant.');
    console.log('   Execute primeiro: node /app/seed.js');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let alreadyOk = 0;

  for (const s of suppliers) {
    // Remove qualquer variação antiga (Fertilizantes, FERTILIZANTE, etc.)
    // e mantém o value canônico exato "fertilizante".
    const cleaned = (s.categories || []).filter(
      (c) => c.toLowerCase().trim() !== 'fertilizante' && c.toLowerCase().trim() !== 'fertilizantes',
    );
    const next = [...cleaned, TARGET_CATEGORY];

    const sameLength = next.length === (s.categories || []).length;
    const sameContent = sameLength && next.every((v, i) => v === s.categories[i]);

    if (sameContent) {
      console.log(`   ⏭  ${s.name.padEnd(20)} (${s.phone}) — já com categoria correta.`);
      alreadyOk++;
      continue;
    }

    await prisma.supplier.update({
      where: { id: s.id },
      data: { categories: next },
    });

    console.log(
      `   ✏️  ${s.name.padEnd(20)} (${s.phone}) — ` +
        `[${(s.categories || []).join(', ') || '∅'}] → [${next.join(', ')}]`,
    );
    updated++;
  }

  console.log('\n📊 Resumo:');
  console.log(`   Atualizados:       ${updated}`);
  console.log(`   Já estavam OK:     ${alreadyOk}`);
  console.log(`   Total processados: ${suppliers.length}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro:', err);
  await prisma.$disconnect();
  process.exit(1);
});
