import { prisma } from '../../config/database';
import { CreateSupplierDTO, UpdateSupplierDTO, PaginatedResponse } from '../../types';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { normalizePhoneBR } from '../../utils/phone';
import type { AuthContext } from '../../utils/auth-context';

/**
 * FF-BE-023 — Isolamento de fornecedores entre produtores de um mesmo tenant.
 *
 * Antes: filtrava só por tenantId — produtor logado via painel via fornecedores
 * de outros produtores. Risco LGPD + quebra de premissa de produto.
 *
 * Agora:
 *   - User com producerId (produtor)            → só fornecedores ligados via
 *                                                  ProducerSupplier + da rede.
 *   - User sem producerId (admin/operator)      → todos do tenant + rede
 *                                                  (comportamento legado).
 *
 * O role ADMIN sempre cai no caminho do admin, mesmo com producerId definido
 * (Risco 2 da spec) — getAuthContext já zera producerId nesse caso.
 */
export class SupplierService {
  /**
   * Lista fornecedores com paginação aplicando isolamento por papel.
   */
  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 10,
    filters?: {
      isNetworkSupplier?: boolean;
      region?: string;
      category?: string;
      includeNetwork?: boolean;
    },
  ): Promise<PaginatedResponse<any>> {
    const skip = (page - 1) * limit;

    const where: any = {};
    const includeNetwork = filters?.includeNetwork !== false;

    // CO-0-05: fornecedores são por tenant (1:N). Sem tabela join — produtor
    // enxerga os mesmos fornecedores que o resto da construtora.
    if (includeNetwork) {
      where.OR = [{ tenantId: ctx.tenantId }, { tenantId: null }];
    } else {
      where.tenantId = ctx.tenantId;
    }

    if (filters?.isNetworkSupplier !== undefined) {
      where.isNetworkSupplier = filters.isNetworkSupplier;
    }

    if (filters?.region) {
      where.regions = { has: filters.region };
    }

    if (filters?.category) {
      where.categories = { has: filters.category };
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        skip,
        take: limit,
        where,
        include: {
          _count: {
            select: {
              // CO-0-05: campo `producers` removido (ProducerSupplier eliminado).
              proposals: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.supplier.count({ where }),
    ]);

    return {
      data: suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca fornecedor por ID respeitando o vínculo produtor-fornecedor.
   * 404 (em vez de 403) quando o produtor tenta acessar um supplier que não
   * é dele — evita vazar a existência do recurso.
   */
  static async getById(ctx: AuthContext, id: string) {
    // CO-0-05: visibilidade é por tenant. Fornecedor visível se for do meu tenant
    // ou se for da rede (tenantId=null).
    const where: any = {
      id,
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    };

    const supplier = await prisma.supplier.findFirst({
      where,
      include: {
        proposals: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            quote: {
              include: {
                producer: true,
              },
            },
          },
        },
      },
    });

    if (!supplier) {
      throw createError.notFound('Fornecedor não encontrado');
    }

    return supplier;
  }

  /**
   * Cria fornecedor e auto-vincula ao produtor logado (se for produtor).
   * Preserva o comportamento de conflito por telefone duplicado no mesmo
   * tenant. Para network suppliers (tenantId=null), só admin/operator cria.
   */
  static async create(ctx: AuthContext, data: CreateSupplierDTO) {
    data.phone = normalizePhoneBR(data.phone);

    // Produtor logado nunca cria fornecedor "da rede" (privilégio admin).
    const isNetwork = ctx.producerId ? false : !!data.isNetworkSupplier;
    const supplierTenantId = isNetwork ? null : ctx.tenantId;

    const existing = await prisma.supplier.findFirst({
      where: {
        tenantId: supplierTenantId,
        phone: data.phone,
      },
    });

    let supplier;
    if (existing) {
      // Para produtor: reaproveita o supplier existente do tenant e cria o vínculo
      // se ainda não houver. Para admin/operator: mantém comportamento legado
      // (telefone duplicado é conflito).
      if (ctx.producerId) {
        supplier = existing;
      } else {
        throw createError.conflict('Telefone já cadastrado');
      }
    } else {
      supplier = await prisma.supplier.create({
        data: {
          ...data,
          isNetworkSupplier: isNetwork,
          tenantId: supplierTenantId,
        },
      });
    }

    // CO-0-05: vínculo é direto via Supplier.tenantId (1:N). Não há mais auto-link
    // por producer — todos os usuários do tenant compartilham os mesmos fornecedores.

    logger.info('Supplier created', {
      supplierId: supplier.id,
      tenantId: ctx.tenantId,
      producerId: ctx.producerId,
    });

    return supplier;
  }

  /**
   * Atualiza fornecedor. getById já barra produtor de tocar em supplier de
   * outro produtor — então se chegou aqui, pode editar.
   */
  static async update(ctx: AuthContext, id: string, data: UpdateSupplierDTO) {
    const supplier = await this.getById(ctx, id);

    if (data.phone) {
      data.phone = normalizePhoneBR(data.phone);
    }

    if (data.phone) {
      const existing = await prisma.supplier.findFirst({
        where: {
          tenantId: supplier.tenantId,
          phone: data.phone,
          id: { not: id },
        },
      });

      if (existing) {
        throw createError.conflict('Telefone já cadastrado por outro fornecedor');
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data,
    });

    logger.info('Supplier updated', {
      supplierId: id,
      tenantId: ctx.tenantId,
      producerId: ctx.producerId,
    });

    return updated;
  }

  /**
   * Deleta fornecedor.
   * CO-0-05: sem tabela join — deletar é deletar o supplier do tenant.
   * Para preservar histórico de proposals, mantemos hard delete apenas para
   * admin/operator; produtor não pode mais deletar (operação a nível de tenant).
   */
  static async delete(ctx: AuthContext, id: string) {
    if (ctx.producerId) {
      // Producer não pode mais deletar fornecedor sozinho (era um soft unlink).
      // Agora deletar é remover do tenant inteiro — exige role acima de USER.
      throw createError.forbidden(
        'Apenas operador/admin pode remover fornecedor do tenant (CO-0-05).',
      );
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!supplier) {
      throw createError.notFound('Fornecedor não encontrado ou não pode ser deletado');
    }

    await prisma.supplier.delete({
      where: { id },
    });

    logger.info('Supplier deleted', { supplierId: id, tenantId: ctx.tenantId });
  }
}
