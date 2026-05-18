import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

interface Producer {
  id: string;
  name: string;
  cpfCnpj: string;
  stateRegistration?: string;
  farm?: string;
  city: string;
  phone: string;
  region: string;
  createdAt: string;
  _count?: {
    suppliers: number;
    quotes: number;
  };
}

interface CreateProducerDTO {
  name: string;
  cpfCnpj: string;
  stateRegistration?: string;
  farm?: string;
  city: string;
  phone: string;
  region: string;
}

interface UpdateProducerDTO {
  name?: string;
  cpfCnpj?: string;
  stateRegistration?: string;
  farm?: string;
  city?: string;
  phone?: string;
  region?: string;
}

export function useProducers(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['producers', page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      const { data } = await api.get<PaginatedResponse<Producer> & { success: boolean }>(
        `/producers?${params}`
      );
      return data;
    },
  });
}

export function useProducer(id: string) {
  return useQuery({
    queryKey: ['producer', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: Producer }>(`/producers/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateProducer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProducerDTO) => {
      const response = await api.post('/producers', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
    },
  });
}

export function useUpdateProducer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateProducerDTO }) => {
      const response = await api.put(`/producers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      queryClient.invalidateQueries({ queryKey: ['producer'] });
    },
  });
}

export function useDeleteProducer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/producers/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
    },
  });
}
