"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HomeAttentionItemDto, HomeOverviewDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useIngest } from "@/lib/ingest-context";
import { resetLabel, timeAgo } from "@/lib/format";
import { Money } from "@/components/ui/Money";
import { Button } from "@/components/ui/Button";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  MergeIcon,
  PlusIcon,
  TrendingUpIcon,
  UsersIcon,
  BriefcaseIcon,
} from "@/components/ui/Icon";

// The account-at-a-glance home (the signed-in landing). A warm welcome, a single
// trustworthy money headline (revenue CLEARED — reconciles with the revenue
// dashboard, §3), and the handful of things that actually need the recruiter
// today. Deliberately NOT a metrics wall (MVP-SPEC §3 defers vanity analytics) —
// every block either reassures ("you're caught up") or routes to a next action.

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function HomeDashboard() {
  const { user } = useAuth();
  const { openIngest } = useIngest();
  const [overview, setOverview] = useState<HomeOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await api.getHomeOverview());
    } catch {
      setError("We couldn't load your home. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Greeting is purely presentational; compute once on mount (client clock).
  const hello = useMemo(() => greeting(new Date().getHours()), []);
  const name = firstName(user?.fullName ?? "");

  const attentionTotal = overview
    ? overview.clearingSoon.count + overview.awaitingVerdict.count + overview.duplicatesPending
    : 0;

  const subtitle = loading
    ? "Pulling your desk together…"
    : error
      ? "We hit a snag loading your desk."
      : overview && !overview.hasAnyData
        ? "Let's turn your scattered CVs and chats into a clean candidate database."
        : attentionTotal > 0
          ? "A few things could use your attention today."
          : "You're all caught up — nothing needs you right now.";

  return (
    <div className="flex h-full flex-col">
      {/* Welcome band — warm, generous, the first thing the recruiter sees. The
          band background stays full-bleed; its content is capped + centered so it
          doesn't stretch on wide screens (matches the content area below). */}
      <div className="border-b border-line bg-gradient-to-b from-brand-tint/50 to-canvas px-4 py-6 sm:px-6 sm:py-7">
        <div className="mx-auto w-full max-w-screen-2xl">
          <h1 className="text-h1 text-ink">
            {hello}
            {name ? <span className="text-brand">, {name}</span> : null}.
          </h1>
          <p className="mt-1 text-body text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-2xl flex-1 space-y-6 px-4 py-5 sm:px-6">
        {loading ? (
          <HomeSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : overview && !overview.hasAnyData ? (
          <FirstRun onAdd={openIngest} />
        ) : overview ? (
          <ReturningHome overview={overview} onAdd={openIngest} />
        ) : null}
      </div>
    </div>
  );
}

// ── Returning recruiter: glance strip + what needs attention ───────────────
function ReturningHome({
  overview,
  onAdd,
}: {
  overview: HomeOverviewDto;
  onAdd: () => void;
}) {
  const { currency, revenueCleared, poolSize, openJobs, clearingSoon, awaitingVerdict } = overview;
  const nothingPending =
    clearingSoon.count === 0 && awaitingVerdict.count === 0 && overview.duplicatesPending === 0;

  return (
    <>
      {/* GLANCE — three calm tiles, each a doorway to the surface behind it. */}
      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-label="At a glance"
        data-tour="home-glance"
      >
        <GlanceTile
          href="/revenue"
          label="Revenue cleared"
          icon={<TrendingUpIcon className="h-4 w-4 text-money" />}
          hint="Earned — guarantee windows elapsed"
        >
          <Money amount={revenueCleared} currency={currency} className="text-h1 text-money" />
        </GlanceTile>
        <GlanceTile
          href="/candidates"
          label="Candidates"
          icon={<UsersIcon className="h-4 w-4 text-brand" />}
          hint="In your clean, searchable pool"
        >
          <span className="nums text-h1 tabular-nums text-ink">{poolSize}</span>
        </GlanceTile>
        <GlanceTile
          href="/jobs"
          label="Open jobs"
          icon={<BriefcaseIcon className="h-4 w-4 text-brand" />}
          hint="Positions you're actively working"
        >
          <span className="nums text-h1 tabular-nums text-ink">{openJobs}</span>
        </GlanceTile>
      </section>

      {/* NEEDS ATTENTION — the reason this page exists. */}
      <section aria-label="Needs attention" className="space-y-3" data-tour="home-attention">
        <h2 className="text-h3 text-ink">Needs attention</h2>

        {nothingPending ? (
          <AllCaughtUp onAdd={onAdd} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {clearingSoon.count > 0 ? (
              <AttentionCard
                tone="warning"
                icon={<ClockIcon className="h-4 w-4" />}
                count={clearingSoon.count}
                title={`${clearingSoon.count === 1 ? "Placement" : "Placements"} clearing soon`}
                blurb="Inside the guarantee window, about to become earned revenue."
                items={clearingSoon.items}
                meta={(it) => `Clears ${resetLabel(it.when)}`}
                cta={{ href: "/revenue", label: "Review in revenue" }}
              />
            ) : null}

            {awaitingVerdict.count > 0 ? (
              <AttentionCard
                tone="brand"
                icon={<EyeIcon className="h-4 w-4" />}
                count={awaitingVerdict.count}
                title="Awaiting a client verdict"
                blurb="Submissions sent — nudge the client or log their decision."
                items={awaitingVerdict.items}
                meta={(it) => `Sent ${timeAgo(it.when)}`}
                cta={{ href: "/candidates", label: "Open candidates" }}
              />
            ) : null}

            {overview.duplicatesPending > 0 ? (
              <AttentionCard
                tone="brand"
                icon={<MergeIcon className="h-4 w-4" />}
                count={overview.duplicatesPending}
                title={`${overview.duplicatesPending} possible ${
                  overview.duplicatesPending === 1 ? "duplicate" : "duplicates"
                }`}
                blurb="Same person across a resume and a chat? Merge or keep both."
                items={[]}
                meta={() => ""}
                cta={{ href: "/candidates", label: "Review duplicates" }}
              />
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

// ── A glance tile: label + icon + big value, the whole card a link ─────────
function GlanceTile({
  href,
  label,
  icon,
  hint,
  children,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-line bg-surface p-5 transition hover:border-brand/30 hover:bg-subtle/40"
    >
      <div className="flex items-center gap-1.5 text-label uppercase text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
        {hint}
        <ArrowRightIcon className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </p>
    </Link>
  );
}

// ── An attention queue card: count + short named preview + one CTA ─────────
function AttentionCard({
  tone,
  icon,
  count,
  title,
  blurb,
  items,
  meta,
  cta,
}: {
  tone: "warning" | "brand";
  icon: React.ReactNode;
  count: number;
  title: string;
  blurb: string;
  items: HomeAttentionItemDto[];
  meta: (item: HomeAttentionItemDto) => string;
  cta: { href: string; label: string };
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-lg border bg-surface p-5",
        tone === "warning" ? "border-warning/30 bg-warning-tint/30" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-md",
              tone === "warning" ? "bg-warning-tint text-warning" : "bg-brand-tint text-brand",
            )}
          >
            {icon}
          </span>
          <div>
            <h3 className="text-h3 text-ink">{title}</h3>
            <p className="mt-0.5 text-sm text-muted">{blurb}</p>
          </div>
        </div>
        <span
          className={cn(
            "nums shrink-0 rounded-full px-2 py-0.5 text-label font-semibold tabular-nums",
            tone === "warning" ? "bg-warning-tint text-warning" : "bg-brand-tint text-brand",
          )}
        >
          {count}
        </span>
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                {it.name}
                {it.detail ? <span className="text-muted"> · {it.detail}</span> : null}
              </span>
              <span className="nums shrink-0 tabular-nums text-muted">{meta(it)}</span>
            </li>
          ))}
          {count > items.length ? (
            <li className="text-sm text-muted">+{count - items.length} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-4 pt-0">
        <Link href={cta.href}>
          <Button variant="secondary" size="sm">
            {cta.label}
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </article>
  );
}

// ── All caught up — reassurance, not a void (design-system §6.8) ───────────
function AllCaughtUp({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-7 text-center sm:p-8">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-tint">
        <CheckIcon className="h-5 w-5 text-money" />
      </div>
      <p className="mt-3 text-body font-medium text-ink">Nothing needs you right now.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        No placements clearing this week, no submissions waiting on a client, no duplicates to
        review. A good moment to top up your pipeline.
      </p>
      <div className="mt-4 inline-flex">
        <Button variant="primary" size="sm" onClick={onAdd}>
          <PlusIcon className="h-4 w-4" strokeWidth={2} />
          Add candidates
        </Button>
      </div>
    </div>
  );
}

// ── First run — the empty-state killer (MVP-SPEC §2A, design-system Principle 2).
function FirstRun({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-8 text-center sm:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
        <UsersIcon className="h-6 w-6 text-brand" />
      </div>
      <h2 className="mt-4 text-h1 text-ink">Let's build your candidate database.</h2>
      <p className="mx-auto mt-2 max-w-md text-body text-muted">
        Forward a messy CV, paste a WhatsApp chat, or drop a folder of resumes. In about two
        minutes you'll have a clean, deduplicated, searchable pool — you didn't type a word.
      </p>

      <div className="mx-auto mt-6 grid max-w-md gap-2 text-left sm:grid-cols-3">
        <MiniStep n={1} label="Forward the mess" />
        <MiniStep n={2} label="We parse & dedupe it" />
        <MiniStep n={3} label="See your clean pool" />
      </div>

      <div className="mt-7 inline-flex">
        <Button variant="primary" size="md" onClick={onAdd}>
          <PlusIcon className="h-4 w-4" strokeWidth={2} />
          Add your first candidates
        </Button>
      </div>
    </div>
  );
}

function MiniStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-subtle/40 px-3 py-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-tint text-label font-semibold text-brand">
        {n}
      </span>
      <span className="text-sm text-ink">{label}</span>
    </div>
  );
}

// ── Loading / error ────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-5">
            <div className="h-3 w-28 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="mt-2 h-7 w-24 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="mt-2 h-3 w-36 rounded bg-subtle motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-5">
            <div className="h-4 w-44 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full rounded bg-subtle motion-safe:animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-subtle motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
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
