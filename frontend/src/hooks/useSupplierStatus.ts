import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * CO-3-09 — Status agregado dos fornecedores convidados em uma cotação.
 */

export type SupplierDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'RESPONDED'
  | 'FAILED';

export interface SupplierStatusItem {
  notificationId: string;
  supplierId: string;
  supplierName: string;
  supplierCompany: string | null;
  supplierPhone: string;
  notifiedAt: string;
  deliveryStatus: SupplierDeliveryStatus;
  deliveredAt: string | null;
  readAt: string | null;
  respondedAt: string | null;
  responseType: string | null;
  hasProposal: boolean;
  errorMsg: string | null;
  followUpCount: number;
}

export interface SupplierStatusSummary {
  total: number;
  responded: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface SupplierStatusResponse {
  items: SupplierStatusItem[];
  summary: SupplierStatusSummary;
}

export function useSupplierStatus(quoteId: string | undefined) {
  return useQuery({
    queryKey: ['supplier-status', quoteId],
    queryFn: async () => {
      const { data } = await api.get<{
        success: boolean;
        data: SupplierStatusResponse;
      }>(`/quotes/${quoteId}/supplier-status`);
      return data.data;
    },
    enabled: !!quoteId,
    refetchInterval: 15_000, // polling para refletir delivery receipts
  });
}
