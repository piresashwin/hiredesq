"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { ImportBatchDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SpinnerIcon } from "@/components/ui/Icon";

// Header job-progress indicator — shows parsing status for active bulk CV imports
// (status = "processing"). Polls every 3s while jobs are active, backs off to 30s
// when idle. No PII is rendered — only counts and ids (CLAUDE.md §2).

const ACTIVE_POLL_MS = 3_000;
const IDLE_POLL_MS = 30_000;

function batchLabel(b: ImportBatchDto): string {
  if (b.jobTitle) return b.jobTitle;
  if (b.source === "csv" || b.source === "xlsx") return "Spreadsheet import";
  return "CV folder drop";
}

function totalProgress(batches: ImportBatchDto[]): { done: number; total: number } {
  return batches.reduce(
    (acc, b) => ({ done: acc.done + b.done + b.duplicates, total: acc.total + b.total }),
    { done: 0, total: 0 },
  );
}

export function JobProgressIndicator() {
  const [batches, setBatches] = useState<ImportBatchDto[]>([]);
  const [open, setOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const active = await api.getActiveBatches();
      setBatches(active);
      // Reschedule at the right cadence without clearing on every tick
      const next = active.length > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => { void refresh(); }, next);
    } catch {
      // chrome only — degrade silently
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (batches.length === 0) return null;

  const { done, total } = totalProgress(batches);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Parsing CVs — ${done} of ${total} done`}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-label font-medium text-ink transition",
            "hover:bg-subtle",
            "data-[state=open]:bg-subtle",
          )}
        >
          <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-brand" />
          <span className="hidden sm:inline">
            {total > 0 ? `${done}/${total} CVs` : "Parsing…"}
          </span>
          {total > 0 && (
            <span
              className="hidden h-1 w-12 overflow-hidden rounded-full bg-line sm:block"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Active import jobs"
          className="z-40 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg outline-none motion-safe:animate-[popIn_140ms_ease-out]"
        >
          <div className="border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-ink">Parsing CVs</span>
            <p className="text-label text-muted">Updates every few seconds</p>
          </div>

          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {batches.map((b) => {
              const bDone = b.done + b.duplicates;
              const bPct = b.total > 0 ? Math.round((bDone / b.total) * 100) : 0;
              return (
                <li key={b.id} className="px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {batchLabel(b)}
                    </span>
                    <span className="shrink-0 text-label text-muted">
                      {bDone}/{b.total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-500"
                      style={{ width: `${bPct}%` }}
                      role="progressbar"
                      aria-valuenow={bDone}
                      aria-valuemin={0}
                      aria-valuemax={b.total}
                      aria-label={`${batchLabel(b)}: ${bDone} of ${b.total} parsed`}
                    />
                  </div>
                  {(b.failed > 0 || b.duplicates > 0) && (
                    <p className="mt-1 text-label text-muted">
                      {b.duplicates > 0 && `${b.duplicates} duplicate${b.duplicates !== 1 ? "s" : ""}`}
                      {b.duplicates > 0 && b.failed > 0 && " · "}
                      {b.failed > 0 && `${b.failed} failed`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
