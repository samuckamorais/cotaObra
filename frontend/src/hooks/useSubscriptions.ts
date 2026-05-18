import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface Subscription {
  id: string;
  producer: {
    id: string;
    name: string;
    cpfCnpj: string;
    phone: string;
    city: string;
    farm: string | null;
    region: string;
  };
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  quotesLimit: number;
  quotesUsed: number;
  startDate: string;
  endDate: string;
  active: boolean;
  daysUntilRenewal: number;
  usagePercentage: number;
}

export interface SubscriptionStats {
  activeSubscriptions: number;
  monthlyRevenue: number;
  renewalRate: number;
  cancellationsThisMonth: number;
  planDistribution: Record<string, number>;
}

export interface SubscriptionsResponse {
  data: Subscription[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: SubscriptionStats;
}

export interface CreateSubscriptionData {
  producerId: string;
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  duration: 1 | 3 | 6 | 12;
  startDate?: string;
  isTrial?: boolean;
}

export interface UpdatePlanData {
  newPlan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  applyImmediately: boolean;
}

export interface RenewData {
  duration: 1 | 3 | 6 | 12;
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
}

export interface CancelData {
  immediate: boolean;
  reason?: string;
}

// List subscriptions
export function useSubscriptions(
  page: number,
  limit: number,
  filters?: {
    status?: string;
    plan?: string;
    search?: string;
  }
) {
  return useQuery<SubscriptionsResponse>({
    queryKey: ['subscriptions', page, limit, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (filters?.status) params.append('status', filters.status);
      if (filters?.plan) params.append('plan', filters.plan);
      if (filters?.search) params.append('search', filters.search);

      const response = await api.get(`/subscriptions?${params}`);
      return response.data;
    },
  });
}

// Get one subscription
export function useSubscription(id: string) {
  return useQuery<Subscription>({
    queryKey: ['subscription', id],
    queryFn: async () => {
      const response = await api.get(`/subscriptions/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// Create subscription
export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSubscriptionData) => {
      const response = await api.post('/subscriptions', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// Update plan
export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePlanData }) => {
      const response = await api.patch(`/subscriptions/${id}/plan`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// Renew subscription
export function useRenewSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RenewData }) => {
      const response = await api.post(`/subscriptions/${id}/renew`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// Cancel subscription
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CancelData }) => {
      const response = await api.post(`/subscriptions/${id}/cancel`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// Reset quota
export function useResetQuota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/subscriptions/${id}/reset-quota`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}
