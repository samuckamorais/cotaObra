import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { CheckCircle, Circle, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  link?: string;
  action?: () => void;
}

interface OnboardingChecklistProps {
  items: ChecklistItem[];
  onComplete?: () => void;
  className?: string;
}

export function OnboardingChecklist({ items, onComplete, className }: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progress = (completedCount / totalCount) * 100;
  const allCompleted = completedCount === totalCount;

  const handleItemClick = (item: ChecklistItem) => {
    if (item.completed) return;

    if (item.action) {
      item.action();
    } else if (item.link) {
      navigate(item.link);
    }
  };

  return (
    <Card className={cn(
      'bg-gradient-to-br from-primary/5 via-accent/5 to-background border-primary/20 overflow-hidden relative',
      allCompleted && 'from-success/10 via-success/5 to-background border-success/30',
      className
    )}>
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />

      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-medium">
              {allCompleted ? 'Parabéns! Setup completo 🎉' : 'Primeiros Passos'}
            </CardTitle>
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {completedCount}/{totalCount}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-500 ease-out',
                allCompleted ? 'bg-success' : 'bg-primary'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {allCompleted
              ? 'Você está pronto para usar todas as funcionalidades!'
              : `${totalCount - completedCount} ${totalCount - completedCount === 1 ? 'passo restante' : 'passos restantes'}`
            }
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 relative">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.completed}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-md transition-all duration-200',
              'hover:bg-secondary/50 disabled:hover:bg-transparent',
              'disabled:cursor-default group',
              !item.completed && 'cursor-pointer'
            )}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {item.completed ? (
                <CheckCircle className="w-5 h-5 text-success animate-in zoom-in duration-300" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 text-left">
              <div className={cn(
                'text-sm font-medium transition-colors',
                item.completed
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground group-hover:text-primary'
              )}>
                {item.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </div>
            </div>

            {/* Arrow */}
            {!item.completed && (
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
            )}
          </button>
        ))}

        {/* Success state */}
        {allCompleted && onComplete && (
          <div className="pt-3 mt-3 border-t border-border">
            <Button
              onClick={onComplete}
              variant="outline"
              size="sm"
              className="w-full bg-success/10 border-success/30 hover:bg-success/20 text-success"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Continuar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
