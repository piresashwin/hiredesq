"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { useIngest } from "@/lib/ingest-context";
import { cn } from "@/lib/cn";
import { resetLabel } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SparkleIcon, SpinnerIcon } from "@/components/ui/Icon";
import { SubmissionPreview } from "@/components/submission/SubmissionPreview";

// Orchestrates generating a client-ready submission from a candidate (§2D, Wedge
// 2): the trigger button, the loading state, the 402 upgrade INVITATION (Model B —
// generation is the AI action the daily meter now gates), and the result preview.
// Self-contained so it can drop into the candidate profile without wiring state up.

export function GenerateSubmissionButton({
  candidateId,
  jobId,
  variant = "secondary",
  className,
}: {
  candidateId: string;
  /** Optional job link (F5). Omit for the pool-only path. */
  jobId?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { toast } = useToast();
  const { notifyCreditsChanged } = useIngest();
  const [generating, setGenerating] = useState(false);
  const [submission, setSubmission] = useState<SubmissionDto | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [outOfCredits, setOutOfCredits] = useState(false);

  async function onGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const next = await api.generateSubmission({ candidateId, jobId });
      setSubmission(next);
      setPreviewOpen(true);
      // A generation spent a daily credit — refresh the top-bar meter (no reload).
      notifyCreditsChanged();
    } catch (err) {
      // Out of daily submission credits → calm upgrade invitation, not a wall
      // (mirrors the ingest 402 handling — design-system §6.8, CLAUDE.md §4).
      if (err instanceof ApiError && err.isOutOfCredits) {
        setOutOfCredits(true);
      } else {
        toast(
          err instanceof ApiError ? err.message : "Couldn't generate the submission. Try again.",
          "error",
        );
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => void onGenerate()}
        disabled={generating}
        className={className}
      >
        {generating ? (
          <SpinnerIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <SparkleIcon className="h-4 w-4" />
        )}
        {generating ? "Generating…" : "Generate client-ready submission"}
      </Button>

      <SubmissionPreview
        submission={submission}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <OutOfCreditsModal open={outOfCredits} onClose={() => setOutOfCredits(false)} />
    </>
  );
}

// Out of daily submission credits → an INVITATION, never a paywall (§6.8). Restates
// that the core product (DB, search, jobs, revenue) stays free regardless (§4).
function OutOfCreditsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [resets, setResets] = useState("");

  // Best-effort: surface when the daily meter resets, if we can read it. Fetched in
  // an effect when the modal opens — NEVER in the render body (that fires a network
  // request on every render). Chrome only; the message reads fine without it.
  useEffect(() => {
    if (!open || resets) return;
    let cancelled = false;
    api
      .getCredits()
      .then((c) => {
        if (!cancelled) setResets(resetLabel(c.resetsAt));
      })
      .catch(() => {
        /* chrome only — the message reads fine without it */
      });
    return () => {
      cancelled = true;
    };
  }, [open, resets]);

  return (
    <Modal open={open} onClose={onClose} title="You've used today's submissions">
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-tint p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-warning">
            <SparkleIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-body font-medium text-ink">
              You&apos;ve generated all your free client-ready submissions for today
              {resets ? <> — they reset {resets}</> : null}.
            </p>
            <p className="mt-1 text-sm text-muted">
              Your candidates, search, jobs, and revenue stay free. Resume parsing is free too —
              this only limits AI-generated submissions.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Link
            href="/settings/billing"
            onClick={onClose}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-body font-semibold transition",
              "bg-brand text-brand-fg hover:bg-brand-hover",
            )}
          >
            See plans
          </Link>
        </div>
      </div>
    </Modal>
  );
}
