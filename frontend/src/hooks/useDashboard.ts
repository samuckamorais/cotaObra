import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface DashboardStats {
  quotesToday: number;
  proposalsReceived: number;
  closureRate: number;
  activeProducers: number;
}

interface QuotesByDay {
  date: string;
  count: number;
}

interface TopProduct {
  product: string;
  count: number;
}

interface CategoryStats {
  category: string;
  suppliersCount: number;
  proposalsCount: number;
}

interface QuoteStatusStats {
  status: string;
  count: number;
}

interface SupplierStats {
  totalSuppliers: number;
  networkSuppliers: number;
  producerSuppliers: number;
  topSuppliers: Array<{
    name: string;
    proposalsCount: number;
  }>;
}

interface ProducerStats {
  totalProducers: number;
  producersWithQuotes: number;
  producersWithActiveSubscription: number;
  topProducers: Array<{
    name: string;
    quotesCount: number;
  }>;
}

interface ProposalStats {
  totalProposals: number;
  totalVolume: number;
  avgProposalValue: number;
  thisMonth: {
    count: number;
    volume: number;
  };
  lastMonth: {
    count: number;
    volume: number;
  };
}

interface DashboardData {
  stats: DashboardStats;
  charts: {
    quotesByDay: QuotesByDay[];
    topProducts: TopProduct[];
    categoryStats: CategoryStats[];
    quoteStatusStats: QuoteStatusStats[];
  };
  supplierStats: SupplierStats;
  producerStats: ProducerStats;
  proposalStats: ProposalStats;
  recentQuotes: any[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: DashboardData }>('/dashboard');
      return data.data;
    },
  });
}
