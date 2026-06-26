"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateListItemDto, PlacementDto, ReplacePlacementInput } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { SearchIcon } from "@/components/ui/Icon";

// Replace a fallen-through placement with a new candidate — NO new fee (§2E). The
// ORIGINAL fee carries forward; a fresh guarantee window starts. The recruiter
// picks the replacement from her own database (same picker pattern as the jobs
// attach modal) and may tweak placedAt / guaranteeDays. The carried fee resolves
// server-side as a Decimal (CLAUDE.md §3); we render server truth on success.

export function ReplacePlacementModal({
  open,
  placement,
  onClose,
  onDone,
}: {
  open: boolean;
  placement: PlacementDto | null;
  onClose: () => void;
  /** Fired with the persisted replacement so the caller refreshes the dashboard. */
  onDone: (placement: PlacementDto) => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState<CandidateListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CandidateListItemDto | null>(null);
  const [placedAt, setPlacedAt] = useState("");
  const [guaranteeDays, setGuaranteeDays] = useState("");
  const [saving, setSaving] = useState(false);
  const reqId = useRef(0);

  // Fresh state each time the modal opens.
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebounced("");
      setPicked(null);
      setPlacedAt("");
      setGuaranteeDays(placement ? String(placement.guaranteeDays) : "");
      setSaving(false);
    }
  }, [open, placement]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open || picked) return;
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
  }, [open, debounced, picked]);

  if (!placement) return null;

  const currency = placement.currency;

  const handleConfirm = async () => {
    if (!picked || saving) return;
    const input: ReplacePlacementInput = { candidateId: picked.id };
    if (placedAt) input.placedAt = new Date(placedAt).toISOString();
    const gd = Number(guaranteeDays);
    if (guaranteeDays.trim() && Number.isFinite(gd) && gd > 0) input.guaranteeDays = gd;

    setSaving(true);
    let updated: PlacementDto;
    try {
      updated = await api.replacePlacement(placement.id, input);
    } catch (err) {
      setSaving(false);
      toast(
        err instanceof ApiError
          ? err.message
          : "Couldn't record that replacement. Please try again.",
        "error",
      );
      return;
    }

    onDone(updated);
    // No PII in the toast — candidate name omitted (CLAUDE.md §2).
    toast("Replacement recorded — the original fee carried forward, no new fee.", "success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Replace this placement"
      description={
        <>
          Swap in a new candidate for the same role.{" "}
          <span className="font-medium text-ink">No new fee</span> — the original fee carries
          forward and a fresh guarantee window starts.
        </>
      }
    >
      <div className="space-y-4">
        {/* Carried-forward fee, made explicit. */}
        <div className="flex items-center justify-between rounded-md border border-line bg-subtle/60 p-3">
          <span className="text-label uppercase text-muted">Fee carried forward</span>
          <Money amount={placement.feeAmount} currency={currency} className="text-h3 text-money" />
        </div>

        {picked ? (
          // ── Step 2: confirm the replacement + optional details ──
          <>
            <div className="flex items-center gap-2.5 rounded-md border border-brand bg-brand-tint/50 px-3 py-2.5">
              <Avatar name={picked.fullName} id={picked.id} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{picked.fullName}</span>
                {picked.currentTitle ? (
                  <span className="block truncate text-sm text-muted">{picked.currentTitle}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="shrink-0 text-label font-medium text-brand underline-offset-2 hover:underline"
              >
                Change
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="rp-placedAt" className="block text-label text-muted">
                  Placed on — optional
                </label>
                <input
                  id="rp-placedAt"
                  type="date"
                  value={placedAt}
                  onChange={(e) => setPlacedAt(e.target.value)}
                  className={cn(
                    "nums h-10 w-full rounded-sm border border-line bg-surface px-3 text-body text-ink",
                    "transition focus:border-brand",
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rp-guarantee" className="block text-label text-muted">
                  Guarantee (days)
                </label>
                <input
                  id="rp-guarantee"
                  type="text"
                  inputMode="numeric"
                  value={guaranteeDays}
                  onChange={(e) => setGuaranteeDays(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={String(placement.guaranteeDays)}
                  className={cn(
                    "nums h-10 w-full rounded-sm border border-line bg-surface px-3 text-body tabular-nums text-ink",
                    "placeholder:text-faint transition focus:border-brand",
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={() => void handleConfirm()} disabled={saving}>
                {saving ? "Recording…" : "Confirm replacement"}
              </Button>
            </div>
          </>
        ) : (
          // ── Step 1: pick the replacement candidate ──
          <>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, role, skill…"
                aria-label="Search candidates for the replacement"
                autoFocus
                className={cn(
                  "h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-body text-ink",
                  "placeholder:text-faint transition focus:border-brand",
                )}
              />
            </div>

            <div
              className="max-h-64 overflow-y-auto rounded-md border border-line"
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
                    const role = [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ");
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => setPicked(c)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-subtle"
                        >
                          <Avatar name={c.fullName} id={c.id} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-ink">
                              {c.fullName}
                            </span>
                            {role ? (
                              <span className="block truncate text-sm text-muted">{role}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-label font-medium text-brand">Pick</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
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
