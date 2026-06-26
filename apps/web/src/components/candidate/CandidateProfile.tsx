"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddNoteInput,
  CandidateDto,
  CandidateJobHistoryDto,
  CustomFieldDefinitionDto,
  EducationEntry,
  ExperienceEntry,
  NoteDto,
  UpdateCandidateInput,
} from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toast";
import { telHref, timeAgo, whatsappHref } from "@/lib/format";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { AiBadge, Chip, StageBadge } from "@/components/ui/Badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import { EditableField } from "@/components/candidate/EditableField";
import { TagInput } from "@/components/ui/TagInput";
import { GenerateSubmissionButton } from "@/components/submission/GenerateSubmission";
import { CandidateSubmissions } from "@/components/submission/CandidateSubmissions";
import {
  BriefcaseIcon,
  ChatIcon,
  FileIcon,
  MailIcon,
  PhoneIcon,
  TrashIcon,
  UploadCloudIcon,
} from "@/components/ui/Icon";

// Candidate profile slide-over (design-system §6.4) — a wide TWO-COLUMN layout:
//   • Left  — profile photo + identity, contact actions, and Operations (submission /
//             view original / export / delete). Kept compact so it never scrolls.
//   • Right — tabbed: Personal details (editable fields) · Experience · Education ·
//             Skills · Job history · Notes · Submissions.
// Every parsed field stays editable in place (optimistic PATCH); delete is an
// explicit, honest confirm naming exactly what's removed (a11y §10 / CLAUDE.md §2).

