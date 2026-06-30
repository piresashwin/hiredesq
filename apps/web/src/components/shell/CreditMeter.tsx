"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useIngest } from "@/lib/ingest-context";
import { cn } from "@/lib/cn";
import { resetLabel } from "@/lib/format";
import { ClockIcon } from "@/components/ui/Icon";

// Credit meter (design-system §6.8): a quiet pill in the top bar showing the monthly
// SUBMISSION allotment. Under Model B (§F3) the monthly meter gates client-ready
// SUBMISSION generation — resume parsing is free. Turns `warning` under ~15% —
// never a blocking wall (MVP-SPEC §4). Fed by getCredits; degrades silently if the
// call fails (it's chrome, not a gate).

const LOW_RATIO = 0.15;

export function CreditMeter() {
  const { creditsSignal } = useIngest();
  const [balance, setBalance] = useState<number | null>(null);
  const [allotment, setAllotment] = useState<number | null>(null);
  const [resetsAt, setResetsAt] = useState<string | null>(null);

  // Re-fetch on mount AND whenever a generation spends a credit (creditsSignal) so
  // the pill never shows a stale balance until a full reload.
  useEffect(() => {
    let cancelled = false;
    api
      .getCredits()
      .then((c) => {
        if (cancelled) return;
        setBalance(c.balance);
        setAllotment(c.monthlyAllotment);
        setResetsAt(c.resetsAt);
      })
      .catch(() => {
        // chrome only — leave the pill hidden if credits can't be read
      });
    return () => {
      cancelled = true;
    };
  }, [creditsSignal]);

  if (balance === null) return null;

  const low = allotment !== null && allotment > 0 && balance / allotment <= LOW_RATIO;
  const resets = resetsAt ? resetLabel(resetsAt) : "";
  const resetsSuffix = resets ? ` — resets ${resets}` : "";

  return (
    <Link
      href="/settings/billing"
      aria-label={`${balance} client-ready submissions left this month${resetsSuffix}. View credits and plan.`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition",
        low
          ? "border-warning/30 bg-warning-tint text-warning hover:bg-warning-tint/70"
          : "border-line bg-surface text-muted hover:bg-subtle hover:text-ink",
      )}
      title={
        low
          ? `${balance} submissions left — running low${resetsSuffix}. View plan.`
          : `${balance} submissions left this month${resetsSuffix}. View plan.`
      }
    >
      <ClockIcon className="h-3.5 w-3.5" />
      <span className="nums tabular-nums">{balance}</span>
      <span className="sr-only">client-ready submissions remaining this month</span>
    </Link>
  );
}
