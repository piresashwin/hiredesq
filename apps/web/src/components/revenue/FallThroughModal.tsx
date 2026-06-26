"use client";

import { useEffect, useMemo, useState } from "react";
import type { FallThroughInput, PlacementDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";

// Mark a placement as fallen through (§2E). The candidate left inside the
// guarantee window, so the booked fee is REVERSED. The recruiter may optionally
// keep a pro-rated amount (e.g. a partial fee the client honoured) — leaving it
// empty reverses the whole fee. The reversal is computed server-side as a Decimal
// (CLAUDE.md §3); we only send the raw retained string and render server truth.

export function FallThroughModal({
  open,
  placement,
  onClose,
  onDone,
}: {
  open: boolean;
  placement: PlacementDto | null;
  onClose: () => void;
  /** Fired with the updated placement so the caller refreshes cleared/at-risk. */
  onDone: (placement: PlacementDto) => void;
}) {
  const { toast } = useToast();
  const [retained, setRetained] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRetained("");
      setSaving(false);
    }
  }, [open, placement?.id]);

  const currency = placement?.currency ?? "USD";

  // Display-only validation of the optional retained amount. Empty = full reversal.
  const retainedError = useMemo(() => {
    if (!retained.trim() || !placement) return null;
    const n = Number(retained);
    const fee = Number(placement.feeAmount);
    if (!Number.isFinite(n) || n < 0) return "Enter a valid amount.";
    if (n > fee) return "Can't keep more than the original fee.";
    return null;
  }, [retained, placement]);

  if (!placement) return null;

  const candidateName = placement.candidate?.fullName ?? "this candidate";

  const handleConfirm = async () => {
    if (saving || retainedError) return;
    const input: FallThroughInput = retained.trim() ? { retainedAmount: retained.trim() } : {};

    setSaving(true);
    let updated: PlacementDto;
    try {
      updated = await api.fallThroughPlacement(placement.id, input);
    } catch (err) {
      setSaving(false);
      toast(
        err instanceof ApiError
          ? err.message
          : "Couldn't record that fall-through. Please try again.",
        "error",
      );
      return;
    }

    onDone(updated);
    // No PII in the toast — candidate name omitted (CLAUDE.md §2).
    toast("Placement marked as fallen through — the fee was reversed.", "info");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="danger"
      title="Mark as fallen through"
      description={
        <>
          The candidate left inside the guarantee window. This{" "}
          <span className="font-medium text-ink">reverses the booked fee</span> — it stops counting
          toward your revenue.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirm();
        }}
        className="space-y-4"
      >
        {/* The fee being reversed, for sanity. */}
        <div className="flex items-center justify-between rounded-md border border-line bg-subtle/60 p-3">
          <span className="text-label uppercase text-muted">Booked fee</span>
          <Money amount={placement.feeAmount} currency={currency} className="text-h3 text-ink" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ft-retained" className="block text-label text-muted">
            Amount you keep ({currency}) — optional
          </label>
          <input
            id="ft-retained"
            type="text"
            inputMode="decimal"
            value={retained}
            autoFocus
            onChange={(e) => setRetained(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Leave empty to reverse the full fee"
            aria-invalid={retainedError ? true : undefined}
            aria-describedby="ft-retained-help"
            className={cn(
              "nums h-10 w-full rounded-sm border bg-surface px-3 text-body tabular-nums text-ink",
              "placeholder:text-faint transition focus:border-brand",
              retainedError ? "border-danger" : "border-line",
            )}
          />
          <p id="ft-retained-help" className="text-sm text-muted">
            {retainedError ? (
              <span className="text-danger" role="alert">
                {retainedError}
              </span>
            ) : (
              <>
                If the client paid a pro-rated portion, enter what you keep. Empty means the whole
                fee for {candidateName.split(" ")[0]} is reversed.
              </>
            )}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={saving || !!retainedError}>
            {saving ? "Recording…" : "Reverse the fee"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
