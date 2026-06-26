"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreateJobInput, JobDto, UpdateJobInput } from "@hiredesq/shared";
import { api, ApiError, PAGE_SIZE } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { STAGE_ACCENT, STAGE_LABEL, STAGE_ORDER } from "@/lib/pipeline";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Money } from "@/components/ui/Money";
import { Pagination } from "@/components/ui/Pagination";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { JobFormModal } from "@/components/jobs/JobFormModal";
import { useToast } from "@/components/ui/Toast";
import {
  BriefcaseIcon,
  EyeIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/Icon";

// Jobs index (design-system §6.4 density / §6.5) — now LIVE. Loads listJobs()
// with skeletons (never a spinner-on-blank); the empty state IS the create
// surface (§6.8). Search + pagination are SERVER-SIDE (mirrors the candidates
// desk): a debounced term scopes the query, the numbered pager walks the
// workspace-scoped total — never a client-side .filter() of one page.

function totalInPipeline(job: JobDto): number {
  return STAGE_ORDER.reduce((sum, s) => sum + (job.stageCounts?.[s] ?? 0), 0);
}

export function JobsIndex() {
  const { toast } = useToast();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);
  // Edit mode reuses the create modal pre-filled with this job (JobFormModal
  // supports both modes via its optional `job` prop).
  const [editing, setEditing] = useState<JobDto | null>(null);
  // Server-side pagination (offset). `total` drives the pager; `page` resets to 1
  // whenever the search term changes.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Whether the workspace has ANY jobs (empty-state vs no-search-results), set from
  // the unfiltered load so a search miss never shows the create-first empty state.
  const [hasAny, setHasAny] = useState<boolean | null>(null);

  // Debounce the search input (mirrors the candidates desk's 250ms).
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = useCallback(async (term: string, pageArg: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listJobs(term, pageArg);
      setJobs(res.items);
      setTotal(res.total);
      if (!term) setHasAny(res.total > 0);
      else if (res.total > 0) setHasAny(true);
    } catch {
      setError("We couldn't load your jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // A new term resets to page 1 (the result set changed).
  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    void load(debounced, page);
  }, [debounced, page, load]);

  async function handleCreate(input: CreateJobInput): Promise<boolean> {
    try {
      await api.createJob(input);
      setCreating(false);
      // Refetch the current view so the new row lands paged/ordered server-side.
      void load(debounced, page);
      toast("Job created — attach candidates to start the pipeline.", "success");
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't create that job.", "error");
      return false;
    }
  }

  async function handleEdit(input: UpdateJobInput): Promise<boolean> {
    if (!editing) return false;
    try {
      const updated = await api.updateJob(editing.id, input);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setEditing(null);
      toast("Job updated.", "success");
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update that job.", "error");
      return false;
    }
  }

  const deleteJob = useCallback(
    async (job: JobDto) => {
      if (
        !window.confirm(
          `Delete ${job.title}? This permanently removes the job and its pipeline.`,
        )
      ) {
        return;
      }
      try {
        await api.deleteJob(job.id);
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        setTotal((t) => Math.max(0, t - 1));
        toast(`${job.title} was deleted.`, "info");
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't delete that job.", "error");
      }
    },
    [toast],
  );

  const showEmpty = !loading && !error && hasAny === false && !debounced;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Jobs"
        subtitle="Your open roles and the candidates moving through each."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            data-tour="jobs-create"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            New job
          </Button>
        }
      />

      <div
        className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        data-tour="jobs-list"
      >
        {loading ? (
          <JobsSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load(debounced, page)} />
        ) : showEmpty ? (
          <EmptyJobs onCreate={() => setCreating(true)} />
        ) : (
          <>
            {/* Search/filter toolbar leads the body (§5 — operates on the data). */}
            <div className="relative mb-4">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles or clients…"
                aria-label="Search jobs"
                className={cn(
                  "h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-body text-ink",
                  "placeholder:text-faint transition focus:border-brand",
                )}
              />
            </div>

            {jobs.length === 0 ? (
              <NoResults term={debounced} />
            ) : (
              <>
                <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
                  {jobs.map((job) => (
                    <li key={job.id}>
                      <JobRow
                        job={job}
                        onOpen={() => router.push(`/jobs/${job.id}`)}
                        onEdit={() => setEditing(job)}
                        onDelete={() => void deleteJob(job)}
                      />
                    </li>
                  ))}
                </ul>
                <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
              </>
            )}
          </>
        )}
      </div>

      <JobFormModal open={creating} onClose={() => setCreating(false)} onSubmit={handleCreate} />
      <JobFormModal
        open={editing !== null}
        job={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={handleEdit}
      />
    </div>
  );
}

