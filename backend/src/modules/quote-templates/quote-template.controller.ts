import { Request, Response } from 'express';
import { ErrorHandler, createError } from '../../utils/error-handler';
import { QuoteTemplateService } from './quote-template.service';
import { prisma } from '../../config/database';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  items: z.array(z.any()).min(1, 'Pelo menos um item é obrigatório'),
  region: z.string().optional(),
  freight: z.string().optional(),
  paymentTerms: z.string().optional(),
  supplierScope: z.string().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  items: z.array(z.any()).min(1).optional(),
  region: z.string().optional(),
  freight: z.string().optional(),
  paymentTerms: z.string().optional(),
  supplierScope: z.string().optional(),
});

async function getProducerId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { producerId: true },
  });
  if (!user?.producerId) {
    throw createError.badRequest('Usuário não vinculado a um produtor');
  }
  return user.producerId;
}

export class QuoteTemplateController {
  /**
   * GET /api/quote-templates
   */
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const producerId = await getProducerId(req.userId!);
      const templates = await QuoteTemplateService.list(producerId);

      res.json({ success: true, data: templates });
    }
  );

  /**
   * GET /api/quote-templates/:id
   */
  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const producerId = await getProducerId(req.userId!);
      const template = await QuoteTemplateService.getById(req.params.id, producerId);

      res.json({ success: true, data: template });
    }
  );

  /**
   * POST /api/quote-templates
   */
  static create = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const producerId = await getProducerId(req.userId!);
      const data = createTemplateSchema.parse(req.body);

      const template = await QuoteTemplateService.create({
        producerId,
        ...data,
      });

      res.status(201).json({ success: true, data: template });
    }
  );

  /**
   * PUT /api/quote-templates/:id
   */
  static update = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const producerId = await getProducerId(req.userId!);
      const data = updateTemplateSchema.parse(req.body);

      const template = await QuoteTemplateService.update(req.params.id, producerId, data);

      res.json({ success: true, data: template });
    }
  );

  /**
   * DELETE /api/quote-templates/:id
   */
  static delete = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const producerId = await getProducerId(req.userId!);
      await QuoteTemplateService.delete(req.params.id, producerId);

      res.json({ success: true, message: 'Template removido' });
    }
  );
}
