import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The shared page-header band (design-system §5). One structure for every
// top-level screen so they never drift: a full-bleed sticky band whose content
// caps + centers at max-w-screen-2xl. It carries ONLY the page name + required
// subtitle on the left and at most one primary action on the right. Everything
// that operates on the data — the search box, filters, mode toggles, result
// counts — belongs in the BODY, not here (a sticky header keeps the primary
// action reachable; the search toolbar leads the body). Home's gradient band is
// the single sanctioned exception and is out of scope here. Presentational
// only — no data, no state.
export function PageHeader({
  title,
  subtitle,
  action,
  sticky = true,
  className,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6",
        sticky && "sticky top-14 z-20",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{title}</h1>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
