"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Button } from "@/components/ui/Button";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  SpinnerIcon,
  UploadCloudIcon,
  SearchIcon,
  BriefcaseIcon,
  MailIcon,
  TrendingUpIcon,
  SparkleIcon,
} from "@/components/ui/Icon";

// First-run onboarding takeover (design-system: "kill the empty state" — but tell
// the story first). A full-screen, keyboard-navigable carousel that walks a new
// recruiter through the loop the product is built on: chaos → clean pool →
// search → jobs → client-ready submission → revenue. One Higgsfield illustration
// per beat (public/onboarding/*.webp), each tracing the brand's chaos→structure
// motif with a single terracotta accent. Shown once per account (gated on
// AuthUserDto.onboardedAt) by the app shell; never blocks ingest after dismissal.
//
// Responsive: full-screen on mobile, a centered card on desktop. Accessible:
// role=dialog, focus-trapped, Esc / ← → navigation, reduced-motion respected.

type Step = {
  /** Static illustration under apps/web/public. */
  image: string;
  /** Descriptive alt — never PII; these are generic brand illustrations. */
  alt: string;
  /** Small step label above the headline. */
  eyebrow: string;
  title: string;
  body: string;
  /** Icon for the feature-stack rail (null for the welcome beat). */
  icon: typeof UploadCloudIcon | null;
  /** Short rail label naming the feature this beat unlocks. */
  rail: string;
};

const STEPS: Step[] = [
  {
    image: "/onboarding/01-chaos.webp",
    alt: "Resumes, chat bubbles, an email and a phone scattered in disorder",
    eyebrow: "Welcome to Hiredesq",
    title: "Your candidates are everywhere. That's the problem.",
    body: "CVs in WhatsApp. Resumes buried in email. A name scribbled on your phone. The chaos was never the ads you post — it's everything that comes back. Hiredesq tames the return path. Here's how it all fits together.",
    icon: SparkleIcon,
    rail: "Start",
  },
  {
    image: "/onboarding/02-ingest.webp",
    alt: "Messy inputs on the left resolving into a tidy grid of clean candidate cards",
    eyebrow: "Step 1 · Kill the empty state",
    title: "Forward the mess. Watch it become a clean pool.",
    body: "Drop a folder of resumes, paste a WhatsApp export, or forward an email. Every one is parsed into a structured candidate — name, skills, contact, experience — and duplicates merge automatically. No typing, no setup. Your database fills itself.",
    icon: UploadCloudIcon,
    rail: "Ingest",
  },
  {
    image: "/onboarding/03-search.webp",
    alt: "A plain-English search over a grid of candidate cards, one match highlighted",
    eyebrow: "Step 2 · Find anyone in seconds",
    title: "Ask in plain English. Get the right person.",
    body: "“ICU nurses with a transferable Gulf visa” — search your own pool by meaning, not just keywords. The candidate you forgot you had surfaces in one line. Search is always free, never gated behind credits.",
    icon: SearchIcon,
    rail: "Search",
  },
  {
    image: "/onboarding/04-jobs.webp",
    alt: "A central job with candidates organised across a Sourced-to-Placed pipeline",
    eyebrow: "Step 3 · Give every CV a home",
    title: "Jobs are the spine. Everything hangs off them.",
    body: "Open a position, set its hard constraints, and every CV that trickles back lands attached to the req it was sourced for. Move candidates Sourced → Submitted → Interview → Placed, with a trail of why each one is in or out.",
    icon: BriefcaseIcon,
    rail: "Jobs",
  },
  {
    image: "/onboarding/05-submission.webp",
    alt: "A messy CV turning into a clean branded profile with contact details masked",
    eyebrow: "Step 4 · The thing you get paid for",
    title: "One click: messy CV → client-ready profile.",
    body: "Turn any candidate into a clean, branded profile with contact details masked, so the client can't go direct. Share a link today, advance the pipeline automatically, and see when they've viewed it.",
    icon: MailIcon,
    rail: "Submit",
  },
  {
    image: "/onboarding/06-revenue.webp",
    alt: "A revenue figure and an upward chart coming into focus out of noise",
    eyebrow: "Step 5 · See your money",
    title: "Your revenue, one click away — and honest.",
    body: "Mark a placement, record the fee, and watch your dashboard. Cleared revenue stays separate from at-risk money still inside the guarantee window, so the headline number is one you can trust. Now — let's go clean up that backlog.",
    icon: TrendingUpIcon,
    rail: "Revenue",
  },
];

