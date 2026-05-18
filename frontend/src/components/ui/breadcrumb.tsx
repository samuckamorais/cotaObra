import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex items-center gap-2 px-6 py-2.5 border-b border-border/50 bg-background',
        className
      )}
    >
      <ol className="flex items-center gap-2 text-xs">
        {/* Home sempre aparece */}
        <li>
          <Link
            to="/dashboard"
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="w-3 h-3" />
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <React.Fragment key={index}>
              <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
              <li>
                {isLast ? (
                  <span className="flex items-center gap-1.5 text-foreground font-medium">
                    {item.icon}
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.href || '#'}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
