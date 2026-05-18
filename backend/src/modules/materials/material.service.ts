import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { normalizeUnit } from '../../utils/unit-normalizer';
import { resolveCategoryValue } from '../../constants/material-categories';
import type { AuthContext } from '../../utils/auth-context';
import type { Material, Prisma } from '@prisma/client';
import Papa from 'papaparse';

/**
 * CO-1-06 — Materials service. Suporta catálogo da rede (tenantId=null,
 * compartilhado) e catálogo customizado por tenant.
 *
 * Visibilidade: qualquer usuário do tenant vê materiais com tenantId=ctx.tenantId
 * OU tenantId=null. SUPER_ADMIN vê tudo.
 */

export interface CreateMaterialDTO {
  sku: string;
  name: string;
  category: string;
  defaultUnit: string;
  spec?: string;
}

export type UpdateMaterialDTO = Partial<CreateMaterialDTO>;

export interface ListMaterialsFilters {
  q?: string;
  category?: string;
  includeNetwork?: boolean;
}

export interface ImportCsvResult {
  created: number;
  updated: number;
  errors: Array<{ line: number; message: string }>;
}

export class MaterialService {
  private static buildWhere(
    ctx: AuthContext,
    filters?: ListMaterialsFilters,
  ): Prisma.MaterialWhereInput {
    const where: Prisma.MaterialWhereInput = { active: true };

    const includeNetwork = filters?.includeNetwork !== false;
    if (ctx.role === 'SUPER_ADMIN') {
      // Vê tudo, sem filtro de tenant
    } else if (includeNetwork) {
      where.OR = [{ tenantId: ctx.tenantId }, { tenantId: null }];
    } else {
      where.tenantId = ctx.tenantId;
    }

    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.q) {
      where.OR = (where.OR ?? []).concat([
        { name: { contains: filters.q, mode: 'insensitive' } },
        { sku: { contains: filters.q, mode: 'insensitive' } },
      ]);
    }
    return where;
  }

  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 50,
    filters?: ListMaterialsFilters,
  ) {
    const skip = (page - 1) * limit;
    const where = this.buildWhere(ctx, filters);

    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.material.count({ where }),
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

  static async getById(ctx: AuthContext, id: string): Promise<Material> {
    const where = this.buildWhere(ctx);
    where.id = id;
    const material = await prisma.material.findFirst({ where });
    if (!material) throw createError.notFound('Material não encontrado');
    return material;
  }

  /**
   * Valida e normaliza category/unit + verifica unique (tenantId, sku).
   */
  private static async validateAndNormalize(
    ctx: AuthContext,
    data: CreateMaterialDTO,
    excludeId?: string,
  ): Promise<CreateMaterialDTO> {
    const category = resolveCategoryValue(data.category);
    if (!category) {
      throw createError.unprocessable(
        `Categoria "${data.category}" não está na lista de MATERIAL_CATEGORIES`,
      );
    }
    const defaultUnit = normalizeUnit(data.defaultUnit);
    if (!defaultUnit || defaultUnit === 'unidades') {
      // normalizeUnit retorna "unidades" em caso de input inválido; é nosso sinal de erro.
      if (data.defaultUnit?.toLowerCase() !== 'unidades') {
        throw createError.unprocessable(
          `Unidade "${data.defaultUnit}" não está na lista de UNITS`,
        );
      }
    }

    // Conflito de SKU dentro do tenant
    const existing = await prisma.material.findFirst({
      where: {
        sku: data.sku,
        tenantId: ctx.tenantId,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    if (existing) {
      throw createError.conflict(`SKU "${data.sku}" já existe neste tenant`);
    }

    return {
      sku: data.sku.trim().toUpperCase(),
      name: data.name.trim(),
      category,
      defaultUnit,
      spec: data.spec?.trim() || undefined,
    };
  }

  static async create(ctx: AuthContext, data: CreateMaterialDTO): Promise<Material> {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'BUYER' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Seu perfil não pode criar materiais');
    }
    const normalized = await this.validateAndNormalize(ctx, data);

    const material = await prisma.material.create({
      data: {
        tenantId: ctx.tenantId,
        sku: normalized.sku,
        name: normalized.name,
        category: normalized.category,
        defaultUnit: normalized.defaultUnit,
        spec: normalized.spec ?? null,
      },
    });
    logger.info('material.created', { id: material.id, tenantId: ctx.tenantId });
    return material;
  }

  static async update(
    ctx: AuthContext,
    id: string,
    data: UpdateMaterialDTO,
  ): Promise<Material> {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'BUYER' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Seu perfil não pode editar materiais');
    }
    const existing = await this.getById(ctx, id);

    // Não permite editar material de rede (tenantId=null) sem ser SUPER_ADMIN
    if (existing.tenantId === null && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden(
        'Materiais do catálogo CotaObra (rede) só podem ser alterados por SUPER_ADMIN',
      );
    }

    // Re-valida SKU se mudou
    const updateData: Prisma.MaterialUpdateInput = {};
    if (data.sku !== undefined && data.sku !== existing.sku) {
      const dupe = await prisma.material.findFirst({
        where: { sku: data.sku, tenantId: ctx.tenantId, NOT: { id } },
      });
      if (dupe) throw createError.conflict(`SKU "${data.sku}" já existe`);
      updateData.sku = data.sku.trim().toUpperCase();
    }
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.category !== undefined) {
      const cat = resolveCategoryValue(data.category);
      if (!cat) throw createError.unprocessable(`Categoria inválida: ${data.category}`);
      updateData.category = cat;
    }
    if (data.defaultUnit !== undefined) {
      updateData.defaultUnit = normalizeUnit(data.defaultUnit);
    }
    if (data.spec !== undefined) updateData.spec = data.spec?.trim() || null;

    const material = await prisma.material.update({
      where: { id },
      data: updateData,
    });
    logger.info('material.updated', { id, tenantId: ctx.tenantId });
    return material;
  }

  /**
   * Soft delete: marca active=false. Hard delete só por SUPER_ADMIN.
   */
  static async softDelete(ctx: AuthContext, id: string): Promise<void> {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Apenas admins podem desativar materiais');
    }
    const existing = await this.getById(ctx, id);
    if (existing.tenantId === null && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Material da rede só pode ser desativado por SUPER_ADMIN');
    }
    await prisma.material.update({
      where: { id },
      data: { active: false },
    });
    logger.info('material.deactivated', { id, tenantId: ctx.tenantId });
  }

  /**
   * Import CSV — formato `sku,name,category,unit,spec`.
   * Limite: 500 linhas (~1MB).
   */
  static async importCsv(ctx: AuthContext, csvText: string): Promise<ImportCsvResult> {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'BUYER' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Seu perfil não pode importar materiais');
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (parsed.errors.length > 0) {
      const first = parsed.errors[0];
      throw createError.badRequest(`CSV malformado: ${first.message} (linha ${first.row})`);
    }

    if (parsed.data.length === 0) {
      throw createError.badRequest('CSV vazio');
    }
    if (parsed.data.length > 500) {
      throw createError.badRequest(
        `CSV tem ${parsed.data.length} linhas; limite é 500. Quebre em arquivos menores.`,
      );
    }

    const result: ImportCsvResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const line = i + 2; // +1 para 1-based, +1 pelo header
      try {
        const sku = (row.sku ?? '').trim();
        const name = (row.name ?? row.nome ?? '').trim();
        const categoryInput = (row.category ?? row.categoria ?? '').trim();
        const unitInput = (row.unit ?? row.unidade ?? row.defaultunit ?? '').trim();
        const spec = (row.spec ?? row.especificacao ?? '').trim() || undefined;

        if (!sku || !name || !categoryInput || !unitInput) {
          result.errors.push({
            line,
            message: 'Campos obrigatórios: sku, name, category, unit',
          });
          continue;
        }

        const category = resolveCategoryValue(categoryInput);
        if (!category) {
          result.errors.push({
            line,
            message: `Categoria "${categoryInput}" não está em MATERIAL_CATEGORIES`,
          });
          continue;
        }

        const defaultUnit = normalizeUnit(unitInput);

        const existing = await prisma.material.findFirst({
          where: { tenantId: ctx.tenantId, sku },
        });

        if (existing) {
          await prisma.material.update({
            where: { id: existing.id },
            data: { name, category, defaultUnit, spec: spec ?? null, active: true },
          });
          result.updated++;
        } else {
          await prisma.material.create({
            data: {
              tenantId: ctx.tenantId,
              sku,
              name,
              category,
              defaultUnit,
              spec: spec ?? null,
            },
          });
          result.created++;
        }
      } catch (err: any) {
        result.errors.push({
          line,
          message: err?.message ?? 'Erro desconhecido',
        });
      }
    }

    logger.info('material.csv.imported', {
      tenantId: ctx.tenantId,
      ...result,
    });
    return result;
  }
}
