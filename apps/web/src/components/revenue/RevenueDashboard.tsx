"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PlacementDto, RevenueSummaryDto } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { api, PAGE_SIZE } from "@/lib/api";
import { Money, Stat } from "@/components/ui/Money";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Menu } from "@/components/ui/Menu";
import { PlacementStatusBadge } from "@/components/ui/Badge";
import { TrendingUpIcon, ClockIcon, MoreIcon, XCircleIcon, MergeIcon } from "@/components/ui/Icon";
import { FallThroughModal } from "@/components/revenue/FallThroughModal";
import { ReplacePlacementModal } from "@/components/revenue/ReplacePlacementModal";

// Revenue dashboard (design-system §6.6) — the differentiator, one click away.
// LIVE: loads getRevenueSummary() + listPlacements() (CLAUDE.md §3 — money is a
// pre-resolved Decimal string from the API; the client never does fee arithmetic
// it then persists).
//
// The headline distinguishes REVENUE CLEARED (earned — guarantee window elapsed,
// the trustworthy hero, money-green, count-up on mount §8) from REVENUE AT-RISK
// (booked but still inside the guarantee window — provisional, never presented as
// final, §2E/§3). Each placement row shows its lifecycle status as a chip and,
// for at-risk ones, when it clears.

function isThisMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** A placement still booking revenue (cleared + at-risk). Fell-through/replaced
 *  rows have been reversed/superseded and don't count toward live totals. */
function isLive(p: PlacementDto): boolean {
  return p.status === "cleared" || p.status === "at_risk";
}

export function RevenueDashboard() {
  const [summary, setSummary] = useState<RevenueSummaryDto | null>(null);
  const [placements, setPlacements] = useState<PlacementDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Server-side pagination for the placements TABLE only. The hero/summary numbers
  // come from getRevenueSummary() (server-computed) and never page (§3). `total` is
  // the workspace-scoped placement count from the envelope — the table header reads
  // it so it never reports just the current page.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Guarantee-lifecycle actions (§2E): a placement marked for fall-through or
  // replacement. Both refresh the dashboard so cleared/at-risk update.
  const [fallThroughTarget, setFallThroughTarget] = useState<PlacementDto | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<PlacementDto | null>(null);

  const load = useCallback(async (pageArg: number) => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextPlacements] = await Promise.all([
        api.getRevenueSummary(),
        api.listPlacements(pageArg),
      ]);
      setSummary(nextSummary);
      setPlacements(nextPlacements.items);
      setTotal(nextPlacements.total);
    } catch {
      setError("We couldn't load your revenue. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  // After either action, re-fetch so cleared/at-risk reconcile with server truth.
  const refreshAfterAction = useCallback(() => {
    void load(page);
  }, [load, page]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Revenue"
        subtitle="What you've actually earned, and what's still inside its guarantee window."
        sticky={false}
      />

      <div className="mx-auto w-full max-w-screen-2xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load(page)} />
        ) : summary && placements ? (
          <DashboardBody
            summary={summary}
            placements={placements}
            total={total}
            page={page}
            onPage={setPage}
            onFallThrough={setFallThroughTarget}
            onReplace={setReplaceTarget}
          />
        ) : null}
      </div>

      <FallThroughModal
        open={fallThroughTarget !== null}
        placement={fallThroughTarget}
        onClose={() => setFallThroughTarget(null)}
        onDone={refreshAfterAction}
      />
      <ReplacePlacementModal
        open={replaceTarget !== null}
        placement={replaceTarget}
        onClose={() => setReplaceTarget(null)}
        onDone={refreshAfterAction}
      />
    </div>
  );
}

