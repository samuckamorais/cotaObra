/**
 * FEAT-008 (FF-BE-029 + FF-BE-030) — Admin Controller (rotas /api/admin/*).
 *
 * Todas as rotas requerem SUPER_ADMIN (montadas com requireSuperAdmin
 * em app.ts). Ações sensíveis usam withReason(). O service grava
 * AuditLog dentro da operação.
 */
import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { ErrorHandler } from '../../utils/error-handler';
import { AdminService } from './admin.service';
import { AuditLogService } from '../../services/audit-log.service';

// ───────────────────────────────────────────────────────────────────────
// Schemas Zod (validação de input antes do service)
// ───────────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  name: z.string().min(1, 'Nome obrigatório').max(120),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']),
  tenantName: z.string().min(1).max(120).optional(),
  tenantId: z.string().uuid().optional(),
  password: z.string().optional(),
  reason: z.string().min(10, 'Motivo obrigatório (mínimo 10 caracteres)'),
});

const resetPasswordSchema = z.object({
  password: z.string().optional(),
  reason: z.string().min(10, 'Motivo obrigatório (mínimo 10 caracteres)'),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const listTenantsSchema = paginationSchema.extend({
  search: z.string().optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const listUsersSchema = paginationSchema.extend({
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  tenantId: z.string().uuid().optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const listAuditLogSchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

// ───────────────────────────────────────────────────────────────────────
// Controller
// ───────────────────────────────────────────────────────────────────────

export class AdminController {
  // ============================================================
  // Users
  // ============================================================

  /** POST /api/admin/users — cadastro direto (senha gerada OU custom) */
  static createUser = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = createUserSchema.parse(req.body);
      const actor = req.user!;

      const result = await AdminService.createUser({
        email: data.email,
        name: data.name,
        role: data.role,
        tenantName: data.tenantName,
        tenantId: data.tenantId,
        password: data.password,
        reason: data.reason,
        actorUserId: actor.id,
        req,
      });

      res.status(201).json({
        success: true,
        ...result,
      });
    },
  );

  /** POST /api/admin/users/:id/reset-password */
  static resetPassword = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = resetPasswordSchema.parse(req.body);
      const actor = req.user!;

      const result = await AdminService.resetPassword({
        targetUserId: req.params.id,
        password: data.password,
        reason: data.reason,
        actorUserId: actor.id,
        req,
      });

      res.json({
        success: true,
        ...result,
      });
    },
  );

  /** POST /api/admin/users/:id/deactivate */
  static deactivateUser = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const actor = req.user!;
      await AdminService.setUserActive(
        actor.id,
        req.params.id,
        false,
        req.body.reason,
        req,
      );
      res.json({ success: true });
    },
  );

  /** POST /api/admin/users/:id/reactivate */
  static reactivateUser = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const actor = req.user!;
      await AdminService.setUserActive(
        actor.id,
        req.params.id,
        true,
        req.body.reason,
        req,
      );
      res.json({ success: true });
    },
  );

  /** GET /api/admin/users — busca cross-tenant */
  static listUsers = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const params = listUsersSchema.parse(req.query);
      const actor = req.user!;

      const result = await AdminService.listUsers(params);

      // Auditoria leve (não-bloqueante): super admin viu cross-tenant
      AuditLogService.log({
        userId: actor.id,
        action: 'list_users',
        payload: { filters: params, count: result.data.length },
        req,
      });

      res.json({ success: true, ...result });
    },
  );

  // ============================================================
  // Tenants
  // ============================================================

  /** GET /api/admin/tenants */
  static listTenants = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const params = listTenantsSchema.parse(req.query);
      const actor = req.user!;

      const result = await AdminService.listTenants(params);

      AuditLogService.log({
        userId: actor.id,
        action: 'list_tenants',
        payload: { filters: params, count: result.data.length },
        req,
      });

      res.json({ success: true, ...result });
    },
  );

  /** GET /api/admin/tenants/:id */
  static getTenantDetail = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const actor = req.user!;
      const tenant = await AdminService.getTenantDetail(req.params.id);

      AuditLogService.log({
        userId: actor.id,
        action: 'view_tenant_data',
        targetType: 'Tenant',
        targetId: tenant.id,
        tenantId: tenant.id,
        req,
      });

      res.json({ success: true, data: tenant });
    },
  );

  /** POST /api/admin/tenants/:id/deactivate */
  static deactivateTenant = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const actor = req.user!;
      await AdminService.setTenantActive(
        actor.id,
        req.params.id,
        false,
        req.body.reason,
        req,
      );
      res.json({ success: true });
    },
  );

  /** POST /api/admin/tenants/:id/reactivate */
  static reactivateTenant = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const actor = req.user!;
      await AdminService.setTenantActive(
        actor.id,
        req.params.id,
        true,
        req.body.reason,
        req,
      );
      res.json({ success: true });
    },
  );

  // ============================================================
  // Audit Log
  // ============================================================

  /** GET /api/admin/audit-log */
  static listAuditLog = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const params = listAuditLogSchema.parse(req.query);
      const actor = req.user!;

      const result = await AdminService.listAuditLog(params);

      // Não-bloqueante: registrar acesso ao próprio log também
      AuditLogService.log({
        userId: actor.id,
        action: 'list_audit_log',
        payload: { filters: params, count: result.data.length },
        req,
      });

      res.json({ success: true, ...result });
    },
  );
}
