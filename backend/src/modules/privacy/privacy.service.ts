import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';

type EntityType = 'producer' | 'supplier';

export class PrivacyService {
  /**
   * Exporta todos os dados de um produtor ou fornecedor (direito de portabilidade LGPD)
   */
  static async exportData(entityId: string, entityType: EntityType) {
    if (entityType === 'producer') {
      // CO-0-04/05: settings agora vivem em TenantSettings; ProducerSupplier removido.
      // Carregamos as suppliers do mesmo tenant + settings do tenant via consultas extras.
      const producer = await prisma.producer.findUnique({
        where: { id: entityId },
        include: {
          quotes: {
            include: {
              items: true,
              proposals: {
                include: { items: true },
              },
            },
          },
          subscription: true,
        },
      });

      if (!producer) {
        throw createError.notFound('Produtor nao encontrado');
      }

      logger.info('LGPD data export requested', {
        entityId,
        entityType,
      });

      return {
        entityType: 'producer',
        exportedAt: new Date().toISOString(),
        data: producer,
      };
    }

    if (entityType === 'supplier') {
      // CO-0-05: campo `producers` removido. Supplier agora pertence direto ao tenant.
      const supplier = await prisma.supplier.findUnique({
        where: { id: entityId },
        include: {
          proposals: {
            include: { items: true },
          },
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (!supplier) {
        throw createError.notFound('Fornecedor nao encontrado');
      }

      logger.info('LGPD data export requested', {
        entityId,
        entityType,
      });

      return {
        entityType: 'supplier',
        exportedAt: new Date().toISOString(),
        data: supplier,
      };
    }

    throw createError.badRequest('Tipo de entidade invalido. Use "producer" ou "supplier".');
  }

  /**
   * Anonimiza PII de um produtor ou fornecedor (direito ao esquecimento LGPD)
   * Mantém registros agregados para estatísticas, mas remove dados pessoais.
   */
  static async forgetData(entityId: string, entityType: EntityType) {
    const hash = (value: string) =>
      crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);

    if (entityType === 'producer') {
      const producer = await prisma.producer.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, phone: true, cpfCnpj: true },
      });

      if (!producer) {
        throw createError.notFound('Produtor nao encontrado');
      }

      await prisma.producer.update({
        where: { id: entityId },
        data: {
          name: `ANON_${hash(producer.name)}`,
          phone: `+0000000${hash(producer.phone)}`,
          cpfCnpj: hash(producer.cpfCnpj),
          stateRegistration: null,
          farm: null,
          lastQuotePreferences: Prisma.JsonNull,
          preferences: Prisma.JsonNull,
          cpfCnpjHash: null,
          cpfCnpjEncrypted: null,
        },
      });

      // Desativar usuário vinculado, se existir
      await prisma.user.updateMany({
        where: { producerId: entityId },
        data: { active: false },
      });

      logger.info('LGPD data anonymized', {
        entityId,
        entityType,
        action: 'FORGET_DATA',
      });

      return { success: true, message: 'Dados do produtor anonimizados com sucesso' };
    }

    if (entityType === 'supplier') {
      const supplier = await prisma.supplier.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, phone: true },
      });

      if (!supplier) {
        throw createError.notFound('Fornecedor nao encontrado');
      }

      await prisma.supplier.update({
        where: { id: entityId },
        data: {
          name: `ANON_${hash(supplier.name)}`,
          phone: `+0000000${hash(supplier.phone)}`,
          company: null,
          email: null,
          cpfCnpjHash: null,
          cpfCnpjEncrypted: null,
        },
      });

      logger.info('LGPD data anonymized', {
        entityId,
        entityType,
        action: 'FORGET_DATA',
      });

      return { success: true, message: 'Dados do fornecedor anonimizados com sucesso' };
    }

    throw createError.badRequest('Tipo de entidade invalido. Use "producer" ou "supplier".');
  }
}
