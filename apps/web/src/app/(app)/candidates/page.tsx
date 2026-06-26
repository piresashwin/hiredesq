"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CandidateDto, CandidateListItemDto } from "@hiredesq/shared";
import { api, ApiError, PAGE_SIZE } from "@/lib/api";
import { useIngest } from "@/lib/ingest-context";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlusIcon, SearchIcon, SparkleIcon, TypeIcon } from "@/components/ui/Icon";
import { CandidateTable } from "@/components/candidate/CandidateTable";
import { CandidateSkeleton } from "@/components/candidate/CandidateSkeleton";
import { CandidateProfile } from "@/components/candidate/CandidateProfile";
import { Pagination } from "@/components/ui/Pagination";
import { IngestSurface } from "@/components/ingest/IngestSurface";
import {
  DuplicateReviewButton,
  DuplicateReviewSlideOver,
} from "@/components/ingest/DuplicateReview";

// The candidate desk — the home surface (design-system §6.3). Dense table with a
// sticky search bar; row click opens the slide-over profile. When there are zero
// candidates the page IS the ingest surface (Principle 2 — kill the empty state),
// never a "create your first candidate" void. New parses (parsedSignal) refresh
// the list and briefly highlight what just landed.

// useSearchParams (for the ⌘K spotlight's ?open=<id> handoff) must sit under a
// Suspense boundary, so the page is a thin wrapper around this desk component.
function CandidatesDesk() {
  const { parsedSignal, openIngest } = useIngest();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // List rows are PII-lean summaries; the full record is fetched when a profile opens.
  const [candidates, setCandidates] = useState<CandidateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // Search mode (F6). Keyword = backend's typo-tolerant fuzzy search; semantic =
  // meaning-based vector search ("describe who you want"). Component-state only.
  const [semantic, setSemantic] = useState(false);
  const [selected, setSelected] = useState<CandidateDto | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  // Server-side pagination (offset). `total` drives the numbered pager; `page` is
  // 1-based and resets to 1 whenever the query (term/mode) changes.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Track whether the workspace has *any* candidates (for the empty-state vs
  // no-search-results distinction) — independent of the current filter.
  const [hasAny, setHasAny] = useState<boolean | null>(null);
  const highlightTimer = useRef<number | null>(null);

  // Debounce the search input (§6.3 — debounced search → listCandidates).
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (term: string, useSemantic: boolean, pageArg: number, markNew = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.listCandidates(term, useSemantic, pageArg);
        const next = res.items;
        setTotal(res.total);
        if (markNew) {
          // Highlight rows not present before the refresh.
          setCandidates((prev) => {
            const prevIds = new Set(prev.map((c) => c.id));
            const fresh = next.filter((c) => !prevIds.has(c.id)).map((c) => c.id);
            if (fresh.length) {
              setHighlightIds(new Set(fresh));
              if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
              highlightTimer.current = window.setTimeout(() => setHighlightIds(new Set()), 2500);
            }
            return next;
          });
        } else {
          setCandidates(next);
        }
        if (!term) setHasAny(res.total > 0);
        else if (res.total > 0) setHasAny(true);
      } catch {
        setError("We couldn't load your candidates. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Open a profile: fetch the FULL candidate (contact + history) only now — the list
  // never carries that PII (§2). The drawer opens once the full record resolves.
  const openCandidate = useCallback(
    async (item: CandidateListItemDto) => {
      try {
        setSelected(await api.getCandidate(item.id));
      } catch {
        toast("We couldn't open that candidate. Please try again.", "error");
      }
    },
    [toast],
  );

  // Row kebab actions. Export downloads the candidate's record as JSON (§2 export
  // support); delete removes the row + decrements the total optimistically.
  const exportCandidate = useCallback(
    async (c: CandidateListItemDto) => {
      try {
        const data = await api.exportCandidate(c.id);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `candidate-${c.id}.json`; // ID only, no PII (§2)
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't export this candidate.", "error");
      }
    },
    [toast],
  );

  const deleteCandidate = useCallback(
    async (c: CandidateListItemDto) => {
      if (
        !window.confirm(
          `Delete ${c.fullName}? This permanently removes their profile and files.`,
        )
      ) {
        return;
      }
      try {
        await api.deleteCandidate(c.id);
        setCandidates((prev) => prev.filter((x) => x.id !== c.id));
        setTotal((t) => Math.max(0, t - 1));
        if (selected?.id === c.id) setSelected(null);
        toast(`${c.fullName}'s profile was deleted.`, "info");
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't delete this candidate.", "error");
      }
    },
    [toast, selected],
  );

  // A new term or mode flip resets to page 1 (the result set changed).
  useEffect(() => {
    setPage(1);
  }, [debounced, semantic]);

  // Re-run on term / mode / page change. An empty term ignores `semantic` (it's
  // the full list). When term+mode change, the effect above resets page to 1, so
  // this fires once with the new query on page 1.
  useEffect(() => {
    void load(debounced, semantic, page);
  }, [debounced, semantic, page, load]);

  // ⌘K spotlight handoff: /candidates?open=<id> opens that profile, then strips
  // the param so a refresh/back doesn't re-open it.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    let active = true;
    api
      .getCandidate(openId)
      .then((c) => {
        if (active) setSelected(c);
      })
      .catch(() => {
        if (active) toast("We couldn't open that candidate. Please try again.", "error");
      });
    router.replace("/candidates");
    return () => {
      active = false;
    };
  }, [searchParams, router, toast]);

  // A completed parse → reload (mark new rows). Skip the very first render.
  const firstSignal = useRef(parsedSignal);
  useEffect(() => {
    if (parsedSignal === firstSignal.current) return;
    void load(debounced, semantic, page, true);
  }, [parsedSignal, debounced, semantic, page, load]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  const showEmptyIngest = !loading && !error && hasAny === false && !debounced;

  return (
    <div className="flex h-full flex-col">
      {/* Header (§5) — page identity + the one primary action. Hidden in the
          true empty state, where the page IS the ingest surface. */}
      {!showEmptyIngest ? (
        <PageHeader
          title="Candidates"
          subtitle="Your clean, searchable talent pool."
          action={
            <div className="flex items-center gap-3">
              <DuplicateReviewButton onOpen={() => setReviewOpen(true)} />
              {/* Ingest lives here now (removed from the global header) — always one
                  click from adding candidates while on the desk. */}
              <Button variant="primary" size="sm" onClick={openIngest} data-tour="candidates-add">
                <PlusIcon className="h-4 w-4" strokeWidth={2} />
                Add candidates
              </Button>
            </div>
          }
        />
      ) : null}

      <div
        className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-4 sm:px-6"
        data-tour="candidates-list"
      >
        {showEmptyIngest ? (
          <EmptyIngest onReviewDuplicates={() => setReviewOpen(true)} />
        ) : (
          <>
            {/* Search/filter toolbar leads the body (§5 — it operates on the data,
                so it lives in the body, not the header). */}
            <div className="mb-4" data-tour="candidates-search">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      semantic
                        ? "Describe who you're looking for — e.g. ICU nurses with a transferable Gulf visa"
                        : "Search name, skill, role…"
                    }
                    aria-label={semantic ? "Search candidates by meaning" : "Search candidates"}
                    aria-describedby={semantic ? "search-mode-hint" : undefined}
                    className={cn(
                      "h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-body text-ink",
                      "placeholder:text-faint transition focus:border-brand",
                    )}
                  />
                </div>
                <SearchModeToggle semantic={semantic} onChange={setSemantic} />
                {candidates.length > 0 ? (
                  <span className="nums hidden shrink-0 text-sm tabular-nums text-muted sm:inline">
                    {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"}
                  </span>
                ) : null}
              </div>
              {semantic ? (
                <p
                  id="search-mode-hint"
                  className="mt-2 flex items-center gap-1.5 text-label text-muted"
                >
                  <SparkleIcon className="h-3.5 w-3.5 text-brand" aria-hidden />
                  Searching by meaning — describe the role, not just keywords.
                </p>
              ) : null}
            </div>

            {loading ? (
              <CandidateSkeleton />
            ) : error ? (
              <ErrorState onRetry={() => void load(debounced, semantic, page)} message={error} />
            ) : candidates.length === 0 ? (
              <NoResults term={debounced} />
            ) : (
              <>
                <CandidateTable
                  candidates={candidates}
                  highlightIds={highlightIds}
                  onSelect={(c) => void openCandidate(c)}
                  onDelete={(c) => void deleteCandidate(c)}
                  onExport={(c) => void exportCandidate(c)}
                />
                <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
              </>
            )}
          </>
        )}
      </div>

      <CandidateProfile
        candidate={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onUpdated={(next) => {
          setSelected((cur) => (cur && cur.id === next.id ? next : cur));
          setCandidates((prev) => prev.map((c) => (c.id === next.id ? next : c)));
        }}
      />

      <DuplicateReviewSlideOver open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={null}>
      <CandidatesDesk />
    </Suspense>
  );
}

// Keyword ⇄ semantic segmented control (F6). Two native buttons so it's
// keyboard-operable for free; `aria-pressed` exposes which mode is active and a
// group label names the control. Semantic is an enhancement, not the default —
// keyword stays the calm fallback.
function SearchModeToggle({
  semantic,
  onChange,
}: {
  semantic: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Search mode"
      className="inline-flex shrink-0 rounded-sm border border-line bg-surface p-0.5"
    >
      <SearchModeButton active={!semantic} onClick={() => onChange(false)}>
        <TypeIcon className="h-3.5 w-3.5" aria-hidden />
        Keyword
      </SearchModeButton>
      <SearchModeButton active={semantic} onClick={() => onChange(true)}>
        <SparkleIcon className="h-3.5 w-3.5" aria-hidden />
        Semantic
      </SearchModeButton>
    </div>
  );
}

function SearchModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-label font-medium transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        active ? "bg-brand-tint text-brand" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function EmptyIngest({ onReviewDuplicates }: { onReviewDuplicates: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="mb-6 text-center">
        <h1 className="text-h1 text-ink">Let&apos;s build your candidate database</h1>
        <p className="mt-1 text-body text-muted">
          No forms, no setup. Drop a folder of resumes, a CSV, or paste a chat — watch it become a
          clean database in seconds.
        </p>
      </div>
      <IngestSurface variant="page" autoFocus onReviewDuplicates={onReviewDuplicates} />
    </div>
  );
}

function NoResults({ term }: { term: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-body text-ink">No candidates match &ldquo;{term}&rdquo;.</p>
      <p className="mt-1 text-sm text-muted">Try a different name, skill, or location.</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <p className="text-body text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-line px-3 py-1.5 text-body text-brand transition hover:bg-subtle"
      >
        Try again
      </button>
    </div>
  );
}
