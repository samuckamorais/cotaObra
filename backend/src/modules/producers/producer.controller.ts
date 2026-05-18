import { Request, Response } from 'express';
import { ProducerService } from './producer.service';
import { ErrorHandler } from '../../utils/error-handler';
import { createProducerSchema, updateProducerSchema, paginationSchema } from '../../utils/validators';
import { getAuthContext } from '../../utils/auth-context';

export class ProducerController {
  /**
   * GET /api/producers
   * Lista produtores conforme papel do user (FF-BE-026).
   */
  static list = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = paginationSchema.parse(req.query);
    const ctx = getAuthContext(req);

    const result = await ProducerService.list(ctx, page, limit);

    res.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/producers/:id
   * Busca produtor por ID respeitando isolamento.
   */
  static getById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const ctx = getAuthContext(req);

    const producer = await ProducerService.getById(ctx, id);

    res.json({
      success: true,
      data: producer,
    });
  });

  /**
   * POST /api/producers
   * Cria novo produtor — auto-link se USER, sem link se ADMIN/SUPER_ADMIN.
   */
  static create = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = createProducerSchema.parse(req.body);
    const ctx = getAuthContext(req);

    const producer = await ProducerService.create(ctx, data);

    res.status(201).json({
      success: true,
      data: producer,
    });
  });

  /**
   * PUT /api/producers/:id
   * Atualiza produtor (autorizado via getById).
   */
  static update = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const data = updateProducerSchema.parse(req.body);
    const ctx = getAuthContext(req);

    const producer = await ProducerService.update(ctx, id, data);

    res.json({
      success: true,
      data: producer,
    });
  });

  /**
   * DELETE /api/producers/:id
   * Deleta produtor (autorizado via getById).
   */
  static delete = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const ctx = getAuthContext(req);

    await ProducerService.delete(ctx, id);

    res.json({
      success: true,
      message: 'Produtor deletado com sucesso',
    });
  });

  /**
   * GET /api/producers/:id/suppliers
   * Lista fornecedores do produtor (USER só vê do próprio).
   */
  static getSuppliers = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const ctx = getAuthContext(req);

    const suppliers = await ProducerService.getSuppliers(ctx, id);

    res.json({
      success: true,
      data: suppliers,
    });
  });

  /**
   * POST /api/producers/:id/suppliers
   * Adiciona fornecedor ao produtor.
   */
  static addSupplier = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { supplierId } = req.body;
    const ctx = getAuthContext(req);

    if (!supplierId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'supplierId é obrigatório' },
      });
      return;
    }

    const supplier = await ProducerService.addSupplier(ctx, id, supplierId);

    res.status(201).json({
      success: true,
      data: supplier,
    });
  });

  /**
   * DELETE /api/producers/:id/suppliers/:supplierId
   * Remove fornecedor do produtor.
   */
  static removeSupplier = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id, supplierId } = req.params;
    const ctx = getAuthContext(req);

    await ProducerService.removeSupplier(ctx, id, supplierId);

    res.json({
      success: true,
      message: 'Fornecedor removido com sucesso',
    });
  });
}
