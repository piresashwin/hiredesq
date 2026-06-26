"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApplicationDto,
  ConstraintFlagDto,
  ConstraintKey,
  ConstraintStatus,
  QualificationTrailEntryDto,
  TrailEntryKind,
} from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { QualificationBadge } from "@/components/ui/Badge";

// Application detail drawer (§2C, F4). Shows WHY a candidate is in or out of a
// role: a deterministic constraint checklist (Required vs Candidate — NOT an AI
// score) plus the qualification trail (notes + qualified/disqualified decisions).
// Reuses the SlideOver / focus-trap pattern from the candidate profile so the
// recruiter keeps her place on the board.

const CONSTRAINT_LABEL: Record<ConstraintKey, string> = {
  nationality: "Nationality",
  residence_transferable: "Residence transferable",
  license: "License",
};

// Status conveyed by a glyph + word, never colour alone (a11y §10). "Needs info"
// (unknown) is neutral — the absence of data, never a failure.
const STATUS_GLYPH: Record<ConstraintStatus, string> = {
  pass: "✓",
  fail: "!",
  unknown: "?",
};

const STATUS_WORD: Record<ConstraintStatus, string> = {
  pass: "Match",
  fail: "Mismatch",
  unknown: "Needs info",
};

const STATUS_STYLE: Record<ConstraintStatus, string> = {
  pass: "bg-success-tint text-money",
  fail: "bg-warning-tint text-warning",
  unknown: "bg-subtle text-muted",
};

