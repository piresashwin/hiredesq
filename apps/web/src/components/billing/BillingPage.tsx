"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CreditBalanceDto } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { resetLabel } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CheckIcon } from "@/components/ui/Icon";

// Credits / Upgrade surface (design-system §6.8, MVP-SPEC §4). Hitting the daily
// cap is framed as an UPGRADE INVITATION, never a paywall. Under Model B (§F3) the
// daily meter gates client-ready SUBMISSION generation; RESUME PARSING IS FREE
// (metered separately by a generous lifetime ingest quota). The clean database,
// search, jobs, and revenue are FREE FOREVER and must never read as gated.
// Live-backed by getCredits(); the "Upgrade to Team" CTA opens real Stripe Checkout
// (F8) and the Team state opens the Stripe billing portal — the page never shows a
// card, only redirects to Stripe-hosted pages.

const LOW_RATIO = 0.15;

// What every plan keeps for free, forever — stated up front so nothing core ever
// reads as gated (CLAUDE.md §4: DB/search/jobs/revenue are free).
const FREE_FOREVER = [
  "Your full candidate database",
  "Search across every candidate",
  "Jobs & pipeline (Kanban + list)",
  "The revenue dashboard",
];

const TEAM_EXTRAS = [
  "Many more client-ready submissions per day",
  "Bulk imports (a folder of 200 resumes)",
  "Invite your team (up to 10 seats)",
  "Shared workspace & pipeline",
];

// A 403 from the owner-only billing endpoints (F8) — surfaced calmly, never as a
// raw server error.
const OWNER_ONLY_MESSAGE = "Only the workspace owner can manage billing.";

function billingErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return OWNER_ONLY_MESSAGE;
    return err.message;
  }
  return fallback;
}

export function BillingPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [credits, setCredits] = useState<CreditBalanceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Redirecting to a Stripe-hosted page (checkout or portal) — drives the busy
  // CTA state. The redirect leaves the SPA, so we never reset this on success.
  const [redirecting, setRedirecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCredits();
      setCredits(data);
    } catch (err) {
      setError(billingErrorMessage(err, "We couldn't load your plan. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stripe return states (F8). On ?upgrade=success the webhook may not have flipped
  // plan→team yet, so we refetch once and reassure; on cancelled we note it quietly.
  // Either way we clear the param so a refresh doesn't replay the banner.
  const upgrade = searchParams.get("upgrade");
  useEffect(() => {
    if (upgrade !== "success" && upgrade !== "cancelled") return;
    if (upgrade === "success") {
      toast("Welcome to Team — your upgrade is being confirmed.", "success");
      void load();
    } else {
      toast("Checkout cancelled — no changes were made.", "info");
    }
    router.replace("/settings/billing");
  }, [upgrade, toast, load, router]);

  const handleUpgrade = useCallback(async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      const { url } = await api.startCheckout();
      window.location.href = url;
    } catch (err) {
      toast(billingErrorMessage(err, "Couldn't start checkout — please try again."), "error");
      setRedirecting(false);
    }
  }, [redirecting, toast]);

  const handleManageBilling = useCallback(async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      const { url } = await api.openBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast(billingErrorMessage(err, "Couldn't open billing — please try again."), "error");
      setRedirecting(false);
    }
  }, [redirecting, toast]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="text-h1 text-ink">Credits & plan</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your daily credits power client-ready submissions. Resume parsing is free.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-5 sm:px-6">
        {loading ? (
          <BillingSkeleton />
        ) : error || !credits ? (
          <ErrorState
            message={error ?? "We couldn't load your plan. Please try again."}
            onRetry={() => void load()}
          />
        ) : (
          <BillingContent
            credits={credits}
            redirecting={redirecting}
            onUpgrade={handleUpgrade}
            onManageBilling={handleManageBilling}
          />
        )}
      </div>
    </div>
  );
}

