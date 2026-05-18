import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-normal transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          'border-0.5',
          {
            'bg-primary text-primary-foreground hover:bg-primary/90 border-primary': variant === 'default',
            'bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive':
              variant === 'destructive',
            'border-border bg-transparent hover:bg-secondary': variant === 'outline',
            'border-transparent hover:bg-secondary': variant === 'ghost',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border': variant === 'secondary',
          },
          {
            'h-9 px-4': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-6': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
