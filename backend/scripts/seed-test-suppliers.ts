/**
 * Script one-shot — Cadastrar 8 fornecedores fictícios na categoria
 * "Fertilizantes" para o produtor com telefone +5564999696787.
 *
 * Uso exclusivo para gravação de vídeo / testes manuais. Os telefones
 * são padrões repetidos (1111... 8888...) para deixar óbvio que não são
 * contatos reais.
 *
 * Idempotente — pode ser rodado múltiplas vezes:
 *  - Se o fornecedor já existe no tenant: garante o vínculo ProducerSupplier
 *    e adiciona "Fertilizantes" às categorias caso falte.
 *  - Se não existe: cria Supplier + ProducerSupplier em transação.
 *
 * Uso:
 *   docker compose exec backend npx tsx scripts/seed-test-suppliers.ts
 */

import { prisma } from '../src/config/database';

const PRODUCER_PHONE = '+5564999696787';
const CATEGORY = 'Fertilizantes';

const TEST_SUPPLIERS: Array<{ name: string; phone: string }> = [
  { name: 'Pedro Silva',     phone: '11111111111' },
  { name: 'Maria Santos',    phone: '22222222222' },
  { name: 'João Oliveira',   phone: '33333333333' },
  { name: 'Ana Pereira',     phone: '44444444444' },
  { name: 'Carlos Souza',    phone: '55555555555' },
  { name: 'Lúcia Almeida',   phone: '66666666666' },
  { name: 'Roberto Costa',   phone: '77777777777' },
  { name: 'Juliana Mendes',  phone: '88888888888' },
];

async function main() {
  console.log(`🔧 Seed de fornecedores teste — produtor ${PRODUCER_PHONE}\n`);

  const producer = await prisma.producer.findFirst({
    where: { phone: PRODUCER_PHONE },
    select: { id: true, name: true, tenantId: true, region: true },
  });

  if (!producer) {
    console.error(`❌ Produtor com telefone ${PRODUCER_PHONE} não encontrado.`);
    console.error('   Verifique se o produtor já está cadastrado no banco.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Produtor encontrado: ${producer.name} (id=${producer.id}, tenant=${producer.tenantId})\n`);

  let created = 0;
  let linked = 0;
  let alreadyOk = 0;

  for (const seed of TEST_SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({
      where: { phone: seed.phone, tenantId: producer.tenantId },
    });

    if (existing) {
      // Já existe no tenant — garantir vínculo e categoria
      const link = await prisma.producerSupplier.findFirst({
        where: { producerId: producer.id, supplierId: existing.id },
      });

      const needsCategory = !existing.categories.some(
        (c) => c.toLowerCase() === CATEGORY.toLowerCase(),
      );

      if (link && !needsCategory) {
        console.log(`   ⏭  ${seed.name.padEnd(20)} (${seed.phone}) — já vinculado e com categoria.`);
        alreadyOk++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        if (!link) {
          await tx.producerSupplier.create({
            data: {
              producerId: producer.id,
              supplierId: existing.id,
              tenantId: producer.tenantId,
            },
          });
        }
        if (needsCategory) {
          await tx.supplier.update({
            where: { id: existing.id },
            data: { categories: { push: CATEGORY } },
          });
        }
      });

      console.log(`   🔗 ${seed.name.padEnd(20)} (${seed.phone}) — vinculado ao produtor.`);
      linked++;
      continue;
    }

    // Criar novo
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          name: seed.name,
          phone: seed.phone,
          tenantId: producer.tenantId,
          isNetworkSupplier: false,
          categories: [CATEGORY],
          regions: producer.region ? [producer.region] : [],
        },
      });
      await tx.producerSupplier.create({
        data: {
          producerId: producer.id,
          supplierId: supplier.id,
          tenantId: producer.tenantId,
        },
      });
    });

    console.log(`   ✨ ${seed.name.padEnd(20)} (${seed.phone}) — criado.`);
    created++;
  }

  console.log('\n📊 Resumo:');
  console.log(`   Criados:           ${created}`);
  console.log(`   Vinculados:        ${linked}`);
  console.log(`   Já estavam OK:     ${alreadyOk}`);
  console.log(`   Total processados: ${TEST_SUPPLIERS.length}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro durante o seed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
