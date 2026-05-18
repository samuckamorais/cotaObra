import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

/**
 * CO-1-04 — Hook React Query para CRUD de Material + import CSV.
 */

export interface Material {
  id: string;
  tenantId: string | null;
  sku: string;
  name: string;
  category: string;
  defaultUnit: string;
  spec: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaterialDTO {
  sku: string;
  name: string;
  category: string;
  defaultUnit: string;
  spec?: string;
}

export type UpdateMaterialDTO = Partial<CreateMaterialDTO>;

export interface MaterialFilters {
  q?: string;
  category?: string;
  includeNetwork?: boolean;
}

export interface ImportCsvResult {
  created: number;
  updated: number;
  errors: Array<{ line: number; message: string }>;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;

export function useMaterials(page = 1, limit = 50, filters: MaterialFilters = {}) {
  return useQuery({
    queryKey: ['materials', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams(clean({ page, limit, ...filters }));
      const { data } = await api.get<
        PaginatedResponse<Material> & { success: boolean }
      >(`/materials?${params}`);
      return data;
    },
  });
}

export function useMaterial(id: string | undefined) {
  return useQuery({
    queryKey: ['material', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: Material }>(
        `/materials/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMaterialDTO) => {
      const { data } = await api.post<{ success: boolean; data: Material }>(
        '/materials',
        payload,
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMaterialDTO }) => {
      const response = await api.patch<{ success: boolean; data: Material }>(
        `/materials/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material', vars.id] });
    },
  });
}

export function useDeactivateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/materials/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });
}

export function useImportMaterialsCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ success: boolean; data: ImportCsvResult }>(
        '/materials/import-csv',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });
}
