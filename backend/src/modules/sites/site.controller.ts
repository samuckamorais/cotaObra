import { Request, Response } from 'express';
import { z } from 'zod';
import { SiteService } from './site.service';
import { ErrorHandler } from '../../utils/error-handler';
import { getAuthContext } from '../../utils/auth-context';

/**
 * CO-1-02 — Sites controller.
 * Endpoints: GET/POST /api/sites, GET/PATCH/DELETE /api/sites/:id.
 */

// Lista oficial de UFs BR (validação de state)
const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

// CNO: 12 dígitos (Cadastro Nacional de Obra)
const cnoSchema = z
  .string()
  .regex(/^\d{12}$/, 'CNO deve ter exatamente 12 dígitos')
  .optional()
  .or(z.literal(''));

// Phone E.164 (+5511999999999)
const phoneE164 = z
  .string()
  .regex(/^\+\d{10,15}$/, 'Telefone deve estar em formato E.164 (+5511999999999)')
  .optional()
  .or(z.literal(''));

const createSiteSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(120),
  cno: cnoSchema,
  address: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  state: z.enum(BR_STATES),
  zip: z
    .string()
    .regex(/^\d{5}-?\d{3}$/, 'CEP inválido (use 12345-678)')
    .optional()
    .or(z.literal('')),
  region: z.string().min(2).max(100),
  manager: z.string().max(120).optional(),
  managerPhone: phoneE164,
  budget: z.number().min(0).nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
});

const updateSiteSchema = createSiteSchema.partial();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listFiltersSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  q: z.string().optional(),
  city: z.string().optional(),
  state: z.enum(BR_STATES).optional(),
});

export class SiteController {
  /**
   * GET /api/sites?page=1&limit=20&status=ACTIVE&q=aurora
   */
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = listFiltersSchema.parse(req.query);
      const ctx = getAuthContext(req);

      const result = await SiteService.list(ctx, page, limit, filters);
      res.json({ success: true, ...result });
    },
  );

  /**
   * GET /api/sites/:id
   */
  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      const site = await SiteService.getById(ctx, id);
      res.json({ success: true, data: site });
    },
  );

  /**
   * POST /api/sites
   */
  static create = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const data = createSiteSchema.parse(req.body);

      // Normaliza strings vazias para undefined
      const sanitized = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== '' && v !== undefined),
      );

      const site = await SiteService.create(ctx, sanitized as any);
      res.status(201).json({ success: true, data: site });
    },
  );

  /**
   * PATCH /api/sites/:id
   */
  static update = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      const data = updateSiteSchema.parse(req.body);

      const sanitized = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== '' && v !== undefined),
      );

      const site = await SiteService.update(ctx, id, sanitized as any);
      res.json({ success: true, data: site });
    },
  );

  /**
   * DELETE /api/sites/:id (soft delete → status COMPLETED)
   */
  static delete = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const ctx = getAuthContext(req);
      const site = await SiteService.softDelete(ctx, id);
      res.json({
        success: true,
        message: 'Obra arquivada (status COMPLETED)',
        data: site,
      });
    },
  );
}
