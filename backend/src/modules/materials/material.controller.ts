import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { MaterialService } from './material.service';
import { ErrorHandler, createError } from '../../utils/error-handler';
import { getAuthContext } from '../../utils/auth-context';

const createMaterialSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  category: z.string().min(2).max(50),
  defaultUnit: z.string().min(1).max(20),
  spec: z.string().max(500).optional(),
});

const updateMaterialSchema = createMaterialSchema.partial();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const listFiltersSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  includeNetwork: z.coerce.boolean().optional(),
});

/**
 * Multer em memória — CSVs no máx 1MB.
 * Exposto no controller para ser usado no app.ts via `materialUpload.single('file')`.
 */
export const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV são aceitos'));
    }
  },
});

export class MaterialController {
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = listFiltersSchema.parse(req.query);
      const ctx = getAuthContext(req);

      const result = await MaterialService.list(ctx, page, limit, filters);
      res.json({ success: true, ...result });
    },
  );

  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      const material = await MaterialService.getById(ctx, id);
      res.json({ success: true, data: material });
    },
  );

  static create = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const data = createMaterialSchema.parse(req.body);
      const material = await MaterialService.create(ctx, data);
      res.status(201).json({ success: true, data: material });
    },
  );

  static update = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      const data = updateMaterialSchema.parse(req.body);
      const material = await MaterialService.update(ctx, id, data);
      res.json({ success: true, data: material });
    },
  );

  static delete = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      await MaterialService.softDelete(ctx, id);
      res.json({ success: true, message: 'Material desativado' });
    },
  );

  /**
   * POST /api/materials/import-csv (multipart/form-data, file=CSV)
   */
  static importCsv = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;

      if (!file) {
        throw createError.badRequest('Envie o CSV no campo "file" (multipart/form-data)');
      }

      const csvText = file.buffer.toString('utf-8');
      const result = await MaterialService.importCsv(ctx, csvText);

      const statusCode = result.errors.length > 0 ? 207 : 200;
      res.status(statusCode).json({ success: true, data: result });
    },
  );
}
