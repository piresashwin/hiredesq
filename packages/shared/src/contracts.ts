// API request/response contracts shared between apps/api and apps/web.
//
// These are the single source of truth the frontend builds against (Phase 1
// fixtures conform to them) and every later phase's API returns. Field names
// match the Prisma model camelCase. Money is always a STRING here (a Decimal
// serialized losslessly) — never a JS number (CLAUDE.md §3). Dates are ISO
// strings.

import type {
  CandidateProfile,
  CandidateSource,
  EducationEntry,
  ExperienceEntry,
  PipelineStage,
  UploadKind,
} from "./index.js";

// ─────────────────────────── Auth ───────────────────────────

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  /** First workspace created for the new user; they become its owner. */
  workspaceName: string;
  /**
   * Browser-detected IANA timezone (Intl.DateTimeFormat().resolvedOptions().timeZone,
   * e.g. "Asia/Dubai"). Optional — used to seed the user's timezone preference and
   * derive a default country at signup. Falls back to the schema defaults if absent.
   */
  timezone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Sign in / sign up with Google. `code` is the one-time authorization code from the
 * Google popup (auth-code flow); the API exchanges it server-side, verifies the
 * resulting ID token, and find-or-creates the user. One endpoint serves both login
 * and signup (Google doesn't distinguish).
 */
export interface GoogleAuthInput {
  code: string;
  /**
   * Browser-detected IANA timezone (e.g. "Asia/Dubai"). Optional — only used on the
   * find-or-CREATE path to seed a brand-new Google user's timezone + default country;
   * ignored for a returning account. See SignupInput.timezone.
   */
  timezone?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type WorkspaceRole = "owner" | "member";

/** UI theme preference, synced to the user account. */
export type ThemePreference = "light" | "dark" | "system";

/** Screens that ship with a guided on-screen tour. */
export type TourScreen = "home" | "candidates" | "jobs" | "revenue";

/** Per-screen tour completion, synced to the user account. `true` once finished/skipped. */
export type TourProgress = Partial<Record<TourScreen, boolean>>;

/** The authenticated principal + their active workspace context. */
export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  /** Short-lived signed URL for the profile photo, or null if none set (§2). */
  avatarUrl: string | null;
  /** Persisted UI theme preference. */
  theme: ThemePreference;
  /** IANA timezone for displaying dates/times (e.g. "Asia/Dubai"). User-level preference. */
  timezone: string;
  /**
   * ISO 3166-1 alpha-2 country code (e.g. "AE"), auto-detected from the timezone at
   * signup. A best-effort display/locale default the user can correct; null when never
   * detected or for a region-less timezone.
   */
  country: string | null;
  /** Preferred/default currency code (ISO 4217, e.g. "USD") for new jobs/placements. */
  currency: string;
  /** Whether TOTP two-factor auth is enabled — login is gated on a code when true. */
  twoFactorEnabled: boolean;
  /** Per-screen guided-tour completion, synced across devices. */
  tourProgress: TourProgress;
  /**
   * ISO timestamp of when this user finished (or skipped) the first-run
   * onboarding, or null if they never have. Drives the once-per-account
   * onboarding takeover — the web app shows it whenever this is null.
   */
  onboardedAt: string | null;
}

export interface AuthResponse {
  user: AuthUserDto;
  tokens: AuthTokens;
}

/**
 * Editable profile fields. Note there is deliberately NO `email` here — the
 * sign-in email is immutable, and `ValidationPipe({ whitelist: true })` strips any
 * `email` a client might send so it can never reach the update (CLAUDE.md identity).
 */
export interface UpdateProfileInput {
  fullName?: string;
  theme?: ThemePreference;
  /** IANA timezone (e.g. "Asia/Dubai"). */
  timezone?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "AE"). Empty string clears it. */
  country?: string | null;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency?: string;
  /** Mark one or more screens' tours as seen; merged server-side, never replaces. */
  tourProgress?: TourProgress;
}

