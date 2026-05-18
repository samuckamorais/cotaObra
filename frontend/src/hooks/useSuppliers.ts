import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

interface Supplier {
  id: string;
  name: string;
  phone: string;
  company?: string;
  email?: string;
  regions: string[];
  categories: string[];
  isNetworkSupplier: boolean;
  createdAt: string;
  _count?: {
    producers: number;
    proposals: number;
  };
}

interface CreateSupplierDTO {
  name: string;
  phone: string;
  company?: string;
  email?: string;
  regions: string[];
  categories: string[];
  isNetworkSupplier?: boolean;
}

interface UpdateSupplierDTO {
  name?: string;
  phone?: string;
  company?: string;
  email?: string;
  regions?: string[];
  categories?: string[];
  isNetworkSupplier?: boolean;
}

export function useSuppliers(page = 1, limit = 10, filters?: any) {
  return useQuery({
    queryKey: ['suppliers', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...filters,
      });
      const { data } = await api.get<PaginatedResponse<Supplier> & { success: boolean }>(
        `/suppliers?${params}`
      );
      return data;
    },
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: any }>(`/suppliers/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierDTO) => {
      const response = await api.post('/suppliers', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSupplierDTO }) => {
      const response = await api.put(`/suppliers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/suppliers/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
