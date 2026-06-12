import { Skeleton } from "./misc";

/** Generic page loading state shown while the store hydrates. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-fade-in-fast space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    </div>
  );
}
