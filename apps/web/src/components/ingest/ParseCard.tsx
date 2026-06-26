"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateDto } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { AiBadge } from "@/components/ui/Badge";
import {
  AlertIcon,
  CheckIcon,
  ChatIcon,
  PhoneIcon,
  MailIcon,
  SpinnerIcon,
} from "@/components/ui/Icon";

// One parse card in the live reveal (design-system §6.2 + §8 — THE wow moment).
// While the job runs it shows a "reading…" spinner; on done the candidate's
// fields populate PROGRESSIVELY (name → role → contact) with a soft check.
// Reduced motion: the staged reveal collapses to an instant fill (the CSS
// keyframes are disabled globally and we drop the per-field stagger delay).

export type ParseItemState =
  | { phase: "reading" }
  | { phase: "done"; candidate: CandidateDto }
  | { phase: "failed"; error: string };

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ParseCard({ label, state }: { label: string; state: ParseItemState }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-3 motion-safe:animate-[popIn_140ms_ease-out]",
        state.phase === "failed" ? "border-warning/40" : "border-line",
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted">
        <ChatIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium text-ink">{label}</span>
      </div>

      <div className="mt-2">
        {state.phase === "reading" ? <ReadingState /> : null}
        {state.phase === "failed" ? <FailedState error={state.error} /> : null}
        {state.phase === "done" ? <DoneState candidate={state.candidate} /> : null}
      </div>
    </div>
  );
}

function ReadingState() {
  return (
    <div className="flex items-center gap-2 text-body text-info" aria-live="polite">
      <SpinnerIcon className="h-4 w-4 animate-spin" />
      <span>Reading…</span>
    </div>
  );
}

function FailedState({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 text-body text-warning" role="status">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error || "Couldn't read this one — want to paste the text?"}</span>
    </div>
  );
}

// Reveals name → role → contact in three staged steps. Each step is gated on a
// timer so the recruiter watches the structure assemble (the streaming feel).
function DoneState({ candidate }: { candidate: CandidateDto }) {
  const reduced = useRef(prefersReducedMotion());
  const [step, setStep] = useState(reduced.current ? 3 : 0);

  useEffect(() => {
    if (reduced.current) return;
    const timers = [
      window.setTimeout(() => setStep(1), 80),
      window.setTimeout(() => setStep(2), 320),
      window.setTimeout(() => setStep(3), 560),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const role = [candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" @ ");
  const contact = candidate.email ?? candidate.phone;

  return (
    <div className="space-y-1.5">
      {step >= 1 ? (
        <div className="reveal-field flex items-center gap-2">
          <span className="text-h3 text-ink">{candidate.fullName}</span>
          {step >= 3 ? (
            <span
              className="check-pop inline-flex h-4 w-4 items-center justify-center rounded-full bg-money text-white"
              aria-label="Parsed"
            >
              <CheckIcon className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : null}
        </div>
      ) : (
        <Placeholder w="w-32" />
      )}

      {step >= 2 ? (
        role ? (
          <p className="reveal-field text-body text-muted">{role}</p>
        ) : null
      ) : (
        <Placeholder w="w-44" />
      )}

      {step >= 3 ? (
        contact ? (
          <p className="reveal-field flex items-center gap-1.5 text-sm text-muted">
            {candidate.email ? (
              <MailIcon className="h-3.5 w-3.5" />
            ) : (
              <PhoneIcon className="h-3.5 w-3.5" />
            )}
            {contact}
            <AiBadge className="ml-1" />
          </p>
        ) : null
      ) : (
        <Placeholder w="w-28" />
      )}
    </div>
  );
}

function Placeholder({ w }: { w: string }) {
  return <div className={cn("h-3.5 rounded bg-subtle", w)} aria-hidden />;
}
