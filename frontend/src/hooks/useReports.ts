import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface DateRangeFilters {
  from?: string;
  to?: string;
  producerId?: string;
}

function buildParams(filters: DateRangeFilters) {
  const p: Record<string, string> = {};
  if (filters.from) p.from = filters.from;
  if (filters.to) p.to = filters.to;
  if (filters.producerId) p.producerId = filters.producerId;
  return new URLSearchParams(p).toString();
}

export function useReportFunnel(filters: DateRangeFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'funnel', filters],
    queryFn: async () => {
      const qs = buildParams(filters);
      const { data } = await api.get(`/reports/funnel${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}

export function useReportOperational() {
  return useQuery({
    queryKey: ['reports', 'operational'],
    queryFn: async () => {
      const { data } = await api.get('/reports/operational');
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000, // refresca a cada 5 min
  });
}

export function useReportSavings(filters: DateRangeFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'savings', filters],
    queryFn: async () => {
      const qs = buildParams(filters);
      const { data } = await api.get(`/reports/savings${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}

export function useReportSupplierPerformance(filters: DateRangeFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'supplier-performance', filters],
    queryFn: async () => {
      const qs = buildParams(filters);
      const { data } = await api.get(`/reports/supplier-performance${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}

export function useReportCategoryRegion(filters: DateRangeFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'category-region', filters],
    queryFn: async () => {
      const qs = buildParams(filters);
      const { data } = await api.get(`/reports/category-region${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}

/**
 * CO-7-03 — Top materiais (PurchaseOrderItem agregado por descrição).
 */
export interface TopMaterialRow {
  description: string;
  unit: string;
  totalQty: number;
  totalSpend: number;
  poCount: number;
  suppliersCount: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
}
export function useReportTopMaterials(
  filters: DateRangeFilters & { limit?: number } = {},
) {
  return useQuery({
    queryKey: ['reports', 'top-materials', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.limit) params.limit = String(filters.limit);
      const qs = new URLSearchParams(params).toString();
      const { data } = await api.get<{
        success: boolean;
        data: { items: TopMaterialRow[] };
      }>(`/reports/top-materials${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}

/**
 * CO-7-04 — Gasto por obra.
 */
export interface SiteSpendingRow {
  siteId: string;
  siteName: string;
  region: string;
  status: string;
  totalSpend: number;
  poCount: number;
  quotesCount: number;
  quotesClosed: number;
  estimatedSavings: number;
}
export function useReportSiteSpending(filters: DateRangeFilters = {}) {
  return useQuery({
    queryKey: ['reports', 'site-spending', filters],
    queryFn: async () => {
      const qs = buildParams(filters);
      const { data } = await api.get<{
        success: boolean;
        data: {
          sites: SiteSpendingRow[];
          totals: { totalSpend: number; totalPoCount: number; totalEstimatedSavings: number };
        };
      }>(`/reports/site-spending${qs ? `?${qs}` : ''}`);
      return data.data;
    },
  });
}
