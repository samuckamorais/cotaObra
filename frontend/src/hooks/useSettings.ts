import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export type WinnerNotificationType = 'SELECTED' | 'PRODUCER_WILL_CONTACT' | 'NONE';

export interface ProducerSettings {
  proposalLinkExpiryHours: number;
  quoteDeadlineDays: number;
  defaultSupplierScope: 'MINE' | 'NETWORK' | 'ALL';
  maxItemsPerQuote: number;
  winnerNotificationType: WinnerNotificationType;
  quoteExpiryHours: number;
  /** CO-6-05: teto de aprovação. null/0 = sem teto (auto-aprovado). */
  approvalThreshold: number | null;
  /** CO-8-01: integração ERP */
  erpWebhookUrl: string | null;
  erpAdapter: 'generic' | 'sienge' | 'gvdasa' | null;
  erpWebhookConfigured?: boolean;
  /** Apenas no PUT — backend nunca retorna. */
  erpWebhookSecret?: string | null;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: ProducerSettings }>('/settings');
      return data.data;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<ProducerSettings>) => {
      const { data } = await api.put<{ success: boolean; data: ProducerSettings }>('/settings', payload);
      return data.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
    },
  });
}