function BillingContent({
  credits,
  redirecting,
  onUpgrade,
  onManageBilling,
}: {
  credits: CreditBalanceDto;
  redirecting: boolean;
  onUpgrade: () => void;
  onManageBilling: () => void;
}) {
  const { balance, dailyAllotment, used, resetsAt, plan, ingestUsedLifetime, ingestFreeLimit } =
    credits;
  const isTeam = plan === "team";
  const ratio = dailyAllotment > 0 ? balance / dailyAllotment : 0;
  // On Team the lifted allotment means the meter never reads as a near-cap nudge.
  const low = !isTeam && dailyAllotment > 0 && ratio <= LOW_RATIO;
  const usedPct = dailyAllotment > 0 ? Math.min(100, Math.round((used / dailyAllotment) * 100)) : 0;
  const resets = resetLabel(resetsAt);
  // Model B (§F3): resume parsing is free, metered by a lifetime ingest quota.
  const parsesLeft = Math.max(0, ingestFreeLimit - ingestUsedLifetime);

  return (
    <>
      {/* Usage meter */}
      <section
        className={cn(
          "rounded-lg border bg-surface p-5",
          low ? "border-warning/40" : "border-line",
        )}
        aria-label="Daily submission credit usage"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-label uppercase text-muted">Client-ready submissions today</div>
            <div className="mt-1">
              <span className="nums text-display tabular-nums text-ink">{balance}</span>
              <span className="nums text-h3 tabular-nums text-muted"> / {dailyAllotment}</span>
            </div>
          </div>
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-label font-medium capitalize",
              plan === "team" ? "bg-brand-tint text-brand" : "bg-subtle text-muted",
            )}
          >
            {plan} plan
          </span>
        </div>

        <div
          className="mt-4 h-2.5 w-full overflow-hidden rounded-sm bg-subtle"
          role="progressbar"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily submissions used"
        >
          <div
            className={cn(
              "h-full rounded-sm transition-[width] duration-500 motion-reduce:transition-none",
              low ? "bg-warning" : "bg-brand",
            )}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className={cn("mt-2 text-sm", low ? "text-warning" : "text-muted")}>
          {isTeam ? (
            <>
              You&apos;re on <span className="font-medium text-ink">Team</span> — submissions are no
              longer capped at the free daily limit.{" "}
              <span className="nums tabular-nums">{used}</span> generated today
              {resets ? <> — your meter resets {resets}</> : null}.
            </>
          ) : low ? (
            <>
              You&apos;re running low on submissions —{" "}
              <span className="font-medium">{balance} left</span>
              {resets ? <>, resets {resets}</> : null}. Upgrade for more (your database, search,
              jobs, and revenue stay free regardless).
            </>
          ) : (
            <>
              <span className="nums tabular-nums">{used}</span> of{" "}
              <span className="nums tabular-nums">{dailyAllotment}</span> submissions used
              {resets ? <> — resets {resets}</> : null}. They reset every day — no rollover.
            </>
          )}
        </p>

        {/* Model B: resume parsing is free, metered by the lifetime ingest quota. */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">Resume parsing is free.</span>{" "}
            <span className="nums tabular-nums">{parsesLeft.toLocaleString()}</span> of{" "}
            <span className="nums tabular-nums">{ingestFreeLimit.toLocaleString()}</span> free
            parses remaining — paste or upload as much as you like to build your database.
          </p>
        </div>
      </section>

      {/* Free-forever reassurance (never a paywall on core) */}
      <section className="rounded-lg border border-line bg-brand-tint/40 p-4">
        <p className="text-body text-ink">
          <span className="font-semibold">Free forever:</span> your database, search, jobs, and
          revenue — plus resume parsing. Daily credits only ever limit how many client-ready
          submissions you generate, never the candidates you already have.
        </p>
      </section>

      {/* Free vs Team comparison */}
      <section aria-label="Plan comparison" className="grid gap-3 md:grid-cols-2">
        <PlanCard
          name="Free"
          tagline="For a solo desk getting started."
          price="$0"
          cadence="forever"
          current={plan === "free"}
          features={[
            ...FREE_FOREVER,
            "Free resume parsing",
            `${dailyAllotment} client-ready submissions / day`,
          ]}
        />
        <PlanCard
          name="Team"
          tagline="For a growing agency of up to 10."
          price="$—"
          cadence="per month"
          highlight
          current={plan === "team"}
          features={[...FREE_FOREVER, ...TEAM_EXTRAS]}
          cta={
            isTeam ? (
              <Button
                variant="secondary"
                onClick={onManageBilling}
                disabled={redirecting}
                aria-busy={redirecting}
                className="w-full"
              >
                {redirecting ? "Opening…" : "Manage billing"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={onUpgrade}
                disabled={redirecting}
                aria-busy={redirecting}
                className="w-full"
              >
                {redirecting ? "Redirecting…" : "Upgrade to Team"}
              </Button>
            )
          }
        />
      </section>

      {isTeam ? (
        <p className="text-sm text-muted">
          You&apos;re on Team. Manage your subscription, payment method, and invoices anytime via{" "}
          <span className="font-medium text-ink">Manage billing</span> above —{" "}
          <Link href="/candidates" className="text-brand hover:underline">
            back to your candidates
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-muted">
          You&apos;ll be redirected to Stripe to complete your upgrade securely — we never see your
          card. Prefer to wait? Keep working on Free as long as you like —{" "}
          <Link href="/candidates" className="text-brand hover:underline">
            back to your candidates
          </Link>
          .
        </p>
      )}
    </>
  );
}

function PlanCard({
  name,
  tagline,
  price,
  cadence,
  features,
  highlight = false,
  current = false,
  cta,
}: {
  name: string;
  tagline: string;
  price: string;
  cadence?: string;
  features: string[];
  highlight?: boolean;
  current?: boolean;
  cta?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-surface p-5",
        highlight ? "border-brand/50 shadow-sm" : "border-line",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-ink">{name}</h2>
        {current ? (
          <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-label font-medium text-muted">
            Current
          </span>
        ) : highlight ? (
          <span className="rounded-sm bg-brand-tint px-1.5 py-0.5 text-label font-medium text-brand">
            Recommended
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm text-muted">{tagline}</p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="nums text-h1 tabular-nums text-ink">{price}</span>
        {cadence ? <span className="text-sm text-muted">{cadence}</span> : null}
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-body text-ink">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {cta ? <div className="mt-5">{cta}</div> : null}
    </div>
  );
}

// Skeleton matching the final shape (meter card → reassurance → two plan cards),
// never a centered spinner on a blank page (design-system §6.8, Principle 1).
function BillingSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="h-3 w-32 rounded-sm bg-subtle" />
        <div className="mt-2 h-8 w-24 rounded-sm bg-subtle" />
        <div className="mt-4 h-2.5 w-full rounded-sm bg-subtle" />
        <div className="mt-2 h-3 w-48 rounded-sm bg-subtle" />
      </div>
      <div className="mt-6 h-16 rounded-lg border border-line bg-subtle/60" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="h-64 rounded-lg border border-line bg-surface" />
        <div className="h-64 rounded-lg border border-line bg-surface" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface py-12 text-center" role="alert">
      <p className="text-body text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-line px-3 py-1.5 text-body text-brand transition hover:bg-subtle"
      >
        Try again
      </button>
    </div>
  );
}
