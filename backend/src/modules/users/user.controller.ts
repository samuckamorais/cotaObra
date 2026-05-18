import { Request, Response } from 'express';
import { UserService } from './user.service';
import { ErrorHandler } from '../../utils/error-handler';
import { paginationSchema } from '../../utils/validators';
import { z } from 'zod';

const permissionSchema = z.object({
  resource: z.enum(['DASHBOARD', 'QUOTES', 'SUPPLIERS', 'PRODUCERS', 'SUBSCRIPTIONS', 'USERS']),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const createUserSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.enum(['ADMIN', 'USER']).optional(),
  producerId: z.string().uuid().optional().nullable(),
  permissions: z.array(permissionSchema).optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

const updateUserSchema = z.object({
  name: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  active: z.boolean().optional(),
  producerId: z.string().uuid().optional().nullable(),
  permissions: z.array(permissionSchema).optional(),
});

export class UserController {
  /**
   * GET /api/users
   */
  static list = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = paginationSchema.parse(req.query);
    const tenantId = (req as any).user?.tenantId;

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const activeParam = req.query.active;
    const active = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined;

    const result = await UserService.list(page, limit, tenantId, { search, role, active });

    res.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/users/:id
   */
  static getById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const user = await UserService.getById(id);

    res.json({
      success: true,
      data: user,
    });
  });

  /**
   * POST /api/users
   */
  static create = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = createUserSchema.parse(req.body);
    const tenantId = (req as any).user?.tenantId;

    const user = await UserService.create(data, tenantId);

    res.status(201).json({
      success: true,
      data: user,
    });
  });

  /**
   * PUT /api/users/:id
   */
  static update = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    const user = await UserService.update(id, data);

    res.json({
      success: true,
      data: user,
    });
  });

  /**
   * DELETE /api/users/:id
   */
  static delete = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    await UserService.delete(id);

    res.json({
      success: true,
      message: 'Usuário deletado com sucesso',
    });
  });

  /**
   * POST /api/users/invite
   * Convida um novo usuário por e-mail
   */
  static invite = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = inviteUserSchema.parse(req.body);
    const tenantId = (req as any).user?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        message: 'Tenant não identificado',
      });
      return;
    }

    const user = await UserService.invite(email, tenantId);

    res.status(201).json({
      success: true,
      data: user,
      message: 'Convite enviado com sucesso',
    });
  });

  /**
   * PATCH /api/users/:id/status
   * Pausa ou reativa um usuário
   */
  static toggleStatus = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const requestingUserId = (req as any).user?.id;

    if (!requestingUserId) {
      res.status(401).json({
        success: false,
        message: 'Usuário não autenticado',
      });
      return;
    }

    const user = await UserService.toggleStatus(id, requestingUserId);

    res.json({
      success: true,
      data: user,
      message: user.active ? 'Usuário reativado com sucesso' : 'Usuário pausado com sucesso',
    });
  });
}
