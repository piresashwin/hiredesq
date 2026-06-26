"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportBatchDto } from "@hiredesq/shared";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import {
  CheckIcon,
  FolderIcon,
  SparkleIcon,
  SpinnerIcon,
  UsersIcon,
} from "@/components/ui/Icon";

// The bulk-drop progress view (design-system §6.2 + §8): "I had 200 resumes in
// Drive." We poll getImportBatch(id) and show a live, calm progress bar with
// recruiter-native counts ("Reading 40 resumes… 38 done · 2 merged · 0 failed").
// On done it becomes a tasteful summary with a path to the candidates and a nudge
// to review any duplicates. Counts use tabular figures so they don't jump as they
// tick (§7). Animation degrades to instant under prefers-reduced-motion.

const POLL_MS = 1200;
const POLL_TIMEOUT_MS = 10 * 60_000;

export function BatchProgress({
  batchId,
  /** How many items the upload accepted up-front, so we can render the bar
   *  before the first poll lands (perceived speed, Principle 1). */
  initialTotal,
  /** Job-centric inbound (§2A, F7): the role this drop targeted, if any. Passed
   *  up-front so the label can name the role before the first poll; the polled
   *  ImportBatchDto.jobTitle takes over once it lands. */
  jobTitle: initialJobTitle,
  onDone,
  onReviewDuplicates,
}: {
  batchId: string;
  initialTotal: number;
  jobTitle?: string | null;
  /** Fired once, when the batch reaches "done" — list screens refresh on it. */
  onDone?: (batch: ImportBatchDto) => void;
  /** Surface the dedup-review entry when the batch produced duplicates. */
  onReviewDuplicates?: () => void;
}) {
  const [batch, setBatch] = useState<ImportBatchDto | null>(null);
  const [stalled, setStalled] = useState(false);
  const timer = useRef<number | null>(null);
  const firedDone = useRef(false);

  useEffect(() => {
    const startedAt = Date.now();
    let active = true;

    const tick = () => {
      api
        .getImportBatch(batchId)
        .then((next) => {
          if (!active) return;
          setBatch(next);
          if (next.status === "done") {
            if (!firedDone.current) {
              firedDone.current = true;
              onDone?.(next);
            }
            return;
          }
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setStalled(true);
            return;
          }
          timer.current = window.setTimeout(tick, POLL_MS);
        })
        .catch(() => {
          if (!active) return;
          // Keep the last good snapshot; just note we lost the live feed.
          setStalled(true);
        });
    };

    tick();
    return () => {
      active = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [batchId, onDone]);

  const total = batch?.total ?? initialTotal;
  const done = batch?.done ?? 0;
  const failed = batch?.failed ?? 0;
  const duplicates = batch?.duplicates ?? 0;
  const processed = Math.min(done + failed, total);
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isDone = batch?.status === "done";
  // Prefer the server's record once polled; fall back to the up-front title.
  const jobTitle = batch?.jobTitle ?? initialJobTitle ?? null;
  const jobId = batch?.jobId ?? null;

  return (
    <section
      className="rounded-lg border border-line bg-surface p-4"
      aria-label="Bulk import progress"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            isDone ? "bg-success-tint text-money" : "bg-brand-tint text-brand",
          )}
        >
          {isDone ? (
            <CheckIcon className="h-4 w-4 check-pop" strokeWidth={2.5} />
          ) : (
            <FolderIcon className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-h3 text-ink" aria-live="polite">
            {isDone ? (
              <>
                Done — read <span className="nums tabular-nums">{done}</span>{" "}
                {pluralize(done, "candidate")}
                {jobTitle ? (
                  <>
                    {" "}
                    for <span className="font-semibold text-brand">{jobTitle}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                Reading <span className="nums tabular-nums">{total}</span>{" "}
                {jobTitle ? pluralize(total, "CV") : pluralize(total, "file")}
                {jobTitle ? (
                  <>
                    {" "}
                    for <span className="font-semibold text-brand">{jobTitle}</span>
                  </>
                ) : null}
                …
              </>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            <span className="nums tabular-nums">{done}</span> done
            {duplicates > 0 ? (
              <>
                {" · "}
                <span className="nums tabular-nums">{duplicates}</span>{" "}
                {duplicates === 1 ? "possible duplicate" : "possible duplicates"}
              </>
            ) : null}
            {" · "}
            <span className={cn("nums tabular-nums", failed > 0 && "text-warning")}>{failed}</span>{" "}
            failed
          </p>
        </div>
      </div>

      {/* Progress bar. While processing the fill animates toward the live pct. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Files processed"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            isDone ? "bg-money" : "bg-brand",
          )}
          style={{ width: `${Math.max(pct, processed > 0 ? 4 : 0)}%` }}
        />
      </div>

      {stalled && !isDone ? (
        <p className="mt-2 text-sm text-warning" role="status">
          This is taking longer than usual — your candidates will keep landing on the list as they
          finish.
        </p>
      ) : null}

      {!isDone && !stalled ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
          Cleaning each one up — you can keep working.
        </p>
      ) : null}

      {isDone ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href={jobId ? `/jobs/${jobId}` : "/candidates"}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold",
              "bg-brand text-brand-fg transition hover:bg-brand-hover",
            )}
          >
            <UsersIcon className="h-4 w-4" />
            {jobId ? "View pipeline" : "View candidates"}
          </Link>
          {duplicates > 0 && onReviewDuplicates ? (
            <Button variant="secondary" size="sm" onClick={onReviewDuplicates}>
              <SparkleIcon className="h-4 w-4" />
              Review {duplicates} {pluralize(duplicates, "duplicate")}
            </Button>
          ) : null}
          {failed > 0 ? (
            <span className="text-sm text-muted">
              <span className="nums tabular-nums">{failed}</span> couldn&apos;t be read — try
              pasting those.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function pluralize(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