/** Change password while signed in — current password re-verified server-side. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// ─────────────────────── Two-factor auth (TOTP) ───────────────────────

/** A 6-digit TOTP code — used to enable, disable, or complete a 2FA login. */
export interface TwoFactorVerifyInput {
  code: string;
}

/**
 * Returned by POST /auth/2fa/setup. The secret + otpauth URI are shown ONCE so the
 * user can scan the QR (rendered server-side to a data URL) or enter the key
 * manually. 2FA is NOT yet active — the user must verify a code via /auth/2fa/enable.
 */
export interface TwoFactorSetupDto {
  /** otpauth://totp/... provisioning URI encoded in the QR. */
  otpauthUri: string;
  /** PNG data URL of the QR for the provisioning URI. */
  qrDataUrl: string;
  /** Base32 secret, for manual entry when a camera isn't available. */
  secret: string;
}

/**
 * Returned by login/google when the account has 2FA enabled: instead of tokens,
 * a short-lived challenge token the client exchanges (with a code) at /auth/login/2fa.
 */
export interface TwoFactorChallengeDto {
  twoFactorRequired: true;
  challengeToken: string;
}

/** Login either succeeds outright (AuthResponse) or demands a 2FA code (challenge). */
export type LoginResultDto = AuthResponse | TwoFactorChallengeDto;

/** Complete a 2FA-gated login: the challenge token from step one + the TOTP code. */
export interface TwoFactorLoginInput {
  challengeToken: string;
  code: string;
}

// ─────────────────────── Delete account ───────────────────────

/**
 * Permanently delete the signed-in user's account (CLAUDE.md §2 — hard delete, files
 * included). `confirmEmail` must match the account email; `password` is required when
 * the account has one (Google-only accounts confirm by email alone). Deletion is
 * blocked (409) if the user is the last owner of a workspace that has other members.
 */
export interface DeleteAccountInput {
  confirmEmail: string;
  password?: string;
}

/** Start the forgot-password flow — always 204 (never reveals if the email exists). */
export interface ForgotPasswordInput {
  email: string;
}

/** Complete a reset using the emailed token. */
export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

// ─────────────────────── Passwordless (magic-link) login ───────────────────────

/**
 * Request a one-time login link for an existing account — always 204 (never reveals
 * whether the email exists, like forgot-password). The emailed link carries a token
 * the client redeems at /auth/magic-link/verify.
 */
export interface RequestMagicLinkInput {
  email: string;
}

/**
 * Redeem a magic-link token. Resolves to a normal login outcome (LoginResultDto):
 * tokens outright, OR — when the account has 2FA enabled — a challenge to complete
 * at /auth/login/2fa, exactly like password/Google login.
 */
export interface VerifyMagicLinkInput {
  token: string;
}

// ─────────────────────────── Candidates (§2) ───────────────────────────

/**
 * A candidate as returned by the API. email/phone are DECRYPTED at the API
 * boundary for display (stored encrypted at rest, CLAUDE.md §2) and only
 * included for users with read access to the workspace.
 */
export interface CandidateDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  // Hard-constraint fields for the qualification filter (§2C). null/empty = unknown.
  nationality: string | null;
  residenceTransferable: boolean | null;
  licenses: string[];
  /** Short-lived signed URL for the candidate's profile photo, or null if none (§2). */
  photoUrl: string | null;
  /**
   * Values for the workspace's custom fields — a map of CustomFieldDefinition.id ->
   * stringified value (boolean "true"/"false", date ISO yyyy-mm-dd, the rest as
   * text). Only ids with a live definition appear; render against listCustomFields.
   */
  customFields: Record<string, string>;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One job (in this workspace) the candidate has been attached to — their internal
 * pipeline history, shown in the profile's "Job history" tab. Distinct from their
 * CV work history (ExperienceEntry); this is hiredesq applications, with stage.
 */
export interface CandidateJobHistoryDto {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  client: string | null;
  stage: PipelineStage;
  createdAt: string;
}

