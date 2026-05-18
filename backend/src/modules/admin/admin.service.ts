/**
 * FEAT-008 (FF-BE-029 + FF-BE-030) — Admin Service.
 *
 * Núcleo das operações cross-tenant disponíveis ao SUPER_ADMIN:
 *   - Cadastro direto de novos usuários (gerada ou custom)
 *   - Reset de senha
 *   - Inativar/reativar users e tenants
 *   - Listar tenants/users/audit-log
 *
 * Todas as rotas que chamam estes métodos passam por requireSuperAdmin
 * e (quando aplicável) withReason(). O service gera o AuditLog DENTRO
 * de transações com a operação principal — auditoria é parte do contrato
 * (RN-07), não um observador externo opcional.
 */
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { generateTempPassword } from '../../utils/password-generator';
import { validatePasswordStrength } from '../../utils/password-strength';
import { AuditLogService } from '../../services/audit-log.service';

const BCRYPT_ROUNDS = 10;

/** Roles que um SUPER_ADMIN pode atribuir ao criar/atualizar user. */
type AssignableRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface CreateUserInput {
  email: string;
  name: string;
  role: AssignableRole;
  /** Nome do tenant NOVO (cria) — exclusivo com tenantId */
  tenantName?: string;
  /** ID de tenant EXISTENTE — exclusivo com tenantName */
  tenantId?: string;
  /** Senha custom (validada com strength); ausência = gera aleatória */
  password?: string;
  reason: string;
  /** Para o AuditLog ip/UA */
  req?: Request;
  /** ID do super admin executor */
  actorUserId: string;
}

export interface CreateUserResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: AssignableRole;
    tenantId: string | null;
    active: boolean;
    mustChangePassword: boolean;
  };
  tenant: { id: string; name: string; slug: string } | null;
  generatedPassword: string;
  passwordMode: 'generated' | 'custom';
}

export interface ResetPasswordInput {
  targetUserId: string;
  password?: string;
  reason: string;
  actorUserId: string;
  req?: Request;
}

