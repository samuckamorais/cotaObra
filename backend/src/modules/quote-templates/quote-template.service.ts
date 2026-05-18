import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';

interface CreateTemplateDTO {
  producerId: string;
  name: string;
  items: unknown;
  region?: string;
  freight?: string;
  paymentTerms?: string;
  supplierScope?: string;
}

interface UpdateTemplateDTO {
  name?: string;
  items?: unknown;
  region?: string;
  freight?: string;
  paymentTerms?: string;
  supplierScope?: string;
}

export class QuoteTemplateService {
  static async list(producerId: string) {
    return prisma.quoteTemplate.findMany({
      where: { producerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getById(id: string, producerId: string) {
    const template = await prisma.quoteTemplate.findUnique({ where: { id } });
    if (!template || template.producerId !== producerId) {
      throw createError.notFound('Template não encontrado');
    }
    return template;
  }

  static async create(data: CreateTemplateDTO) {
    return prisma.quoteTemplate.create({
      data: {
        producerId: data.producerId,
        name: data.name,
        items: data.items as any,
        region: data.region,
        freight: data.freight,
        paymentTerms: data.paymentTerms,
        supplierScope: data.supplierScope || 'ALL',
      },
    });
  }

  static async update(id: string, producerId: string, data: UpdateTemplateDTO) {
    const template = await prisma.quoteTemplate.findUnique({ where: { id } });
    if (!template || template.producerId !== producerId) {
      throw createError.notFound('Template não encontrado');
    }

    return prisma.quoteTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.items !== undefined && { items: data.items as any }),
        ...(data.region !== undefined && { region: data.region }),
        ...(data.freight !== undefined && { freight: data.freight }),
        ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
        ...(data.supplierScope !== undefined && { supplierScope: data.supplierScope }),
      },
    });
  }

  static async delete(id: string, producerId: string) {
    const template = await prisma.quoteTemplate.findUnique({ where: { id } });
    if (!template || template.producerId !== producerId) {
      throw createError.notFound('Template não encontrado');
    }

    await prisma.quoteTemplate.delete({ where: { id } });
  }
}
