/**
 * FEAT-008 (FF-BE-032) — CLI para criar o primeiro SUPER_ADMIN da plataforma.
 *
 * Necessário porque a feature exige que pelo menos um SUPER_ADMIN exista
 * para qualquer ação cross-tenant — e o único modo de criar SUPER_ADMIN é
 * via outro SUPER_ADMIN (RN-10). Esse script quebra o "ovo-galinha".
 *
 * Uso:
 *   npm run create-superadmin -- --email=admin@cotaobra.com.br --name="Admin"
 *   npm run create-superadmin -- --email=... --name="..." --password=Senha123!
 *   npm run create-superadmin -- --email=... --force   # reseta senha do existente
 *
 * Recomendação operacional (RN-10 + Risco 4 da spec):
 *   - Rodar UMA VEZ após primeira migration.
 *   - Criar PELO MENOS 2 super admins (você + sócio/co-fundador) para
 *     destravar emergências (perda de credencial).
 *   - A senha temp aparece UMA VEZ no stdout. Copie e guarde em cofre.
 *
 * Saída em caso de senha gerada (modo default):
 *   ✅ Super admin criado: <id>
 *   🔑 Senha temporária: <16 chars>
 *
 * Em ambos os modos (gerada ou custom): mustChangePassword=true — o super
 * admin é forçado a trocar a senha no primeiro login.
 */

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateTempPassword } from '../utils/password-generator';
import { validatePasswordStrength } from '../utils/password-strength';

const prisma = new PrismaClient();

interface Args {
  email?: string;
  name?: string;
  password?: string;
  force?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--force') args.force = true;
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg.startsWith('--name=')) args.name = arg.slice('--name='.length);
    else if (arg.startsWith('--password=')) args.password = arg.slice('--password='.length);
  }
  return args;
}

function printHelp(): void {
  console.log(`
CotaObra — Criar Super Admin

Uso:
  npm run create-superadmin -- --email=<email> --name="<nome>" [--password=<senha>] [--force]

Opções:
  --email     E-mail do super admin (obrigatório).
  --name      Nome completo do super admin (obrigatório se for novo).
  --password  Senha custom (opcional — default: gera senha aleatória de 16 chars).
              Validada com o mesmo critério do change-password (>=10 chars + mix).
  --force     Se já existe SUPER_ADMIN com esse e-mail, reseta a senha em vez de falhar.
  --help, -h  Mostra esta ajuda.

Exemplos:
  npm run create-superadmin -- --email=admin@cotaobra.com.br --name="Admin"
  npm run create-superadmin -- --email=admin@cotaobra.com.br --password='S3nha!ForteEspecial' --force
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.email) {
    console.error('❌ --email é obrigatório. Use --help para ver as opções.');
    process.exitCode = 1;
    return;
  }

  const email = args.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });

  // Decide senha: custom (validada) ou gerada.
  let plainPassword: string;
  let passwordMode: 'generated' | 'custom';
  if (args.password) {
    const check = validatePasswordStrength(args.password);
    if (!check.valid) {
      console.error(`❌ Senha não atende força mínima: ${check.reason}`);
      process.exitCode = 1;
      return;
    }
    plainPassword = args.password;
    passwordMode = 'custom';
  } else {
    plainPassword = generateTempPassword();
    passwordMode = 'generated';
  }
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  if (existing) {
    if (!args.force) {
      console.error(
        `❌ Já existe um usuário com e-mail ${email} (role=${existing.role}). ` +
          `Use --force para resetar a senha.`,
      );
      process.exitCode = 1;
      return;
    }

    // Modo --force: reseta senha + promove a SUPER_ADMIN se ainda não for.
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: UserRole.SUPER_ADMIN,
        password: passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        // passwordCreatedById fica null no CLI — não há super admin "ator" aqui.
        active: true,
      },
      select: { id: true, email: true, role: true },
    });

    console.log('');
    console.log(`✅ Super admin atualizado: ${updated.email} (id=${updated.id})`);
    console.log(`🔑 Nova senha temporária (${passwordMode}): ${plainPassword}`);
    console.log('⚠️  Esta senha não será mostrada novamente. Copie agora.');
    console.log('🛡️  No primeiro login, será obrigatório trocar a senha.');
    return;
  }

  // Criação nova.
  if (!args.name) {
    console.error('❌ --name é obrigatório para criar novo super admin.');
    process.exitCode = 1;
    return;
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: args.name.trim(),
      password: passwordHash,
      role: UserRole.SUPER_ADMIN,
      tenantId: null, // super admin "puro" (RN-11)
      active: true,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log('');
  console.log(`✅ Super admin criado: ${created.email} (id=${created.id})`);
  console.log(`🔑 Senha temporária (${passwordMode}): ${plainPassword}`);
  console.log('⚠️  Esta senha não será mostrada novamente. Copie agora.');
  console.log('🛡️  No primeiro login, será obrigatório trocar a senha.');
}

main()
  .catch((err) => {
    console.error('❌ Falha ao criar super admin:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