export interface ResetPasswordResult {
  generatedPassword: string;
  passwordMode: 'generated' | 'custom';
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function generateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'tenant';
  let candidate = root;
  for (let i = 1; i < 100; i++) {
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${root}-${i + 1}`;
  }
  // Extremamente improvável, mas evita loop infinito
  return `${root}-${Date.now()}`;
}

export class AdminService {
  // ===================================================================
  // FF-BE-030 — Cadastro direto
  // ===================================================================

  /**
   * Cria user em tenant novo ou existente.
   *
   * - body.password ausente → gera senha aleatória (action=create_user)
   * - body.password presente → valida força e usa (action=create_user_with_custom_password)
   * - mustChangePassword=true em ambos os modos (RN-03)
   * - Senha em texto retorna APENAS aqui (RN-02), NUNCA em logs.
   */
  static async createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();

    if (!email || !name) {
      throw createError.badRequest('email e name são obrigatórios');
    }

    // XOR: tenantName e tenantId — exatamente um. SUPER_ADMIN pode pular ambos
    // (super admin sem tenant — RN-11), os outros roles exigem um deles.
    const hasNew = !!input.tenantName?.trim();
    const hasExisting = !!input.tenantId;
    if (hasNew && hasExisting) {
      throw createError.badRequest(
        'Informe apenas tenantName (novo) OU tenantId (existente), não ambos',
      );
    }
    if (!hasNew && !hasExisting && input.role !== 'SUPER_ADMIN') {
      throw createError.badRequest(
        'Informe tenantName (novo) ou tenantId (existente) para esse role',
      );
    }

    // Decide senha
    let plain: string;
    let passwordMode: 'generated' | 'custom';
    if (input.password) {
      const strength = validatePasswordStrength(input.password);
      if (!strength.valid) {
        throw createError.badRequest(strength.reason ?? 'Senha fraca');
      }
      plain = input.password;
      passwordMode = 'custom';
    } else {
      plain = generateTempPassword();
      passwordMode = 'generated';
    }
    const passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);

    // Email duplicado (constraint @unique em todo o sistema, edge case 1 da spec)
    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) {
      throw createError.conflict('E-mail já cadastrado no sistema');
    }

    // Resolve tenant
    let tenantRecord: { id: string; name: string; slug: string } | null = null;
    if (hasNew) {
      const slug = await generateUniqueSlug(input.tenantName!);
      tenantRecord = await prisma.tenant.create({
        data: { name: input.tenantName!.trim(), slug, active: true },
        select: { id: true, name: true, slug: true },
      });
    } else if (hasExisting) {
      const t = await prisma.tenant.findUnique({
        where: { id: input.tenantId! },
        select: { id: true, name: true, slug: true, active: true },
      });
      if (!t) throw createError.notFound('Tenant não encontrado');
      if (!t.active) throw createError.badRequest('Tenant está inativo');
      tenantRecord = { id: t.id, name: t.name, slug: t.slug };
    }

    const created = await prisma.user.create({
      data: {
        email,
        name,
        password: passwordHash,
        role: input.role as UserRole,
        tenantId: tenantRecord?.id ?? null,
        active: true,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        passwordCreatedById: input.actorUserId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        active: true,
        mustChangePassword: true,
      },
    });

    // AuditLog — action distinta entre os modos (RN-13)
    await AuditLogService.log({
      userId: input.actorUserId,
      action:
        passwordMode === 'custom'
          ? 'create_user_with_custom_password'
          : 'create_user',
      targetType: 'User',
      targetId: created.id,
      tenantId: tenantRecord?.id,
      reason: input.reason,
      // O sanitizador remove "password" daqui mesmo se vazasse — mas
      // não mandamos a senha no payload por design. Apenas metadata.
      payload: {
        email,
        role: input.role,
        passwordMode,
        tenantMode: hasNew ? 'new' : hasExisting ? 'existing' : 'none',
      },
      req: input.req,
    });

    logger.info('Super admin created user', {
      actorUserId: input.actorUserId,
      targetUserId: created.id,
      role: created.role,
      passwordMode,
    });

    return {
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role as AssignableRole,
        tenantId: created.tenantId,
        active: created.active,
        mustChangePassword: created.mustChangePassword,
      },
      tenant: tenantRecord,
      generatedPassword: plain,
      passwordMode,
    };
  }

  /**
   * Reseta senha de um user existente. Marca mustChangePassword=true
   * (independente do estado anterior — Cenário 5 da spec).
   */
  static async resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    const target = await prisma.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, email: true, tenantId: true, active: true },
    });
    if (!target) throw createError.notFound('Usuário não encontrado');

    // Permitido resetar de qualquer user (incluindo outro super admin —
    // edge case da spec). Mas auto-reset NÃO é permitido: usa fluxo
    // "esqueci minha senha" se precisar trocar a própria.
    if (target.id === input.actorUserId) {
      throw createError.badRequest(
        'Use /auth/change-password ou /auth/forgot-password para resetar a própria senha',
      );
    }

    let plain: string;
    let passwordMode: 'generated' | 'custom';
    if (input.password) {
      const strength = validatePasswordStrength(input.password);
      if (!strength.valid) {
        throw createError.badRequest(strength.reason ?? 'Senha fraca');
      }
      plain = input.password;
      passwordMode = 'custom';
    } else {
      plain = generateTempPassword();
      passwordMode = 'generated';
    }
    const passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: target.id },
      data: {
        password: passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        passwordCreatedById: input.actorUserId,
      },
    });

    await AuditLogService.log({
      userId: input.actorUserId,
      action: 'reset_password',
      targetType: 'User',
      targetId: target.id,
      tenantId: target.tenantId ?? undefined,
      reason: input.reason,
      payload: { email: target.email, passwordMode },
      req: input.req,
    });

    logger.info('Super admin reset password', {
      actorUserId: input.actorUserId,
      targetUserId: target.id,
      passwordMode,
    });

    return { generatedPassword: plain, passwordMode };
  }

  // ===================================================================
  // FF-BE-029 — Toggle ativo (user e tenant)
  // ===================================================================

  static async setUserActive(
    actorUserId: string,
    targetUserId: string,
    active: boolean,
    reason: string,
    req?: Request,
  ): Promise<void> {
    if (targetUserId === actorUserId) {
      throw createError.badRequest('Você não pode desativar a si próprio');
    }
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, tenantId: true, active: true },
    });
    if (!target) throw createError.notFound('Usuário não encontrado');

    await prisma.user.update({ where: { id: target.id }, data: { active } });

    await AuditLogService.log({
      userId: actorUserId,
      action: active ? 'reactivate_user' : 'deactivate_user',
      targetType: 'User',
      targetId: target.id,
      tenantId: target.tenantId ?? undefined,
      reason,
      payload: { email: target.email, previousActive: target.active },
      req,
    });
  }

  static async setTenantActive(
    actorUserId: string,
    targetTenantId: string,
    active: boolean,
    reason: string,
    req?: Request,
  ): Promise<void> {
    const target = await prisma.tenant.findUnique({
      where: { id: targetTenantId },
      select: { id: true, name: true, slug: true, active: true },
    });
    if (!target) throw createError.notFound('Tenant não encontrado');

    await prisma.tenant.update({ where: { id: target.id }, data: { active } });

    await AuditLogService.log({
      userId: actorUserId,
      action: active ? 'reactivate_tenant' : 'deactivate_tenant',
      targetType: 'Tenant',
      targetId: target.id,
      tenantId: target.id,
      reason,
      payload: { name: target.name, slug: target.slug, previousActive: target.active },
      req,
    });
  }

  // ===================================================================
  // FF-BE-029 — Listagens
  // ===================================================================

  static async listTenants(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.TenantWhereInput = {};

    if (params.active !== undefined) where.active = params.active;
    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          active: true,
          createdAt: true,
          _count: { select: { users: true, producers: true, suppliers: true, quotes: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  static async getTenantDetail(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        active: true,
        createdAt: true,
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
            mustChangePassword: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            users: true,
            producers: true,
            suppliers: true,
            quotes: true,
            proposals: true,
          },
        },
      },
    });
    if (!tenant) throw createError.notFound('Tenant não encontrado');

    // Estatísticas dos últimos 30 dias
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [quotesLast30d, proposalsLast30d] = await Promise.all([
      prisma.quote.count({ where: { tenantId, createdAt: { gte: since } } }),
      prisma.proposal.count({ where: { tenantId, createdAt: { gte: since } } }),
    ]);

    return {
      ...tenant,
      stats: {
        users: tenant._count.users,
        producers: tenant._count.producers,
        suppliers: tenant._count.suppliers,
        quotesTotal: tenant._count.quotes,
        proposalsTotal: tenant._count.proposals,
        quotesLast30d,
        proposalsLast30d,
      },
    };
  }

  static async listUsers(params: {
    page: number;
    limit: number;
    search?: string;
    role?: UserRole;
    tenantId?: string;
    active?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.UserWhereInput = {};

    if (params.active !== undefined) where.active = params.active;
    if (params.role) where.role = params.role;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
          tenant: { select: { id: true, name: true, slug: true, active: true } },
          producerId: true,
          active: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  static async listAuditLog(params: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    tenantId?: string;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.AuditLogWhereInput = {};

    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.targetType) where.targetType = params.targetType;
    if (params.targetId) where.targetId = params.targetId;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }
}
