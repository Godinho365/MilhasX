export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-panel2 ${className}`} />;
}

export function PageSkeleton({ cards = 4, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-6 h-8 w-48" />
      {cards > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
        </div>
      )}
      <div className="card overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
