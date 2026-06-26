"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreatePlacementInput, FeeBasis, PlacementDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";

// Placement / fee capture (design-system §6.7, §10). Triggered from drag-to-Placed
// on the board and from a "Log placement" button. The recruiter picks a flat
// amount OR a % of salary; for a %, the RESOLVED fee is shown with its basis,
// currency, and rounding visible BEFORE save (money integrity, §10).
//
// LIVE: on save we POST createPlacement() with the raw inputs (amount, or
// salary+percent). The AUTHORITATIVE fee is the Decimal the API resolves and
// returns in PlacementDto.feeAmount (CLAUDE.md §3) — the toast uses that, never
// the client estimate. The resolved figure shown below is a clearly-labelled
// display-only preview so Priya can sanity-check the math before committing.

export interface PlacementContext {
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  currency: string;
}

interface Resolved {
  /** Display string, 2dp, e.g. "8000.00". */
  amount: string;
  /** True when the % math didn't divide evenly and we rounded to the cent. */
  rounded: boolean;
}

/**
 * Display-only fee resolution. Parses to cents (integers) to avoid float drift
 * in the *preview*, then formats to a 2dp string. This is NOT the source of
 * truth — see the note above.
 */
function resolveFee(
  basis: FeeBasis,
  amount: string,
  salary: string,
  percent: string,
): Resolved | null {
  if (basis === "flat") {
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return null;
    return { amount: n.toFixed(2), rounded: false };
  }
  const sal = Number(salary);
  const pct = Number(percent);
  if (!salary.trim() || !percent.trim() || !Number.isFinite(sal) || !Number.isFinite(pct))
    return null;
  if (sal <= 0 || pct <= 0) return null;
  // Work in cents to keep the preview exact, then detect rounding.
  const exactCents = ((sal * pct) / 100) * 100; // salary*percent/100, in cents
  const cents = Math.round(exactCents);
  const rounded = Math.abs(exactCents - cents) > 1e-9;
  return { amount: (cents / 100).toFixed(2), rounded };
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "long" });
}

