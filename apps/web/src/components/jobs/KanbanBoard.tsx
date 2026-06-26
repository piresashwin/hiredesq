"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ApplicationDto,
  CandidateDto,
  CandidateListItemDto,
  JobDto,
  PipelineStage,
} from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  IN_FLIGHT_STAGES,
  NEXT_STAGE,
  STAGE_ACCENT,
  STAGE_LABEL,
  STAGE_ORDER,
  daysBetween,
  daysInStageLabel,
  expectedFeeForJob,
} from "@/lib/pipeline";
import { estimateTotal, roleLine } from "@/lib/format";
import { Money } from "@/components/ui/Money";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowRightIcon,
  EyeIcon,
  FileIcon,
  MoreIcon,
  PlusIcon,
  SparkleIcon,
  UploadCloudIcon,
  XCircleIcon,
} from "@/components/ui/Icon";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { PlacementModal, type PlacementContext } from "@/components/PlacementModal";
import { AttachCandidateModal } from "@/components/jobs/AttachCandidateModal";
import { SuggestedCandidatesModal } from "@/components/jobs/SuggestedCandidatesModal";
import { ApplicationDetailDrawer } from "@/components/jobs/ApplicationDetailDrawer";
import { IngestSurface } from "@/components/ingest/IngestSurface";
import { CandidateProfile } from "@/components/candidate/CandidateProfile";
import { QualificationBadge } from "@/components/ui/Badge";

// Per-job Kanban board (design-system §6.5), now LIVE: applications load from the
// API and every move is an optimistic PATCH that reverts on error (Principle 1).
//
// Friendliness redesign vs. Phase 1:
//  • the per-card <select> is gone — moving is native drag-and-drop PLUS a
//    keyboard-accessible "•••" move menu and a one-click "advance →" (the common
//    path). Full keyboard operability either way.
//  • "+ Attach candidate" lives on the board (header + Sourced column) so a
//    populated board never forces a trip to the candidates page.
//  • candidate avatars anchor every card/row — recruiters scan by person.
//  • Rejected is de-emphasised: a muted collapsible disclosure, not a 5th column
//    (a rejection is not an error, §3.3).
//  • per-card quick actions: view candidate (slide-over) + reject.
// Pipeline/column totals derive from the job's expectedFee (the API is the source
// of truth for deal value) — the old per-app fixture map is gone.

type View = "board" | "list";

// The columns shown as full-weight Kanban lanes (Rejected is handled separately).
const BOARD_STAGES: PipelineStage[] = ["sourced", "submitted", "interview", "placed"];

