"use client";

import { use, useEffect, useState } from "react";
import type { SharedSubmissionDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { Logo } from "@/components/marketing/Logo";
import { MaskedProfileView } from "@/components/submission/MaskedProfileView";
import { PrinterIcon } from "@/components/ui/Icon";

// PUBLIC client-facing share page (§2D, Wedge 2). Lives OUTSIDE the (app) group:
// no app shell, no nav, NO authenticated calls — it only fetches the public,
// tokenized SharedSubmissionDto (no ids, no workspace, no contact — §1/§2). This
// is the artifact a recruiter sends a client, so it's professional and minimal.

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: SharedSubmissionDto }
  | { status: "notfound" }
  | { status: "error" };

export default function SharedSubmissionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api
      .getSharedSubmission(token)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err) => {
        if (cancelled) return;
        // A bad/expired token reads as "not found" — never a scary error (the
        // client opening this isn't a hiredesq user).
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setState({ status: "notfound" });
        } else {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-canvas">
      {/* Quiet branded header — the recruiter's agency is the sender; this is a
          neutral, trustworthy frame around the candidate. */}
      <header className="border-b border-line bg-surface/80 backdrop-blur print:border-0">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3.5">
          <Logo />
          {state.status === "ready" ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink print:hidden"
            >
              <PrinterIcon className="h-4 w-4" />
              Print / Save PDF
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
        {state.status === "loading" ? (
          <ProfileSkeleton />
        ) : state.status === "notfound" ? (
          <Notice
            title="This profile link isn't available"
            body="The link may have expired or been removed. Ask whoever shared it to send you a fresh one."
          />
        ) : state.status === "error" ? (
          <Notice
            title="We couldn't load this profile"
            body="Something went wrong. Please refresh the page or try the link again in a moment."
          />
        ) : (
          <article className="rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-8 print:border-0 print:shadow-none">
            <MaskedProfileView profile={state.data.maskedProfile} summary={state.data.summary} />
            <footer className="mt-8 border-t border-line pt-4 text-sm text-faint">
              Shared on {shortDate(state.data.createdAt)} · Contact details are managed by the
              representing agency.
            </footer>
          </article>
        )}
      </div>
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-lg border border-line bg-surface p-8 text-center shadow-sm"
      role="status"
    >
      <h1 className="text-h2 text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-body text-muted">{body}</p>
    </div>
  );
}

// Skeleton matching the final profile shape — speed is the brand (Principle 1),
// never a centered spinner on a blank page.
function ProfileSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border border-line bg-surface p-6 shadow-sm motion-reduce:animate-none sm:p-8"
      aria-hidden="true"
    >
      <div className="h-7 w-48 rounded-sm bg-subtle" />
      <div className="mt-2 h-4 w-64 rounded-sm bg-subtle" />
      <div className="mt-6 space-y-2">
        <div className="h-3 w-full rounded-sm bg-subtle" />
        <div className="h-3 w-11/12 rounded-sm bg-subtle" />
        <div className="h-3 w-9/12 rounded-sm bg-subtle" />
      </div>
      <div className="mt-6 h-16 w-full rounded-md bg-subtle/60" />
      <div className="mt-6 flex gap-1.5">
        <div className="h-6 w-16 rounded-sm bg-subtle" />
        <div className="h-6 w-20 rounded-sm bg-subtle" />
        <div className="h-6 w-14 rounded-sm bg-subtle" />
      </div>
    </div>
  );
}
