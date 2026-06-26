"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateListItemDto, CandidateMatchDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { QualificationBadge } from "@/components/ui/Badge";
import { SpinnerIcon } from "@/components/ui/Icon";

// Embedding-matched suggestions for a job (§5). Surfaces the pool's nearest candidates
// to this req — semantic recall (NOT an AI fit-score), each with the deterministic
// constraint verdict so the recruiter sees fit + flags together. Returns only RELEVANT
// candidates (the server thresholds on cosine), qualified first then near-misses
// (a hard-constraint fail) demoted but not hidden. Picking one attaches it to Sourced,
// reusing the board's optimistic attach (same as AttachCandidateModal).

export function SuggestedCandidatesModal({
  open,
  jobId,
  onClose,
  onPick,
  attachedIds,
  attaching,
}: {
  open: boolean;
  jobId: string;
  onClose: () => void;
  /** Fired with the chosen candidate; the board performs the attach. */
  onPick: (candidate: CandidateListItemDto) => void;
  /** Candidate ids already on this job — shown as "On this job". */
  attachedIds: Set<string>;
  /** Id currently being attached (disables the row + shows a spinner). */
  attaching: string | null;
}) {
  const [matches, setMatches] = useState<CandidateMatchDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const ticket = ++reqId.current;
    setLoading(true);
    setError(null);
    api
      .suggestedCandidates(jobId)
      .then((next) => {
        if (ticket === reqId.current) setMatches(next);
      })
      .catch(() => {
        if (ticket === reqId.current) setError("We couldn't load suggestions. Try again.");
      })
      .finally(() => {
        if (ticket === reqId.current) setLoading(false);
      });
  }, [open, jobId]);

  // Qualified first, near-misses (a hard fail) after — preserving the server's order.
  const qualified = matches.filter((m) => m.constraintSummary !== "fail");
  const nearMiss = matches.filter((m) => m.constraintSummary === "fail");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Suggested candidates"
      description="Your closest matches from this database for this role — meaning-based, not just keywords."
    >
      <div
        className="max-h-80 overflow-y-auto rounded-md border border-line"
        role="listbox"
        aria-label="Suggested candidates"
      >
        {loading ? (
          <PickerSkeleton />
        ) : error ? (
          <p className="px-3 py-8 text-center text-body text-muted" role="alert">
            {error}
          </p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-10 text-center text-body text-muted">
            No strong matches in your database yet. Add a job description and ingest more CVs —
            suggestions sharpen as the pool grows.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {qualified.map((m) => (
              <MatchRow
                key={m.candidate.id}
                match={m}
                attached={attachedIds.has(m.candidate.id)}
                busy={attaching === m.candidate.id}
                disabled={attaching !== null}
                onPick={() => onPick(m.candidate)}
              />
            ))}
            {nearMiss.length > 0 ? (
              <p className="bg-subtle/60 px-3 py-1.5 text-label uppercase tracking-wide text-faint">
                Relevant, but missing a hard requirement
              </p>
            ) : null}
            {nearMiss.map((m) => (
              <MatchRow
                key={m.candidate.id}
                match={m}
                attached={attachedIds.has(m.candidate.id)}
                busy={attaching === m.candidate.id}
                disabled={attaching !== null}
                onPick={() => onPick(m.candidate)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MatchRow({
  match,
  attached,
  busy,
  disabled,
  onPick,
}: {
  match: CandidateMatchDto;
  attached: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const c = match.candidate;
  const role = [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ");
  const pct = Math.round(match.similarity * 100);
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      disabled={attached || busy || disabled}
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
        "hover:bg-subtle disabled:cursor-not-allowed",
        attached && "opacity-60",
      )}
    >
      <Avatar name={c.fullName} id={c.id} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink">{c.fullName}</span>
          {match.constraintSummary !== "none" ? (
            <QualificationBadge summary={match.constraintSummary} />
          ) : null}
        </span>
        {role ? <span className="block truncate text-sm text-muted">{role}</span> : null}
      </span>
      <span
        className="nums shrink-0 text-label tabular-nums text-faint"
        title="Relevance to this role"
      >
        {pct}% match
      </span>
      {busy ? (
        <SpinnerIcon className="h-4 w-4 shrink-0 animate-spin text-muted" />
      ) : attached ? (
        <span className="shrink-0 text-label text-faint">On this job</span>
      ) : (
        <span className="shrink-0 text-label font-medium text-brand">Attach</span>
      )}
    </button>
  );
}

function PickerSkeleton() {
  return (
    <ul className="divide-y divide-line" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-2.5 px-3 py-2">
          <span className="h-6 w-6 shrink-0 rounded-full bg-subtle motion-safe:animate-pulse" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-1/3 rounded bg-subtle motion-safe:animate-pulse" />
            <span className="block h-2.5 w-1/2 rounded bg-subtle motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}