// A dense, scannable job row: title + client, a stage-distribution mini-bar,
// candidate count, and pipeline value (money green). Click → the Kanban board.
// A trailing 3-dot menu carries Open / Edit / Delete; its cell stops the click
// from also navigating the row Link.
function JobRow({
  job,
  onOpen,
  onEdit,
  onDelete,
}: {
  job: JobDto;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const total = totalInPipeline(job);

  const menuItems: MenuItem[] = [
    { key: "open", label: "Open", icon: <EyeIcon className="h-4 w-4" />, onSelect: onOpen },
    { key: "edit", label: "Edit", icon: <PencilIcon className="h-4 w-4" />, onSelect: onEdit },
    {
      key: "delete",
      label: "Delete",
      icon: <TrashIcon className="h-4 w-4" />,
      destructive: true,
      onSelect: onDelete,
    },
  ];

  return (
    <div className="group relative flex items-stretch">
      <Link
        href={`/jobs/${job.id}`}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3 px-4 py-3 transition hover:bg-subtle sm:flex-row sm:items-center",
        )}
      >
        <div className="min-w-0 sm:w-64 sm:shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-h3 text-ink group-hover:text-brand">{job.title}</h2>
            <StatusPill status={job.status} />
          </div>
          <p className="truncate text-sm text-muted">{job.client ?? "No client set"}</p>
        </div>

        <div className="min-w-0 flex-1">
          {total > 0 ? (
            <StageBar job={job} total={total} />
          ) : (
            <p className="text-sm text-faint">
              No candidates yet — attach one to start the pipeline.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-6 sm:justify-end">
          <div className="text-right">
            <div className="nums text-sm tabular-nums text-muted">
              {total} {total === 1 ? "candidate" : "candidates"}
            </div>
            <div className="text-sm text-faint">Created {timeAgo(job.createdAt)}</div>
          </div>
          <div className="text-right sm:w-28">
            <div className="text-label uppercase text-muted">Pipeline</div>
            <Money
              amount={job.pipelineValue ?? "0.00"}
              currency={job.currency ?? "USD"}
              className="text-h3 text-money"
            />
          </div>
        </div>
      </Link>

      {/* Row actions — outside the Link so the menu never triggers navigation. */}
      <div
        className="flex shrink-0 items-center pr-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Menu
          label={`Actions for ${job.title}`}
          align="end"
          trigger={<MoreIcon className="h-5 w-5 p-0.5" />}
          items={menuItems}
        />
      </div>
    </div>
  );
}

// A proportional segmented bar showing the pipeline shape (Sourced→…→Rejected),
// coloured by the §3.3 stage palette, with a legend of non-empty stages.
function StageBar({ job, total }: { job: JobDto; total: number }) {
  const segments = STAGE_ORDER.map((s) => ({ stage: s, count: job.stageCounts?.[s] ?? 0 })).filter(
    (seg) => seg.count > 0,
  );
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-subtle"
        role="img"
        aria-label={segments.map((seg) => `${seg.count} ${STAGE_LABEL[seg.stage]}`).join(", ")}
      >
        {segments.map((seg) => (
          <span
            key={seg.stage}
            className={cn("h-full", STAGE_ACCENT[seg.stage].bar)}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden>
        {segments.map((seg) => (
          <span key={seg.stage} className="inline-flex items-center gap-1.5 text-sm text-muted">
            <span className={cn("h-2 w-2 rounded-full", STAGE_ACCENT[seg.stage].bar)} />
            <span className="nums tabular-nums font-medium text-ink">{seg.count}</span>
            {STAGE_LABEL[seg.stage]}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const open = status.toLowerCase() === "open";
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm px-1.5 py-0.5 text-label font-medium capitalize",
        open ? "bg-brand-tint text-brand" : "bg-subtle text-muted",
      )}
    >
      {status}
    </span>
  );
}

function JobsSkeleton() {
  return (
    <ul
      className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-64 shrink-0 space-y-1.5">
            <div className="h-4 w-2/3 rounded bg-subtle motion-safe:animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-subtle motion-safe:animate-pulse" />
          </div>
          <div className="h-2 flex-1 rounded-full bg-subtle motion-safe:animate-pulse" />
          <div className="h-6 w-20 rounded bg-subtle motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function NoResults({ term }: { term: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-body text-ink">No jobs match &ldquo;{term}&rdquo;.</p>
      <p className="mt-1 text-sm text-muted">Try a different role or client name.</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <p className="text-body text-ink">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
        Try again
      </Button>
    </div>
  );
}

function EmptyJobs({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-line bg-subtle/40 p-10 text-center">
      <BriefcaseIcon className="mx-auto h-7 w-7 text-faint" />
      <p className="mt-3 text-body text-ink">Open your first role.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Create a job, then attach candidates to watch them move through Sourced → Submitted →
        Interview → Placed, with pipeline value rising as they go.
      </p>
      <Button variant="primary" size="sm" onClick={onCreate} className="mt-4">
        <PlusIcon className="h-4 w-4" strokeWidth={2} />
        New job
      </Button>
    </div>
  );
}