const RESIDENCE_OPTIONS: { label: string; value: boolean | null }[] = [
  { label: "Transferable", value: true },
  { label: "Not transferable", value: false },
  { label: "Unknown", value: null },
];

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function CandidateProfile({
  candidate,
  open,
  jobId,
  onClose,
  onUpdated,
}: {
  candidate: CandidateDto | null;
  open: boolean;
  /**
   * When the drawer is opened from inside a job pipeline, this is that job's id.
   * It gates the "Generate client-ready submission" operation — that action only
   * makes sense against a specific job — and links the generated submission to it.
   * Omitted on the candidate-pool view, where the Operations block is hidden.
   */
  jobId?: string;
  onClose: () => void;
  onUpdated: (next: CandidateDto) => void;
}) {
  const { toast } = useToast();
  const [viewingFile, setViewingFile] = useState(false);
  const [tab, setTab] = useState("details");

  useEffect(() => {
    if (open) setTab("details");
  }, [open, candidate?.id]);

  if (!candidate) return null;

  const hasOriginalFile =
    candidate.source === "resume_upload" || candidate.source === "bulk_import";

  async function onViewOriginal() {
    if (!candidate) return;
    setViewingFile(true);
    // Open the tab synchronously (inside the click gesture) so the popup blocker
    // lets it through, THEN navigate it once the signed URL resolves. We must NOT
    // pass "noopener" here — that makes window.open return null, so we'd lose the
    // handle and the post-await fallback open() gets blocked. Null the opener
    // manually instead to keep the same security posture.
    const tabWin = window.open("about:blank", "_blank");
    if (tabWin) tabWin.opener = null;
    try {
      const { url } = await api.getCandidateFileUrl(candidate.id);
      if (tabWin) tabWin.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      tabWin?.close();
      toast(
        err instanceof ApiError ? err.message : "Couldn't open the original — it may have moved.",
        "error",
      );
    } finally {
      setViewingFile(false);
    }
  }

  // Optimistic field save: update parent immediately, revert on failure.
  async function save(patch: UpdateCandidateInput): Promise<boolean> {
    if (!candidate) return false;
    const prev = candidate;
    const optimistic = { ...candidate, ...patch } as CandidateDto;
    // customFields is a partial patch (one key) — MERGE into the existing map rather
    // than letting the spread replace the whole thing. null/"" clears a key, mirroring
    // the server. The authoritative map comes back from the PATCH response below.
    if (patch.customFields) {
      const merged = { ...candidate.customFields };
      for (const [k, v] of Object.entries(patch.customFields)) {
        if (v === null || v === "") delete merged[k];
        else merged[k] = v;
      }
      optimistic.customFields = merged;
    }
    onUpdated(optimistic);
    try {
      const saved = await api.updateCandidate(candidate.id, patch);
      onUpdated(saved);
      return true;
    } catch (err) {
      onUpdated(prev);
      toast(err instanceof ApiError ? err.message : "Couldn't save that change.", "error");
      return false;
    }
  }

  const role = [candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" @ ");

  const tabs: TabDef[] = [
    { key: "details", label: "Personal details" },
    { key: "experience", label: "Experience", count: candidate.experience.length },
    { key: "education", label: "Education", count: candidate.education.length },
    { key: "skills", label: "Skills", count: candidate.skills.length },
    { key: "jobs", label: "Job history" },
    { key: "notes", label: "Notes" },
    { key: "submissions", label: "Submissions" },
  ];

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        size="xl"
        title={`${candidate.fullName} — candidate profile`}
      >
        <SlideOverHeader onClose={onClose}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-faint">
            <SourceBadge source={candidate.source} />
            <span>
              Parsed from {candidate.source.replace(/_/g, " ")} &middot; {timeAgo(candidate.createdAt)}
            </span>
            {hasOriginalFile ? (
              <button
                type="button"
                onClick={() => void onViewOriginal()}
                disabled={viewingFile}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm font-medium text-brand transition",
                  "hover:underline disabled:opacity-60",
                )}
              >
                <FileIcon className="h-3.5 w-3.5" />
                {viewingFile ? "Opening…" : "View original"}
              </button>
            ) : null}
          </div>
        </SlideOverHeader>

        {/* Body: two columns on desktop (right column scrolls per-tab); single scroll on mobile. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* LEFT — identity, contact, operations (compact, no internal scroll) */}
          <div className="shrink-0 border-b border-line lg:w-[300px] lg:border-b-0 lg:border-r">
            <div className="flex flex-col items-center gap-3 p-4 text-center sm:p-5">
              <PhotoUpload
                candidate={candidate}
                onUpdated={onUpdated}
                onError={(m) => toast(m, "error")}
              />
              <div className="min-w-0 max-w-full">
                <h2 className="truncate text-h2 text-ink">{candidate.fullName}</h2>
                {role ? <p className="mt-0.5 break-words text-body text-muted">{role}</p> : null}
              </div>
            </div>

            {/* Contact actions — thumb-sized, the primary mobile job (§9). */}
            <div className="flex gap-2 border-t border-line p-4 sm:px-5">
              <ContactAction
                href={candidate.phone ? telHref(candidate.phone) : undefined}
                label="Call"
                Icon={PhoneIcon}
              />
              <ContactAction
                href={candidate.email ? `mailto:${candidate.email}` : undefined}
                label="Email"
                Icon={MailIcon}
              />
              <ContactAction
                href={candidate.phone ? whatsappHref(candidate.phone) : undefined}
                label="WhatsApp"
                Icon={ChatIcon}
                external
              />
            </div>

            {/* Operations — only in a job pipeline, where generating a client-ready
                submission against this job is the meaningful action (§2D). */}
            {jobId ? (
              <div className="space-y-2 border-t border-line p-4 sm:px-5">
                <p className="text-label uppercase tracking-wide text-muted">Operations</p>
                <GenerateSubmissionButton
                  candidateId={candidate.id}
                  jobId={jobId}
                  variant="primary"
                  className="w-full"
                />
              </div>
            ) : null}
          </div>

          {/* RIGHT — tabbed */}
          <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
            <Tabs tabs={tabs} value={tab} onChange={setTab} className="h-full">
              {(active) => (
                <div className="p-4 sm:p-5">
                  {active === "details" ? (
                    <PersonalDetails candidate={candidate} save={save} />
                  ) : active === "experience" ? (
                    <ExperienceList items={candidate.experience} />
                  ) : active === "education" ? (
                    <EducationList items={candidate.education} />
                  ) : active === "skills" ? (
                    <SkillsPanel skills={candidate.skills} />
                  ) : active === "jobs" ? (
                    <JobHistoryPanel candidateId={candidate.id} />
                  ) : active === "notes" ? (
                    <NotesPanel candidateId={candidate.id} onError={(m) => toast(m, "error")} />
                  ) : (
                    <CandidateSubmissions candidateId={candidate.id} />
                  )}
                </div>
              )}
            </Tabs>
          </div>
        </div>
      </SlideOver>
    </>
  );
}

