/**
 * Script one-shot — Reset de produtores presos em AWAITING_SUPPLIER_SCOPE.
 *
 * Contexto: após a feature flag ENABLE_NETWORK_SUPPLIERS ser ligada off,
 * produtores que já estavam parados nesse estado (criado antes da flag)
 * continuam recebendo a pergunta com 3 opções, podendo escolher Rede e
 * disparar cotação para zero fornecedores.
 *
 * Esta rotina é idempotente — pode ser executada múltiplas vezes sem
 * efeito colateral. Resetar = step 'IDLE' + context {}; o produtor
 * recomeça do menu inicial na próxima mensagem.
 *
 * Uso:
 *   npx tsx scripts/reset-supplier-scope-states.ts
 *
 * Recomendado executar em staging primeiro para validar o count.
 */

import { prisma } from '../src/config/database';

async function main() {
  console.log('🔧 Resetando produtores presos em AWAITING_SUPPLIER_SCOPE...\n');

  // Listar antes para auditoria (não-bloqueante)
  const stuck = await prisma.conversationState.findMany({
    where: { step: 'AWAITING_SUPPLIER_SCOPE' },
    select: { producerId: true, tenantId: true, updatedAt: true },
  });

  console.log(`📊 Encontrado(s) ${stuck.length} produtor(es) preso(s):`);
  stuck.forEach((s) => {
    console.log(`   - producerId=${s.producerId} tenantId=${s.tenantId} updatedAt=${s.updatedAt.toISOString()}`);
  });

  if (stuck.length === 0) {
    console.log('\n✅ Nenhum estado para resetar. Banco já está limpo.\n');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.conversationState.updateMany({
    where: { step: 'AWAITING_SUPPLIER_SCOPE' },
    data: { step: 'IDLE', context: {} },
  });

  console.log(`\n✅ ${result.count} estado(s) reset(s) com sucesso.\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Erro durante o reset:', err);
  await prisma.$disconnect();
  process.exit(1);
});
