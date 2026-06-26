"use client";

import { cn } from "@/lib/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";

// Numbered pager for paginated tables (design-system §5 — pagination lives in the
// body, with the data it controls). Server-side offset paging: the parent owns
// `page` and refetches on change; this is presentational. Renders the
// "X–Y of N" range + « Prev  1 2 … Next » with an ellipsis window so a 200-page
// workspace never prints 200 buttons. Hidden entirely when there's a single page.

export function Pagination({
  page,
  limit,
  total,
  onPage,
  className,
}: {
  /** 1-based current page. */
  page: number;
  /** Page size (rows per page). */
  limit: number;
  /** Total rows across all pages (workspace-scoped). */
  total: number;
  onPage: (next: number) => void;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const first = (current - 1) * limit + 1;
  const last = Math.min(current * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row",
        className,
      )}
    >
      <p className="nums text-sm tabular-nums text-muted">
        Showing {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-1">
        <PagerButton
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          ariaLabel="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </PagerButton>

        {pageWindow(current, pageCount).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-faint" aria-hidden>
              …
            </span>
          ) : (
            <PagerButton
              key={p}
              onClick={() => onPage(p)}
              active={p === current}
              ariaLabel={`Page ${p}`}
              ariaCurrent={p === current}
            >
              {p}
            </PagerButton>
          ),
        )}

        <PagerButton
          onClick={() => onPage(current + 1)}
          disabled={current >= pageCount}
          ariaLabel="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRightIcon className="h-4 w-4" />
        </PagerButton>
      </div>
    </nav>
  );
}

function PagerButton({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
  ariaCurrent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
  ariaCurrent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={ariaCurrent ? "page" : undefined}
      className={cn(
        "nums inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-sm border px-2 text-sm font-medium tabular-nums transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-brand bg-brand-tint text-brand"
          : "border-line bg-surface text-muted hover:text-ink enabled:hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Page numbers to render, with "…" gaps: always the first and last page, the
 * current page, and one neighbour on each side. E.g. page 6 of 12 →
 * `1 … 5 6 7 … 12`. Keeps the pager to a fixed width regardless of page count.
 */
function pageWindow(current: number, pageCount: number): (number | "…")[] {
  const pages = new Set<number>([1, pageCount, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}