function DashboardBody({
  summary,
  placements,
  total,
  page,
  onPage,
  onFallThrough,
  onReplace,
}: {
  summary: RevenueSummaryDto;
  placements: PlacementDto[];
  /** Workspace-scoped total placement count (envelope) — drives the table header +
   *  pager so neither reports just the current page. */
  total: number;
  page: number;
  onPage: (next: number) => void;
  onFallThrough: (p: PlacementDto) => void;
  onReplace: (p: PlacementDto) => void;
}) {
  const currency = summary.currency;
  const now = useMemo(() => new Date(), []);

  // Stable, newest-first ordering of the current page's placements.
  const sorted = useMemo(
    () => [...placements].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)),
    [placements],
  );

  const heroCleared = Number(summary.revenueCleared);
  const monthName = now.toLocaleString(undefined, { month: "long" });

  if (total === 0) {
    return <RevenueEmptyState />;
  }

  return (
    <>
      {/* HERO — Revenue cleared (earned) is the confident headline; Revenue at-risk
          is the softer, cautionary sibling (provisional money, §2E/§3). */}
      <section className="grid gap-4 sm:grid-cols-3 lg:gap-5" aria-label="Revenue summary headline">
        {/* Cleared — primary, money-green, count-up. Spans 2 cols on desktop. */}
        <div
          className="rounded-lg border border-line bg-surface p-6 sm:col-span-2 lg:p-7"
          aria-label="Revenue cleared"
          data-tour="revenue-headline"
        >
          <div className="flex items-center gap-1.5 text-label uppercase text-muted">
            <TrendingUpIcon className="h-4 w-4 text-money" />
            Revenue cleared
          </div>
          <div className="mt-1.5">
            <CountUpMoney value={heroCleared} currency={currency} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Earned for good — the guarantee window has elapsed. This is money you can count on.
          </p>
        </div>

        {/* At-risk — secondary, softer/cautionary. Never presented as final. */}
        <div
          className="rounded-lg border border-warning/30 bg-warning-tint/40 p-6 lg:p-7"
          aria-label="Revenue at risk"
          data-tour="revenue-breakdown"
        >
          <div className="flex items-center gap-1.5 text-label uppercase text-warning">
            <ClockIcon className="h-4 w-4" />
            At risk
          </div>
          <div className="mt-1.5">
            <Money
              amount={summary.revenueAtRisk}
              currency={currency}
              className="text-h1 text-warning"
            />
          </div>
          <p className="mt-1 text-sm text-muted">
            Booked, but still inside its guarantee window — not earned yet.
          </p>
        </div>
      </section>

      {/* SECONDARY STATS — all from the summary. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5" aria-label="Revenue stats">
        <Stat label={`Placements in ${monthName}`}>
          <span className="nums text-h1 tabular-nums text-ink">{summary.placementsThisMonth}</span>
        </Stat>
        <Stat label="Pipeline value (weighted)">
          <Money
            amount={summary.pipelineValue}
            currency={currency}
            className="text-h1 text-money"
          />
        </Stat>
        <Stat label="Avg fee">
          <Money amount={summary.avgFee} currency={currency} className="text-h1 text-money" />
        </Stat>
        {/* Workspace-scoped total from the envelope — NOT a per-page count (the
            table below is now paginated, so a page-local tally would mislead). */}
        <Stat label="Total placements">
          <span className="nums text-h1 tabular-nums text-ink">{total}</span>
        </Stat>
      </section>

      {/* TREND — summary.monthlyTrend, pure CSS bars. */}
      <MonthlyTrend trend={summary.monthlyTrend} currency={currency} />

      {/* PLACEMENTS TABLE — status chip + when-it-clears + lifecycle actions. */}
      <PlacementsTable
        placements={sorted}
        total={total}
        page={page}
        onPage={onPage}
        currency={currency}
        now={now}
        onFallThrough={onFallThrough}
        onReplace={onReplace}
      />
    </>
  );
}

// ── Hero count-up (respects prefers-reduced-motion → instant) ───────────
function CountUpMoney({ value, currency }: { value: number; currency: string }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const duration = 900;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    setDisplay(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <span
      aria-label={new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value)}
    >
      <Money amount={Math.round(display)} currency={currency} emphasis className="text-money" />
    </span>
  );
}

