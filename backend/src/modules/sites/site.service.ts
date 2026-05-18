import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import type { AuthContext } from '../../utils/auth-context';
import type { Site, SiteStatus, Prisma } from '@prisma/client';

/**
 * CO-1-02 — Sites (Obras) service com RBAC e isolamento por tenant.
 *
 * Regras de visibilidade:
 *   - SUPER_ADMIN     → todas as obras (qualquer tenant)
 *   - ADMIN/APPROVER  → todas as obras do tenant
 *   - BUYER           → todas as obras do tenant
 *   - REQUESTER       → apenas obras em user.siteIds
 *
 * Soft delete: DELETE não apaga, marca status = COMPLETED (preserva histórico
 * de cotações da obra para reports). Hard delete só por SUPER_ADMIN.
 */

export interface CreateSiteDTO {
  name: string;
  cno?: string;
  address?: string;
  city: string;
  state: string;
  zip?: string;
  region: string;
  manager?: string;
  managerPhone?: string;
  budget?: number;
  status?: SiteStatus;
  startAt?: Date;
  endAt?: Date;
}

export type UpdateSiteDTO = Partial<CreateSiteDTO>;

export interface ListSitesFilters {
  status?: SiteStatus;
  q?: string; // busca livre em name/city
  city?: string;
  state?: string;
}

export class SiteService {
  /**
   * Constrói filtro `where` aplicando RBAC para o user logado.
   */
  private static buildWhere(
    ctx: AuthContext,
    siteIds: string[] | null,
    filters?: ListSitesFilters,
  ): Prisma.SiteWhereInput {
    const where: Prisma.SiteWhereInput = {};

    // Isolamento por tenant (exceto SUPER_ADMIN cross-tenant)
    if (ctx.role !== 'SUPER_ADMIN') {
      where.tenantId = ctx.tenantId;
    }

    // REQUESTER vê apenas as obras em siteIds
    if (ctx.role === 'REQUESTER') {
      if (!siteIds || siteIds.length === 0) {
        // Sem obras vinculadas → não vê nada
        where.id = { in: ['__no_sites__'] };
      } else {
        where.id = { in: siteIds };
      }
    }

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.city) {
      where.city = { equals: filters.city, mode: 'insensitive' };
    }
    if (filters?.state) {
      where.state = filters.state.toUpperCase();
    }
    if (filters?.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { city: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * Carrega siteIds do user (para filtro REQUESTER).
   */
  private static async loadUserSiteIds(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { siteIds: true },
    });
    return user?.siteIds ?? [];
  }

  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 20,
    filters?: ListSitesFilters,
  ) {
    const skip = (page - 1) * limit;
    const siteIds = ctx.role === 'REQUESTER' ? await this.loadUserSiteIds(ctx.userId) : null;
    const where = this.buildWhere(ctx, siteIds, filters);

    const [data, total] = await Promise.all([
      prisma.site.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      prisma.site.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  static async getById(ctx: AuthContext, id: string): Promise<Site> {
    const siteIds = ctx.role === 'REQUESTER' ? await this.loadUserSiteIds(ctx.userId) : null;
    const where = this.buildWhere(ctx, siteIds);
    where.id = id;

    const site = await prisma.site.findFirst({ where });
    if (!site) {
      throw createError.notFound('Obra não encontrada');
    }
    return site;
  }

  static async create(ctx: AuthContext, data: CreateSiteDTO): Promise<Site> {
    // REQUESTER e APPROVER não podem criar obras
    if (ctx.role === 'REQUESTER' || ctx.role === 'APPROVER') {
      throw createError.forbidden('Seu perfil não pode criar obras');
    }

    const site = await prisma.site.create({
      data: {
        tenantId: ctx.tenantId,
        name: data.name,
        cno: data.cno ?? null,
        address: data.address ?? null,
        city: data.city,
        state: data.state.toUpperCase(),
        zip: data.zip ?? null,
        region: data.region,
        manager: data.manager ?? null,
        managerPhone: data.managerPhone ?? null,
        budget: data.budget !== undefined ? new (require('@prisma/client/runtime/library').Decimal)(data.budget) : null,
        status: data.status ?? 'ACTIVE',
        startAt: data.startAt ?? null,
        endAt: data.endAt ?? null,
      },
    });

    logger.info('site.created', { siteId: site.id, tenantId: ctx.tenantId, userId: ctx.userId });
    return site;
  }

  static async update(
    ctx: AuthContext,
    id: string,
    data: UpdateSiteDTO,
  ): Promise<Site> {
    // REQUESTER e APPROVER não podem editar obras
    if (ctx.role === 'REQUESTER' || ctx.role === 'APPROVER') {
      throw createError.forbidden('Seu perfil não pode editar obras');
    }

    // Verifica que existe e pertence ao tenant (getById faz a verificação)
    await this.getById(ctx, id);

    const updateData: Prisma.SiteUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.cno !== undefined) updateData.cno = data.cno;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.state !== undefined) updateData.state = data.state.toUpperCase();
    if (data.zip !== undefined) updateData.zip = data.zip;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.manager !== undefined) updateData.manager = data.manager;
    if (data.managerPhone !== undefined) updateData.managerPhone = data.managerPhone;
    if (data.budget !== undefined) {
      updateData.budget = data.budget === null
        ? null
        : new (require('@prisma/client/runtime/library').Decimal)(data.budget);
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startAt !== undefined) updateData.startAt = data.startAt;
    if (data.endAt !== undefined) updateData.endAt = data.endAt;

    const site = await prisma.site.update({
      where: { id },
      data: updateData,
    });

    logger.info('site.updated', { siteId: id, tenantId: ctx.tenantId, userId: ctx.userId });
    return site;
  }

  /**
   * Soft delete: marca status = COMPLETED. Histórico preservado.
   */
  static async softDelete(ctx: AuthContext, id: string): Promise<Site> {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Apenas admins podem arquivar obras');
    }

    await this.getById(ctx, id);

    const site = await prisma.site.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    logger.info('site.archived', { siteId: id, tenantId: ctx.tenantId, userId: ctx.userId });
    return site;
  }
}
