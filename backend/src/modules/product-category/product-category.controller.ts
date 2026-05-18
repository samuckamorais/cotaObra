import { Request, Response } from 'express';
import { z } from 'zod';
import { ErrorHandler } from '../../utils/error-handler';
import { ProductCategoryService } from '../../services/product-category.service';

const createSchema = z.object({
  keyword: z.string().min(2),
  category: z.string().min(2),
});

const updateSchema = z.object({
  keyword: z.string().min(2).optional(),
  category: z.string().min(2).optional(),
});

/**
 * FF-BE-011 — Admin CRUD do mapeamento Produto → Categoria.
 * Endpoints autenticados (rota registra middlewares no app.ts).
 */
export class ProductCategoryController {
  static list = ErrorHandler.asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ProductCategoryService.list();
    res.json({ success: true, data });
  });

  static create = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
      return;
    }
    try {
      const created = await ProductCategoryService.create(parsed.data.keyword, parsed.data.category);
      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      // P2002 = unique constraint
      if (err?.code === 'P2002') {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE_KEYWORD', message: 'Keyword já cadastrada.' },
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err?.message || 'Erro ao cadastrar.' },
      });
    }
  });

  static update = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' },
      });
      return;
    }
    try {
      const updated = await ProductCategoryService.update(req.params.id, parsed.data);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err?.message || 'Erro ao atualizar.' },
      });
    }
  });

  static delete = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      await ProductCategoryService.delete(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      if (err?.code === 'P2025') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
        return;
      }
      throw err;
    }
  });
}
