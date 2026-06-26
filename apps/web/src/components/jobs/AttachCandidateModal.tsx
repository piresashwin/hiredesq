"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateListItemDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { SearchIcon, SpinnerIcon } from "@/components/ui/Icon";

// Candidate picker (design-system §6.5) — keeps the recruiter on the board when
// attaching someone (a populated board must never force a trip to the candidates
// page). Searches her own candidates via listCandidates (debounced), shows
// initials + role for fast scanning, and excludes anyone already on this job.
// Picking one calls back to attach; the board does the optimistic insert.

export function AttachCandidateModal({
  open,
  onClose,
  onPick,
  attachedIds,
  attaching,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen candidate; the board performs the attach. */
  onPick: (candidate: CandidateListItemDto) => void;
  /** Candidate ids already on this job — shown as "Already on this job". */
  attachedIds: Set<string>;
  /** Id currently being attached (disables the row + shows a spinner). */
  attaching: string | null;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState<CandidateListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Reset the search each time the picker opens.
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const ticket = ++reqId.current;
    setLoading(true);
    setError(null);
    api
      .listCandidates(debounced)
      .then((res) => {
        if (ticket === reqId.current) setCandidates(res.items);
      })
      .catch(() => {
        if (ticket === reqId.current) setError("We couldn't load your candidates. Try again.");
      })
      .finally(() => {
        if (ticket === reqId.current) setLoading(false);
      });
  }, [open, debounced]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach a candidate"
      description="Pick someone from your database to add to this job's pipeline."
    >
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, skill…"
            aria-label="Search candidates to attach"
            autoFocus
            className={cn(
              "h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-body text-ink",
              "placeholder:text-faint transition focus:border-brand",
            )}
          />
        </div>

        <div
          className="max-h-72 overflow-y-auto rounded-md border border-line"
          role="listbox"
          aria-label="Candidates"
        >
          {loading ? (
            <PickerSkeleton />
          ) : error ? (
            <p className="px-3 py-8 text-center text-body text-muted" role="alert">
              {error}
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-8 text-center text-body text-muted">
              {debounced ? `No candidates match "${debounced}".` : "No candidates yet."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((c) => {
                const already = attachedIds.has(c.id);
                const busy = attaching === c.id;
                const role = [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ");
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={already || busy || attaching !== null}
                      onClick={() => onPick(c)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
                        "hover:bg-subtle disabled:cursor-not-allowed",
                        already && "opacity-60",
                      )}
                    >
                      <Avatar name={c.fullName} id={c.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{c.fullName}</span>
                        {role ? (
                          <span className="block truncate text-sm text-muted">{role}</span>
                        ) : null}
                      </span>
                      {busy ? (
                        <SpinnerIcon className="h-4 w-4 shrink-0 animate-spin text-muted" />
                      ) : already ? (
                        <span className="shrink-0 text-label text-faint">On this job</span>
                      ) : (
                        <span className="shrink-0 text-label font-medium text-brand">Attach</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
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
