import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

/**
 * CO-6-03 — hooks de Approval.
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalListItem {
  id: string;
  tenantId: string;
  quoteId: string;
  status: ApprovalStatus;
  thresholdAmount: number | string;
  totalAmount: number | string;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
  quote: {
    id: string;
    region: string;
    deadline: string | null;
    site: { id: string; name: string } | null;
  };
  requestedBy: { id: string; name: string };
  approver: { id: string; name: string } | null;
}

export interface ApprovalDetail extends ApprovalListItem {
  closeQuotePayload: any;
  quote: ApprovalListItem['quote'] & {
    proposals: Array<{
      id: string;
      rank: number | null;
      totalValue: number | string;
      paymentTerms: string;
      deliveryDays: number;
      freightMode: string | null;
      supplier: { id: string; name: string };
    }>;
  };
  requestedBy: { id: string; name: string; email: string };
  approver: { id: string; name: string; email: string } | null;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;

export function useApprovals(
  page = 1,
  limit = 20,
  filters: { status?: ApprovalStatus } = {},
) {
  return useQuery({
    queryKey: ['approvals', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams(clean({ page, limit, ...filters }));
      const { data } = await api.get<
        PaginatedResponse<ApprovalListItem> & { success: boolean }
      >(`/approvals?${params}`);
      return data;
    },
  });
}

export function useApproval(id: string | undefined) {
  return useQuery({
    queryKey: ['approval', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: ApprovalDetail }>(
        `/approvals/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useApprovalsPendingCount() {
  return useQuery({
    queryKey: ['approvals-pending-count'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: { count: number } }>(
        '/approvals/pending-count',
      );
      return data.data.count;
    },
    refetchInterval: 60_000, // refresca a cada 1 min
  });
}

export function useApproveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{
        success: boolean;
        data: {
          approvalId: string;
          action: 'approved';
          purchaseOrderIds?: string[];
          totalValue?: number;
        };
      }>(`/approvals/${id}/approve`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['approval'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useRejectApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.post<{
        success: boolean;
        data: { approvalId: string; action: 'rejected'; reason: string };
      }>(`/approvals/${id}/reject`, { reason });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['approval'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}
