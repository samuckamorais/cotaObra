import crypto from 'crypto';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { PaginatedResponse } from '../../types';
import { Prisma } from '@prisma/client';

interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  role?: 'ADMIN' | 'USER';
  producerId?: string | null;
  permissions?: Array<{
    resource: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
}

interface UpdateUserDTO {
  name?: string;
  email?: string;
  password?: string;
  role?: 'ADMIN' | 'USER';
  active?: boolean;
  producerId?: string | null;
  permissions?: Array<{
    resource: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
}

interface ListUsersOptions {
  search?: string;
  role?: string;
  active?: boolean;
}

const userSelectFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  producerId: true,
  producer: { select: { id: true, name: true, city: true } },
  permissions: true,
} as const;

export class UserService {
  /**
   * Lista usuários com paginação e filtros
   */
  static async list(
    page = 1,
    limit = 10,
    tenantId?: string,
    options?: ListUsersOptions,
  ): Promise<PaginatedResponse<Prisma.UserGetPayload<{ select: typeof userSelectFields }>>> {
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    // Filtro de busca por nome ou email (case-insensitive)
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    // Filtro por role
    if (options?.role) {
      where.role = options.role as Prisma.EnumUserRoleFilter;
    }

    // Filtro por status ativo/inativo
    if (options?.active !== undefined) {
      where.active = options.active;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: userSelectFields,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca usuário por ID
   */
  static async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        producerId: true,
        producer: { select: { id: true, name: true, city: true } },
        permissions: true,
      },
    });

    if (!user) {
      throw createError.notFound('Usuário não encontrado');
    }

    return user;
  }

  /**
   * Cria novo usuário
   */
  static async create(data: CreateUserDTO, tenantId?: string) {
    // Verificar se email já existe
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      throw createError.conflict('E-mail já cadastrado');
    }

    // Validar producer se informado
    if (data.producerId) {
      // Verificar se producer existe
      const producer = await prisma.producer.findUnique({
        where: { id: data.producerId },
        select: { id: true },
      });
      if (!producer) {
        throw createError.notFound('Produtor não encontrado');
      }

      // Verificar se producer já está vinculado a outro user
      const alreadyLinked = await prisma.user.findUnique({
        where: { producerId: data.producerId },
        select: { id: true },
      });
      if (alreadyLinked) {
        throw createError.conflict('Este produtor já está vinculado a outro usuário');
      }
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        password: hashedPassword,
        role: data.role || 'USER',
        tenantId: tenantId || null,
        producerId: data.producerId || null,
        permissions: data.permissions
          ? {
              create: data.permissions.map((p) => ({
                resource: p.resource as any,
                canView: p.canView,
                canCreate: p.canCreate,
                canEdit: p.canEdit,
                canDelete: p.canDelete,
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        producerId: true,
        producer: { select: { id: true, name: true, city: true } },
        permissions: true,
      },
    });

    logger.info('User created', { userId: user.id });

    return user;
  }

  /**
   * Atualiza usuário
   */
  static async update(id: string, data: UpdateUserDTO) {
    // Verificar se usuário existe
    await this.getById(id);

    // Se mudou email, verificar se novo email está disponível
    if (data.email) {
      const existing = await prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          id: { not: id },
        },
      });

      if (existing) {
        throw createError.conflict('E-mail já cadastrado por outro usuário');
      }
    }

    // Validar producer se informado
    if (data.producerId) {
      const producer = await prisma.producer.findUnique({
        where: { id: data.producerId },
        select: { id: true },
      });
      if (!producer) {
        throw createError.notFound('Produtor não encontrado');
      }

      // Verificar se producer já está vinculado a outro user (ignorar o próprio)
      const alreadyLinked = await prisma.user.findFirst({
        where: { producerId: data.producerId, id: { not: id } },
        select: { id: true },
      });
      if (alreadyLinked) {
        throw createError.conflict('Este produtor já está vinculado a outro usuário');
      }
    }

    // Preparar dados para atualização
    const updateData: Prisma.UserUpdateInput = {
      name: data.name,
      email: data.email?.toLowerCase(),
      role: data.role,
      active: data.active,
      producer: data.producerId !== undefined
        ? (data.producerId ? { connect: { id: data.producerId } } : { disconnect: true })
        : undefined,
    };

    // Se forneceu nova senha, fazer hash
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Atualizar usuário
    await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        updatedAt: true,
        producerId: true,
        producer: { select: { id: true, name: true, city: true } },
        permissions: true,
      },
    });

    // Atualizar permissões se fornecidas
    if (data.permissions) {
      // Deletar permissões antigas
      await prisma.permission.deleteMany({
        where: { userId: id },
      });

      // Criar novas permissões
      await prisma.permission.createMany({
        data: data.permissions.map((p) => ({
          userId: id,
          resource: p.resource as any,
          canView: p.canView,
          canCreate: p.canCreate,
          canEdit: p.canEdit,
          canDelete: p.canDelete,
        })),
      });
    }

    logger.info('User updated', { userId: id });

    return await this.getById(id);
  }

  /**
   * Deleta usuário
   */
  static async delete(id: string) {
    await this.getById(id);

    await prisma.user.delete({
      where: { id },
    });

    logger.info('User deleted', { userId: id });
  }

  /**
   * Pausa ou reativa usuário
   */
  static async toggleStatus(userId: string, requestingUserId: string) {
    // 1. Verificar se usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true, role: true, tenantId: true },
    });

    if (!user) {
      throw createError.notFound('Usuário não encontrado');
    }

    // 2. Validação: Impedir auto-desativação
    if (userId === requestingUserId) {
      throw createError.forbidden('Você não pode desativar sua própria conta');
    }

    // 3. Validação: Impedir desativação do último admin ativo do tenant
    if (user.active && user.role === 'ADMIN') {
      const activeAdminsCount = await prisma.user.count({
        where: {
          tenantId: user.tenantId,
          role: 'ADMIN',
          active: true,
        },
      });

      if (activeAdminsCount <= 1) {
        throw createError.forbidden(
          'Não é possível desativar o último administrador ativo'
        );
      }
    }

    // 4. Alternar status
    const newStatus = !user.active;
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { active: newStatus },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        updatedAt: true,
        permissions: true,
      },
    });

    // Audit log
    logger.info('User status toggled', {
      action: 'USER_STATUS_TOGGLE',
      requestingUserId,
      targetUserId: userId,
      previousStatus: user.active,
      newStatus,
    });

    return updatedUser;
  }

  /**
   * Convida um novo usuário por e-mail (cria com senha temporária)
   */
  static async invite(email: string, tenantId: string) {
    // Verificar se email já existe
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw createError.conflict('E-mail já cadastrado');
    }

    // Gerar senha temporária
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: email.split('@')[0],
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'USER',
        tenantId,
      },
      select: userSelectFields,
    });

    // TODO: Enviar e-mail de convite com link de redefinição de senha
    logger.info('User invited', {
      userId: user.id,
      email: user.email,
      tenantId,
      tempPassword, // Temporário — remover quando e-mail estiver implementado
    });

    return user;
  }
}
