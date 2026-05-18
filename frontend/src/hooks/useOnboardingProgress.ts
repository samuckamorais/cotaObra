import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface OnboardingStep {
  id: string;
  completed: boolean;
}

const ONBOARDING_STORAGE_KEY = 'cotaobra:onboarding';

export function useOnboardingProgress() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<OnboardingStep[]>([
    { id: 'login', completed: true }, // Always true if user is logged in
    { id: 'whatsapp', completed: false },
    { id: 'producers', completed: false },
    { id: 'quote', completed: false },
  ]);

  // Load progress from localStorage
  useEffect(() => {
    if (!user) return;

    const stored = localStorage.getItem(`${ONBOARDING_STORAGE_KEY}:${user.id}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSteps(parsed);
      } catch (error) {
        console.error('Failed to parse onboarding progress', error);
      }
    }
  }, [user]);

  // Save progress to localStorage
  const saveProgress = (newSteps: OnboardingStep[]) => {
    if (!user) return;
    localStorage.setItem(`${ONBOARDING_STORAGE_KEY}:${user.id}`, JSON.stringify(newSteps));
    setSteps(newSteps);
  };

  const markStepComplete = (stepId: string) => {
    const newSteps = steps.map(step =>
      step.id === stepId ? { ...step, completed: true } : step
    );
    saveProgress(newSteps);
  };

  const resetProgress = () => {
    const resetSteps = steps.map(step => ({ ...step, completed: step.id === 'login' }));
    saveProgress(resetSteps);
  };

  const isComplete = steps.every(step => step.completed);
  const completedCount = steps.filter(step => step.completed).length;

  return {
    steps,
    markStepComplete,
    resetProgress,
    isComplete,
    completedCount,
    totalCount: steps.length,
  };
}
