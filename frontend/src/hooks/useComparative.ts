import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * CO-4-03/04 — Quadro comparativo (pricing engine).
 */

export interface ComparativeItem {
  id: string;
  description: string;
  qty: number | null;
  unit: string | null;
  materialName: string | null;
}

export interface ComparativeProposalItem {
  quoteItemId: string;
  unitPrice: number;
  totalPrice: number;
  available: boolean;
  rank: number;
}

export interface ComparativeBreakdown {
  base: string;
  freight: string;
  financialCost: string;
  deliveryAdjustment: string;
  corrected: string;
}

export interface ComparativeProposal {
  supplierId: string;
  supplierName: string;
  supplierCompany: string | null;
  rank: number | null;
  totalValue: number;
  correctedTotal: number | null;
  breakdown: ComparativeBreakdown | null;
  freightMode: string | null;
  freightValue: number | null;
  paymentTerms: string;
  deliveryDays: number;
  isPartial: boolean;
  items: ComparativeProposalItem[];
}

export interface ComparativeData {
  quote: {
    id: string;
    status: string;
    deadlineDays: number;
    siteName: string | null;
    items: ComparativeItem[];
  };
  proposals: ComparativeProposal[];
  summary: {
    lowestCorrectedTotal: number | null;
    highestCorrectedTotal: number | null;
    savings: number | null;
    winnerSupplierId: string | null;
    redacted: boolean;
  };
}

export function useComparative(quoteId: string | undefined) {
  return useQuery({
    queryKey: ['quote-comparative', quoteId],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: ComparativeData }>(
        `/quotes/${quoteId}/comparative`,
      );
      return data.data;
    },
    enabled: !!quoteId,
  });
}