export function KanbanBoard({ job }: { job: JobDto }) {
  const { toast } = useToast();
  const currency = job.currency ?? "USD";
  const expectedFee = expectedFeeForJob(job.expectedFee);

  const [apps, setApps] = useState<ApplicationDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<PipelineStage | null>(null);

  const [attachOpen, setAttachOpen] = useState(false);
  // Embedding-matched suggestions for this role (§5) — picking one reuses `attach`.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);

  // Job-centric inbound (§2A, F7): the "Add CVs to this role" surface. CVs pasted
  // or dropped here auto-attach to this job (land in Sourced) — no manual attach.
  const [ingestOpen, setIngestOpen] = useState(false);

  // Placement capture (drag/advance to Placed). On save the modal POSTs the
  // placement; the backend creates the fee record AND moves the application to
  // placed in one transaction (§6.7), so we reflect server truth on success.
  const [pending, setPending] = useState<PlacementContext | null>(null);
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);
  // Month-to-date booked total, fetched when the modal opens so the win toast can
  // show the accurate new monthly total (the board doesn't otherwise load revenue).
  const [bookedThisMonth, setBookedThisMonth] = useState(0);

  // Candidate slide-over (quick "view" action) — fetched on demand since cards
  // only carry a summary.
  const [profile, setProfile] = useState<CandidateDto | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Application detail drawer (qualification side-by-side + trail). The app
  // already carries constraintSummary/Flags, so no fetch is needed to open it;
  // the drawer loads the trail itself.
  const [detailApp, setDetailApp] = useState<ApplicationDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  function viewDetails(app: ApplicationDto) {
    setDetailApp(app);
    setDetailOpen(true);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.listApplications(job.id);
      setApps(next);
    } catch {
      setError("We couldn't load this pipeline. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = apps ?? [];

  const byStage = useMemo(() => {
    const map: Record<PipelineStage, ApplicationDto[]> = {
      sourced: [],
      submitted: [],
      interview: [],
      placed: [],
      rejected: [],
    };
    for (const a of list) map[a.stage].push(a);
    return map;
  }, [list]);

  const attachedIds = useMemo(() => new Set(list.map((a) => a.candidateId)), [list]);

  // Live pipeline value: in-flight apps × the job's expected fee. Display-only
  // (real weighting is JobDto.pipelineValue from the API); kept reactive so the
  // header total updates as cards move during a session.
  const inFlightCount = list.filter((a) => IN_FLIGHT_STAGES.includes(a.stage)).length;
  // Prefer the server's Decimal pipeline value; the local estimate is cents-safe
  // (never `count * Number(fee)` float, §3) and display-only.
  const livePipeline = job.pipelineValue ?? estimateTotal(expectedFee, inFlightCount);

  function contextFor(app: ApplicationDto): PlacementContext {
    return {
      candidateId: app.candidateId,
      candidateName: app.candidate?.fullName ?? "this candidate",
      jobId: job.id,
      jobTitle: job.title,
      currency,
    };
  }

  // ── Move a card to a stage (optimistic, revert on error) ────────────────
  async function moveStage(appId: string, stage: PipelineStage) {
    const app = list.find((a) => a.id === appId);
    if (!app || app.stage === stage) return;

    if (stage === "placed") {
      // Capture the fee first; the placement POST commits the move on save (§6.7).
      setPending(contextFor(app));
      setPendingAppId(appId);
      // Best-effort: get the month-to-date total so the toast shows the right
      // running figure. A failure here just falls back to 0 (the +fee still shows).
      setBookedThisMonth(0);
      void api
        .getRevenueSummary()
        // Booked = earned (cleared) + still-in-window (at-risk). A freshly logged
        // placement is at-risk, so the running toast total reflects both (§2E).
        .then((s) => setBookedThisMonth(Number(s.revenueCleared) + Number(s.revenueAtRisk)))
        .catch(() => setBookedThisMonth(0));
      return;
    }

    const prevStage = app.stage;
    setApps((cur) =>
      (cur ?? []).map((a) =>
        a.id === appId ? { ...a, stage, updatedAt: new Date().toISOString() } : a,
      ),
    );
    try {
      const saved = await api.moveStage(job.id, appId, stage);
      setApps((cur) => (cur ?? []).map((a) => (a.id === appId ? saved : a)));
      toast(`Moved to ${STAGE_LABEL[stage]}.`, "info");
    } catch (err) {
      setApps((cur) => (cur ?? []).map((a) => (a.id === appId ? { ...a, stage: prevStage } : a)));
      toast(err instanceof ApiError ? err.message : "Couldn't move that candidate.", "error");
    }
  }

  // Placement saved → the API created the placement AND moved the application to
  // placed in the same transaction. Optimistically move the card, then refetch to
  // reflect server truth (the win toast itself is fired by the modal). The modal
  // only calls this on a successful POST, so no rollback path is needed here.
  function handleLogged() {
    const appId = pendingAppId;
    setPendingAppId(null);
    if (!appId) return;
    setApps((cur) =>
      (cur ?? []).map((a) =>
        a.id === appId ? { ...a, stage: "placed", updatedAt: new Date().toISOString() } : a,
      ),
    );
    // Reconcile with the server (the placement transaction is the source of truth).
    void load();
  }

  // ── Attach a candidate (optimistic insert into Sourced) ─────────────────
  async function attach(candidate: CandidateListItemDto) {
    if (attachedIds.has(candidate.id)) return;
    setAttaching(candidate.id);
    try {
      const created = await api.attachCandidate(job.id, candidate.id);
      // Ensure the card has a summary to render even if the API omits it.
      const withSummary: ApplicationDto = {
        ...created,
        candidate: created.candidate ?? {
          id: candidate.id,
          fullName: candidate.fullName,
          currentTitle: candidate.currentTitle,
          currentCompany: candidate.currentCompany,
        },
      };
      setApps((cur) => [withSummary, ...(cur ?? [])]);
      // No PII in the toast (CLAUDE.md §2) — confirm by count, not name.
      toast("Candidate attached — landed in Sourced.", "success");
      setAttachOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't attach that candidate.", "error");
    } finally {
      setAttaching(null);
    }
  }

  // ── View a candidate (fetch full profile, open slide-over) ──────────────
  async function viewCandidate(candidateId: string) {
    try {
      const full = await api.getCandidate(candidateId);
      setProfile(full);
      setProfileOpen(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't open that candidate.", "error");
    }
  }

  // ── Native drag-and-drop ────────────────────────────────────────────────
  function onDrop(stage: PipelineStage) {
    setDragOver(null);
    if (dragId) void moveStage(dragId, stage);
    setDragId(null);
  }

  const hasApps = list.length > 0;

  return (
    <div className="flex h-full flex-col">
      <BoardHeader
        job={job}
        view={view}
        onView={setView}
        pipelineValue={livePipeline}
        currency={currency}
        onAttach={() => setAttachOpen(true)}
        onSuggest={() => setSuggestOpen(true)}
        onAddCvs={() => setIngestOpen(true)}
      />

      <div className="flex-1 overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loading ? (
          <BoardSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !hasApps ? (
          <EmptyPipeline
            onAttach={() => setAttachOpen(true)}
            onAddCvs={() => setIngestOpen(true)}
          />
        ) : view === "board" ? (
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
              {BOARD_STAGES.map((stage) => (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  apps={byStage[stage]}
                  currency={currency}
                  expectedFee={expectedFee}
                  isDropTarget={dragOver === stage}
                  draggingId={dragId}
                  onDragEnterCol={() => setDragOver(stage)}
                  onDragLeaveCol={() => setDragOver((cur) => (cur === stage ? null : cur))}
                  onDropCol={() => onDrop(stage)}
                  onDragStartCard={setDragId}
                  onDragEndCard={() => {
                    setDragId(null);
                    setDragOver(null);
                  }}
                  onMoveCard={moveStage}
                  onViewCard={viewCandidate}
                  onDetailsCard={viewDetails}
                  onAttach={stage === "sourced" ? () => setAttachOpen(true) : undefined}
                />
              ))}
            </div>
            <RejectedDisclosure
              apps={byStage.rejected}
              onMoveCard={moveStage}
              onViewCard={viewCandidate}
              onDetailsCard={viewDetails}
              isDropTarget={dragOver === "rejected"}
              onDragEnterCol={() => setDragOver("rejected")}
              onDragLeaveCol={() => setDragOver((cur) => (cur === "rejected" ? null : cur))}
              onDropCol={() => onDrop("rejected")}
            />
          </div>
        ) : (
          <ListView
            apps={list}
            currency={currency}
            expectedFee={expectedFee}
            onMoveCard={moveStage}
            onViewCard={viewCandidate}
            onDetailsCard={viewDetails}
          />
        )}
      </div>

      <AttachCandidateModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={(c) => void attach(c)}
        attachedIds={attachedIds}
        attaching={attaching}
      />

      <SuggestedCandidatesModal
        open={suggestOpen}
        jobId={job.id}
        onClose={() => setSuggestOpen(false)}
        onPick={(c) => void attach(c)}
        attachedIds={attachedIds}
        attaching={attaching}
      />

      {/* Job-centric inbound (§2A, F7): the return path for this role. CVs added
          here attach to the job and land in Sourced — refresh the board as they
          arrive so the recruiter watches them appear. */}
      <SlideOver
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        title={`Add CVs to ${job.title}`}
      >
        <SlideOverHeader onClose={() => setIngestOpen(false)}>
          <h2 className="text-h2 text-ink">Add CVs to this role</h2>
          <p className="mt-0.5 text-sm text-muted">
            CVs trickling back from your ad land here, organized — paste or drop them and they
            attach to <span className="font-medium text-ink">{job.title}</span>, straight into
            Sourced.
          </p>
        </SlideOverHeader>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <IngestSurface
            variant="panel"
            autoFocus
            targetJob={{ id: job.id, title: job.title }}
            onParsed={() => void load()}
          />
        </div>
      </SlideOver>

      <PlacementModal
        open={pending !== null}
        context={pending}
        monthlyBookedBefore={bookedThisMonth}
        onClose={() => {
          setPending(null);
          setPendingAppId(null);
        }}
        onLogged={() => handleLogged()}
      />

      <ApplicationDetailDrawer
        jobId={job.id}
        app={detailApp}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <CandidateProfile
        candidate={profile}
        open={profileOpen}
        jobId={job.id}
        onClose={() => setProfileOpen(false)}
        onUpdated={(next) => {
          setProfile(next);
          // Keep the board card summary in sync with edits.
          setApps((cur) =>
            (cur ?? []).map((a) =>
              a.candidateId === next.id
                ? {
                    ...a,
                    candidate: {
                      id: next.id,
                      fullName: next.fullName,
                      currentTitle: next.currentTitle,
                      currentCompany: next.currentCompany,
                    },
                  }
                : a,
            ),
          );
        }}
      />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────
function BoardHeader({
  job,
  view,
  onView,
  pipelineValue,
  currency,
  onAttach,
  onSuggest,
  onAddCvs,
}: {
  job: JobDto;
  view: View;
  onView: (v: View) => void;
  pipelineValue: string | null;
  currency: string;
  onAttach: () => void;
  onSuggest: () => void;
  onAddCvs: () => void;
}) {
  return (
    <div className="sticky top-14 z-20 border-b border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/jobs" className="text-sm text-muted transition hover:text-brand">
            ← Jobs
          </Link>
          <h1 className="truncate text-h1 text-ink">{job.title}</h1>
          <p className="mt-0.5 truncate text-sm text-muted">{job.client ?? "No client set"}</p>
        </div>

        <div className="flex items-center gap-3">
          {pipelineValue !== null ? (
            <div className="text-right">
              <div className="text-label uppercase text-muted">In pipeline</div>
              <Money amount={pipelineValue} currency={currency} className="text-h3 text-money" />
            </div>
          ) : null}
          <ViewToggle view={view} onView={onView} />
          <Button variant="secondary" size="sm" onClick={onSuggest}>
            <SparkleIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Suggest matches</span>
            <span className="sm:hidden">Suggest</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onAddCvs}>
            <UploadCloudIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Add CVs to this role</span>
            <span className="sm:hidden">Add CVs</span>
          </Button>
          <Button variant="primary" size="sm" onClick={onAttach}>
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Attach candidate</span>
            <span className="sm:hidden">Attach</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div
      role="group"
      aria-label="View"
      className="inline-flex rounded-md border border-line bg-surface p-0.5"
    >
      {(["board", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onView(v)}
          className={cn(
            "rounded-sm px-3 py-1 text-sm font-medium capitalize transition",
            view === v ? "bg-brand-tint text-brand" : "text-muted hover:text-ink",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── A board column ────────────────────────────────────────────────────────
function BoardColumn({
  stage,
  apps,
  currency,
  expectedFee,
  isDropTarget,
  draggingId,
  onDragEnterCol,
  onDragLeaveCol,
  onDropCol,
  onDragStartCard,
  onDragEndCard,
  onMoveCard,
  onViewCard,
  onDetailsCard,
  onAttach,
}: {
  stage: PipelineStage;
  apps: ApplicationDto[];
  currency: string;
  expectedFee: string | null;
  isDropTarget: boolean;
  draggingId: string | null;
  onDragEnterCol: () => void;
  onDragLeaveCol: () => void;
  onDropCol: () => void;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  onMoveCard: (id: string, stage: PipelineStage) => void;
  onViewCard: (candidateId: string) => void;
  onDetailsCard: (app: ApplicationDto) => void;
  onAttach?: () => void;
}) {
  const accent = STAGE_ACCENT[stage];
  // Column value = candidate count × the job's expected fee (display estimate),
  // cents-safe (no float drift, §3). Null when not an in-flight stage.
  const columnValue = IN_FLIGHT_STAGES.includes(stage) ? estimateTotal(expectedFee, apps.length) : null;

  return (
    <section
      aria-label={`${STAGE_LABEL[stage]} column`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={onDragEnterCol}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeaveCol();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropCol();
      }}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-md border bg-canvas/50 transition",
        isDropTarget ? cn("border-transparent ring-2", accent.ring) : "border-line",
      )}
    >
      <div className="rounded-t-md border-b border-line">
        <div className={cn("h-1 rounded-t-md", accent.bar)} aria-hidden />
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex items-center gap-1.5">
            <span className={cn("text-label font-semibold uppercase", accent.text)}>
              {STAGE_LABEL[stage]}
            </span>
            <span className="nums rounded-sm bg-subtle px-1.5 text-label tabular-nums text-muted">
              {apps.length}
            </span>
          </span>
          {columnValue !== null ? (
            <Money amount={columnValue} currency={currency} className="text-sm text-money" />
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {apps.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-faint">
            {isDropTarget ? "Drop here" : "—"}
          </p>
        ) : (
          apps.map((app) => (
            <BoardCard
              key={app.id}
              app={app}
              currency={currency}
              expectedFee={expectedFee}
              dragging={draggingId === app.id}
              onDragStart={() => onDragStartCard(app.id)}
              onDragEnd={onDragEndCard}
              onMove={(s) => onMoveCard(app.id, s)}
              onView={() => onViewCard(app.candidateId)}
              onDetails={() => onDetailsCard(app)}
            />
          ))
        )}
        {onAttach ? (
          <button
            type="button"
            onClick={onAttach}
            className={cn(
              "mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line",
              "py-2 text-sm font-medium text-muted transition hover:border-brand/40 hover:text-brand",
            )}
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2} />
            Attach candidate
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ── A draggable candidate card ─────────────────────────────────────────────
function BoardCard({
  app,
  currency,
  expectedFee,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onView,
  onDetails,
}: {
  app: ApplicationDto;
  currency: string;
  expectedFee: string | null;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (stage: PipelineStage) => void;
  onView: () => void;
  onDetails: () => void;
}) {
  const name = app.candidate?.fullName ?? "Candidate";
  const role = roleLine(app.candidate);
  const days = daysBetween(app.updatedAt);
  const next = NEXT_STAGE[app.stage];

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", app.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      aria-roledescription="Draggable candidate card"
      className={cn(
        "rounded-md border border-line bg-surface p-2.5 shadow-sm transition",
        "hover:border-brand/40",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 cursor-grab active:cursor-grabbing" aria-hidden>
          <Avatar name={name} id={app.candidateId} size="sm" />
        </span>
        <button
          type="button"
          onClick={onView}
          className="min-w-0 flex-1 text-left"
          aria-label={`View ${name}`}
        >
          <span className="block truncate text-body font-semibold text-ink hover:text-brand">
            {name}
          </span>
          {role ? <span className="block truncate text-sm text-muted">{role}</span> : null}
        </button>
        {expectedFee ? <ExpectedFeeChip amount={expectedFee} currency={currency} /> : null}
      </div>

      {app.constraintSummary && app.constraintSummary !== "none" ? (
        <button
          type="button"
          onClick={onDetails}
          className="mt-2 inline-flex rounded-sm transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          aria-label={`View qualification detail for ${name}`}
        >
          <QualificationBadge summary={app.constraintSummary} />
        </button>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="nums text-sm tabular-nums text-faint">
          {daysInStageLabel(days)} in stage
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onDetails}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-sm font-medium text-muted",
              "transition hover:bg-subtle hover:text-ink",
            )}
          >
            Details
          </button>
          {next ? (
            <button
              type="button"
              onClick={() => onMove(next)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-sm font-medium text-brand",
                "transition hover:bg-brand-tint",
              )}
            >
              {STAGE_LABEL[next]}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <CardMenu
            stage={app.stage}
            name={name}
            onMove={onMove}
            onView={onView}
            onDetails={onDetails}
          />
        </div>
      </div>
    </article>
  );
}

function ExpectedFeeChip({ amount, currency }: { amount: string; currency: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-sm bg-success-tint px-1.5 py-0.5 text-label font-medium text-money"
      title="Expected fee for this role"
    >
      <Money amount={amount} currency={currency} className="text-label text-money" />
    </span>
  );
}

// The move menu — the keyboard-accessible replacement for the old <select>.
// Lists the OTHER stages + view + reject as discrete actions.
function CardMenu({
  stage,
  name,
  onMove,
  onView,
  onDetails,
}: {
  stage: PipelineStage;
  name: string;
  onMove: (stage: PipelineStage) => void;
  onView: () => void;
  onDetails?: () => void;
}) {
  const items: MenuItem[] = [
    {
      key: "view",
      label: "View candidate",
      icon: <EyeIcon className="h-4 w-4" />,
      onSelect: onView,
    },
    ...(onDetails
      ? [
          {
            key: "details",
            label: "Qualification detail",
            icon: <FileIcon className="h-4 w-4" />,
            onSelect: onDetails,
          },
        ]
      : []),
    ...STAGE_ORDER.filter((s) => s !== stage && s !== "rejected").map((s) => ({
      key: s,
      label: `Move to ${STAGE_LABEL[s]}`,
      onSelect: () => onMove(s),
    })),
    ...(stage !== "rejected"
      ? [
          {
            key: "reject",
            label: "Reject",
            icon: <XCircleIcon className="h-4 w-4" />,
            destructive: true,
            onSelect: () => onMove("rejected"),
          },
        ]
      : []),
  ];

  return (
    <Menu
      label={`Actions for ${name}`}
      trigger={<MoreIcon className="h-5 w-5 p-px" />}
      items={items}
      align="end"
    />
  );
}

// ── Rejected disclosure (de-emphasised, §3.3) ──────────────────────────────
function RejectedDisclosure({
  apps,
  onMoveCard,
  onViewCard,
  onDetailsCard,
  isDropTarget,
  onDragEnterCol,
  onDragLeaveCol,
  onDropCol,
}: {
  apps: ApplicationDto[];
  onMoveCard: (id: string, stage: PipelineStage) => void;
  onViewCard: (candidateId: string) => void;
  onDetailsCard: (app: ApplicationDto) => void;
  isDropTarget: boolean;
  onDragEnterCol: () => void;
  onDragLeaveCol: () => void;
  onDropCol: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Rejected"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={onDragEnterCol}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeaveCol();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropCol();
        setOpen(true);
      }}
      className={cn(
        "shrink-0 rounded-md border bg-canvas/40 transition",
        isDropTarget ? "border-transparent ring-2 ring-stage-rejected/40" : "border-line",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-label font-semibold uppercase text-stage-rejected">Rejected</span>
        <span className="nums rounded-sm bg-subtle px-1.5 text-label tabular-nums text-muted">
          {apps.length}
        </span>
        <span className="ml-auto text-sm text-muted">
          {isDropTarget ? "Drop to reject" : open ? "Hide" : "Show"}
        </span>
      </button>

      {open && apps.length > 0 ? (
        <ul className="flex flex-wrap gap-2 border-t border-line p-2">
          {apps.map((app) => {
            const name = app.candidate?.fullName ?? "Candidate";
            const role = roleLine(app.candidate);
            return (
              <li
                key={app.id}
                className="flex w-64 items-center gap-2 rounded-md border border-line bg-surface/60 p-2 opacity-80"
              >
                <Avatar name={name} id={app.candidateId} size="sm" />
                <button
                  type="button"
                  onClick={() => onViewCard(app.candidateId)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`View ${name}`}
                >
                  <span className="block truncate text-body font-medium text-ink hover:text-brand">
                    {name}
                  </span>
                  {role ? <span className="block truncate text-sm text-muted">{role}</span> : null}
                </button>
                <CardMenu
                  stage={app.stage}
                  name={name}
                  onMove={(s) => onMoveCard(app.id, s)}
                  onView={() => onViewCard(app.candidateId)}
                  onDetails={() => onDetailsCard(app)}
                />
              </li>
            );
          })}
        </ul>
      ) : open ? (
        <p className="border-t border-line px-3 py-3 text-sm text-muted">No rejected candidates.</p>
      ) : null}
    </section>
  );
}

// ── List / table view (Priya likes rows, §6.5) ────────────────────────────
function ListView({
  apps,
  currency,
  expectedFee,
  onMoveCard,
  onViewCard,
  onDetailsCard,
}: {
  apps: ApplicationDto[];
  currency: string;
  expectedFee: string | null;
  onMoveCard: (id: string, stage: PipelineStage) => void;
  onViewCard: (candidateId: string) => void;
  onDetailsCard: (app: ApplicationDto) => void;
}) {
  const ordered = [...apps].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-body">
        <thead className="bg-subtle">
          <tr className="text-left text-label uppercase text-muted">
            <th className="py-2 pl-4 pr-3 font-medium">Candidate</th>
            <th className="py-2 pr-3 font-medium">Role @ Company</th>
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Qualification</th>
            <th className="py-2 pr-3 font-medium">Days in stage</th>
            {expectedFee ? (
              <th className="py-2 pr-3 text-right font-medium">Expected fee</th>
            ) : null}
            <th className="py-2 pr-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((app) => {
            const name = app.candidate?.fullName ?? "Candidate";
            const role = roleLine(app.candidate);
            const accent = STAGE_ACCENT[app.stage];
            const dead = app.stage === "rejected";
            return (
              <tr
                key={app.id}
                className={cn("h-12 border-b border-line last:border-0", dead && "opacity-60")}
              >
                <td className="pl-4 pr-3">
                  <span className="flex items-center gap-2">
                    <Avatar name={name} id={app.candidateId} size="sm" />
                    <button
                      type="button"
                      onClick={() => onViewCard(app.candidateId)}
                      className="truncate font-semibold text-ink hover:text-brand"
                    >
                      {name}
                    </button>
                  </span>
                </td>
                <td className="pr-3 text-muted">{role || "—"}</td>
                <td className="pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", accent.bar)} aria-hidden />
                    <span className="text-sm text-ink">{STAGE_LABEL[app.stage]}</span>
                  </span>
                </td>
                <td className="pr-3">
                  {app.constraintSummary && app.constraintSummary !== "none" ? (
                    <button
                      type="button"
                      onClick={() => onDetailsCard(app)}
                      className="inline-flex rounded-sm transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      aria-label={`View qualification detail for ${name}`}
                    >
                      <QualificationBadge summary={app.constraintSummary} />
                    </button>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="nums pr-3 tabular-nums text-muted">
                  {daysInStageLabel(daysBetween(app.updatedAt))}
                </td>
                {expectedFee ? (
                  <td className="pr-3 text-right">
                    {dead ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Money amount={expectedFee} currency={currency} className="text-money" />
                    )}
                  </td>
                ) : null}
                <td className="pr-4 text-right">
                  <span className="inline-flex justify-end">
                    <CardMenu
                      stage={app.stage}
                      name={name}
                      onMove={(s) => onMoveCard(app.id, s)}
                      onView={() => onViewCard(app.candidateId)}
                      onDetails={() => onDetailsCard(app)}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Loading / error / empty ────────────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 overflow-hidden" aria-hidden>
      {BOARD_STAGES.map((stage) => (
        <div key={stage} className="flex w-72 shrink-0 flex-col rounded-md border border-line">
          <div className={cn("h-1 rounded-t-md", STAGE_ACCENT[stage].bar)} />
          <div className="border-b border-line px-3 py-2">
            <div className="h-3 w-20 rounded bg-subtle motion-safe:animate-pulse" />
          </div>
          <div className="space-y-2 p-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-md border border-line bg-surface p-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-subtle motion-safe:animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 rounded bg-subtle motion-safe:animate-pulse" />
                    <div className="h-2.5 w-1/2 rounded bg-subtle motion-safe:animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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

function EmptyPipeline({ onAttach, onAddCvs }: { onAttach: () => void; onAddCvs: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-line bg-subtle/40 p-10 text-center">
      <p className="text-body text-ink">Start this pipeline with the CVs coming back.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Paste or drop the CVs trickling back from your ad — they parse and land in Sourced attached
        to this role. Or pick someone already in your database. Column totals start adding up as you
        move them toward Placed.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="sm" onClick={onAddCvs}>
          <UploadCloudIcon className="h-4 w-4" />
          Add CVs to this role
        </Button>
        <Button variant="secondary" size="sm" onClick={onAttach}>
          <PlusIcon className="h-4 w-4" strokeWidth={2} />
          Attach candidate
        </Button>
      </div>
    </div>
  );
}
