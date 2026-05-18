import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface SidebarBadges {
  quotes: number | null;
  whatsapp: 'ok' | 'error' | null;
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

  const summarizedCount = quotesData?.collectingQuotes || 0;
  const whatsappStatus = whatsappData?.isConnected === true
    ? 'ok'
    : whatsappData?.isConnected === false
    ? 'error'
    : null;

  return {
    quotes: summarizedCount > 0 ? summarizedCount : null,
    whatsapp: whatsappStatus,
  };
}
