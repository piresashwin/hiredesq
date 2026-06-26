"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { JobDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { KanbanBoard } from "@/components/jobs/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { BriefcaseIcon } from "@/components/ui/Icon";

// Per-job Kanban board route (design-system §6.5) — now LIVE. The job is loaded
// from the API by route param (IDs only in the URL — never PII, CLAUDE.md §2);
// the board itself fetches its applications. A skeleton shows while loading
// (never a spinner-on-blank, Principle 1); a missing job gets a guided fallback
// rather than a void (§6.8).
export default function JobBoardPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const [job, setJob] = useState<JobDto | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setJob(await api.getJob(jobId));
      setStatus("ready");
    } catch (err) {
      setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "ready" && job) {
    return <KanbanBoard job={job} />;
  }

  if (status === "loading") {
    return (
      <div className="flex h-full flex-col">
        <div className="sticky top-14 z-20 border-b border-line bg-canvas/95 px-4 py-4 sm:px-6 lg:px-8">
          <div className="h-3 w-12 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-1.5 h-6 w-48 rounded bg-subtle motion-safe:animate-pulse" />
          <div className="mt-1.5 h-3 w-32 rounded bg-subtle motion-safe:animate-pulse" />
        </div>
        <div className="flex flex-1 gap-4 overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 w-72 shrink-0 rounded-md border border-line bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link href="/jobs" className="text-sm text-muted transition hover:text-brand">
        ← Jobs
      </Link>
      <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-line bg-subtle/40 p-10 text-center">
        <BriefcaseIcon className="mx-auto h-7 w-7 text-faint" />
        <p className="mt-3 text-body text-ink">
          {status === "notfound" ? "We couldn't find this job." : "We couldn't load this job."}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {status === "notfound"
            ? "It may have been removed. Pick one of your open roles to see its pipeline."
            : "Something went wrong reaching the server. Try again in a moment."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {status === "error" ? (
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          ) : null}
          <Link href="/jobs">
            <Button variant="primary" size="sm">
              Back to jobs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
