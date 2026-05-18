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
