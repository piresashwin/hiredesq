"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ingestNudgeLevel,
  type BulkIngestResponse,
  type CreditBalanceDto,
  type ImportBatchDto,
} from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { useIngest } from "@/lib/ingest-context";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { resetLabel } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import {
  BriefcaseIcon,
  FolderIcon,
  SheetIcon,
  SparkleIcon,
  SpinnerIcon,
  UploadCloudIcon,
} from "@/components/ui/Icon";
import { ParseCard, type ParseItemState } from "@/components/ingest/ParseCard";
import { BatchProgress } from "@/components/ingest/BatchProgress";

// The empty-state killer (design-system §6.2) + the live parse reveal (§8). The
// recruiter pastes OR DROPS her mess and WATCHES it become clean candidates.
//
// Phase 1 (untouched): the paste textarea → ingest() → poll → reveal.
// Phase 2 (this file): the dashed zone is now a REAL drop target —
//   • drag files / a whole folder onto it,
//   • click to browse (multiple files),
//   • pick a folder (webkitdirectory),
//   • accept CSV / XLSX.
//   On drop/select → uploadFiles(). A SMALL drop (single item, no batchId) reveals
//   per-item ParseCards exactly like the paste path. A BULK drop (batchId) shows a
//   live BatchProgress panel instead — the "I had 200 resumes in Drive" moment.
//
// No "upload then click parse" two-step: a drop starts the work immediately.

const POLL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

// Native HTML file picking only (task constraint — no dropzone libs). We accept
// the document/image types the pipeline reads plus spreadsheets for list imports.
const ACCEPT =
  ".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx," +
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "text/csv,application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";

interface ParseItem {
  key: number;
  label: string;
  state: ParseItemState;
}

interface BatchState {
  id: string;
  total: number;
}

