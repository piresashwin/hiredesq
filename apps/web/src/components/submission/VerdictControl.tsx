"use client";

import { useState } from "react";
import type { SubmissionDto, SubmissionStatus, SubmissionVerdict } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toast";
import { SubmissionBadge } from "@/components/ui/Badge";
import { ArrowRightIcon, EyeIcon, SpinnerIcon, XCircleIcon } from "@/components/ui/Icon";

// The client-feedback loop (§2D, F5). The recruiter relays the CLIENT's call on a
// submission — calm and factual, framed as "Client verdict", not our judgement. The
// backend owns the consequences (sets status, nudges the job-linked pipeline stage,
// writes the qualification trail); we POST the verdict and refresh.
//
// Tone (Principle 7): Advance reads as progress (brand green); Interview is neutral-
// positive (terracotta — heating up); Reject is cautionary terracotta, NOT alarming —
// a client passing isn't an error. Each action carries an icon + label so intent
// survives without colour (a11y §10).

const VERDICTS: {
  verdict: SubmissionVerdict;
  label: string;
  icon: typeof ArrowRightIcon;
  classes: string;
}[] = [
  {
    verdict: "advance",
    label: "Advance",
    icon: ArrowRightIcon,
    classes: "border-brand/40 text-brand hover:bg-brand-tint",
  },
  {
    verdict: "interview",
    label: "Interview",
    icon: EyeIcon,
    classes: "border-stage-interview/40 text-stage-interview hover:bg-stage-interview/10",
  },
  {
    verdict: "reject",
    label: "Pass",
    icon: XCircleIcon,
    classes: "border-warning/40 text-warning hover:bg-warning-tint",
  },
];

// Which statuses already carry a recorded verdict (vs awaiting one).
const VERDICT_STATUSES: SubmissionStatus[] = ["advance", "interview", "reject"];

export function VerdictControl({
  submission,
  onRecorded,
}: {
  submission: SubmissionDto;
  /** Fires with the server's updated DTO so the surrounding list/trail can refresh. */
  onRecorded: (updated: SubmissionDto) => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<SubmissionVerdict | null>(null);
  const [editing, setEditing] = useState(false);

  const recorded = VERDICT_STATUSES.includes(submission.status);
  const jobLinked = submission.jobId != null;

  async function record(verdict: SubmissionVerdict) {
    if (pending) return;
    setPending(verdict);
    try {
      const updated = await api.recordVerdict(submission.id, { verdict });
      onRecorded(updated);
      setEditing(false);
      toast(
        jobLinked
          ? "Client verdict recorded — pipeline stage updated."
          : "Client verdict recorded.",
        "success",
      );
    } catch (err) {
      toast(
        err instanceof ApiError ? err.message : "Couldn't record the verdict. Try again.",
        "error",
      );
    } finally {
      setPending(null);
    }
  }

  // Already has a verdict and not actively changing it → show the recorded outcome,
  // with a quiet affordance to change it (re-recording is allowed by the backend).
  if (recorded && !editing) {
    return (
      <div className="rounded-md border border-line bg-subtle/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-label uppercase text-muted">Client verdict</span>
            <SubmissionBadge status={submission.status} />
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-sm text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-subtle/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p id="verdict-label" className="text-label uppercase text-muted">
          Record client verdict
        </p>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-sm text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-labelledby="verdict-label">
        {VERDICTS.map(({ verdict, label, icon: VerdictIcon, classes }) => (
          <button
            key={verdict}
            type="button"
            onClick={() => void record(verdict)}
            disabled={pending != null}
            aria-busy={pending === verdict}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-surface text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-40",
              classes,
            )}
          >
            {pending === verdict ? (
              <SpinnerIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <VerdictIcon className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {jobLinked
          ? "Recording a verdict moves this candidate's pipeline stage and logs why."
          : "Records the client's call on this submission."}
      </p>
    </div>
  );
}
