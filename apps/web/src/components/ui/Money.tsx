import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";

// Money & stats (design-system §6.6/§7, CLAUDE.md §3). Revenue always renders
// through this so it's consistently the money-green, tabular-figure treatment
// and ties to the `Money` value object in packages/core.
//
// NOTE: this is the DISPLAY layer only. Never do money arithmetic with the
// `amount` here — sums/fees are computed server-side as Decimal in packages/core
// and arrive pre-resolved. We only format.

export interface MoneyProps {
  /** Pre-resolved amount as a string (preferred, lossless) or number. */
  amount: string | number;
  currency?: string;
  /** Visually emphasise as a headline revenue figure (money-green, larger). */
  emphasis?: boolean;
  className?: string;
}

export function Money({ amount, currency = "USD", emphasis = false, className }: MoneyProps) {
  const formatted = formatCurrency(amount, currency);

  return (
    <span
      className={cn(
        "nums tabular-nums",
        emphasis ? "text-display text-money" : "font-medium text-ink",
        className,
      )}
    >
      {formatted}
    </span>
  );
}

/** A dashboard stat block: label + big value (revenue, placements, pipeline). */
export function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-line bg-surface p-4", className)}>
      <div className="text-label uppercase text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
