import type { Request } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * FEAT-008 (FF-BE-028) — Serviço de auditoria imutável.
 *
 * Toda ação sensível (especialmente em /api/admin/*) gera um AuditLog
 * (RN-07). Sem exceção. Sem delete físico.
 *
 * Risco crítico 1 da spec: senha temp em log estruturado por engano.
 * Mitigação: o `payload` é sanitizado antes de persistir — qualquer chave
 * que CONTÉM "password", "token", "secret", "otp" ou "authorization"
 * (case-insensitive) é mascarada como "[REDACTED]".
 */

export type AuditAction =
  | 'create_user'
  | 'create_user_with_custom_password'
  | 'reset_password'
  | 'deactivate_user'
  | 'reactivate_user'
  | 'deactivate_tenant'
  | 'reactivate_tenant'
  | 'promote_to_super_admin'
  | 'view_tenant_data'
  | 'list_tenants'
  | 'list_users'
  | 'list_audit_log'
  // Permite extensão sem quebrar o tipo (ações futuras de outras features).
  | (string & {});

export interface AuditLogInput {
  /** ID do user que executou a ação (super admin no caso típico). */
  userId: string;
  action: AuditAction;
  /** Tipo do recurso impactado: "Tenant" | "User" | ... */
  targetType?: string;
  targetId?: string;
  /** Tenant impactado pela ação (pode ser != do tenant do ator se cross-tenant). */
  tenantId?: string;
  /** Obrigatório em ações sensíveis (RN-08); validado pelo middleware withReason. */
  reason?: string;
  /** Snapshot do request relevante — sanitizado antes de persistir. */
  payload?: Record<string, unknown> | null;
  /** Request opcional — extrai ip/user-agent. */
  req?: Request;
}

/**
 * Chaves cujo valor deve ser mascarado antes de gravar.
 * Match case-insensitive + parcial: cobre "password", "generatedPassword",
 * "newPassword", "oldPassword", "authToken", "secret_key", etc.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|otp|authorization|api[_-]?key)/i;

const REDACTED = '[REDACTED]';

/**
 * Faz cópia profunda do payload removendo valores de chaves sensíveis.
 * Aceita objetos, arrays e primitivos aninhados. Retorna o mesmo formato.
 */
export function sanitizeAuditPayload(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map(sanitizeAuditPayload);
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = sanitizeAuditPayload(value);
      }
    }
    return out;
  }
  return input;
}

/**
 * Extrai IP do request respeitando trust proxy do Express (X-Forwarded-For).
 * Limita o tamanho do user-agent para evitar payloads gigantes.
 */
function extractRequestMeta(req?: Request): { ip?: string; userAgent?: string } {
  if (!req) return {};
  const ip = (req.ip || req.socket?.remoteAddress || undefined)?.toString();
  const ua = req.headers['user-agent'];
  const userAgent = typeof ua === 'string' ? ua.slice(0, 500) : undefined;
  return { ip, userAgent };
}

export class AuditLogService {
  /**
   * Persiste uma entrada de auditoria. Nunca lança — falha de auditoria
   * NÃO deve quebrar a ação principal. Em caso de erro, loga no logger
   * com nível error (alerta operacional).
   */
  static async log(input: AuditLogInput): Promise<void> {
    try {
      const { ip, userAgent } = extractRequestMeta(input.req);
      const sanitizedPayload =
        input.payload !== undefined && input.payload !== null
          ? (sanitizeAuditPayload(input.payload) as object)
          : undefined;

      await prisma.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          tenantId: input.tenantId,
          reason: input.reason,
          payload: sanitizedPayload as any,
          ip,
          userAgent,
        },
      });
    } catch (err) {
      // Auditoria nunca deve quebrar a operação principal. Mas precisamos
      // sinalizar pro operador — log error + tracking. Em prod isso vira
      // alerta no Sentry/CloudWatch.
      logger.error('Failed to write AuditLog', {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        error: String(err),
      });
    }
  }
}
