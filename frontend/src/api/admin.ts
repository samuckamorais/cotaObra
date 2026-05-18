/**
 * FEAT-008 (FF-FE-001) — Cliente do módulo /api/admin/* (rotas só para SUPER_ADMIN).
 *
 * Todas as funções retornam dados já desempacotados (sem o envelope
 * `{ success, data: ... }`). Erros do backend são propagados como
 * `AxiosError` — quem chama lida com try/catch e mostra mensagem.
 */
import { api, PaginatedResponse } from './client';
import type { UserRole } from '../contexts/AuthContext';

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface AdminTenantRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  _count: {
    users: number;
    producers: number;
    suppliers: number;
    quotes: number;
  };
}

export interface AdminTenantDetail extends Omit<AdminTenantRow, '_count'> {
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: UserRole;
    active: boolean;
    mustChangePassword: boolean;
    createdAt: string;
  }>;
  stats: {
    users: number;
    producers: number;
    suppliers: number;
    quotesTotal: number;
    proposalsTotal: number;
    quotesLast30d: number;
    proposalsLast30d: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenant: { id: string; name: string; slug: string; active: boolean } | null;
  producerId: string | null;
  active: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  createdAt: string;
}

export interface AdminAuditLogRow {
  id: string;
  userId: string;
  user: { id: string; email: string; name: string; role: UserRole };
  action: string;
  targetType: string | null;
  targetId: string | null;
  tenantId: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  role: UserRole;
  tenantName?: string;
  tenantId?: string;
  /** Quando ausente, sistema gera senha aleatória. */
  password?: string;
  reason: string;
}

export interface CreateUserResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string | null;
    active: boolean;
    mustChangePassword: boolean;
  };
  tenant: { id: string; name: string; slug: string } | null;
  generatedPassword: string;
  passwordMode: 'generated' | 'custom';
}

// ───────────────────────────────────────────────────────────────────────
// Tenants
// ───────────────────────────────────────────────────────────────────────

export async function listTenants(params: {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
}): Promise<PaginatedResponse<AdminTenantRow>> {
  const response = await api.get('/admin/tenants', { params });
  return { data: response.data.data, pagination: response.data.pagination };
}

export async function getTenantDetail(id: string): Promise<AdminTenantDetail> {
  const response = await api.get(`/admin/tenants/${id}`);
  return response.data.data;
}

export async function deactivateTenant(id: string, reason: string): Promise<void> {
  await api.post(`/admin/tenants/${id}/deactivate`, { reason });
}

export async function reactivateTenant(id: string, reason: string): Promise<void> {
  await api.post(`/admin/tenants/${id}/reactivate`, { reason });
}

// ───────────────────────────────────────────────────────────────────────
// Users
// ───────────────────────────────────────────────────────────────────────

export async function listUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  tenantId?: string;
  active?: boolean;
}): Promise<PaginatedResponse<AdminUserRow>> {
  const response = await api.get('/admin/users', { params });
  return { data: response.data.data, pagination: response.data.pagination };
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  const response = await api.post('/admin/users', payload);
  return response.data;
}

export async function resetUserPassword(
  userId: string,
  reason: string,
  password?: string,
): Promise<{ generatedPassword: string; passwordMode: 'generated' | 'custom' }> {
  const response = await api.post(`/admin/users/${userId}/reset-password`, { reason, password });
  return response.data;
}

export async function deactivateUser(userId: string, reason: string): Promise<void> {
  await api.post(`/admin/users/${userId}/deactivate`, { reason });
}

export async function reactivateUser(userId: string, reason: string): Promise<void> {
  await api.post(`/admin/users/${userId}/reactivate`, { reason });
}

// ───────────────────────────────────────────────────────────────────────
// Audit Log
// ───────────────────────────────────────────────────────────────────────

export async function listAuditLog(params: {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<PaginatedResponse<AdminAuditLogRow>> {
  const response = await api.get('/admin/audit-log', { params });
  return { data: response.data.data, pagination: response.data.pagination };
}

// ───────────────────────────────────────────────────────────────────────
// 2FA TOTP setup (não exclusivo de SUPER_ADMIN — todo user autenticado pode)
// ───────────────────────────────────────────────────────────────────────

export async function startTotpSetup(): Promise<{ secret: string; otpauthUrl: string }> {
  const response = await api.post('/auth/2fa/setup-start');
  return response.data.data;
}

export async function confirmTotpSetup(
  secret: string,
  otp: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await api.post('/auth/2fa/setup-confirm', { secret, otp });
  return response.data;
}

export async function disableTotp(otp: string): Promise<void> {
  await api.post('/auth/2fa/disable', { otp });
}
