import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * CO-7-05 — hook do checklist de onboarding (backend-driven).
 */

export interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string };
}

export interface OnboardingProgressV2 {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  percent: number;
  done: boolean;
  completedAt?: string;
}

export function useOnboarding() {
  return useQuery({
    queryKey: ['onboarding-progress'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: OnboardingProgressV2 }>(
        '/onboarding/progress',
      );
      return data.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
