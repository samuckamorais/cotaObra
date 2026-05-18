import { prisma } from '../../config/database';
import { CreateProducerDTO, UpdateProducerDTO, PaginatedResponse } from '../../types';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { normalizePhoneBR } from '../../utils/phone';
import type { AuthContext } from '../../utils/auth-context';

/**
 * FF-BE-026 — Modelo 1:1 USER ↔ Producer + isolamento de acesso.
 *
 *  - USER (producerId=null): cria producer + auto-link em transação.
 *  - USER (producerId já preenchido): 409, regra 1:1.
 *  - ADMIN/SUPER_ADMIN: cria sem auto-link (cadastra para terceiros).
 *  - list/getById/update/delete/getSuppliers/addSupplier/removeSupplier:
 *    USER vê só o próprio producer, ADMIN vê todos do tenant,
 *    SUPER_ADMIN vê cross-tenant.
 */
export class ProducerService {
  /**
   * Lista produtores conforme papel do user.
   */
  static async list(ctx: AuthContext, page = 1, limit = 10): Promise<PaginatedResponse<any>> {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (ctx.role === 'USER') {
      if (!ctx.producerId) {
        // USER ainda não criou producer → lista vazia (não é erro)
        return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
      }
      where.id = ctx.producerId;
      where.tenantId = ctx.tenantId;
    } else if (ctx.role !== 'SUPER_ADMIN') {
      // ADMIN
      where.tenantId = ctx.tenantId;
    }
    // SUPER_ADMIN: sem filtro de tenant (cross-tenant)

    const [producers, total] = await Promise.all([
      prisma.producer.findMany({
        where,
        skip,
        take: limit,
        include: {
          subscription: true,
          _count: {
            select: {
              // CO-0-05: campo `suppliers` removido do Producer; suppliers são por tenant.
              quotes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.producer.count({ where }),
    ]);

    return {
      data: producers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca produtor por ID respeitando isolamento por papel.
   * Retorna 404 (não 403) para producer alheio — não vazar existência.
   */
  static async getById(ctx: AuthContext, id: string) {
    if (ctx.role === 'USER') {
      if (!ctx.producerId || ctx.producerId !== id) {
        logger.warn('producer_isolation_violation_attempted', {
          userId: ctx.userId,
          requestedProducerId: id,
          actualProducerId: ctx.producerId,
        });
        throw createError.notFound('Produtor não encontrado');
      }
    }

    const where: any = { id };
    if (ctx.role !== 'SUPER_ADMIN') {
      where.tenantId = ctx.tenantId;
    }

    // CO-0-05: relação `suppliers` (ProducerSupplier[]) removida.
    // Os fornecedores do produtor agora são todos os do mesmo tenant.
    const producer = await prisma.producer.findFirst({
      where,
      include: {
        subscription: true,
        quotes: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { proposals: true },
            },
          },
        },
      },
    });

    if (!producer) {
      throw createError.notFound('Produtor não encontrado');
    }

    return producer;
  }

  /**
   * Cria novo produtor.
   *  - USER (producerId=null): auto-link em transação + FSMEvent.
   *  - USER (producerId já existe): 409 (regra 1:1).
   *  - ADMIN/SUPER_ADMIN: cria sem auto-link.
   */
  static async create(ctx: AuthContext, data: CreateProducerDTO) {
    // Regra 1:1 para USER — não pode criar 2º producer
    if (ctx.role === 'USER' && ctx.producerId !== null) {
      logger.warn('producer_create_blocked_already_linked', {
        userId: ctx.userId,
        existingProducerId: ctx.producerId,
      });
      throw createError.conflict(
        'Você já tem um producer cadastrado. Não é permitido criar outro.',
      );
    }

    // Normalizar telefone para formato canônico +55DDXXXXXXXXX
    data.phone = normalizePhoneBR(data.phone);

    // SUPER_ADMIN pode criar em outro tenant via data.tenantId; demais usam ctx.tenantId
    const targetTenantId =
      ctx.role === 'SUPER_ADMIN' && (data as any).tenantId
        ? (data as any).tenantId
        : ctx.tenantId;

    // Verificar duplicidade NO TENANT alvo
    const existingPhone = await prisma.producer.findFirst({
      where: { tenantId: targetTenantId, phone: data.phone },
    });
    if (existingPhone) {
      throw createError.conflict('Telefone já cadastrado');
    }

    const existingCpfCnpj = await prisma.producer.findFirst({
      where: { tenantId: targetTenantId, cpfCnpj: data.cpfCnpj },
    });
    if (existingCpfCnpj) {
      throw createError.conflict('CPF/CNPJ já cadastrado');
    }

    const shouldAutoLink = ctx.role === 'USER' && ctx.producerId === null;

    const result = await prisma.$transaction(async (tx) => {
      const producer = await tx.producer.create({
        data: {
          tenantId: targetTenantId,
          name: data.name,
          cpfCnpj: data.cpfCnpj,
          stateRegistration: data.stateRegistration,
          farm: data.farm,
          city: data.city,
          phone: data.phone,
          region: data.region,
          conversationState: {
            create: {
              tenantId: targetTenantId,
              step: 'IDLE',
              context: {},
            },
          },
        },
        include: {
          conversationState: true,
        },
      });

      if (shouldAutoLink) {
        await tx.user.update({
          where: { id: ctx.userId },
          data: { producerId: producer.id },
        });
        await tx.fSMEvent.create({
          data: {
            producerId: producer.id,
            eventType: 'producer_auto_linked_to_user',
            payload: {
              userId: ctx.userId,
              tenantId: targetTenantId,
            },
          },
        });
      }

      return producer;
    });

    logger.info('Producer created', {
      producerId: result.id,
      tenantId: targetTenantId,
      creatorRole: ctx.role,
      autoLinked: shouldAutoLink,
    });

    return result;
  }

  /**
   * Atualiza produtor (após autorização via getById).
   */
  static async update(ctx: AuthContext, id: string, data: UpdateProducerDTO) {
    // Autorização via getById (lança 404 se USER não for dono)
    await this.getById(ctx, id);

    // Tenant alvo do producer (para checks de duplicidade)
    const targetTenantId = ctx.role === 'SUPER_ADMIN' ? undefined : ctx.tenantId;

    if (data.phone) {
      data.phone = normalizePhoneBR(data.phone);

      const existing = await prisma.producer.findFirst({
        where: {
          ...(targetTenantId ? { tenantId: targetTenantId } : {}),
          phone: data.phone,
          id: { not: id },
        },
      });

      if (existing) {
        throw createError.conflict('Telefone já cadastrado por outro produtor');
      }
    }

    if (data.cpfCnpj) {
      const existing = await prisma.producer.findFirst({
        where: {
          ...(targetTenantId ? { tenantId: targetTenantId } : {}),
          cpfCnpj: data.cpfCnpj,
          id: { not: id },
        },
      });

      if (existing) {
        throw createError.conflict('CPF/CNPJ já cadastrado por outro produtor');
      }
    }

    const producer = await prisma.producer.update({
      where: { id },
      data,
      include: {
        subscription: true,
      },
    });

    logger.info('Producer updated', {
      producerId: id,
      tenantId: producer.tenantId,
      actorRole: ctx.role,
    });

    return producer;
  }

  /**
   * Deleta produtor (após autorização via getById).
   */
  static async delete(ctx: AuthContext, id: string) {
    await this.getById(ctx, id);

    await prisma.producer.delete({
      where: { id },
    });

    logger.info('Producer deleted', {
      producerId: id,
      tenantId: ctx.tenantId,
      actorRole: ctx.role,
    });
  }

  /**
   * Lista fornecedores do produtor (mesmo isolamento via getById).
   */
  static async getSuppliers(ctx: AuthContext, producerId: string) {
    await this.getById(ctx, producerId);

    // CO-0-05: fornecedores são por tenant agora. "Suppliers de um producer" =
    // suppliers do tenant do producer.
    const producer = await prisma.producer.findUnique({
      where: { id: producerId },
      select: { tenantId: true },
    });
    if (!producer) {
      throw createError.notFound('Produtor não encontrado');
    }

    const where: any = { tenantId: producer.tenantId };
    if (ctx.role !== 'SUPER_ADMIN' && producer.tenantId !== ctx.tenantId) {
      // tenant mismatch — esconde
      return [];
    }

    return prisma.supplier.findMany({ where });
  }

  /**
   * Adiciona fornecedor ao tenant do produtor.
   * CO-0-05: sem tabela join — vínculo é o próprio Supplier.tenantId.
   */
  static async addSupplier(ctx: AuthContext, producerId: string, supplierId: string) {
    await this.getById(ctx, producerId);

    const targetTenantId =
      ctx.role === 'SUPER_ADMIN'
        ? (
            await prisma.producer.findUnique({
              where: { id: producerId },
              select: { tenantId: true },
            })
          )?.tenantId
        : ctx.tenantId;

    if (!targetTenantId) {
      throw createError.notFound('Produtor não encontrado');
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw createError.notFound('Fornecedor não encontrado');
    }

    // Já no tenant?
    if (supplier.tenantId === targetTenantId) {
      throw createError.conflict('Fornecedor já pertence a esta construtora');
    }

    // Se for da rede (tenantId=null), claim para o tenant. Outros tenants → bloqueia.
    if (supplier.tenantId !== null) {
      throw createError.forbidden(
        'Fornecedor pertence a outra construtora; não é possível anexar',
      );
    }

    const updated = await prisma.supplier.update({
      where: { id: supplierId },
      data: { tenantId: targetTenantId, isNetworkSupplier: false },
    });

    logger.info('Supplier claimed by tenant', {
      producerId,
      supplierId,
      tenantId: targetTenantId,
      actorRole: ctx.role,
    });

    return updated;
  }

  /**
   * Remove fornecedor do tenant do produtor.
   * CO-0-05: "remover vínculo" = devolver o supplier para a rede (tenantId=null)
   * ou apagá-lo se isNetworkSupplier=false. Por segurança, escolhemos devolver.
   */
  static async removeSupplier(ctx: AuthContext, producerId: string, supplierId: string) {
    await this.getById(ctx, producerId);

    const targetTenantId =
      ctx.role === 'SUPER_ADMIN'
        ? (
            await prisma.producer.findUnique({
              where: { id: producerId },
              select: { tenantId: true },
            })
          )?.tenantId
        : ctx.tenantId;

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: targetTenantId },
    });

    if (!supplier) {
      throw createError.notFound('Vínculo não encontrado');
    }

    // Soft-remove: tenantId=null devolve para rede. Mantém histórico de proposals.
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { tenantId: null },
    });

    logger.info('Supplier released from tenant', {
      producerId,
      supplierId,
      tenantId: targetTenantId,
      actorRole: ctx.role,
    });
  }
}
