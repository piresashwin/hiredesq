// Skeleton rows for the candidate list (design-system Principle 1 / §6.8 — a
// skeleton matching the final shape, never a centered spinner on a blank page).

function Bar({ w }: { w: string }) {
  return <div className={`h-3 rounded bg-subtle motion-safe:shimmer ${w}`} />;
}

export function CandidateSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {/* Desktop rows */}
      <div className="hidden sm:block">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-line px-4">
            <Bar w="w-40" />
            <Bar w="w-48" />
            <Bar w="w-28" />
            <Bar w="w-32" />
            <div className="ml-auto">
              <Bar w="w-12" />
            </div>
          </div>
        ))}
      </div>
      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-md border border-line bg-surface p-3">
            <Bar w="w-40" />
            <Bar w="w-48" />
            <Bar w="w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
