import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

export function useQuoteStats() {
  return useQuery({
    queryKey: ['quote-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: any }>('/quotes/stats');
      return data.data;
    },
  });
}

interface Quote {
  id: string;
  product: string;
  quantity: string;
  unit: string;
  region: string;
  status: string;
  createdAt: string;
  producer: {
    id: string;
    name: string;
  };
  _count: {
    proposals: number;
  };
}

export function useQuotes(page = 1, limit = 10, filters?: any) {
  return useQuery({
    queryKey: ['quotes', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...filters,
      });
      const { data } = await api.get<PaginatedResponse<Quote> & { success: boolean }>(
        `/quotes?${params}`
      );
      return data;
    },
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: any }>(`/quotes/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCloseQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ quoteId, supplierId }: { quoteId: string; supplierId: string }) => {
      const { data } = await api.put(`/quotes/${quoteId}/close`, { supplierId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useQuoteResults(quoteId: string, quoteStatus?: string) {
  const isActive = quoteStatus === 'COLLECTING' || quoteStatus === 'DISPATCHED';
  return useQuery({
    queryKey: ['quote-results', quoteId],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: any }>(
        `/quotes/${quoteId}/results`
      );
      return data.data;
    },
    enabled: !!quoteId,
    refetchInterval: isActive ? 15000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useCloseTotalWinner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, supplierId }: { quoteId: string; supplierId: string }) => {
      const { data } = await api.post(`/quotes/${quoteId}/close-total`, { supplierId });
      return data;
    },
    onSuccess: (_data, { quoteId }) => {
      queryClient.invalidateQueries({ queryKey: ['quote-results', quoteId] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useCloseByItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, winners }: { quoteId: string; winners: Array<{ quoteItemId: string; supplierId: string }> }) => {
      const { data } = await api.post(`/quotes/${quoteId}/close-by-item`, { winners });
      return data;
    },
    onSuccess: (_data, { quoteId }) => {
      queryClient.invalidateQueries({ queryKey: ['quote-results', quoteId] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useNotifyWinner() {
  return useMutation({
    mutationFn: async ({
      quoteId,
      notificationType,
    }: {
      quoteId: string;
      notificationType: 'selected' | 'producer_will_contact';
    }) => {
      const { data } = await api.post(`/quotes/${quoteId}/notify-winner`, { notificationType });
      return data;
    },
  });
}
