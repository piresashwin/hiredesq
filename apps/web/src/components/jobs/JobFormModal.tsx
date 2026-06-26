"use client";

import { useEffect, useState } from "react";
import type { CreateJobInput, JobDto, UpdateJobInput } from "@hiredesq/shared";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { TagInput } from "@/components/ui/TagInput";
import { CheckIcon, ArrowRightIcon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

// Job create/edit form (design-system §6.4 / §6.8). One component, two modes:
// no `job` = create; a `job` = edit (pre-filled). Laid out as a two-step wizard —
// a step list on the left, the active step's fields on the right — so the role
// basics and the deterministic qualification filter (§2C, F4) don't crowd a
// single scroll. Step 1 captures title/client/fee; step 2 captures the HARD
// REQUIREMENTS (nationalities, "visa must transfer", licences). All of step 2 is
// optional — an unconstrained role simply shows no qualification chips downstream.

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED"];

const STEPS = [
  { label: "Role & fee", short: "Title, client, fee" },
  { label: "Requirements", short: "Nationality, visa, licences" },
] as const;

export function JobFormModal({
  open,
  onClose,
  onSubmit,
  job,
}: {
  open: boolean;
  onClose: () => void;
  /** Create takes CreateJobInput; edit takes UpdateJobInput. Resolve to a boolean
   *  (true = saved → close/reset). */
  onSubmit: (input: CreateJobInput & UpdateJobInput) => Promise<boolean>;
  /** Present = edit mode (pre-filled); absent = create mode. */
  job?: JobDto;
}) {
  const editing = Boolean(job);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [expectedFee, setExpectedFee] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [transferable, setTransferable] = useState(false);
  const [licenses, setLicenses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // (Re)seed the form whenever it opens — from the job in edit mode, blank in
  // create mode — so a reopened modal never shows stale values. Always restart
  // at the first step.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setTitle(job?.title ?? "");
    setClient(job?.client ?? "");
    setDescription(job?.description ?? "");
    setExpectedFee(job?.expectedFee ?? "");
    setCurrency(job?.currency ?? "USD");
    setNationalities(job?.requiredNationalities ?? []);
    setTransferable(job?.residenceTransferableRequired ?? false);
    setLicenses(job?.requiredLicenses ?? []);
    setSubmitting(false);
  }, [open, job]);

  // Title is the only required field, and it lives on step 1 — so it also gates
  // advancing to step 2 (and jumping there via the step list).
  const canAdvance = title.trim().length > 0;
  const isLast = step === STEPS.length - 1;

  const goTo = (target: number) => {
    if (target <= step || canAdvance) setStep(target);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit job" : "New job"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Not on the last step yet → "Next" (and Enter-in-a-field) advances
          // rather than submitting.
          if (!isLast) {
            if (canAdvance) setStep((s) => s + 1);
            return;
          }
          if (!canAdvance || submitting) return;
          setSubmitting(true);
          void onSubmit({
            title: title.trim(),
            client: client.trim() || undefined,
            description: description.trim() || undefined,
            expectedFee: expectedFee.trim() || undefined,
            currency,
            requiredNationalities: nationalities,
            residenceTransferableRequired: transferable,
            requiredLicenses: licenses,
          }).then((ok) => {
            if (!ok) setSubmitting(false);
          });
        }}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {/* Step list — desktop sidebar */}
          <nav aria-label="Steps" className="hidden sm:block sm:w-44 sm:shrink-0">
            <ol className="space-y-1 border-r border-line pr-5">
              {STEPS.map((s, i) => {
                const done = i < step;
                const active = i === step;
                const reachable = i <= step || canAdvance;
                return (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      disabled={!reachable}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition",
                        active ? "bg-brand-tint" : "hover:bg-subtle",
                        !reachable && "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label font-semibold",
                          active || done
                            ? "bg-brand text-brand-fg"
                            : "border border-line text-muted",
                        )}
                      >
                        {done ? <CheckIcon className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-body",
                            active || done ? "font-medium text-ink" : "text-muted",
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-label text-muted">{s.short}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Step progress — mobile header (the sidebar collapses on small screens) */}
          <div className="sm:hidden">
            <p className="text-label uppercase text-muted">
              Step {step + 1} of {STEPS.length}
            </p>
            <p className="mt-0.5 text-body font-medium text-ink">{STEPS[step]?.label}</p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.label}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i <= step ? "bg-brand" : "bg-line",
                  )}
                />
              ))}
            </div>
          </div>

          {/* Active step's fields */}
          <div className="min-w-0 flex-1">
            <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-0.5">
              {step === 0 ? (
                <>
                  <p className="text-sm text-muted">
                    Add the role and client. The expected fee drives your pipeline value.
                  </p>
                  <Field
                    label="Role title"
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Senior Product Manager"
                    autoFocus
                  />
                  <Field
                    label="Client"
                    name="client"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="Acme Fintech"
                    hint="Optional"
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="description" className="block text-label text-muted">
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Responsibilities, must-have experience, the kind of person who fits…"
                      rows={4}
                      maxLength={5000}
                      className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-faint transition focus:border-brand"
                    />
                    <p className="text-label text-muted">
                      Optional — powers the “Suggest matches” candidate search for this role.
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <Field
                      label="Expected fee"
                      name="expectedFee"
                      inputMode="decimal"
                      value={expectedFee}
                      onChange={(e) => setExpectedFee(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="8000"
                      hint="Typical placement fee for this role"
                      className="nums tabular-nums"
                    />
                    <div className="space-y-1.5">
                      <label htmlFor="currency" className="block text-label text-muted">
                        Currency
                      </label>
                      <select
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="h-10 rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Non-negotiables for this role. Candidates are checked against these as a plain
                    checklist — required vs. what they have. All optional.
                  </p>

                  <TagInput
                    label="Required nationalities"
                    value={nationalities}
                    onChange={setNationalities}
                    placeholder="e.g. Filipino, Indian"
                    hint="Leave empty if any nationality is fine. A candidate matches if they hold any one."
                  />

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-sm py-1">
                    <input
                      type="checkbox"
                      checked={transferable}
                      onChange={(e) => setTransferable(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-line text-brand focus:ring-brand"
                    />
                    <span>
                      <span className="block text-body text-ink">
                        Residence / visa must be transferable
                      </span>
                      <span className="block text-sm text-muted">
                        Only candidates whose visa can transfer to this employer will qualify.
                      </span>
                    </span>
                  </label>

                  <TagInput
                    label="Required licences"
                    value={licenses}
                    onChange={setLicenses}
                    placeholder="e.g. BLS, ACLS"
                    hint="Certifications the candidate must hold. They must have all listed."
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer — Cancel always; Back from step 2; Next on step 1, submit on the last. */}
        <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
              >
                Back
              </Button>
            ) : null}
            {isLast ? (
              <Button type="submit" variant="primary" disabled={!canAdvance || submitting}>
                {submitting
                  ? editing
                    ? "Saving…"
                    : "Creating…"
                  : editing
                    ? "Save changes"
                    : "Create job"}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!canAdvance}>
                Next
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