export function PlacementModal({
  open,
  context,
  monthlyBookedBefore,
  onClose,
  onLogged,
}: {
  open: boolean;
  context: PlacementContext | null;
  /** This-month total BEFORE this placement, as a number, for the toast. */
  monthlyBookedBefore: number;
  onClose: () => void;
  /** Fired with the placement the API persisted (its feeAmount is authoritative). */
  onLogged: (placement: PlacementDto) => void;
}) {
  const { toast } = useToast();
  const [basis, setBasis] = useState<FeeBasis>("percent_of_salary");
  const [amount, setAmount] = useState("");
  const [salary, setSalary] = useState("");
  const [percent, setPercent] = useState("8.33");
  // Guarantee window (§2E). Defaults to 30 server-side when omitted; this field is
  // optional and unobtrusive — most recruiters just take the default.
  const [guaranteeDays, setGuaranteeDays] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form each time the modal opens for a fresh candidate.
  useEffect(() => {
    if (open) {
      setBasis("percent_of_salary");
      setAmount("");
      setSalary("");
      setPercent("8.33");
      setGuaranteeDays("");
      setSaving(false);
    }
  }, [open, context?.candidateId]);

  const currency = context?.currency ?? "USD";
  const resolved = useMemo(
    () => resolveFee(basis, amount, salary, percent),
    [basis, amount, salary, percent],
  );

  if (!context) return null;

  const handleSave = async () => {
    if (!resolved || saving) return;
    const placedAt = new Date().toISOString();
    // Send the raw inputs — never a client-computed fee we'd then persist
    // (CLAUDE.md §3). The API resolves the Decimal and returns it.
    const gd = Number(guaranteeDays);
    const input: CreatePlacementInput = {
      candidateId: context.candidateId,
      jobId: context.jobId,
      basis,
      currency,
      placedAt,
      ...(basis === "flat" ? { amount } : { salary, percent }),
      ...(guaranteeDays.trim() && Number.isFinite(gd) && gd > 0 ? { guaranteeDays: gd } : {}),
    };

    setSaving(true);
    let placement: PlacementDto;
    try {
      placement = await api.createPlacement(input);
    } catch (err) {
      // Keep the modal open on error so Priya can retry without re-entering.
      setSaving(false);
      toast(
        err instanceof ApiError ? err.message : "Couldn't log that placement. Please try again.",
        "error",
      );
      return;
    }

    // Let the caller reflect server truth (move the card, refresh revenue).
    onLogged(placement);

    // Toast uses the AUTHORITATIVE returned feeAmount, never the estimate.
    const fee = Number(placement.feeAmount);
    const newTotal = monthlyBookedBefore + fee;
    const feeFmt = formatMoney(fee, placement.currency);
    const totalFmt = formatMoney(newTotal, placement.currency);
    // No PII in the toast — candidate name omitted (CLAUDE.md §2, §10).
    toast(
      `Placement logged. +${feeFmt} · ${totalFmt} booked in ${monthLabel(placement.placedAt)}.`,
      "success",
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log placement"
      description={
        <>
          Booking the fee for <span className="font-medium text-ink">{context.candidateName}</span>{" "}
          on <span className="font-medium text-ink">{context.jobTitle}</span>.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="space-y-4"
      >
        {/* Fee basis toggle */}
        <fieldset>
          <legend className="text-label uppercase text-muted">Fee basis</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fee basis">
            <BasisOption
              label="% of salary"
              checked={basis === "percent_of_salary"}
              onClick={() => setBasis("percent_of_salary")}
            />
            <BasisOption
              label="Flat amount"
              checked={basis === "flat"}
              onClick={() => setBasis("flat")}
            />
          </div>
        </fieldset>

        {basis === "flat" ? (
          <NumField
            label={`Fee amount (${currency})`}
            value={amount}
            onChange={setAmount}
            placeholder="8000"
            autoFocus
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label={`Annual salary (${currency})`}
              value={salary}
              onChange={setSalary}
              placeholder="96000"
              autoFocus
            />
            <NumField label="Fee %" value={percent} onChange={setPercent} placeholder="8.33" />
          </div>
        )}

        {/* Estimated fee preview — money integrity made visible (§10). Clearly
            labelled as an estimate: the authoritative Decimal comes back from the
            API on save (CLAUDE.md §3). */}
        <div className="rounded-md border border-line bg-subtle/60 p-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="text-label uppercase text-muted">Estimated fee</span>
            {resolved ? (
              <Money amount={resolved.amount} currency={currency} className="text-h3 text-money" />
            ) : (
              <span className="text-body text-faint">—</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {resolved ? (
              basis === "percent_of_salary" ? (
                <>
                  {fmtPlain(percent)}% of {formatMoney(Number(salary), currency)} ≈{" "}
                  {formatMoney(Number(resolved.amount), currency)}
                  {resolved.rounded ? " (rounded to the nearest cent)" : ""}. Confirmed on save.
                </>
              ) : (
                <>Flat fee in {currency}. The exact amount is confirmed on save.</>
              )
            ) : (
              "Enter the numbers above to preview the fee before you save."
            )}
          </p>
        </div>

        {/* Guarantee window — optional, defaults to 30 days server-side (§2E). */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="placement-guarantee" className="text-label text-muted">
            Guarantee window (days)
          </label>
          <input
            id="placement-guarantee"
            type="text"
            inputMode="numeric"
            value={guaranteeDays}
            onChange={(e) => setGuaranteeDays(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="30"
            aria-describedby="placement-guarantee-help"
            className={cn(
              "nums h-9 w-24 rounded-sm border border-line bg-surface px-3 text-body tabular-nums text-ink",
              "placeholder:text-faint transition focus:border-brand",
            )}
          />
        </div>
        <p id="placement-guarantee-help" className="-mt-2 text-sm text-muted">
          Until this elapses, the fee counts as at-risk. Leave blank for the default 30 days.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!resolved || saving}>
            {saving ? "Logging…" : "Log placement"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BasisOption({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "h-10 rounded-sm border px-3 text-body font-medium transition",
        checked
          ? "border-brand bg-brand-tint text-brand"
          : "border-line bg-surface text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-label text-muted">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className={cn(
          "nums h-10 w-full rounded-sm border border-line bg-surface px-3 text-body tabular-nums text-ink",
          "placeholder:text-faint transition focus:border-brand",
        )}
      />
    </div>
  );
}

// Local display formatters (the modal needs plain strings for the toast/preview
// copy; <Money/> covers the rendered figures).
function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function fmtPlain(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}
