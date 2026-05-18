/**
 * Script para adicionar permissão de WHATSAPP_CONFIG para usuários ADMIN
 *
 * Uso: npx tsx scripts/seed-whatsapp-permission.ts
 */

import { PrismaClient, UserRole, Resource } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adicionando permissão WHATSAPP_CONFIG para admins...\n');

  // Buscar todos os usuários ADMIN
  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
  });

  if (admins.length === 0) {
    console.log('⚠️  Nenhum usuário ADMIN encontrado. Crie um admin primeiro.\n');
    return;
  }

  console.log(`📊 Encontrados ${admins.length} administrador(es):\n`);

  for (const admin of admins) {
    console.log(`   • ${admin.name} (${admin.email})`);

    // Verificar se já existe permissão para WHATSAPP_CONFIG
    const existingPermission = await prisma.permission.findUnique({
      where: {
        userId_resource: {
          userId: admin.id,
          resource: Resource.WHATSAPP_CONFIG,
        },
      },
    });

    if (existingPermission) {
      console.log(`     ✓ Já possui permissão WHATSAPP_CONFIG`);
      continue;
    }

    // Criar permissão completa para WHATSAPP_CONFIG
    await prisma.permission.create({
      data: {
        userId: admin.id,
        resource: Resource.WHATSAPP_CONFIG,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      },
    });

    console.log(`     ✅ Permissão WHATSAPP_CONFIG concedida`);
  }

  console.log('\n✅ Processo concluído!\n');
  console.log('💡 Dica: Execute este script sempre que criar novos admins ou');
  console.log('   quando precisar garantir que todos os admins tenham acesso ao WhatsApp Config.\n');
}

main()
  .catch((error) => {
    console.error('❌ Erro ao executar seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
