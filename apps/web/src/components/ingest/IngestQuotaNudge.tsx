"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ingestNudgeLevel, type IngestNudgeLevel } from "@hiredesq/shared";
import { api, ingestNudgeStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useIngest } from "@/lib/ingest-context";
import { cn } from "@/lib/cn";
import { CloseIcon, SparkleIcon } from "@/components/ui/Icon";

// Approaching-ingest-limit upgrade nudge (CLAUDE.md §4/§5). Parsing is the magic
// moment and free — but metered per period (free = 500 lifetime, solo_pro = 200/mo).
// This is the in-app, celebratory half of the escalating nudge: it appears at the
// "banner" level (~90%) as a dismissible milestone and hardens at "wall" (100%) into
// "you've reached your free parses". Pride, not pressure (design-system §6.8 — never
// a paywall on the core product). The proactive bell notification (worker-emitted)
// is the other half. Counts only — never PII (§2). Mounted once in the app shell.

const NUDGE_PERIOD = (period: string | null): string =>
  // A token that changes when a monthly meter resets, so a dismiss re-arms next
  // month; "lifetime" (free) never resets, so a dismiss sticks until it escalates.
  period === "monthly" ? new Date().toISOString().slice(0, 7) : "lifetime";

export function IngestQuotaNudge() {
  const { user } = useAuth();
  const { creditsSignal } = useIngest();
  const [used, setUsed] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  // Bumped on dismiss to force a re-read of the (just-written) dismissed level.
  const [dismissTick, setDismissTick] = useState(0);

  // Re-fetch on mount and whenever a parse completes (creditsSignal) so the banner
  // appears/escalates promptly. Chrome only — silent on failure.
  useEffect(() => {
    let cancelled = false;
    api
      .getCredits()
      .then((c) => {
        if (cancelled) return;
        setUsed(c.ingestUsed);
        setLimit(c.ingestFreeLimit);
        setPeriod(c.ingestPeriod);
      })
      .catch(() => {
        /* chrome only — never gates the surface */
      });
    return () => {
      cancelled = true;
    };
  }, [creditsSignal]);

  const level: IngestNudgeLevel = used === null ? "none" : ingestNudgeLevel(used, limit);
  const workspaceId = user?.workspaceId ?? null;
  const periodToken = NUDGE_PERIOD(period);

  // Show only at banner/wall, and only when this level hasn't already been dismissed
  // for this period. A dismiss at "banner" still lets "wall" through (level mismatch).
  const visible = useMemo(() => {
    if (!workspaceId || (level !== "banner" && level !== "wall")) return false;
    void dismissTick; // re-evaluate after a dismiss writes to the store
    return ingestNudgeStore.dismissedLevel(workspaceId, periodToken) !== level;
  }, [workspaceId, level, periodToken, dismissTick]);

  if (!visible || used === null || limit === null) return null;

  const wall = level === "wall";
  const lifetime = period === "lifetime";

  return (
    <div
      className="border-b border-warning/30 bg-warning-tint"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-warning">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">
            {wall
              ? lifetime
                ? `You've built ${limit.toLocaleString()} candidates on the free plan 🎉`
                : `You've used all ${limit.toLocaleString()} parses this month 🎉`
              : `You've parsed ${used.toLocaleString()} of ${limit.toLocaleString()} candidates 🎉`}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {wall
              ? "Parsing is paused until you upgrade — everything you've already built stays free."
              : "You're outgrowing the free plan. Upgrade to keep your pipeline growing without limits."}
          </p>
        </div>
        <Link
          href="/settings/billing"
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition",
            "bg-brand text-brand-fg hover:bg-brand-hover",
          )}
        >
          See plans
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            if (workspaceId) ingestNudgeStore.dismiss(workspaceId, periodToken, level);
            setDismissTick((t) => t + 1);
          }}
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-warning/10 hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