/**
 * A free-form recruiter note on a candidate. `applicationId` null = a general
 * candidate-level note; set = scoped to a specific position (the candidate's
 * application to a job), with `jobTitle` denormalized for display.
 */
export interface NoteDto {
  id: string;
  body: string;
  applicationId: string | null;
  jobTitle: string | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

/** Add a note. Omit `applicationId` for a candidate-level note; set it to scope to a position. */
export interface AddNoteInput {
  body: string;
  applicationId?: string;
}

/**
 * The candidate LIST/SEARCH row — deliberately omits contact PII (email/phone) and
 * the heavy experience/education blobs. The list view never needs them, so the API
 * neither decrypts nor ships them for every row (CLAUDE.md §2 — minimize the PII
 * surface; §1 perf — narrower projection). Opening a profile fetches the full
 * `CandidateDto` via GET /candidates/:id. A full `CandidateDto` is structurally a
 * superset, so it is assignable where a list item is expected.
 */
export interface CandidateListItemDto {
  id: string;
  fullName: string;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields a recruiter can correct in place (design-system §6.4, Principle 6). */
export interface UpdateCandidateInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: string[];
  nationality?: string | null;
  residenceTransferable?: boolean | null;
  licenses?: string[];
  /**
   * Custom-field values to set, keyed by CustomFieldDefinition.id. Merged into the
   * candidate's existing values; a null value clears that field. Unknown ids (no
   * matching workspace definition) are rejected.
   */
  customFields?: Record<string, string | null>;
}

// ─────────────────────────── Custom fields (workspace-configurable) ───────────────────────────

/** The set of custom-field value types a workspace can configure. */
export type CustomFieldType = "text" | "number" | "date" | "select" | "boolean";

/** A workspace-configured custom candidate field (Settings → Candidate fields). */
export interface CustomFieldDefinitionDto {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Choices for a `select` field; empty for every other type. */
  options: string[];
  /** Ascending display order on the candidate's Personal-details tab. */
  order: number;
}

/** Create a custom field. `options` is required (non-empty) only for `select`. */
export interface CreateCustomFieldInput {
  label: string;
  type: CustomFieldType;
  options?: string[];
}

/** Update a custom field's label, `select` options, or display order. Type is immutable. */
export interface UpdateCustomFieldInput {
  label?: string;
  options?: string[];
  order?: number;
}

/** Per-candidate export payload (GDPR / DPDP — CLAUDE.md §2). */
export interface CandidateExportDto {
  candidate: CandidateDto;
  applications: ApplicationDto[];
  placements: PlacementDto[];
  exportedAt: string;
}

// ─────────────────────────── Ingest & parse status (§5) ───────────────────────────

export type ParseJobStatus = "queued" | "processing" | "done" | "failed";

/**
 * Body for the live paste-path ingest (POST /workspaces/:id/ingest, §5).
 *
 * This is the SINGLE SOURCE OF TRUTH for the request shape: the API's `IngestDto`
 * `implements IngestInput` and the web client sends exactly this — so a renamed or
 * retyped field fails to compile on BOTH sides instead of silently mismatching at
 * runtime (the field name is `payload`, never `text`). Every request body has a
 * matching `*Input` here for that reason.
 *
 * `workspaceId` is intentionally absent — it comes from the authenticated route
 * param, never the body (CLAUDE.md §1).
 */
export interface IngestInput {
  kind: UploadKind;
  source: CandidateSource;
  /** Extracted text for text/pdf/docx, or base64 image data for the image kind. */
  payload: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  /** Job-centric inbound (§2A, F7): attach produced candidates to this job. */
  jobId?: string;
}

export interface IngestResponse {
  parseJobId: string;
  status: ParseJobStatus;
}

/**
 * Polled by the ingest UI to drive the live "parse reveal" (design-system §8).
 * candidateId is populated once status === "done" so the UI can reveal the card.
 */
export interface ParseJobStatusDto {
  id: string;
  status: ParseJobStatus;
  error: string | null;
  candidateId: string | null;
}

// ─────────────────────────── Bulk ingest & uploads (§2A) ───────────────────────────

/** One file accepted by the upload endpoint. */
export interface UploadedItemDto {
  fileId: string;
  filename: string;
  parseJobId: string;
  status: ParseJobStatus;
  /** True when this exact file was already uploaded (idempotent no-op). */
  duplicate: boolean;
}

/** Response to a (possibly multi-file / folder / CSV) upload. */
export interface BulkIngestResponse {
  /** Present when more than one item was submitted (a folder/CSV drop). */
  batchId?: string;
  items: UploadedItemDto[];
}

/** Aggregate progress for a bulk drop — polled by the progress view. */
export interface ImportBatchDto {
  id: string;
  source: string;
  status: "processing" | "done";
  total: number;
  done: number;
  failed: number;
  duplicates: number;
  createdAt: string;
  updatedAt: string;
  /** Job-centric inbound (§2A, F7): the position this drop targeted, if any. */
  jobId?: string | null;
  jobTitle?: string | null;
}

/** A short-lived signed URL to view an uploaded original (§2). */
export interface SignedUrlDto {
  url: string;
  expiresInSeconds: number;
}

// ─────────────────────── Forwarding inbox (§2A, F9) ───────────────────────

/** One attachment in a normalized inbound email (base64 bytes). */
export interface InboundAttachment {
  filename: string;
  contentType: string;
  /** base64-encoded bytes. */
  contentBase64: string;
}

/**
 * Provider-agnostic normalized inbound email the webhook consumes. The Cloudflare
 * Email Worker (or any provider adapter) parses raw MIME and POSTs THIS shape, so
 * the API never touches raw MIME and the email front stays swappable.
 */
export interface InboundEmailPayload {
  /** Recipient address — resolves the workspace (+ optional job via plus-addressing). */
  to: string;
  from?: string;
  subject?: string;
  /** Plain-text body (a forwarded chat / CV pasted in the body). */
  text?: string;
  attachments?: InboundAttachment[];
}

/** The workspace's forwarding-inbox address (F9). */
export interface InboxAddressDto {
  address: string;
}

// ─────────────────────────── Dedup review (§5) ───────────────────────────

/** A name-only match awaiting the recruiter's confirm/dismiss decision. */
export interface DuplicateSuggestionDto {
  id: string;
  matchedOn: string;
  status: "pending" | "confirmed" | "dismissed";
  createdAt: string;
  /** The freshly ingested record. */
  candidate: CandidateSummaryDto;
  /** The existing record it might be a duplicate of. */
  duplicateOf: CandidateSummaryDto;
}

export interface ResolveDuplicateInput {
  /** confirm = merge the new record into the existing one; dismiss = keep both. */
  action: "confirm" | "dismiss";
}

/** Pending-duplicate count for the review badge — no PII, just the number (§2). */
export interface DuplicateCountDto {
  count: number;
}

// ─────────────────────────── Jobs & pipeline ───────────────────────────

export interface JobDto {
  id: string;
  title: string;
  client: string | null;
  status: string;
  /** The req prose (responsibilities/requirements); feeds the candidate-match embedding. */
  description?: string | null;
  createdAt: string;
  /** Typical placement fee for this role — the basis for pipeline value (money string). */
  expectedFee?: string | null;
  /** Count of applications in each stage, for board column headers. */
  stageCounts?: Partial<Record<PipelineStage, number>>;
  /** Weighted pipeline value (Σ in-flight apps × expectedFee × stage probability), money string. */
  pipelineValue?: string;
  currency?: string;
  // Hard constraints for the deterministic qualification filter (§2C). Empty/false =
  // no constraint.
  requiredNationalities: string[];
  residenceTransferableRequired: boolean;
  requiredLicenses: string[];
}

export interface CreateJobInput {
  title: string;
  client?: string;
  /** The req prose (responsibilities/requirements); feeds the candidate-match embedding. */
  description?: string;
  /** Typical fee for the role (money string); drives pipeline value. */
  expectedFee?: string;
  currency?: string;
  requiredNationalities?: string[];
  residenceTransferableRequired?: boolean;
  requiredLicenses?: string[];
}

export interface UpdateJobInput {
  title?: string;
  client?: string | null;
  status?: string;
  description?: string | null;
  expectedFee?: string | null;
  requiredNationalities?: string[];
  residenceTransferableRequired?: boolean;
  requiredLicenses?: string[];
}

// ─────────────────── Qualification filter + trail (§2C, F4) ───────────────────

export type ConstraintStatus = "pass" | "fail" | "unknown";
/** "none" = the job sets no hard constraints; otherwise the worst flag wins. */
export type ConstraintSummary = ConstraintStatus | "none";
export type ConstraintKey = "nationality" | "residence_transferable" | "license";

/** One deterministic constraint check for a candidate vs a job (NO AI). */
export interface ConstraintFlagDto {
  key: ConstraintKey;
  status: ConstraintStatus;
  /** What the req requires, human-readable. */
  required: string;
  /** What the candidate has, human-readable ("Unknown" when not supplied). */
  candidate: string;
}

/**
 * A candidate suggested for a job by the embedding match (§5). The list-lean,
 * PII-free candidate row, its cosine `similarity` to the job (0–1, higher = closer),
 * and the deterministic constraint verdict (NO AI) so the recruiter sees fit + flags
 * together. This is semantic suggestion (recall), not an AI fit-score (MVP-SPEC §3).
 */
export interface CandidateMatchDto {
  candidate: CandidateListItemDto;
  /** Cosine similarity to the job embedding, 0–1 (1 = identical direction). */
  similarity: number;
  /** Worst-flag verdict across the job's hard constraints ("none" = unconstrained). */
  constraintSummary: ConstraintSummary;
  /** Per-constraint detail; empty when the job sets no hard constraints. */
  constraintFlags: ConstraintFlagDto[];
}

export type TrailEntryKind = "note" | "qualified" | "disqualified";

export interface QualificationTrailEntryDto {
  id: string;
  applicationId: string;
  kind: TrailEntryKind;
  note: string;
  authorId: string | null;
  createdAt: string;
}

export interface AddTrailEntryInput {
  /** Defaults to "note" when omitted. */
  kind?: TrailEntryKind;
  note: string;
}

/** Attach an existing candidate to a job — lands in the `sourced` stage. */
export interface AttachCandidateInput {
  candidateId: string;
}

/** A candidate's position against a job in the pipeline. */
export interface ApplicationDto {
  id: string;
  candidateId: string;
  jobId: string;
  stage: PipelineStage;
  createdAt: string;
  updatedAt: string;
  /** Denormalized for board cards (no extra fetch per card). */
  candidate?: CandidateSummaryDto;
  /** Deterministic qualification verdict vs the job's hard constraints (§2C). */
  constraintSummary?: ConstraintSummary;
  /** Per-constraint detail for the side-by-side view. Absent when the job is unconstrained. */
  constraintFlags?: ConstraintFlagDto[];
}

export interface CandidateSummaryDto {
  id: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
}

export interface MoveStageInput {
  stage: PipelineStage;
}

// ─────────────────────────── Revenue (§3) ───────────────────────────

export type FeeBasis = "flat" | "percent_of_salary";

/** Guarantee lifecycle (§2E). `cleared` is the only "earned" state; `at_risk` is
 * booked-but-inside-window; `fell_through`/`replaced` are reversed/superseded. */
export type PlacementStatus = "at_risk" | "cleared" | "fell_through" | "replaced";

export interface PlacementDto {
  id: string;
  candidateId: string;
  jobId: string;
  /** Resolved fee, Decimal serialized as a string (CLAUDE.md §3). */
  feeAmount: string;
  currency: string;
  placedAt: string;
  createdAt: string;
  /** Guarantee window length in days (default 30). */
  guaranteeDays: number;
  /** When the guarantee clears (ISO): placedAt + guaranteeDays. */
  clearsAt: string;
  /** EFFECTIVE status — an at_risk placement past its window reads as `cleared`. */
  status: PlacementStatus;
  /** Set on a no-new-fee replacement: the original placement it replaces. */
  replacesPlacementId: string | null;
  /** Denormalized for the revenue placements table (no per-row fetch). */
  candidate?: CandidateSummaryDto;
  jobTitle?: string;
}

/**
 * Create a placement. For a flat fee, send `amount`. For a % of salary, send
 * `salary` + `percent`; the resolved Decimal is computed server-side via the
 * Money value object and returned in PlacementDto.feeAmount.
 */
export interface CreatePlacementInput {
  candidateId: string;
  jobId: string;
  basis: FeeBasis;
  currency: string;
  amount?: string;
  salary?: string;
  percent?: string;
  placedAt?: string;
  /** Guarantee window in days (default 30 if omitted). */
  guaranteeDays?: number;
}

/** Record a candidate leaving inside the guarantee window — reverses the fee (§2E). */
export interface FallThroughInput {
  /** Optional pro-rated amount RETAINED of the original fee (money string). Omit =
   * full reversal (retain nothing). Must be ≤ the original fee. */
  retainedAmount?: string;
}

/** Replace a fallen-through placement with a new candidate — NO new fee (§2E). The
 * replacement carries the original fee forward and starts a fresh guarantee window. */
export interface ReplacePlacementInput {
  /** The replacement candidate (verified in-tenant). */
  candidateId: string;
  placedAt?: string;
  /** Guarantee window for the replacement (default = the original's). */
  guaranteeDays?: number;
}

export interface RevenueSummaryDto {
  currency: string;
  /** EARNED: guarantee window elapsed and not fallen through — the trustworthy hero
   * (§3 — the only number presented as final). */
  revenueCleared: string;
  /** Booked but still INSIDE the guarantee window — not yet earned (§2E). */
  revenueAtRisk: string;
  /** Live placements (cleared + at-risk) created in the current calendar month. */
  placementsThisMonth: number;
  /** Weighted expected value of everything still in the pipeline. */
  pipelineValue: string;
  /** Mean fee across live placements, "0.00" when none. */
  avgFee: string;
  /** Booked revenue per month (live placements), last 6 months. */
  monthlyTrend: { month: string; revenue: string }[];
}

// ─────────────────────────── Submissions (§2D, Wedge 2) ───────────────────────────

export type SubmissionStatus = "sent" | "viewed" | "advance" | "interview" | "reject";

/**
 * The masked, client-facing profile snapshot. By DESIGN there are no email/phone
 * fields — contact is stripped before this is built (CLAUDE.md §2). `contactMasked`
 * signals the UI to render the "contact via agency" treatment.
 */
export interface MaskedProfileDto {
  fullName: string;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  contactMasked: true;
}

export interface SubmissionDto {
  id: string;
  candidateId: string;
  jobId: string | null;
  status: SubmissionStatus;
  /** AI-generated branded summary prose (already contact-scrubbed). */
  summary: string;
  maskedProfile: MaskedProfileDto;
  /** Token for the shareable client link — used as the public path, never the id (§1). */
  shareToken: string;
  createdAt: string;
  updatedAt: string;
  /** Denormalized for the submissions list. */
  candidate?: CandidateSummaryDto;
}

/** Generate a client-ready submission from a candidate (optionally tied to a job). */
export interface GenerateSubmissionInput {
  candidateId: string;
  /** Optional — the V1.1 job-linked path (F5). Omit for the [Launch] pool-only path. */
  jobId?: string;
}

/** A client's review outcome on a submission (§2D, F5). The terminal `SubmissionStatus`es. */
export type SubmissionVerdict = "advance" | "interview" | "reject";

/** Record the client's verdict — auto-nudges the job-linked pipeline stage + trail. */
export interface RecordVerdictInput {
  verdict: SubmissionVerdict;
}

/**
 * The PUBLIC, tokenized share view a client opens — deliberately minimal: no ids,
 * no workspace, no contact data (§1/§2). Reached only via the unguessable token.
 */
export interface SharedSubmissionDto {
  summary: string;
  maskedProfile: MaskedProfileDto;
  status: SubmissionStatus;
  createdAt: string;
}

// ─────────────────────────── Credits (§4) ───────────────────────────

export type PlanTier = "free" | "solo_pro" | "team";

export interface CreditBalanceDto {
  balance: number;
  /** Free-tier MONTHLY allotment — resets every UTC calendar month, no rollover (§4).
   * Under Model B (FEATURE-SET §F3) this meter gates SUBMISSION generation, not ingest. */
  monthlyAllotment: number;
  /** Monthly credits consumed this month (monthlyAllotment - balance, floored at 0). */
  used: number;
  /** When the free monthly credits reset (ISO — start of the next UTC month). */
  resetsAt: string;
  plan: PlanTier;
  /** Model B ingest meter (§F3): resume parsing is free up to `ingestFreeLimit`
   * parses per period (the onboarding/abuse ceiling), then nudges an upgrade.
   * null = unmetered (paid tiers with no ingest ceiling). */
  ingestUsed: number;
  ingestFreeLimit: number | null;
  /** The ingest reset period for this plan: "lifetime" (free — never resets),
   * "monthly" (solo_pro — resets each UTC calendar month), or null (team — unmetered). */
  ingestPeriod: "lifetime" | "monthly" | null;
}

/**
 * One pricing tier as returned by GET /plans (for the pricing/upgrade UI).
 * priceMonthly is a string — Decimal serialized losslessly, never a JS number (§3).
 * ingestFreeLimit null = unmetered ingest (paid tiers).
 * seatLimit null = unlimited seats.
 */
export interface PlanDto {
  tier: PlanTier;
  name: string;
  /** Monthly price, Decimal serialized as a string (CLAUDE.md §3). */
  priceMonthly: string;
  currency: string;
  /** true for Team (billed per seat); false for Free / Solo Pro (flat rate). */
  perSeat: boolean;
  /** Monthly submission-generation credit allotment for this tier. */
  monthlySubmissionAllotment: number;
  /** Free parses per period (lifetime for free tier, monthly for solo_pro); null = unmetered ingest. */
  ingestFreeLimit: number | null;
  /** The ingest reset period: "lifetime" (free), "monthly" (solo_pro), or null (team = unmetered). */
  ingestPeriod: "lifetime" | "monthly" | null;
  /** Max workspace members; null = unlimited. */
  seatLimit: number | null;
}

/** A Stripe-hosted URL to redirect the recruiter to (checkout or billing portal, F8). */
export interface BillingRedirectDto {
  url: string;
}

/** Register interest in upgrading (no payment yet — captures upgrade intent, §4/§6). */
export interface UpgradeInterestInput {
  note?: string;
}

// ─────────────────────────── Home / cockpit (account-at-a-glance) ───────────────────────────

/**
 * One actionable item in a home "needs attention" queue. These are the
 * recruiter's OWN workspace records — names render in their authenticated
 * dashboard exactly as in the revenue table (CLAUDE.md §2 governs logs, the AI
 * prompt, and cross-tenant access, not the recruiter seeing their own pool).
 */
export interface HomeAttentionItemDto {
  /** The underlying record id (placement / submission). */
  id: string;
  /** The candidate this item is about. */
  candidateId: string;
  /** Candidate full name (display). */
  name: string;
  /** Role / job context, when known. */
  detail: string | null;
  /** ISO timestamp the UI formats relatively (a placement's clearsAt, a submission's sent-at). */
  when: string;
}

/**
 * The recruiter's account-at-a-glance home. Deliberately NOT an analytics wall
 * (MVP-SPEC §3 defers vanity analytics): a glanceable cleared-revenue number,
 * the live pool/jobs counts, and the few things that actually need the recruiter
 * today. Counts + the recruiter's own records only — no cross-tenant data.
 */
export interface HomeOverviewDto {
  currency: string;
  /** EARNED revenue — the trustworthy headline, reconciles with the revenue dashboard hero (§3). */
  revenueCleared: string;
  /** Candidates in the pool. */
  poolSize: number;
  /** Open jobs (status === "open"). */
  openJobs: number;
  /** True once the recruiter has ANY data — drives first-run welcome vs the returning home. */
  hasAnyData: boolean;
  /** At-risk placements whose guarantee window clears within the next 7 days. */
  clearingSoon: { count: number; items: HomeAttentionItemDto[] };
  /** Submissions still awaiting a client verdict (sent / viewed). */
  awaitingVerdict: { count: number; items: HomeAttentionItemDto[] };
  /** Name-only duplicate matches awaiting a merge/keep decision (§5). */
  duplicatesPending: number;
}

// ─────────────────────────── Notifications (Phase 0) ───────────────────────────

/**
 * The kinds of in-app notification the platform can emit. A string union (not an
 * enum) so a new trigger is a one-line addition both sides recompile against.
 * Phase 1 ships the first: a bulk upload finishing.
 */
export type NotificationType = "bulk_import_complete" | "ingest_limit_approaching";

/**
 * The structured payload stored on a notification. `link` is the in-app path the UI
 * navigates to when the row is clicked; the rest is type-specific context (ids/counts
 * only — never PII, §2). Open-ended so each type can carry its own fields.
 */
export interface NotificationData {
  /** In-app path to open when the notification is clicked (e.g. "/candidates?batch=…"). */
  link?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * One in-app notification as returned by the API. `data` is a structured payload
 * (ids/counts + a `link` target for the UI to navigate to) — never PII (§2).
 * `readAt` is null until the recipient marks it read.
 */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Structured payload + link target; shape depends on `type`. Null when none. */
  data: NotificationData | null;
  /** ISO timestamp the recipient read it, or null if still unread. */
  readAt: string | null;
  createdAt: string;
}

/**
 * Query params for the notifications list. `unreadOnly` narrows to still-unread rows
 * (the bell dropdown's default view); pagination via the shared PageQueryInput fields.
 * workspaceId is route-param derived, never in the query (§1).
 */
export interface ListNotificationsInput extends PageQueryInput {
  /** When true, return only notifications the recipient hasn't read yet. */
  unreadOnly?: boolean;
}

/** Unread badge count — just the number, never PII DTOs to render a badge (§2). */
export interface NotificationUnreadCountDto {
  count: number;
}

// ── Pagination (offset paging) ──────────────────────────────────────────────
// One envelope for every paginated list endpoint, so the API and web agree on
// the shape (CLAUDE.md "one contract, both sides"). Server-side offset paging:
// the client asks for a 1-based `page` of `limit` rows; the server returns that
// slice plus the workspace-scoped `total` so the UI can render "X–Y of N" and a
// numbered pager. `limit` echoes the effective page size the server applied
// (after its default/clamp), so the client never has to guess it.

/** Query params a client sends to page through a list. Both optional — the
 *  server applies a default page (1) and page size when omitted. */
export interface PageQueryInput {
  /** 1-based page number. */
  page?: number;
  /** Rows per page (server clamps to its max). */
  limit?: number;
}

/** The envelope every paginated list endpoint returns. */
export interface Paginated<T> {
  items: T[];
  /** Total rows matching the query in this workspace (across all pages). */
  total: number;
  /** The 1-based page these items came from. */
  page: number;
  /** The effective page size the server applied. */
  limit: number;
}

// Re-export the parse profile so the web layer has one import surface.
export type { CandidateProfile, ExperienceEntry, EducationEntry, PipelineStage };
