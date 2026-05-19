import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

/**
 * CO-2-07 — Hooks React Query para QuoteRequest (fila do comprador).
 */

export type QuoteRequestStatus =
  | 'PENDING_REVIEW'
  | 'PROMOTED'
  | 'REJECTED'
  | 'EXPIRED';

export interface QuoteRequestItem {
  description: string;
  qty?: number | null;
  unit?: string | null;
  spec?: string | null;
  materialId?: string | null;
}

export interface QuoteRequest {
  id: string;
  tenantId: string;
  siteId: string;
  requesterId: string;
  items: QuoteRequestItem[];
  deadlineAt: string | null;
  observation: string | null;
  source: string;
  rawText: string | null;
  status: QuoteRequestStatus;
  rejectionReason: string | null;
  promotedQuoteId: string | null;
  promotedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string; city: string; state: string };
  requester?: { id: string; name: string; email: string; phone?: string };
}

export interface PromoteInput {
  items: Array<{
    description: string;
    qty: number;
    unit: string;
    spec?: string;
    materialId?: string;
  }>;
  region?: string;
  deadline: string;
  observations?: string;
  freight?: 'CIF' | 'FOB';
  paymentTerms?: string;
  supplierScope: 'MINE' | 'NETWORK' | 'ALL';
  expiryHours?: number;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;

export function useQuoteRequests(
  page = 1,
  limit = 20,
  filters: { status?: QuoteRequestStatus; siteId?: string } = {},
) {
  return useQuery({
    queryKey: ['quote-requests', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams(clean({ page, limit, ...filters }));
      const { data } = await api.get<
        PaginatedResponse<QuoteRequest> & { success: boolean }
      >(`/quote-requests?${params}`);
      return data;
    },
  });
}

export function useQuoteRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['quote-request', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: QuoteRequest }>(
        `/quote-requests/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useQuoteRequestsPendingCount() {
  return useQuery({
    queryKey: ['quote-requests-pending-count'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: { count: number } }>(
        '/quote-requests/pending-count',
      );
      return data.data.count;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function usePromoteQuoteRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PromoteInput }) => {
      const { data: res } = await api.post<{
        success: boolean;
        data: { quoteRequest: QuoteRequest; quoteId: string };
      }>(`/quote-requests/${id}/promote`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useRejectQuoteRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.post<{ success: boolean; data: QuoteRequest }>(
        `/quote-requests/${id}/reject`,
        { reason },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests-pending-count'] });
    },
  });
}
