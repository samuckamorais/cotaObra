import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface SidebarBadges {
  quotes: number | null;
  whatsapp: 'ok' | 'error' | null;
  // CO-2-07: contagem de solicitações pendentes (fila do comprador)
  quoteRequestsPending: number | null;
}

/**
 * Hook que agrega dados de estado para badges na Sidebar.
 * Polling a cada 30s, staleTime 60s.
 */
export function useSidebarBadges(): SidebarBadges {
  const { data: quotesData } = useQuery({
    queryKey: ['sidebar-quotes-stats'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/quotes/stats');
        return data.data;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
    refetchInterval: 30000,
  });

  const { data: whatsappData } = useQuery({
    queryKey: ['sidebar-whatsapp-status'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/admin/whatsapp/config');
        return data.data;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
    refetchInterval: 30000,
  });

  // CO-2-07: contagem de solicitações pendentes
  const { data: pendingData } = useQuery({
    queryKey: ['sidebar-quote-requests-pending'],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ success: boolean; data: { count: number } }>(
          '/quote-requests/pending-count',
        );
        return data.data.count;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const summarizedCount = quotesData?.collectingQuotes || 0;
  const whatsappStatus = whatsappData?.isConnected === true
    ? 'ok'
    : whatsappData?.isConnected === false
    ? 'error'
    : null;

  return {
    quotes: summarizedCount > 0 ? summarizedCount : null,
    whatsapp: whatsappStatus,
    quoteRequestsPending: pendingData && pendingData > 0 ? pendingData : null,
  };
}
