import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Sparkles, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

/**
 * CO-7-05 — Checklist de onboarding CotaObra.
 *
 * Backend-driven (lê /api/onboarding/progress). Dispensável via X — guarda
 * dismiss em localStorage por usuário. Se step.done = true, item fica
 * marcado e sem CTA.
 */

const DISMISS_KEY = 'cotaobra:onboarding:dismissed';

export function OnboardingChecklistV2() {
  const { data, isLoading } = useOnboarding();
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(DISMISS_KEY) === 'true' : false,
  );

  if (isLoading || !data) return null;
  if (data.done) return null; // some 100%, esconde
  if (dismissed) return null;

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, 'true');
    }
    setDismissed(true);
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-amber-50/30">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            <div>
              <h3 className="font-medium text-base">Configure sua construtora</h3>
              <p className="text-xs text-muted-foreground">
                {data.completed} de {data.total} concluído · {data.percent}%
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-500"
            style={{ width: `${data.percent}%` }}
          />
        </div>

        {/* Steps */}
        <ul className="space-y-2">
          {data.steps.map((step) => (
            <li
              key={step.key}
              className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                step.done ? 'opacity-60' : 'hover:bg-background/50'
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <Circle className="size-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.done ? 'line-through' : ''}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              {!step.done && (
                <Link to={step.cta.href}>
                  <Button size="sm" variant="ghost" className="gap-1 shrink-0">
                    {step.cta.label}
                    <ChevronRight className="size-3" />
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