// ── Monthly trend (pure CSS bars, no chart lib) ─────────────────────────
function MonthlyTrend({
  trend,
  currency,
}: {
  trend: RevenueSummaryDto["monthlyTrend"];
  currency: string;
}) {
  const max = Math.max(...trend.map((m) => Number(m.revenue)), 1);

  return (
    <section
      className="rounded-lg border border-line bg-surface p-5 sm:p-6"
      aria-label="Monthly trend"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-ink">Last 6 months</h2>
        <span className="text-sm text-muted">Booked revenue by month</span>
      </div>
      <ol className="mt-4 flex items-end gap-2 sm:gap-4" style={{ height: 160 }}>
        {trend.map((m, i) => {
          const value = Number(m.revenue);
          const pct = Math.max(2, Math.round((value / max) * 100));
          const isLatest = i === trend.length - 1;
          const label = new Date(`${m.month}-01`).toLocaleString(undefined, { month: "short" });
          return (
            <li
              key={m.month}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="nums text-sm tabular-nums text-muted">
                {value > 0 ? (
                  <Money amount={value} currency={currency} className="text-sm text-money" />
                ) : (
                  ""
                )}
              </span>
              <div className="flex w-full justify-center" style={{ height: "100%" }}>
                <div
                  className={cn(
                    "w-full max-w-[40px] rounded-t-sm transition-[height] duration-500 ease-out",
                    isLatest ? "bg-money" : "bg-money/30",
                  )}
                  style={{ height: `${pct}%` }}
                  role="img"
                  aria-label={`${label}: ${new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  }).format(value)}`}
                />
              </div>
              <span
                className={cn("text-label", isLatest ? "font-semibold text-ink" : "text-muted")}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Placements table (status chip, when-it-clears, lifecycle actions) ─────
function PlacementsTable({
  placements,
  total,
  page,
  onPage,
  currency,
  now,
  onFallThrough,
  onReplace,
}: {
  placements: PlacementDto[];
  /** Workspace-scoped total (envelope), not the current page's length. */
  total: number;
  page: number;
  onPage: (next: number) => void;
  currency: string;
  now: Date;
  onFallThrough: (p: PlacementDto) => void;
  onReplace: (p: PlacementDto) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface" aria-label="Placements">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-h3 text-ink">Placements</h2>
        <span className="nums text-sm tabular-nums text-muted">{total} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead className="bg-subtle">
            <tr className="text-left text-label uppercase text-muted">
              <th className="py-2 pl-4 pr-3 font-medium">Candidate</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Placed</th>
              <th className="py-2 pr-3 text-right font-medium">Fee</th>
              <th className="w-10 py-2 pr-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {placements.map((p) => {
              const thisMonth = isThisMonth(p.placedAt, now);
              const live = isLive(p);
              const reversed = p.status === "fell_through" || p.status === "replaced";
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "h-12 border-b border-line transition last:border-0 hover:bg-subtle",
                    thisMonth && live && "bg-success-tint/40",
                  )}
                >
                  <td className="pl-4 pr-3">
                    {/* Link affordance to the underlying record (PII = name in body,
                        id in the href — CLAUDE.md §2). */}
                    <Link
                      href={`/candidates?placement=${p.id}`}
                      className="font-semibold text-ink underline-offset-2 hover:text-brand hover:underline"
                    >
                      {p.candidate?.fullName ?? "Candidate"}
                    </Link>
                  </td>
                  <td className="pr-3 text-muted">{p.jobTitle ?? "Role"}</td>
                  <td className="pr-3">
                    <div className="flex flex-col gap-0.5">
                      <PlacementStatusBadge status={p.status} />
                      {p.status === "at_risk" ? (
                        <span className="nums text-label tabular-nums text-muted">
                          Clears {formatDate(p.clearsAt)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="nums pr-3 tabular-nums text-muted">{formatDate(p.placedAt)}</td>
                  <td className="pr-3 text-right">
                    <Money
                      amount={p.feeAmount}
                      currency={currency}
                      className={cn(reversed ? "text-faint line-through" : "text-money")}
                    />
                  </td>
                  <td className="pr-4 text-right">
                    {live ? (
                      <Menu
                        label={`Actions for placement ${p.id}`}
                        align="end"
                        trigger={<MoreIcon className="h-5 w-5 p-0.5" />}
                        items={[
                          {
                            key: "fall-through",
                            label: "Mark fall-through",
                            icon: <XCircleIcon className="h-4 w-4" />,
                            destructive: true,
                            onSelect: () => onFallThrough(p),
                          },
                          {
                            key: "replace",
                            label: "Replace (no new fee)",
                            icon: <MergeIcon className="h-4 w-4" />,
                            onSelect: () => onReplace(p),
                          },
                        ]}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-sm text-muted">
        Cleared fees are earned for good; at-risk fees are still inside their guarantee window and
        can be reversed if a placement falls through.
      </p>
      <div className="px-4 pb-3">
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={onPage} />
      </div>
    </section>
  );
}

// ── Empty state (guided, not a void — design-system §6.8) ────────────────
function RevenueEmptyState() {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-line bg-subtle/40 p-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-tint">
        <TrendingUpIcon className="h-5 w-5 text-money" />
      </div>
      <p className="mt-3 text-body text-ink">No placements booked yet.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Log a placement from a job&apos;s pipeline — drag a candidate to Placed — and your booked
        revenue shows up here, tied to the exact records behind it.
      </p>
      <Link href="/jobs" className="mt-4 inline-flex">
        <Button variant="primary" size="sm">
          Go to jobs
        </Button>
      </Link>
    </div>
  );
}

// ── Loading / error ──────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-3 lg:gap-5">
        <div className="rounded-lg border border-line bg-surface p-6 sm:col-span-2 lg:p-7">
          <div className="h-3 w-40 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-2 h-9 w-56 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-2 h-3 w-48 rounded bg-subtle motion-safe:animate-pulse" />
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 lg:p-7">
          <div className="h-3 w-20 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-2 h-7 w-32 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-2 h-3 w-28 rounded bg-subtle motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-md border border-line bg-surface p-5">
            <div className="h-3 w-24 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="mt-2 h-6 w-20 rounded bg-subtle motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="h-3 w-28 rounded bg-subtle motion-safe:animate-pulse" />
        <div className="mt-4 flex items-end gap-3" style={{ height: 160 }}>
          {[40, 70, 55, 90, 65, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-subtle motion-safe:animate-pulse"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <div className="h-3 w-28 rounded bg-subtle motion-safe:animate-pulse" />
        </div>
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-full rounded bg-subtle motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <p className="text-body text-ink">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
        Try again
      </Button>
    </div>
  );
}
