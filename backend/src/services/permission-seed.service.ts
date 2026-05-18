import { PrismaClient, Resource, UserRole } from '@prisma/client';

/**
 * CO-1-09 — Permission seed por role.
 *
 * Define o conjunto canônico de permissões para os 4 roles do CotaObra
 * (REQUESTER/BUYER/APPROVER/ADMIN) sobre os recursos atuais. Idempotente:
 * usa upsert por @@unique([userId, resource]).
 *
 * Mantido em service separado para que (a) o seed.ts dev local consuma, e
 * (b) toda criação de User via super-admin (Sprint 1 futuro) chame o mesmo
 * helper, garantindo consistência.
 */

type PermissionMatrix = Record<
  Resource,
  { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
>;

const NONE = { canView: false, canCreate: false, canEdit: false, canDelete: false };
const READ = { canView: true, canCreate: false, canEdit: false, canDelete: false };
const WRITE = { canView: true, canCreate: true, canEdit: true, canDelete: false };
const FULL = { canView: true, canCreate: true, canEdit: true, canDelete: true };

/**
 * Matrizes de permissão por role.
 * Resources atuais: DASHBOARD, QUOTES, SUPPLIERS, PRODUCERS, SITES, MATERIALS,
 * APPROVALS, PURCHASE_ORDERS, SUBSCRIPTIONS, USERS, WHATSAPP_CONFIG, REPORTS.
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionMatrix> = {
  // SUPER_ADMIN: cross-tenant. Permission rows não se aplicam (validação por role direto).
  // Mas seedamos FULL pra consistência.
  SUPER_ADMIN: {
    DASHBOARD: FULL,
    QUOTES: FULL,
    SUPPLIERS: FULL,
    PRODUCERS: FULL,
    SITES: FULL,
    MATERIALS: FULL,
    APPROVALS: FULL,
    PURCHASE_ORDERS: FULL,
    SUBSCRIPTIONS: FULL,
    USERS: FULL,
    WHATSAPP_CONFIG: FULL,
    REPORTS: FULL,
  },

  ADMIN: {
    DASHBOARD: READ,
    QUOTES: FULL,
    SUPPLIERS: FULL,
    PRODUCERS: FULL, // legacy, mantido durante transição
    SITES: FULL,
    MATERIALS: FULL,
    APPROVALS: FULL,
    PURCHASE_ORDERS: FULL,
    SUBSCRIPTIONS: WRITE,
    USERS: FULL,
    WHATSAPP_CONFIG: WRITE,
    REPORTS: READ,
  },

  BUYER: {
    DASHBOARD: READ,
    QUOTES: WRITE,
    SUPPLIERS: WRITE,
    PRODUCERS: READ,
    SITES: WRITE,
    MATERIALS: WRITE,
    APPROVALS: READ, // vê fila mas não aprova
    PURCHASE_ORDERS: WRITE,
    SUBSCRIPTIONS: READ,
    USERS: READ,
    WHATSAPP_CONFIG: READ,
    REPORTS: READ,
  },

  REQUESTER: {
    DASHBOARD: READ,
    QUOTES: READ, // só suas (filtragem por service)
    SUPPLIERS: NONE,
    PRODUCERS: NONE,
    SITES: READ, // filtrado por siteIds (service trata)
    MATERIALS: READ,
    APPROVALS: NONE,
    PURCHASE_ORDERS: NONE,
    SUBSCRIPTIONS: NONE,
    USERS: NONE,
    WHATSAPP_CONFIG: NONE,
    REPORTS: NONE,
  },

  APPROVER: {
    DASHBOARD: READ,
    QUOTES: READ,
    SUPPLIERS: READ,
    PRODUCERS: READ,
    SITES: READ,
    MATERIALS: READ,
    APPROVALS: WRITE, // aprova/recusa
    PURCHASE_ORDERS: READ,
    SUBSCRIPTIONS: NONE,
    USERS: READ,
    WHATSAPP_CONFIG: NONE,
    REPORTS: READ,
  },

  USER: {
    // Legacy do cotaAgro — sem privilégios por default. Permissions são
    // atribuídas explicitamente via UI de admin.
    DASHBOARD: READ,
    QUOTES: NONE,
    SUPPLIERS: NONE,
    PRODUCERS: NONE,
    SITES: NONE,
    MATERIALS: NONE,
    APPROVALS: NONE,
    PURCHASE_ORDERS: NONE,
    SUBSCRIPTIONS: NONE,
    USERS: NONE,
    WHATSAPP_CONFIG: NONE,
    REPORTS: NONE,
  },
};

/**
 * Aplica a matriz de permissão padrão para um user específico.
 * Idempotente: pode rodar quantas vezes (upsert por @@unique).
 */
export async function seedPermissionsForUser(
  prisma: PrismaClient,
  userId: string,
  role: UserRole,
): Promise<void> {
  const matrix = ROLE_PERMISSIONS[role];
  const resources = Object.keys(matrix) as Resource[];

  for (const resource of resources) {
    const perms = matrix[resource];
    await prisma.permission.upsert({
      where: { userId_resource: { userId, resource } },
      create: { userId, resource, ...perms },
      update: { ...perms },
    });
  }
}

/**
 * Aplica permissões para um conjunto de users.
 */
export async function seedPermissionsBulk(
  prisma: PrismaClient,
  users: Array<{ id: string; role: UserRole }>,
): Promise<void> {
  for (const u of users) {
    await seedPermissionsForUser(prisma, u.id, u.role);
  }
}
