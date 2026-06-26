"use client";

import { useCallback, useEffect, useState } from "react";
import type { DuplicateSuggestionDto, CandidateSummaryDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { useIngest } from "@/lib/ingest-context";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { CheckIcon, MergeIcon, SpinnerIcon, UsersIcon } from "@/components/ui/Icon";

// Dedup review (design-system Principle 6 — "trust through correction"). The AI
// flagged a freshly-ingested record as a possible match for an existing one; we
// NEVER auto-decide. The recruiter sees the two records side by side and chooses:
//   • Merge   → confirm (fold the new record into the existing one)
//   • Keep both → dismiss (they're different people)
// Resolution is optimistic (the card removes immediately) with a calm toast and a
// revert on failure. Honest copy, no alarm — a duplicate isn't an error.

export function DuplicateReviewSlideOver({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SlideOver open={open} onClose={onClose} title="Review possible duplicates">
      <SlideOverHeader onClose={onClose}>
        <h2 className="text-h2 text-ink">Review duplicates</h2>
        <p className="mt-0.5 text-sm text-muted">
          We spotted a few records that might be the same person. You decide — nothing is merged
          without you.
        </p>
      </SlideOverHeader>
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">{open ? <DuplicateList /> : null}</div>
    </SlideOver>
  );
}

function DuplicateList() {
  const { toast } = useToast();
  const { notifyParsed } = useIngest();
  const [items, setItems] = useState<DuplicateSuggestionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.listDuplicates());
    } catch {
      setError("We couldn't load the duplicates. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = useCallback(
    async (item: DuplicateSuggestionDto, action: "confirm" | "dismiss") => {
      setResolving((prev) => new Set(prev).add(item.id));
      // Optimistic removal — the decision feels instant (Principle 1).
      setItems((prev) => (prev ? prev.filter((d) => d.id !== item.id) : prev));
      try {
        await api.resolveDuplicate(item.id, action);
        if (action === "confirm") {
          toast(`Merged into ${item.duplicateOf.fullName}.`, "success");
          // A merge changes the candidate list — let it refresh.
          notifyParsed();
        } else {
          toast("Kept both as separate candidates.", "info");
        }
      } catch (err) {
        // Revert: put it back so she can retry.
        setItems((prev) => (prev ? [item, ...prev] : [item]));
        toast(
          err instanceof ApiError ? err.message : "Couldn't save that — please try again.",
          "error",
        );
      } finally {
        setResolving((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [notifyParsed, toast],
  );

  if (error) {
    return (
      <div className="py-10 text-center" role="alert">
        <p className="text-body text-ink">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (items === null) {
    return <ReviewSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-tint text-money">
          <CheckIcon className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <p className="mt-3 text-body text-ink">No duplicates to review.</p>
        <p className="mt-1 text-sm text-muted">Your candidate list is clean.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <DuplicateCard
            item={item}
            busy={resolving.has(item.id)}
            onMerge={() => void resolve(item, "confirm")}
            onKeepBoth={() => void resolve(item, "dismiss")}
          />
        </li>
      ))}
    </ul>
  );
}

function DuplicateCard({
  item,
  busy,
  onMerge,
  onKeepBoth,
}: {
  item: DuplicateSuggestionDto;
  busy: boolean;
  onMerge: () => void;
  onKeepBoth: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3 motion-safe:animate-[popIn_140ms_ease-out]">
      <p className="text-label uppercase text-muted">
        Matched on <span className="text-ink">{item.matchedOn}</span>
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
        <RecordCard label="New record" candidate={item.candidate} accent />
        <div
          className="flex items-center justify-center text-faint sm:flex-col"
          aria-hidden="true"
        >
          <MergeIcon className="h-4 w-4" />
        </div>
        <RecordCard label="Possible match" candidate={item.duplicateOf} />
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="primary" size="sm" onClick={onMerge} disabled={busy} className="flex-1">
          {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <MergeIcon className="h-4 w-4" />}
          Merge
        </Button>
        <Button variant="secondary" size="sm" onClick={onKeepBoth} disabled={busy} className="flex-1">
          Keep both
        </Button>
      </div>
    </div>
  );
}

function RecordCard({
  label,
  candidate,
  accent = false,
}: {
  label: string;
  candidate: CandidateSummaryDto;
  accent?: boolean;
}) {
  const role = [candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" @ ");
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border p-2.5",
        accent ? "border-brand/30 bg-brand-tint/40" : "border-line bg-subtle/50",
      )}
    >
      <p className="text-label uppercase text-muted">{label}</p>
      <p className="mt-0.5 truncate text-h3 text-ink">{candidate.fullName}</p>
      <p className="mt-0.5 truncate text-sm text-muted">{role || "—"}</p>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <li key={i} className="rounded-lg border border-line bg-surface p-3">
          <div className="h-3 w-24 rounded bg-subtle" />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-16 rounded-md bg-subtle" />
            <div className="h-16 rounded-md bg-subtle" />
          </div>
          <div className="mt-3 h-8 rounded-md bg-subtle" />
        </li>
      ))}
    </ul>
  );
}

/**
 * A quiet "Review duplicates (N)" entry button for the candidates screen. Polls
 * the pending count on mount; hides itself when there's nothing to review so it
 * never adds chrome to a clean list (Principle 7).
 */
export function DuplicateReviewButton({ onOpen }: { onOpen: () => void }) {
  const { parsedSignal } = useIngest();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .countDuplicates()
      .then(({ count }) => {
        if (active) setCount(count);
      })
      .catch(() => {
        // A failed count just hides the affordance — it's not load-bearing.
        if (active) setCount(0);
      });
    return () => {
      active = false;
    };
  }, [parsedSignal]);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning-tint px-2.5 py-1.5",
        "text-sm font-medium text-warning transition hover:bg-warning/10",
      )}
    >
      <UsersIcon className="h-4 w-4" />
      Review {count} {count === 1 ? "duplicate" : "duplicates"}
    </button>
  );
}