export function OnboardingCarousel({
  /** Persist "seen" (POST /auth/onboarding/complete) then close. */
  onComplete,
}: {
  onComplete: () => Promise<void> | void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const isLast = index === STEPS.length - 1;

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    // Mark seen even if the network call fails — the recruiter shouldn't be
    // trapped in the tour by a flaky request; the app shell closes either way.
    try {
      await onComplete();
    } finally {
      setFinishing(false);
    }
  }, [finishing, onComplete]);

  const next = useCallback(() => {
    if (isLast) void finish();
    else setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [isLast, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Esc skips the tour (treated as "seen"); arrows page through it.
  useFocusTrap(ref, true, () => void finish());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Preload the next illustration so paging never flashes a blank panel.
  useEffect(() => {
    const upcoming = STEPS[index + 1];
    if (!upcoming) return;
    const img = new window.Image();
    img.src = upcoming.image;
  }, [index]);

  const step = STEPS[index]!; // index is always clamped to a valid step

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/40 motion-safe:animate-[fade_140ms_ease-out]"
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col bg-surface shadow-lg outline-none",
          "sm:max-w-3xl sm:rounded-lg sm:overflow-hidden",
          "motion-safe:animate-[popIn_140ms_ease-out]",
        )}
      >
        {/* Skip — top-right, always reachable. Marks the tour as seen. */}
        <button
          type="button"
          onClick={() => void finish()}
          disabled={finishing}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40"
        >
          Skip tour
          <CloseIcon className="h-3.5 w-3.5" />
        </button>

        {/* Illustration — pale-green letterbox blends with the artwork's own
            background; object-contain keeps the baked-in labels legible. */}
        <div className="flex shrink-0 items-center justify-center bg-brand-tint">
          <img
            key={step.image}
            src={step.image}
            alt={step.alt}
            decoding="async"
            className="h-48 w-full object-contain sm:h-72 motion-safe:animate-[fade_220ms_ease-out]"
          />
        </div>

        {/* Copy */}
        <div
          key={index}
          className="flex flex-1 flex-col px-6 py-6 sm:px-10 sm:py-7 motion-safe:animate-[fade_220ms_ease-out]"
        >
          <p className="text-label font-semibold uppercase tracking-wide text-brand">
            {step.eyebrow}
          </p>
          <h2 id="onboarding-title" className="mt-2 text-h2 font-bold text-ink">
            {step.title}
          </h2>
          <p className="mt-3 max-w-prose text-body text-muted">{step.body}</p>
        </div>

        {/* Feature-stack rail — names the loop and shows how each beat builds on
            the last. Completed beats get a check; the current one is filled. */}
        <div className="hidden shrink-0 items-center gap-1 border-t border-line px-10 pb-1 pt-4 sm:flex">
          {STEPS.slice(1).map((s, i) => {
            const stepNo = i + 1; // rail skips the welcome beat
            const done = stepNo < index;
            const current = stepNo === index;
            const Ico = s.icon ?? SparkleIcon;
            return (
              <div key={s.rail} className="flex flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIndex(stepNo)}
                  className={cn(
                    "group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition",
                    current ? "bg-brand-tint" : "hover:bg-subtle",
                  )}
                  aria-current={current ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition",
                      done && "bg-brand text-brand-fg",
                      current && "bg-brand text-brand-fg",
                      !done && !current && "bg-subtle text-muted",
                    )}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : <Ico className="h-3.5 w-3.5" />}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      current ? "text-ink" : "text-muted",
                    )}
                  >
                    {s.rail}
                  </span>
                </button>
                {stepNo < STEPS.length - 1 ? (
                  <span aria-hidden className="h-px w-3 shrink-0 bg-line" />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-10">
          {/* Progress dots (the canonical control on mobile, where the rail hides) */}
          <div className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s.image}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-brand" : "w-1.5 bg-line",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-sm text-faint sm:inline">
              {index + 1} of {STEPS.length}
            </span>
            {index > 0 ? (
              <Button variant="ghost" size="md" onClick={prev}>
                Back
              </Button>
            ) : null}
            <Button variant="primary" size="md" onClick={next} disabled={finishing}>
              {finishing ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" title="Finishing" />
              ) : isLast ? (
                "Let's go"
              ) : (
                <>
                  Next
                  <ArrowRightIcon className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
