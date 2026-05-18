import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

/**
 * CO-1-04 — Hook React Query para CRUD de Site (Obra).
 * Espelha o padrão de useSuppliers.ts.
 */

export type SiteStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  cno?: string | null;
  address?: string | null;
  city: string;
  state: string;
  zip?: string | null;
  region: string;
  manager?: string | null;
  managerPhone?: string | null;
  budget?: number | string | null; // Decimal serializa como string
  status: SiteStatus;
  startAt?: string | null;
  endAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteDTO {
  name: string;
  cno?: string;
  address?: string;
  city: string;
  state: string;
  zip?: string;
  region: string;
  manager?: string;
  managerPhone?: string;
  budget?: number | null;
  status?: SiteStatus;
  startAt?: string; // ISO date
  endAt?: string;
}

export type UpdateSiteDTO = Partial<CreateSiteDTO>;

export interface SiteFilters {
  status?: SiteStatus;
  q?: string;
  city?: string;
  state?: string;
}

const cleanParams = (obj: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = String(v);
    }
  });
  return out;
};

export function useSites(page = 1, limit = 20, filters: SiteFilters = {}) {
  return useQuery({
    queryKey: ['sites', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams(
        cleanParams({ page, limit, ...filters }),
      );
      const { data } = await api.get<
        PaginatedResponse<Site> & { success: boolean }
      >(`/sites?${params}`);
      return data;
    },
  });
}

export function useSite(id: string | undefined) {
  return useQuery({
    queryKey: ['site', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: Site }>(
        `/sites/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSiteDTO) => {
      const { data } = await api.post<{ success: boolean; data: Site }>(
        '/sites',
        payload,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSiteDTO }) => {
      const response = await api.patch<{ success: boolean; data: Site }>(
        `/sites/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', variables.id] });
    },
  });
}

/**
 * Soft delete — marca status = COMPLETED, não apaga a linha.
 */
export function useArchiveSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ success: boolean; data: Site }>(
        `/sites/${id}`,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
