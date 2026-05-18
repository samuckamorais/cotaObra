/**
 * Page Loading Skeleton
 *
 * Minimal loading placeholder for route-level Suspense boundaries.
 * Follows the clean, minimal design system (Linear-inspired).
 */

export function PageLoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Page title skeleton */}
      <div className="h-8 w-64 bg-muted/20 rounded-md" />

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted/10 border border-border rounded-md" />
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="space-y-3">
        <div className="h-12 bg-muted/10 border border-border rounded-md" />
        <div className="h-64 bg-muted/10 border border-border rounded-md" />
      </div>
    </div>
  );
}

export function CompactLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-sm text-muted-foreground">Carregando...</div>
    </div>
  );
}
