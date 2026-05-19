import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaginatedResponse } from '../api/client';

/**
 * CO-5-08 — hooks de Purchase Orders.
 */

export type PurchaseOrderStatus = 'DRAFT' | 'EMITTED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  quoteItemId: string | null;
  description: string;
  qty: number | string;
  unit: string;
  unitPrice: number | string;
  totalPrice: number | string;
  spec: string | null;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  number: number;
  quoteId: string;
  supplierId: string;
  totalValue: number | string;
  paymentTerms: string;
  deliveryDays: number;
  freightMode: string | null;
  freightValue: number | string | null;
  observations: string | null;
  status: PurchaseOrderStatus;
  pdfUrl: string | null;
  pdfGeneratedAt: string | null;
  parentPurchaseOrderId: string | null;
  createdById: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItem[];
  supplier?: { id: string; name: string; company: string | null };
  quote?: { id: string; site: { id: string; name: string } | null };
  _count?: { items: number };
}

export interface CloseQuoteInput {
  mode: 'winner' | 'split';
  supplierId?: string;
  selections?: Record<string, string>;
  reason?: string;
}

export interface CloseQuoteResult {
  purchaseOrderIds?: string[];
  totalValue: number;
  purchaseOrders?: Array<{
    id: string;
    number: number;
    supplierId: string;
    totalValue: number;
    status: PurchaseOrderStatus;
  }>;
  /** CO-6-02 — backend roteou para Approval por exceder threshold */
  requiresApproval?: boolean;
  approvalId?: string;
  estimatedTotal?: number;
  threshold?: number;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;

export function usePurchaseOrders(
  page = 1,
  limit = 20,
  filters: { status?: PurchaseOrderStatus; supplierId?: string } = {},
) {
  return useQuery({
    queryKey: ['purchase-orders', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams(clean({ page, limit, ...filters }));
      const { data } = await api.get<
        PaginatedResponse<PurchaseOrder> & { success: boolean }
      >(`/purchase-orders?${params}`);
      return data;
    },
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: PurchaseOrder }>(
        `/purchase-orders/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCloseQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      quoteId,
      input,
    }: {
      quoteId: string;
      input: CloseQuoteInput;
    }) => {
      const { data } = await api.post<{ success: boolean; data: CloseQuoteResult }>(
        `/quotes/${quoteId}/close-co5`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote-comparative'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
