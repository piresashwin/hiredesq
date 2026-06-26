// Shared contracts used across api, worker, and the AI package.

/** Where an ingested candidate came from. */
export type CandidateSource =
  | "resume_upload"
  | "bulk_import"
  | "whatsapp_paste"
  | "email_forward"
  | "manual";

/** A single role in a candidate's history. */
export interface ExperienceEntry {
  company: string;
  title: string;
  startDate?: string; // ISO yyyy-mm or yyyy-mm-dd
  endDate?: string | null; // null = current
  summary?: string;
}

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  endDate?: string;
}

/**
 * The structured profile the AI parser must return. This shape is the contract
 * the JSON schema in @hiredesq/ai validates against — keep them in sync.
 */
export interface CandidateProfile {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  currentCompany?: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  // Hard-constraint fields for the deterministic qualification filter (§2C, F4).
  // Extracted only when present in the source; never invented.
  nationality?: string;
  /** Whether the candidate's residence/visa is transferable (null/absent = unknown). */
  residenceTransferable?: boolean | null;
  /** Professional licenses / certifications (e.g. BLS, ACLS, PMP). */
  licenses?: string[];
}

/** Stages a candidate moves through against a job. */
export type PipelineStage =
  | "sourced"
  | "submitted"
  | "interview"
  | "placed"
  | "rejected";

/**
 * Probability weight per stage for the weighted pipeline value (design-system
 * §6.5/§6.6). `placed` is booked revenue (counted separately, not pipeline) and
 * `rejected` is dead — both contribute 0 to the in-flight pipeline. Shared so the
 * API's Decimal computation and the web's display agree on the same model.
 */
export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  sourced: 0.1,
  submitted: 0.3,
  interview: 0.6,
  placed: 0,
  rejected: 0,
};

/** Supported upload kinds the parse pipeline routes on. */
export type UploadKind = "pdf" | "docx" | "image" | "text" | "csv" | "xlsx";

/** pg-boss queue name for the CV-parse pipeline (per-item, live). */
export const CV_PARSE_QUEUE = "cv-parse";

/** pg-boss queue for large bulk drops handled via the Batch API (coordinator). */
export const CV_PARSE_BATCH_QUEUE = "cv-parse-batch";

/**
 * Bulk routing threshold (CLAUDE.md §5): drops with more than this many
 * AI-needing items go through the Batch API (50% cost, async) via the batch
 * coordinator; smaller drops parse live/concurrently for the real-time reveal.
 */
export const BULK_BATCH_THRESHOLD = 20;

/** One item inside a batch-coordinator message. */
export interface BatchParseItem {
  contentHash: string;
  kind: UploadKind;
  source: CandidateSource;
  parseJobId: string;
  payload?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  storageKey?: string;
  fileId?: string;
  filename?: string;
  prebuiltProfile?: CandidateProfile;
}

/** Payload for the batch coordinator (one large drop). */
export interface BatchJobData {
  workspaceId: string;
  batchId: string;
  /** Job-centric inbound (§2A, F7): attach every candidate in this drop to the job. */
  jobId?: string;
  items: BatchParseItem[];
}

/** Payload the API enqueues and the worker consumes for one parse. */
export interface ParseJobData {
  workspaceId: string;
  kind: UploadKind;
  source: CandidateSource;
  /**
   * Inline text/base64 for the paste path (Phase 1). For file uploads this is
   * omitted — the worker fetches bytes from `storageKey` instead (PII never sits
   * in the queue longer than needed).
   */
  payload?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  /** Object-storage key to fetch bytes from (file uploads). Workspace-namespaced. */
  storageKey?: string;
  /** The UploadedFile row this parse came from, if any. */
  fileId?: string;
  /** The bulk ImportBatch this parse belongs to, if any (folder/CSV drop). */
  batchId?: string;
  /** Job-centric inbound (§2A, F7): attach the resulting candidate to this job. */
  jobId?: string;
  /** Original filename for the parse-card label (display only — not a key). */
  filename?: string;
  /**
   * Idempotency key. Provided for file/CSV-row parses (hash known at upload);
   * the worker falls back to hashing `payload` when absent.
   */
  contentHash?: string;
  /**
   * A pre-structured profile from a CLEAN CSV/Excel row (smart-map). When set,
   * the worker stores it directly — no AI call, no credit charge — and only the
   * dedup/store path runs.
   */
  prebuiltProfile?: CandidateProfile;
}

// API request/response contracts (shared with the web app).
export * from "./contracts.js";