export function IngestSurface({
  variant = "panel",
  autoFocus = false,
  onReviewDuplicates,
  targetJob,
  onParsed,
}: {
  /** "panel" inside the slide-over; "page" as the candidates empty-state hero. */
  variant?: "panel" | "page";
  autoFocus?: boolean;
  /** Lets the surface surface a dedup-review entry after a bulk import. */
  onReviewDuplicates?: () => void;
  /** Job-centric inbound (§2A, F7): when set, every CV pasted/dropped here
   *  auto-attaches to this role's pipeline (lands in Sourced). When unset the
   *  surface behaves exactly as before — candidates land in the global pool. */
  targetJob?: { id: string; title: string };
  /** Fired after a candidate lands (paste/small drop done, or a bulk batch
   *  finishes) so a host (the job board) can refresh its own data. */
  onParsed?: () => void;
}) {
  const { notifyParsed, parsedSignal } = useIngest();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<ParseItem[]>([]);
  const [batch, setBatch] = useState<BatchState | null>(null);
  // AI-credit state (design-system §6.8). null = not yet known (degrade silently
  // like the meter — never block the surface because we couldn't read credits).
  const [credits, setCredits] = useState<CreditBalanceDto | null>(null);
  const nextKey = useRef(1);
  const timers = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(window.clearTimeout);
  }, []);

  // Read the AI allotment so the surface can show a calm upgrade invitation when
  // it's exhausted — instead of a dead/silent submit (MVP-SPEC §4). Refresh after
  // each completed parse (parsedSignal) so the local view stays in step.
  const refreshCredits = useCallback(() => {
    api
      .getCredits()
      .then(setCredits)
      .catch(() => {
        // chrome only — if credits can't be read we let the parse path run and
        // rely on the server's 402 to surface the cap (handled on submit).
      });
  }, []);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits, parsedSignal]);

  // The free AI allotment is exhausted. We only treat a *known* zero balance as
  // exhausted; an unknown balance never gates the surface.
  const outOfCredits = credits !== null && credits.monthlyAllotment > 0 && credits.balance <= 0;
  const resets = credits ? resetLabel(credits.resetsAt) : "";
  // Quiet "N left" hint near the submit when low-but-not-zero (don't nag).
  const lowRemaining =
    credits !== null &&
    credits.monthlyAllotment > 0 &&
    credits.balance > 0 &&
    credits.balance / credits.monthlyAllotment <= 0.15
      ? credits.balance
      : null;

  // Quiet ingest-quota meter (CLAUDE.md §5): once the workspace is ~75% through its
  // free parses, show a calm "N of M used" progress hint right where parsing happens.
  // At the banner/wall levels the app-shell IngestQuotaNudge takes over with the CTA,
  // so this meter only renders at the "subtle" level (no double-banner).
  const showIngestMeter =
    credits !== null &&
    credits.ingestFreeLimit !== null &&
    ingestNudgeLevel(credits.ingestUsed, credits.ingestFreeLimit) === "subtle";
  const ingestPct =
    credits !== null && credits.ingestFreeLimit
      ? Math.min(100, Math.round((credits.ingestUsed / credits.ingestFreeLimit) * 100))
      : 0;

  // A 402 race (ran out between load and submit): flip to the exhausted state,
  // re-sync from the server, and invite — never a generic error (§6.8).
  const handleNoCredits = useCallback(() => {
    setCredits((prev) =>
      prev ? { ...prev, balance: 0, used: prev.monthlyAllotment } : prev,
    );
    refreshCredits();
    toast(
      "You've used your free AI parses for today — your candidates, search, and revenue stay free.",
      "info",
    );
  }, [refreshCredits, toast]);

  const updateItem = useCallback((key: number, state: ParseItemState) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, state } : it)));
  }, []);

  const pollJob = useCallback(
    (key: number, jobId: string) => {
      const startedAt = Date.now();

      const tick = () => {
        api
          .getParseJob(jobId)
          .then(async (job) => {
            if (job.status === "done" && job.candidateId) {
              try {
                const candidate = await api.getCandidate(job.candidateId);
                updateItem(key, { phase: "done", candidate });
                notifyParsed();
                onParsed?.();
              } catch {
                updateItem(key, {
                  phase: "failed",
                  error: "Parsed, but we couldn't load the candidate. Refresh to see it.",
                });
              }
              return;
            }
            if (job.status === "failed") {
              updateItem(key, {
                phase: "failed",
                error: job.error ?? "Couldn't read this one — want to paste the text?",
              });
              return;
            }
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              updateItem(key, {
                phase: "failed",
                error: "This is taking longer than usual — try again in a moment.",
              });
              return;
            }
            const id = window.setTimeout(tick, POLL_MS);
            timers.current.push(id);
          })
          .catch(() => {
            updateItem(key, {
              phase: "failed",
              error: "Lost connection while reading — please try again.",
            });
          });
      };

      tick();
    },
    [notifyParsed, onParsed, updateItem],
  );

  // ── Paste path (Phase 1 — unchanged behavior) ──────────────────────────────
  const onSubmit = useCallback(async () => {
    const value = text.trim();
    if (!value || submitting || outOfCredits) return;

    setSubmitting(true);
    const key = nextKey.current++;
    const label = previewLabel(value);
    setItems((prev) => [{ key, label, state: { phase: "reading" } }, ...prev]);

    try {
      const res = await api.ingest({
        kind: "text",
        source: "whatsapp_paste",
        payload: value,
        jobId: targetJob?.id ?? undefined,
      });
      setText("");
      pollJob(key, res.parseJobId);
    } catch (err) {
      // Ran out between load and submit → friendly upgrade invitation, not a
      // scary error. Drop the optimistic card; the invitation takes its place.
      if (err instanceof ApiError && err.isOutOfCredits) {
        setItems((prev) => prev.filter((it) => it.key !== key));
        handleNoCredits();
        return;
      }
      const message =
        err instanceof ApiError ? err.message : "Couldn't start parsing — please try again.";
      updateItem(key, { phase: "failed", error: message });
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, outOfCredits, targetJob, pollJob, updateItem, toast, handleNoCredits]);

  // ── File / folder / CSV path (Phase 2) ──────────────────────────────────────
  const handleBulkResponse = useCallback(
    (res: BulkIngestResponse, files: File[]) => {
      if (res.batchId) {
        // Bulk drop → the live progress panel. Per-item cards would be noise at
        // 40+ files; the batch view is the streaming surface instead.
        setBatch({ id: res.batchId, total: res.items.length || files.length });
        return;
      }
      // Small drop → reveal per-item cards, polling each like the paste path.
      const newItems: ParseItem[] = [];
      for (const item of res.items) {
        const key = nextKey.current++;
        newItems.push({
          key,
          label: item.filename,
          state: item.duplicate
            ? { phase: "failed", error: "Already imported — skipped this one." }
            : { phase: "reading" },
        });
        if (!item.duplicate) pollJob(key, item.parseJobId);
      }
      setItems((prev) => [...newItems, ...prev]);
    },
    [pollJob],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading || outOfCredits) return;
      setUploading(true);
      try {
        const res = await api.uploadFiles(files, targetJob?.id ?? null);
        handleBulkResponse(res, files);
      } catch (err) {
        if (err instanceof ApiError && err.isOutOfCredits) {
          handleNoCredits();
          return;
        }
        toast(
          err instanceof ApiError
            ? err.message
            : "Couldn't upload those — please try again.",
          "error",
        );
      } finally {
        setUploading(false);
      }
    },
    [uploading, outOfCredits, targetJob, handleBulkResponse, toast, handleNoCredits],
  );

  const onBatchDone = useCallback(
    (b: ImportBatchDto) => {
      // The list refreshes; if there were possible duplicates the BatchProgress
      // panel surfaces the review entry itself.
      notifyParsed();
      onParsed?.();
      if (b.failed > 0) {
        toast(`${b.failed} file${b.failed === 1 ? "" : "s"} couldn't be read.`, "info");
      }
    },
    [notifyParsed, onParsed, toast],
  );

  // Drag handlers. We count enter/leave depth so nested children don't flicker
  // the highlight, and only react when files are actually being dragged.
  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (outOfCredits) return;
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    [outOfCredits],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (outOfCredits) return;
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [outOfCredits],
  );

  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (outOfCredits) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = collectFiles(e.dataTransfer);
      void uploadFiles(files);
    },
    [outOfCredits, uploadFiles],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      // Reset so picking the same file/folder again re-fires change.
      e.target.value = "";
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  return (
    <div className={cn(variant === "page" && "mx-auto w-full max-w-2xl")}>
      {/* Job-centric inbound (§2A, F7): when this surface is aimed at a role, say
          so plainly — every CV pasted/dropped here lands attached to it. */}
      {targetJob ? <TargetJobBanner title={targetJob.title} /> : null}

      {/* Out of AI parses → a calm upgrade INVITATION, never a paywall (§6.8). The
          DB/search/jobs/revenue stay free; only the parse submit is paused. */}
      {outOfCredits ? <UpgradeInvitation resets={resets} /> : null}

      {/* Quiet ingest-quota progress (§5) — informational, not a gate. Escalates to
          the app-shell IngestQuotaNudge once it crosses ~90%. */}
      {showIngestMeter && credits ? (
        <div className="mb-3" role="status">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Free parses used</span>
            <span className="nums tabular-nums text-ink">
              {credits.ingestUsed.toLocaleString()} of {credits.ingestFreeLimit!.toLocaleString()}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-subtle"
            role="progressbar"
            aria-valuenow={ingestPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-sm bg-brand transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${ingestPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* The real drop target. The whole region is clickable + keyboard-activatable
          to open the file browser; the two buttons below scope folder/CSV picking. */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border-2 border-dashed px-4 py-10 text-center transition sm:py-12",
          dragging ? "border-brand bg-brand-tint" : "border-line bg-subtle/50",
          outOfCredits && "opacity-60",
        )}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || outOfCredits}
          aria-label="Browse for resumes, files, or a CSV to upload"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-md outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition",
              dragging ? "bg-brand text-brand-fg" : "bg-surface text-faint",
            )}
          >
            {uploading ? (
              <SpinnerIcon className="h-5 w-5 animate-spin" />
            ) : (
              <UploadCloudIcon className="h-5 w-5" />
            )}
          </span>
          <span className="text-body font-medium text-ink">
            {dragging
              ? "Drop to clean them up"
              : uploading
                ? "Uploading…"
                : "Drop resumes, a folder, a CSV"}
          </span>
          <span className="text-sm text-muted">
            or <span className="font-medium text-brand">click to browse</span> &middot; PDF, DOCX,
            images, CSV/XLSX
          </span>
        </button>

        {/* Folder + CSV are explicit entries (a plain file dialog can't pick a
            folder; webkitdirectory needs its own input). */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading || outOfCredits}
          >
            <FolderIcon className="h-4 w-4" />
            Pick a folder
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || outOfCredits}
          >
            <SheetIcon className="h-4 w-4" />
            Upload a CSV
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={onInputChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // webkitdirectory turns this into a folder picker (no npm dep needed).
          // It's a non-standard attribute, so it's set via a typed spread below.
          onChange={onInputChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </div>

      {/* Mobile nudge — bulk import is laptop-first (§9), never blocked. */}
      <p className="mt-2 text-sm text-faint sm:hidden">
        Dropping a folder of resumes is easier on a laptop — paste below works great on your phone.
      </p>

      {/* The live path: paste anything messy (Phase 1, unchanged). */}
      <div className="mt-3">
        <label htmlFor="ingest-paste" className="block text-label text-muted">
          Paste a WhatsApp chat, a resume, or messy notes
        </label>
        <textarea
          id="ingest-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void onSubmit();
            }
          }}
          rows={variant === "page" ? 6 : 5}
          autoFocus={autoFocus}
          disabled={outOfCredits}
          placeholder="e.g. Sarah Chen, Sr PM at Flipkart, Bangalore, sarah@…  — or a whole chat export."
          className={cn(
            "mt-1.5 w-full resize-none rounded-sm border border-line bg-surface p-3 text-body text-ink",
            "placeholder:text-faint transition focus:border-brand",
            "disabled:cursor-not-allowed disabled:bg-subtle/50 disabled:text-muted",
          )}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-faint">
            {lowRemaining !== null ? (
              <span className="nums tabular-nums text-muted">
                {lowRemaining} {lowRemaining === 1 ? "parse" : "parses"} left today
              </span>
            ) : (
              "No setup. Watch it become a clean candidate."
            )}
          </p>
          <Button
            variant="primary"
            onClick={() => void onSubmit()}
            disabled={!text.trim() || submitting || outOfCredits}
          >
            {submitting ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Reading…
              </>
            ) : (
              "Clean it up"
            )}
          </Button>
        </div>
      </div>

      {/* Bulk drop → live progress panel (§8 streaming feel at scale). */}
      {batch ? (
        <div className="mt-4">
          <BatchProgress
            batchId={batch.id}
            initialTotal={batch.total}
            jobTitle={targetJob?.title}
            onDone={onBatchDone}
            onReviewDuplicates={onReviewDuplicates}
          />
        </div>
      ) : null}

      {/* Small drop / paste → per-item cards stream their fields in. */}
      {items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.key}>
              <ParseCard label={it.label} state={it.state} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Job-centric inbound banner (§2A, F7). States plainly that CVs added here attach
