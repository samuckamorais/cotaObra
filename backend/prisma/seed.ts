/**
 * CotaObra — Seed inicial do banco de dados (dev local + CI E2E)
 * Destino: backend/prisma/seed.ts
 *
 * Conteúdo:
 *   - 1 tenant demo "Construtora Aurora Ltda"
 *   - TenantSettings com defaults sensatos
 *   - 3 usuários: admin / comprador / engenheiro (senha: "senha-dev-123")
 *   - 1 obra "Residencial Aurora — Torre A" vinculada ao engenheiro
 *   - 5 fornecedores cobrindo categorias variadas
 *   - 30 materiais no catálogo CotaObra (tenantId=null = compartilhado)
 *   - 2 materiais customizados do tenant demo (tenantId=tenant.id)
 *
 * Uso:
 *   pnpm prisma migrate dev   # aplica schema
 *   pnpm seed                 # popula
 *
 * Idempotente: usa upsert. Pode rodar quantas vezes quiser.
 *
 * Versão: 1.0 — 18/05/2026
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------

const DEMO_TENANT_SLUG = "aurora-demo";
const DEFAULT_PASSWORD = "senha-dev-123"; // 🚨 trocar em prod

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

function log(step: string) {
  console.log(`  → ${step}`);
}

// ---------------------------------------------------------------
// 1. Materiais (catálogo CotaObra compartilhado: tenantId = null)
// ---------------------------------------------------------------

const CATALOG_MATERIALS = [
  // ---- Cimento (3) ----
  { sku: "CIM-CPII-Z32-50", name: "Cimento Portland CP-II-Z 32 (saco 50kg)", category: "cimento", defaultUnit: "saca", spec: "NBR 11578" },
  { sku: "CIM-CPV-ARI-50", name: "Cimento Portland CP-V ARI (saco 50kg)", category: "cimento", defaultUnit: "saca", spec: "NBR 5733 — alta resistência inicial" },
  { sku: "CIM-CPIII-40-50", name: "Cimento Portland CP-III 40 (saco 50kg)", category: "cimento", defaultUnit: "saca", spec: "NBR 5735 — alto-forno" },

  // ---- Agregados (4) ----
  { sku: "AGR-AREIA-MED", name: "Areia média lavada", category: "agregados", defaultUnit: "m3", spec: "Granulometria média, lavada" },
  { sku: "AGR-AREIA-FIN", name: "Areia fina", category: "agregados", defaultUnit: "m3", spec: "Granulometria fina" },
  { sku: "AGR-BRITA-0", name: "Brita 0 (pedrisco)", category: "agregados", defaultUnit: "m3", spec: "Diâmetro 4,8–9,5mm" },
  { sku: "AGR-BRITA-1", name: "Brita 1", category: "agregados", defaultUnit: "m3", spec: "Diâmetro 9,5–19mm" },

  // ---- Aço (4) ----
  { sku: "ACO-VG-CA50-6.3", name: "Vergalhão CA-50 6,3mm — barra 12m", category: "aco", defaultUnit: "peca", spec: "NBR 7480" },
  { sku: "ACO-VG-CA50-8", name: "Vergalhão CA-50 8mm — barra 12m", category: "aco", defaultUnit: "peca", spec: "NBR 7480" },
  { sku: "ACO-VG-CA50-10", name: "Vergalhão CA-50 10mm — barra 12m", category: "aco", defaultUnit: "peca", spec: "NBR 7480" },
  { sku: "ACO-VG-CA50-12.5", name: "Vergalhão CA-50 12,5mm — barra 12m", category: "aco", defaultUnit: "peca", spec: "NBR 7480" },

  // ---- Blocos (4) ----
  { sku: "BLC-CER-9x19x19", name: "Bloco cerâmico 9x19x19cm", category: "blocos", defaultUnit: "peca", spec: "NBR 15270" },
  { sku: "BLC-CONC-14x19x39", name: "Bloco concreto estrutural 14x19x39cm", category: "blocos", defaultUnit: "peca", spec: "NBR 6136" },
  { sku: "BLC-TIJ-MAC", name: "Tijolo maciço 5x10x20cm", category: "blocos", defaultUnit: "milheiro", spec: "Cerâmica vermelha" },
  { sku: "BLC-LAJOTA-12", name: "Lajota cerâmica H=12cm", category: "blocos", defaultUnit: "peca", spec: "Para laje pré-moldada" },

  // ---- Hidráulica (5) ----
  { sku: "HID-PVC-25", name: "Tubo PVC marrom 25mm — barra 6m", category: "hidraulica", defaultUnit: "peca", spec: "Soldável, água fria" },
  { sku: "HID-PVC-50", name: "Tubo PVC marrom 50mm — barra 6m", category: "hidraulica", defaultUnit: "peca", spec: "Soldável" },
  { sku: "HID-PVC-100", name: "Tubo PVC esgoto 100mm — barra 6m", category: "hidraulica", defaultUnit: "peca", spec: "NBR 5688 — série normal" },
  { sku: "HID-JOELHO-25", name: "Joelho PVC 90° 25mm", category: "hidraulica", defaultUnit: "peca", spec: "Soldável" },
  { sku: "HID-REG-ESF-25", name: "Registro de esfera 25mm metal cromado", category: "hidraulica", defaultUnit: "peca", spec: "1\" 1/2 polegada" },

  // ---- Elétrica (4) ----
  { sku: "ELE-FIO-1.5", name: "Fio elétrico flexível 1,5mm² — rolo 100m", category: "eletrica", defaultUnit: "rolo", spec: "750V, antichama" },
  { sku: "ELE-FIO-2.5", name: "Fio elétrico flexível 2,5mm² — rolo 100m", category: "eletrica", defaultUnit: "rolo", spec: "750V, antichama" },
  { sku: "ELE-ELDT-25", name: "Eletroduto corrugado 25mm — rolo 50m", category: "eletrica", defaultUnit: "rolo", spec: "Amarelo, embutimento" },
  { sku: "ELE-QD-DIST-12", name: "Quadro distribuição 12 disjuntores embutir", category: "eletrica", defaultUnit: "peca", spec: "Com barramento" },

  // ---- Gesso (2) ----
  { sku: "GES-DRY-12.5", name: "Placa drywall ST 12,5x1200x1800mm", category: "gesso", defaultUnit: "peca", spec: "Standard para parede" },
  { sku: "GES-ACAB-40", name: "Gesso para acabamento (saco 40kg)", category: "gesso", defaultUnit: "saca", spec: "Em pó, secagem rápida" },

  // ---- Revestimento (2) ----
  { sku: "REV-PORC-60x60", name: "Porcelanato 60x60 cm acetinado", category: "revestimento", defaultUnit: "m2", spec: "PEI 4, branco" },
  { sku: "REV-CER-33x33", name: "Cerâmica esmaltada 33x33 cm", category: "revestimento", defaultUnit: "m2", spec: "PEI 3, antiderrapante" },

  // ---- Pintura (2) ----
  { sku: "PIN-ACR-18", name: "Tinta acrílica fosca premium 18L", category: "pintura", defaultUnit: "balde", spec: "Branco gelo, base água" },
  { sku: "PIN-MASSA-18", name: "Massa corrida PVA 18kg", category: "pintura", defaultUnit: "balde", spec: "Interior, fácil lixamento" },
];

async function seedMaterials() {
  log(`Materiais: criando catálogo CotaObra (${CATALOG_MATERIALS.length} itens)`);
  // Prisma trata NULL como distinto em @@unique composta, então pra catálogo
  // de rede (tenantId=null) usamos o índice parcial materials_global_sku_key
  // via findFirst + create/update.
  for (const m of CATALOG_MATERIALS) {
    const existing = await prisma.material.findFirst({
      where: { tenantId: null, sku: m.sku },
    });
    if (existing) {
      await prisma.material.update({
        where: { id: existing.id },
        data: {
          name: m.name,
          category: m.category,
          defaultUnit: m.defaultUnit,
          spec: m.spec ?? null,
        },
      });
    } else {
      await prisma.material.create({
        data: {
          tenantId: null,
          sku: m.sku,
          name: m.name,
          category: m.category,
          defaultUnit: m.defaultUnit,
          spec: m.spec ?? null,
        },
      });
    }
  }
}

// ---------------------------------------------------------------
// 2. Tenant demo
// ---------------------------------------------------------------

async function seedTenant() {
  log("Tenant: Construtora Aurora Ltda");
  return prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {},
    create: {
      name: "Construtora Aurora Ltda",
      slug: DEMO_TENANT_SLUG,
      cnpj: "12.345.678/0001-90",
      email: "contato@aurora-demo.dev",
      active: true,
    },
  });
}

// ---------------------------------------------------------------
// 3. TenantSettings
// ---------------------------------------------------------------

async function seedTenantSettings(tenantId: string) {
  log("TenantSettings: defaults sensatos (24h exp, R$ 50k teto aprovação)");
  await prisma.tenantSettings.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      defaultExpiryHours: 24,
      defaultDeadlineDays: 5,
      approvalThreshold: 50000.00 as any, // Decimal
      paymentPolicy: {
        monthlyRate: 0.01,       // 1% ao mês — usado pelo pricing-engine
        dailyPenalty: 0.005,     // 0,5% por dia de atraso vs deadline
      },
      autoNotifyWinner: true,
      whatsappProvider: "evolution",
    },
  });
}

// ---------------------------------------------------------------
// 4. Usuários (admin / comprador / engenheiro)
// ---------------------------------------------------------------

async function seedUsers(tenantId: string) {
  log("Usuários: admin@cotaobra.dev / comprador@cotaobra.dev / engenheiro@cotaobra.dev");
  const password = await hash(DEFAULT_PASSWORD);

  // User.email é globalmente unique no schema atual, então usamos email como key.
  // Em Sprint 1 (multi-tenant onde mesmo e-mail pode aparecer em tenants diferentes),
  // mudar para @@unique([tenantId, email]) e usar where: { tenantId_email }.
  const admin = await prisma.user.upsert({
    where: { email: "admin@cotaobra.dev" },
    update: {},
    create: {
      tenantId,
      name: "Admin Demo",
      email: "admin@cotaobra.dev",
      phone: "+5511900000001",
      role: "ADMIN",
      password,
      active: true,
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: "comprador@cotaobra.dev" },
    update: {},
    create: {
      tenantId,
      name: "Samuel Albuquerque (Comprador)",
      email: "comprador@cotaobra.dev",
      phone: "+5511900000002",
      role: "BUYER",
      password,
      active: true,
    },
  });

  const requester = await prisma.user.upsert({
    where: { email: "engenheiro@cotaobra.dev" },
    update: {},
    create: {
      tenantId,
      name: "Carlos Ramos (Eng. de Obra)",
      email: "engenheiro@cotaobra.dev",
      phone: "+5511987654321",
      role: "REQUESTER",
      password,
      active: true,
    },
  });

  return { admin, buyer, requester };
}

// ---------------------------------------------------------------
// 5. Obra (Site)
// ---------------------------------------------------------------

async function seedSite(tenantId: string) {
  log("Obra: Residencial Aurora — Torre A (São Paulo/SP)");
  // Site não tem slug único — usamos findFirst + create.
  let site = await prisma.site.findFirst({
    where: { tenantId, name: "Residencial Aurora — Torre A" },
  });
  if (!site) {
    site = await prisma.site.create({
      data: {
        tenantId,
        name: "Residencial Aurora — Torre A",
        cno: "12.345.67890",
        address: "Rua das Acácias, 1500",
        city: "São Paulo",
        state: "SP",
        zip: "04567-890",
        region: "SP-Capital-Sul",
        manager: "Carlos Ramos",
        managerPhone: "+5511987654321",
        budget: 4200000.00 as any,
        status: "ACTIVE" as any,
        startAt: new Date("2026-03-01"),
        endAt: new Date("2027-12-31"),
      },
    });
  }
  return site;
}

// ---------------------------------------------------------------
// 6. Vincula REQUESTER ao Site
// ---------------------------------------------------------------

async function linkRequesterToSite(requesterId: string, siteId: string) {
  log("Vinculando engenheiro à Obra (siteIds)");
  await prisma.user.update({
    where: { id: requesterId },
    data: { siteIds: { set: [siteId] } as any },
  });
}

// ---------------------------------------------------------------
// 7. Fornecedores
// ---------------------------------------------------------------

const SUPPLIERS = [
  {
    name: "Construnorte Materiais",
    company: "Construnorte Materiais Ltda",
    phone: "+5511988880001",
    email: "vendas@construnorte.dev",
    cnpj: "11.111.111/0001-11",
    regions: ["SP-Capital-Sul", "SP-Capital-Centro"],
    categories: ["cimento", "agregados", "aco"],
    rating: 4.5,
  },
  {
    name: "Casa da Construção SA",
    company: "Casa da Construção S/A",
    phone: "+5511988880002",
    email: "comercial@casaconstrucao.dev",
    cnpj: "22.222.222/0001-22",
    regions: ["SP-Capital-Sul"],
    categories: ["cimento", "blocos", "hidraulica", "gesso"],
    rating: 4.2,
  },
  {
    name: "Materiais Brasil",
    company: "Materiais Brasil Distribuidora",
    phone: "+5511988880003",
    email: "atendimento@matbrasil.dev",
    cnpj: "33.333.333/0001-33",
    regions: ["SP-Capital-Sul", "SP-Capital-Norte", "SP-Interior"],
    categories: ["aco", "blocos", "hidraulica", "eletrica"],
    rating: 4.7,
  },
  {
    name: "Cimentos Real",
    company: "Cimentos Real Indústria",
    phone: "+5511988880004",
    email: "vendas@cimentosreal.dev",
    cnpj: "44.444.444/0001-44",
    regions: ["SP-Capital-Sul"],
    categories: ["cimento", "agregados"],
    rating: 4.0,
  },
  {
    name: "Eletro Hidro Total",
    company: "Eletro Hidro Total Ltda",
    phone: "+5511988880005",
    email: "loja@eletrohidro.dev",
    cnpj: "55.555.555/0001-55",
    regions: ["SP-Capital-Sul", "SP-Capital-Centro"],
    categories: ["hidraulica", "eletrica"],
    rating: 4.4,
  },
];

async function seedSuppliers(tenantId: string) {
  log(`Fornecedores: ${SUPPLIERS.length} cadastrados`);
  for (const s of SUPPLIERS) {
    // Supplier não tem campo `cnpj` plain — está em cpfCnpjEncrypted/Hash.
    // No seed dev pulamos a criptografia para manter código simples; o CNPJ
    // do dado de demo (`s.cnpj`) fica apenas no log.
    await prisma.supplier.upsert({
      where: { tenantId_phone: { tenantId, phone: s.phone } },
      update: {},
      create: {
        tenantId,
        name: s.name,
        company: s.company,
        phone: s.phone,
        email: s.email,
        regions: s.regions,
        categories: s.categories,
        isNetworkSupplier: false,
        rating: s.rating,
      },
    });
  }
}

// ---------------------------------------------------------------
// 8. Materiais customizados do tenant demo
// ---------------------------------------------------------------

const CUSTOM_MATERIALS = [
  {
    sku: "CUSTOM-TINTA-MARCA-X",
    name: "Tinta acrílica branca premium 18L (marca específica)",
    category: "pintura",
    defaultUnit: "balde",
    spec: "Marca aprovada pelo arquiteto",
  },
  {
    sku: "CUSTOM-PORC-GRANDE",
    name: "Porcelanato 90x90 cm acetinado importado",
    category: "revestimento",
    defaultUnit: "m2",
    spec: "PEI 5, fornecedor único homologado",
  },
];

async function seedCustomMaterials(tenantId: string) {
  log(`Materiais customizados do tenant: ${CUSTOM_MATERIALS.length} itens`);
  for (const m of CUSTOM_MATERIALS) {
    await prisma.material.upsert({
      where: { tenantId_sku: { tenantId, sku: m.sku } } as any,
      update: { name: m.name, category: m.category, defaultUnit: m.defaultUnit, spec: m.spec },
      create: { tenantId, ...m },
    });
  }
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding CotaObra dev database...\n");

  await seedMaterials();

  const tenant = await seedTenant();
  await seedTenantSettings(tenant.id);

  const users = await seedUsers(tenant.id);
  const site = await seedSite(tenant.id);
  await linkRequesterToSite(users.requester.id, site.id);
  await seedSuppliers(tenant.id);
  await seedCustomMaterials(tenant.id);

  console.log("\n✅ Seed completo. Credenciais:");
  console.log("   admin     → admin@cotaobra.dev      | senha-dev-123");
  console.log("   comprador → comprador@cotaobra.dev  | senha-dev-123");
  console.log("   engenheiro→ engenheiro@cotaobra.dev | senha-dev-123 (WhatsApp +5511987654321)");
  console.log(`\n📁 Tenant slug: ${tenant.slug}`);
  console.log(`📁 Obra: Residencial Aurora — Torre A (id ${site.id})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed falhou:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