const TRAIL_KIND_LABEL: Record<TrailEntryKind, string> = {
  note: "Note",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

const TRAIL_KIND_STYLE: Record<TrailEntryKind, string> = {
  note: "bg-subtle text-muted",
  qualified: "bg-success-tint text-money",
  disqualified: "bg-warning-tint text-warning",
};

export function ApplicationDetailDrawer({
  jobId,
  app,
  open,
  onClose,
}: {
  jobId: string;
  app: ApplicationDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [trail, setTrail] = useState<QualificationTrailEntryDto[] | null>(null);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [trailError, setTrailError] = useState<string | null>(null);

  const appId = app?.id ?? null;

  const loadTrail = useCallback(async () => {
    if (!appId) return;
    setLoadingTrail(true);
    setTrailError(null);
    try {
      const next = await api.listTrail(jobId, appId);
      setTrail(next);
    } catch {
      setTrailError("We couldn't load the trail. Please try again.");
    } finally {
      setLoadingTrail(false);
    }
  }, [jobId, appId]);

  // (Re)load the trail whenever the drawer opens for an application.
  useEffect(() => {
    if (open && appId) {
      setTrail(null);
      void loadTrail();
    }
  }, [open, appId, loadTrail]);

  if (!app) return null;

  const name = app.candidate?.fullName ?? "Candidate";
  const role = [app.candidate?.currentTitle, app.candidate?.currentCompany]
    .filter(Boolean)
    .join(" @ ");
  const flags = app.constraintFlags ?? [];
  const hasConstraints = app.constraintSummary !== "none" && flags.length > 0;

  async function handleAdd(kind: TrailEntryKind, note: string) {
    if (!appId) return false;
    try {
      const created = await api.addTrailEntry(jobId, appId, { kind, note });
      setTrail((cur) => [created, ...(cur ?? [])]);
      toast("Added to the trail.", "success");
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add that entry.", "error");
      return false;
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={`${name} — qualification detail`}>
      <SlideOverHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Avatar name={name} id={app.candidateId} size="sm" />
          <div className="min-w-0">
            <h2 className="truncate text-h2 text-ink">{name}</h2>
            {role ? <p className="truncate text-sm text-muted">{role}</p> : null}
          </div>
        </div>
        <div className="mt-2">
          <QualificationBadge summary={app.constraintSummary ?? "none"} />
        </div>
      </SlideOverHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
        {/* ── Constraint side-by-side: Required vs Candidate ─────────────── */}
        <section aria-labelledby="constraints-heading">
          <h3 id="constraints-heading" className="text-label uppercase text-muted">
            Hard requirements
          </h3>
          {hasConstraints ? (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {flags.map((flag) => (
                <ConstraintRow key={flag.key} flag={flag} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-md border border-dashed border-line bg-subtle/40 px-3 py-4 text-sm text-muted">
              No hard requirements set for this role.
            </p>
          )}
          <p className="mt-2 text-sm text-faint">
            A factual checklist of the role&apos;s requirements against this candidate — not a score
            or ranking.
          </p>
        </section>

        {/* ── Qualification trail ─────────────────────────────────────────── */}
        <section aria-labelledby="trail-heading">
          <h3 id="trail-heading" className="text-label uppercase text-muted">
            Qualification trail
          </h3>

          <AddTrailForm onAdd={handleAdd} />

          <div className="mt-4">
            {loadingTrail ? (
              <TrailSkeleton />
            ) : trailError ? (
              <div className="rounded-md border border-line p-3 text-sm" role="alert">
                <p className="text-ink">{trailError}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadTrail()}
                  className="mt-2"
                >
                  Try again
                </Button>
              </div>
            ) : trail && trail.length > 0 ? (
              <ul className="space-y-3">
                {trail.map((entry) => (
                  <TrailItem key={entry.id} entry={entry} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No entries yet. Add a note to capture why this candidate is in or out.
              </p>
            )}
          </div>
        </section>
      </div>
    </SlideOver>
  );
}

function ConstraintRow({ flag }: { flag: ConstraintFlagDto }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
      <span className="text-body font-medium text-ink sm:col-span-1">
        {CONSTRAINT_LABEL[flag.key]}
      </span>
      <dl className="col-span-2 grid grid-cols-2 gap-x-3 text-sm sm:col-span-1 sm:order-2">
        <div>
          <dt className="text-label uppercase text-faint">Required</dt>
          <dd className="text-ink">{flag.required}</dd>
        </div>
        <div>
          <dt className="text-label uppercase text-faint">Candidate</dt>
          <dd className="text-ink">{flag.candidate}</dd>
        </div>
      </dl>
      <span
        className={cn(
          "row-start-1 col-start-2 inline-flex items-center gap-1 self-start rounded-sm px-1.5 py-0.5 text-label font-medium",
          "sm:order-3 sm:row-start-auto sm:col-start-auto sm:self-center",
          STATUS_STYLE[flag.status],
        )}
      >
        <span aria-hidden className="font-semibold leading-none">
          {STATUS_GLYPH[flag.status]}
        </span>
        {STATUS_WORD[flag.status]}
      </span>
    </li>
  );
}

function TrailItem({ entry }: { entry: QualificationTrailEntryDto }) {
  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label font-medium",
            TRAIL_KIND_STYLE[entry.kind],
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {TRAIL_KIND_LABEL[entry.kind]}
        </span>
        <time className="nums text-sm tabular-nums text-faint" dateTime={entry.createdAt}>
          {timeAgo(entry.createdAt)}
        </time>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-body text-ink">{entry.note}</p>
    </li>
  );
}

const TRAIL_KINDS: TrailEntryKind[] = ["note", "qualified", "disqualified"];

function AddTrailForm({
  onAdd,
}: {
  onAdd: (kind: TrailEntryKind, note: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<TrailEntryKind>("note");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = note.trim().length > 0 && !saving;

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setSaving(true);
    const ok = await onAdd(kind, trimmed);
    setSaving(false);
    if (ok) {
      setNote("");
      setKind("note");
    }
  }

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <label htmlFor="trail-kind" className="block text-label text-muted">
          Decision
        </label>
        <div role="radiogroup" aria-label="Decision" className="mt-1 inline-flex flex-wrap gap-1.5">
          {TRAIL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-sm font-medium transition",
                kind === k
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {TRAIL_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="trail-note" className="block text-label text-muted">
          Note
        </label>
        <textarea
          id="trail-note"
          value={note}
          rows={3}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Why is this candidate in or out? (e.g. confirmed both licences on the call)"
          className={cn(
            "mt-1 w-full resize-y rounded-sm border border-line bg-surface px-2 py-1.5 text-body text-ink",
            "transition placeholder:text-faint focus:border-brand focus:outline-none",
          )}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          {saving ? "Adding…" : "Add to trail"}
        </Button>
      </div>
    </form>
  );
}

function TrailSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="h-3 w-12 rounded bg-subtle motion-safe:animate-pulse" />
          </div>
          <div className="mt-2 h-3 w-full rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-1.5 h-3 w-2/3 rounded bg-subtle motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