// to this role — so the recruiter knows the candidates will land on the board, not
// the global pool. Calm brand-tint chrome, not an alert.
function TargetJobBanner({ title }: { title: string }) {
  return (
    <div
      className="mb-3 flex items-start gap-3 rounded-lg border border-brand/30 bg-brand-tint p-4"
      role="status"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
        <BriefcaseIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-body text-ink">
          Adding candidates to <span className="font-semibold text-brand">{title}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted">
          Every CV you paste or drop here lands attached to this role — straight into Sourced.
        </p>
      </div>
    </div>
  );
}

// The exhausted-credits state (design-system §6.8, MVP-SPEC §4). An INVITATION,
// not a wall: warm tone, and it always restates that the core product stays free
// (CLAUDE.md §4 — DB/search/jobs/revenue are never gated). Only the AI parse is
// paused until the allotment resets or the recruiter upgrades.
function UpgradeInvitation({ resets }: { resets: string }) {
  return (
    <div
      className="mb-3 rounded-lg border border-warning/40 bg-warning-tint p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-warning">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">
            You&apos;ve used your free AI parses for today
            {resets ? <> — they reset {resets}</> : null}.
          </p>
          <p className="mt-1 text-sm text-muted">
            Your candidates, search, jobs, and revenue stay free. Want more parsing now?
          </p>
          <div className="mt-3">
            <Link
              href="/settings/billing"
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition",
                "bg-brand text-brand-fg hover:bg-brand-hover",
              )}
            >
              See plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Pull a flat File[] out of a drag event, preferring the items API (which exposes
// folder entries the browser already flattened into the FileList for us).
function collectFiles(dt: DataTransfer): File[] {
  if (dt.files && dt.files.length > 0) return Array.from(dt.files);
  const out: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out;
}

// A short, PII-light label for the card header — first line, truncated. We never
// log this; it only renders in the recruiter's own session (CLAUDE.md §2).
function previewLabel(value: string): string {
  const firstLine = value.split("\n").map((l) => l.trim()).find(Boolean) ?? "Pasted text";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
}