// ─────────────────────────── Personal details tab ───────────────────────────

function PersonalDetails({
  candidate,
  save,
}: {
  candidate: CandidateDto;
  save: (patch: UpdateCandidateInput) => Promise<boolean>;
}) {
  // Workspace-configured custom fields (Settings → Candidate fields). Best-effort —
  // a load failure just hides them; the built-in fields always render.
  const [customFields, setCustomFields] = useState<CustomFieldDefinitionDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .listCustomFields()
      .then((defs) => {
        if (!cancelled) setCustomFields(defs);
      })
      .catch(() => {
        /* config fetch is best-effort — built-in fields still render */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="divide-y divide-line">
      <EditableField
        label="Name"
        value={candidate.fullName}
        badge={<AiBadge />}
        onSave={(v) => save({ fullName: v })}
      />
      <EditableField
        label="Title"
        value={candidate.currentTitle ?? ""}
        placeholder="Add a title"
        badge={<AiBadge />}
        onSave={(v) => save({ currentTitle: v || null })}
      />
      <EditableField
        label="Company"
        value={candidate.currentCompany ?? ""}
        placeholder="Add a company"
        badge={<AiBadge />}
        onSave={(v) => save({ currentCompany: v || null })}
      />
      <EditableField
        label="Location"
        value={candidate.location ?? ""}
        placeholder="Add a location"
        badge={<AiBadge />}
        onSave={(v) => save({ location: v || null })}
      />
      <EditableField
        label="Email"
        value={candidate.email ?? ""}
        placeholder="Add an email"
        onSave={(v) => save({ email: v || null })}
      />
      <EditableField
        label="Phone"
        value={candidate.phone ?? ""}
        placeholder="Add a phone number"
        onSave={(v) => save({ phone: v || null })}
      />
      <EditableField
        label="Nationality"
        value={candidate.nationality ?? ""}
        placeholder="Add a nationality"
        onSave={(v) => save({ nationality: v || null })}
      />

      <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <span
          className="shrink-0 text-label text-muted sm:w-28"
          id="residence-transferable-label"
        >
          Residence transferable
        </span>
        <div
          role="radiogroup"
          aria-labelledby="residence-transferable-label"
          className="inline-flex flex-wrap gap-1.5 sm:flex-1 sm:justify-end"
        >
          {RESIDENCE_OPTIONS.map((opt) => {
            const selected = candidate.residenceTransferable === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (!selected) void save({ residenceTransferable: opt.value });
                }}
                className={cn(
                  "rounded-sm border px-2.5 py-1 text-sm font-medium transition",
                  selected
                    ? "border-brand bg-brand-tint text-brand"
                    : "border-line text-muted hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="py-3">
        <TagInput
          label="Licenses"
          value={candidate.licenses}
          onChange={(next) => void save({ licenses: next })}
          placeholder="Add a license and press Enter"
          hint="Professional licenses / certifications (e.g. BLS, ACLS, PMP)."
        />
      </div>

      {customFields.map((field) => (
        <CustomFieldRow
          key={field.id}
          field={field}
          value={candidate.customFields[field.id]}
          save={save}
        />
      ))}
    </div>
  );
}

// One workspace-custom field on the candidate, matching the built-in fields' left-
// label/right-value row. text/number reuse the inline EditableField; date/select/
// boolean get a type-appropriate control that commits on change. An empty value
// clears the field (sent as null, §custom-fields merge).
function CustomFieldRow({
  field,
  value,
  save,
}: {
  field: CustomFieldDefinitionDto;
  value: string | undefined;
  save: (patch: UpdateCandidateInput) => Promise<boolean>;
}) {
  const set = (v: string | null) => save({ customFields: { [field.id]: v } });

  if (field.type === "text" || field.type === "number") {
    return (
      <EditableField
        label={field.label}
        value={value ?? ""}
        placeholder={field.type === "number" ? "Add a number" : `Add ${field.label.toLowerCase()}`}
        onSave={(v) => set(v.trim() || null)}
      />
    );
  }

  const controlId = `custom-${field.id}`;
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor={controlId} className="shrink-0 text-label text-muted sm:w-28">
        {field.label}
      </label>
      <div className="sm:flex sm:flex-1 sm:justify-end">
        {field.type === "date" ? (
          <input
            id={controlId}
            type="date"
            value={value ?? ""}
            onChange={(e) => void set(e.target.value || null)}
            className="h-8 rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
          />
        ) : field.type === "select" ? (
          <select
            id={controlId}
            value={value ?? ""}
            onChange={(e) => void set(e.target.value || null)}
            className="h-8 max-w-[200px] rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          // boolean — Yes / No / Unknown (clears)
          <div
            role="radiogroup"
            aria-label={field.label}
            className="inline-flex flex-wrap gap-1.5"
          >
            {BOOLEAN_OPTIONS.map((opt) => {
              const selected = (value ?? "") === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (!selected) void set(opt.value || null);
                  }}
                  className={cn(
                    "rounded-sm border px-2.5 py-1 text-sm font-medium transition",
                    selected
                      ? "border-brand bg-brand-tint text-brand"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const BOOLEAN_OPTIONS = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
  { label: "Unknown", value: "" },
];

// ─────────────────────────── Photo ───────────────────────────

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function PhotoUpload({
  candidate,
  onUpdated,
  onError,
}: {
  candidate: CandidateDto;
  onUpdated: (next: CandidateDto) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return onError("Please choose a PNG, JPG, or WebP image.");
    if (file.size > MAX_PHOTO_BYTES) return onError("That image is over 2 MB — pick a smaller one.");
    setUploading(true);
    try {
      onUpdated(await api.uploadCandidatePhoto(candidate.id, file));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        onChange={(e) => void onPick(e)}
        className="hidden"
      />
      {candidate.photoUrl ? (
        <img
          src={candidate.photoUrl}
          alt=""
          className="h-20 w-20 rounded-full object-cover ring-1 ring-line"
        />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-tint text-h1 font-semibold text-brand">
          {initialsOf(candidate.fullName)}
        </span>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Change photo"
        title="Change photo"
        className={cn(
          "absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition",
          "hover:text-ink disabled:opacity-60",
        )}
      >
        <UploadCloudIcon className={cn("h-4 w-4", uploading && "animate-pulse")} />
      </button>
    </div>
  );
}

// ─────────────────────────── CV tabs ───────────────────────────

function monthYear(iso?: string | null): string | null {
  if (!iso) return null;
  const norm = /^\d{4}-\d{2}$/.test(iso) ? `${iso}-01` : iso;
  const ms = Date.parse(norm);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function dateRange(start?: string, end?: string | null): string | null {
  const s = monthYear(start);
  const e = end === null ? "Present" : monthYear(end);
  if (!s && !e) return null;
  return [s ?? "—", e ?? "—"].join(" – ");
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

function ExperienceList({ items }: { items: ExperienceEntry[] }) {
  if (items.length === 0) return <EmptyTab>No work experience was parsed from this CV.</EmptyTab>;
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {items.map((x, i) => {
        const range = dateRange(x.startDate, x.endDate);
        return (
          <li key={`${x.company}-${x.title}-${i}`} className="relative">
            <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
            <p className="text-body font-semibold text-ink">{x.title || "—"}</p>
            <p className="text-sm text-muted">
              {x.company}
              {range ? <span className="text-faint"> · {range}</span> : null}
            </p>
            {x.summary ? <p className="mt-1 text-sm text-ink/90">{x.summary}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function EducationList({ items }: { items: EducationEntry[] }) {
  if (items.length === 0) return <EmptyTab>No education was parsed from this CV.</EmptyTab>;
  return (
    <ul className="space-y-4">
      {items.map((e, i) => {
        const detail = [e.degree, e.field].filter(Boolean).join(", ");
        const end = monthYear(e.endDate);
        return (
          <li key={`${e.institution}-${i}`}>
            <p className="text-body font-semibold text-ink">{e.institution}</p>
            <p className="text-sm text-muted">
              {detail || "—"}
              {end ? <span className="text-faint"> · {end}</span> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function SkillsPanel({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <EmptyTab>No skills were parsed yet.</EmptyTab>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <Chip key={s}>{s}</Chip>
      ))}
    </div>
  );
}

function JobHistoryPanel({ candidateId }: { candidateId: string }) {
  const [items, setItems] = useState<CandidateJobHistoryDto[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setItems(null);
    api
      .listCandidateApplications(candidateId)
      .then(setItems)
      .catch(() => setError(true));
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="py-10 text-center" role="alert">
        <p className="text-sm text-ink">We couldn&apos;t load this candidate&apos;s job history.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }
  if (items === null) {
    return (
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-md border border-line bg-subtle/40" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyTab>
        Not in any job pipeline yet. Attach this candidate to a job to start tracking them.
      </EmptyTab>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((j) => (
        <li
          key={j.applicationId}
          className="flex items-center gap-3 rounded-md border border-line bg-surface p-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-subtle text-muted">
            <BriefcaseIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">{j.jobTitle}</p>
            <p className="truncate text-sm text-muted">
              {j.client || "—"} <span className="text-faint">· added {timeAgo(j.createdAt)}</span>
            </p>
          </div>
          <StageBadge stage={j.stage} />
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────── Notes tab ───────────────────────────

function NotesPanel({
  candidateId,
  onError,
}: {
  candidateId: string;
  onError: (message: string) => void;
}) {
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [positions, setPositions] = useState<CandidateJobHistoryDto[]>([]);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [scope, setScope] = useState(""); // "" = general; else applicationId
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setNotes(null);
    api
      .listCandidateNotes(candidateId)
      .then(setNotes)
      .catch(() => setError(true));
    // Positions for the scope selector — best-effort (a failure just limits to General).
    api
      .listCandidateApplications(candidateId)
      .then(setPositions)
      .catch(() => setPositions([]));
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    const input: AddNoteInput = scope ? { body: text, applicationId: scope } : { body: text };
    try {
      const created = await api.addCandidateNote(candidateId, input);
      setNotes((prev) => [created, ...(prev ?? [])]);
      setBody("");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that note.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(noteId: string) {
    const prev = notes;
    setNotes((cur) => (cur ? cur.filter((n) => n.id !== noteId) : cur));
    try {
      await api.deleteCandidateNote(candidateId, noteId);
    } catch (err) {
      setNotes(prev ?? null);
      onError(err instanceof ApiError ? err.message : "Couldn't delete that note.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="rounded-md border border-line bg-surface p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note about this candidate…"
          rows={3}
          className={cn(
            "w-full resize-y rounded-sm border border-line bg-surface px-3 py-2 text-body text-ink",
            "placeholder:text-faint transition focus:border-brand",
          )}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            On
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-9 max-w-[200px] rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
            >
              <option value="">the candidate (general)</option>
              {positions.map((p) => (
                <option key={p.applicationId} value={p.applicationId}>
                  {p.jobTitle}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void add()}
            disabled={!body.trim() || posting}
          >
            {posting ? "Adding…" : "Add note"}
          </Button>
        </div>
      </div>

      {/* List */}
      {error ? (
        <div className="py-8 text-center" role="alert">
          <p className="text-sm text-ink">We couldn&apos;t load notes.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </div>
      ) : notes === null ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-md border border-line bg-subtle/40" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyTab>No notes yet. Add the first one above.</EmptyTab>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted">
                  <span className="font-medium text-ink">{n.authorName ?? "Someone"}</span>
                  <span>· {timeAgo(n.createdAt)}</span>
                  {n.applicationId ? (
                    <span className="rounded-full bg-brand-tint px-1.5 py-0.5 font-medium text-brand">
                      {n.jobTitle ?? "Position"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-subtle px-1.5 py-0.5">General</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
                  aria-label="Delete note"
                  className="-mr-1 -mt-1 shrink-0 rounded-sm p-1 text-faint transition hover:bg-danger-tint hover:text-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-body text-ink">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactAction({
  href,
  label,
  Icon,
  external = false,
}: {
  href?: string;
  label: string;
  Icon: typeof PhoneIcon;
  external?: boolean;
}) {
  const base =
    "flex flex-1 flex-col items-center gap-1 rounded-md border border-line py-2.5 text-sm font-medium transition";
  if (!href) {
    return (
      <span className={`${base} cursor-not-allowed text-faint`} aria-disabled="true">
        <Icon className="h-5 w-5" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`${base} text-brand hover:bg-brand-tint`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </a>
  );
}
