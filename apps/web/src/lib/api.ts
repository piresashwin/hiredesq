// Typed fetch wrapper around the hiredesq API. Every workspace-scoped call is
// mounted under /workspaces/:workspaceId/... (CLAUDE.md §1 — tenant isolation is
// route-param driven, never body-driven). The active workspaceId comes from the
// stored AuthUserDto, never from caller-supplied data.
//
// PII rule (CLAUDE.md §2): routes carry IDs only; candidate names/contacts live
// in request/response bodies, never in the URL.

import type {
  AddNoteInput,
  AddTrailEntryInput,
  ApplicationDto,
  AuthResponse,
  AuthUserDto,
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginResultDto,
  RequestMagicLinkInput,
  ResetPasswordInput,
  VerifyMagicLinkInput,
  ThemePreference,
  TwoFactorChallengeDto,
  TwoFactorLoginInput,
  TwoFactorSetupDto,
  TwoFactorVerifyInput,
  UpdateProfileInput,
  BillingRedirectDto,
  BulkIngestResponse,
  CandidateDto,
  CandidateExportDto,
  CandidateJobHistoryDto,
  CandidateListItemDto,
  CandidateMatchDto,
  AttachCandidateInput,
  CreateJobInput,
  CreatePlacementInput,
  IngestInput,
  CreditBalanceDto,
  DuplicateCountDto,
  DuplicateSuggestionDto,
  HomeOverviewDto,
  FallThroughInput,
  ImportBatchDto,
  InboxAddressDto,
  IngestResponse,
  JobDto,
  LoginInput,
  MoveStageInput,
  NoteDto,
  Paginated,
  ParseJobStatusDto,
  PipelineStage,
  PlacementDto,
  RecordVerdictInput,
  QualificationTrailEntryDto,
  ReplacePlacementInput,
  ResolveDuplicateInput,
  GenerateSubmissionInput,
  RevenueSummaryDto,
  SharedSubmissionDto,
  SignedUrlDto,
  SignupInput,
  SubmissionDto,
  UpdateCandidateInput,
  UpdateJobInput,
  UpgradeInterestInput,
  CustomFieldDefinitionDto,
  CreateCustomFieldInput,
  UpdateCustomFieldInput,
  ListNotificationsInput,
  NotificationDto,
  NotificationUnreadCountDto,
} from "@hiredesq/shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Default rows per page for the paginated list tables (numbered pager). */
export const PAGE_SIZE = 25;

const TOKEN_KEY = "hiredesq.accessToken";
const REFRESH_KEY = "hiredesq.refreshToken";
const USER_KEY = "hiredesq.user";

// ───────────────────────── Ingest input ─────────────────────────
// The request shape is the SHARED `IngestInput` (imported above) — the same type
// the API's IngestDto implements. We deliberately do NOT redefine it locally: a
// local copy is exactly how the field drifted to `text` while the server expected
// `payload`. Build against the contract, not a hand-rolled mirror of it.

// ───────────────────────── Local auth storage ─────────────────────────

export const authStore = {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  getUser(): AuthUserDto | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUserDto;
    } catch {
      return null;
    }
  },
  set(res: AuthResponse): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_KEY, res.tokens.accessToken);
    window.localStorage.setItem(REFRESH_KEY, res.tokens.refreshToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  },
  /** Update just the stored user (profile/avatar/theme edits) — tokens unchanged. */
  setUser(user: AuthUserDto): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
};

// Remembers, per workspace, that this recruiter already registered upgrade
// interest — so the Billing CTA can reflect the confirmed state on reload
// without a dedicated read endpoint. Local-only; no PII, just a boolean flag.
const UPGRADE_INTEREST_KEY = "hiredesq.upgradeInterest";

export const upgradeInterestStore = {
  has(workspaceId: string): boolean {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`${UPGRADE_INTEREST_KEY}.${workspaceId}`) === "1";
  },
  mark(workspaceId: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`${UPGRADE_INTEREST_KEY}.${workspaceId}`, "1");
  },
};

// Theme preference is the source-of-truth on the account (synced across devices),
// but we cache the last-known value locally so the no-flash boot script in the
// root layout can paint the right palette before React (and the user record) load.
const THEME_KEY = "hiredesq.theme";

export const themeStore = {
  get(): ThemePreference | null {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  },
  set(value: ThemePreference): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_KEY, value);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable error code from the API body (e.g. "no_credits" on a
     *  402) so callers can branch without string-matching the message. */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the AI allotment is exhausted — drives the upgrade invitation
   *  (design-system §6.8, never a paywall). Matched on the API's `no_credits`
   *  code, falling back to the 402 status it ships with. */
  get isOutOfCredits(): boolean {
    return this.code === "no_credits" || this.status === 402;
  }
}

function workspacePath(suffix: string): string {
  const user = authStore.getUser();
  if (!user) throw new ApiError(401, "Not authenticated");
  return `/workspaces/${user.workspaceId}${suffix}`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Auth endpoints (signup/login) don't require a bearer token. */
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  // Only declare a JSON content-type when we actually send a body — Fastify
  // rejects an empty body that claims `application/json` (400). Bodyless POSTs
  // (e.g. onboarding/complete, 2fa/setup) must send neither.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = authStore.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  // 401 → drop the stale session and bounce to login (CLAUDE.md §1).
  if (res.status === 401 && auth) {
    authStore.clear();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Your session expired — please sign in again.");
  }

  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    let code: string | undefined;
    try {
      const data = (await res.json()) as { message?: string | string[]; code?: string };
      if (Array.isArray(data.message)) message = data.message[0] ?? message;
      else if (typeof data.message === "string") message = data.message;
      if (typeof data.code === "string") code = data.code;
    } catch {
      // non-JSON error body — keep the friendly default
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Multipart upload — mirrors request()'s auth + error handling but lets the
// browser set the multipart boundary (never set Content-Type by hand for
// FormData). Used by the bulk file/folder/CSV drop (design-system §6.2).
async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = authStore.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: form });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 401) {
    authStore.clear();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Your session expired — please sign in again.");
  }

  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    let code: string | undefined;
    try {
      const data = (await res.json()) as { message?: string | string[]; code?: string };
      if (Array.isArray(data.message)) message = data.message[0] ?? message;
      else if (typeof data.message === "string") message = data.message;
      if (typeof data.code === "string") code = data.code;
    } catch {
      // non-JSON error body — keep the friendly default
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// A reasonable ceiling per drop — keeps an upload to something that finishes in one
// sitting, so a flaky mid-upload abandonment (which would leave a partial batch) is
// the rare exception, not a 2,000-file overnight dump. Over this, we ask the user to
// split the folder rather than start a multi-minute upload likely to drop. Tune as
// real usage data comes in.
const UPLOAD_MAX_FILES = 500;
const UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500 MB total per drop

// Pack a folder drop into byte-bounded chunks for upload(). The budget sits under
// nginx's request cap with headroom for multipart overhead; MAX_FILES stays under
// fastify's per-request `files` limit. A file larger than the budget rides alone
// in its own chunk (we never split a file) — fastify's per-file cap still applies.
const UPLOAD_CHUNK_BYTES = 20 * 1024 * 1024;
const UPLOAD_CHUNK_MAX_FILES = 100;
function chunkFiles(files: File[]): File[][] {
  const chunks: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const file of files) {
    if (cur.length > 0 && (bytes + file.size > UPLOAD_CHUNK_BYTES || cur.length >= UPLOAD_CHUNK_MAX_FILES)) {
      chunks.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(file);
    bytes += file.size;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

// ───────────────────────────── API surface ─────────────────────────────

/** Narrow a login result: true when the account needs a 2FA code to finish signing in. */
export function isTwoFactorChallenge(res: LoginResultDto): res is TwoFactorChallengeDto {
  return "twoFactorRequired" in res;
}

export const api = {
  // Auth
  signup: (input: SignupInput) =>
    request<AuthResponse>("/auth/signup", { method: "POST", body: input, auth: false }),
  // Login/google may resolve to tokens OR a 2FA challenge (LoginResultDto union) —
  // the caller branches on `twoFactorRequired`.
  login: (input: LoginInput) =>
    request<LoginResultDto>("/auth/login", { method: "POST", body: input, auth: false }),
  googleAuth: (code: string, timezone?: string) =>
    request<LoginResultDto>("/auth/google", {
      method: "POST",
      body: { code, timezone } satisfies GoogleAuthInput,
      auth: false,
    }),
  // Completes a 2FA-gated login with the challenge token + TOTP code.
  completeTwoFactorLogin: (input: TwoFactorLoginInput) =>
    request<AuthResponse>("/auth/login/2fa", { method: "POST", body: input, auth: false }),
  me: () => request<AuthUserDto>("/auth/me"),

  // Profile & account (user-scoped, not workspace-scoped). Each returns the
  // refreshed AuthUserDto so the caller can update the stored session.
  updateProfile: (input: UpdateProfileInput) =>
    request<AuthUserDto>("/auth/profile", { method: "PATCH", body: input }),
  changePassword: (input: ChangePasswordInput) =>
    request<void>("/auth/change-password", { method: "POST", body: input }),
  // Two-factor (TOTP). setup returns the QR + secret; enable/disable verify a code
  // and return the refreshed AuthUserDto (twoFactorEnabled flipped).
  setupTwoFactor: () => request<TwoFactorSetupDto>("/auth/2fa/setup", { method: "POST" }),
  enableTwoFactor: (input: TwoFactorVerifyInput) =>
    request<AuthUserDto>("/auth/2fa/enable", { method: "POST", body: input }),
  disableTwoFactor: (input: TwoFactorVerifyInput) =>
    request<AuthUserDto>("/auth/2fa/disable", { method: "POST", body: input }),
  // Permanently delete the signed-in account (DB rows + files). 204 on success;
  // 409 when the user is the last owner of a shared workspace.
  deleteAccount: (input: DeleteAccountInput) =>
    request<void>("/auth/delete-account", { method: "POST", body: input }),
  // Marks the first-run onboarding takeover as seen (idempotent). Returns the
  // refreshed AuthUserDto so the caller can update the stored session in place.
  completeOnboarding: () => request<AuthUserDto>("/auth/onboarding/complete", { method: "POST" }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<AuthUserDto>("/auth/avatar", form);
  },
  // Forgot/reset are public (no token). forgot-password always resolves (the API
  // returns 204 whether or not the email exists — no account enumeration).
  forgotPassword: (input: ForgotPasswordInput) =>
    request<void>("/auth/forgot-password", { method: "POST", body: input, auth: false }),
  resetPassword: (input: ResetPasswordInput) =>
    request<void>("/auth/reset-password", { method: "POST", body: input, auth: false }),
  // Passwordless login. request always resolves (204 whether or not the email
  // exists — no enumeration); verify resolves to tokens OR a 2FA challenge
  // (LoginResultDto), redeemed from the emailed link's ?token=.
  requestMagicLink: (input: RequestMagicLinkInput) =>
    request<void>("/auth/magic-link/request", { method: "POST", body: input, auth: false }),
  verifyMagicLink: (input: VerifyMagicLinkInput) =>
    request<LoginResultDto>("/auth/magic-link/verify", { method: "POST", body: input, auth: false }),

  // Candidates (workspace-scoped). `semantic` switches the backend from the
  // default keyword/fuzzy (typo-tolerant) search to meaning-based vector search
  // (F6); both return CandidateDto[] ranked by relevance and search is free (not
  // credit-gated, CLAUDE.md §4). Semantic only applies when there's a term — an
  // empty query is the unfiltered list either way, so we omit the flag then.
  // Returns PII-lean CandidateListItemDto rows (no email/phone) — opening a profile
  // fetches the full CandidateDto via getCandidate (CLAUDE.md §2).
  listCandidates: (search?: string, semantic = false, page = 1, limit = PAGE_SIZE) => {
    const term = search?.trim();
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (term) {
      params.set("search", term);
      if (semantic) params.set("semantic", "true");
    }
    return request<Paginated<CandidateListItemDto>>(workspacePath(`/candidates?${params}`));
  },
  getCandidate: (id: string) => request<CandidateDto>(workspacePath(`/candidates/${id}`)),
  updateCandidate: (id: string, input: UpdateCandidateInput) =>
    request<CandidateDto>(workspacePath(`/candidates/${id}`), { method: "PATCH", body: input }),
  deleteCandidate: (id: string) =>
    request<void>(workspacePath(`/candidates/${id}`), { method: "DELETE" }),
  exportCandidate: (id: string) =>
    request<CandidateExportDto>(workspacePath(`/candidates/${id}/export`)),
  // Profile photo upload (browser → API → S3, workspace-namespaced). Returns the
  // refreshed CandidateDto (with a fresh signed photoUrl).
  uploadCandidatePhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<CandidateDto>(workspacePath(`/candidates/${id}/photo`), form);
  },
  // Job history — every job in this workspace the candidate has been attached to
  // (their internal pipeline history, with stage). For the profile's Job-history tab.
  listCandidateApplications: (id: string) =>
    request<CandidateJobHistoryDto[]>(workspacePath(`/candidates/${id}/applications`)),

  // Recruiter notes on a candidate — general (candidate-level) or scoped to a
  // position (an application). For the profile's Notes tab.
  listCandidateNotes: (id: string) =>
    request<NoteDto[]>(workspacePath(`/candidates/${id}/notes`)),
  addCandidateNote: (id: string, input: AddNoteInput) =>
    request<NoteDto>(workspacePath(`/candidates/${id}/notes`), { method: "POST", body: input }),
  deleteCandidateNote: (id: string, noteId: string) =>
    request<void>(workspacePath(`/candidates/${id}/notes/${noteId}`), { method: "DELETE" }),

  // Ingest & parse status
  ingest: (input: IngestInput) =>
    request<IngestResponse>(workspacePath("/ingest"), { method: "POST", body: input }),
  getParseJob: (id: string) =>
    request<ParseJobStatusDto>(workspacePath(`/parse-jobs/${id}`)),

  // Bulk ingest & uploads (Phase 2). Files/folders/CSV are sent as multipart
  // under the "files" field; the server routes each to a parse job and, when
  // more than one item lands, groups them under a batchId for the progress view.
  //
  // Job-centric inbound (§2A, F7): when `jobId` is supplied it rides as a query
  // param (the multipart body is reserved for the files), and every candidate
  // produced auto-attaches to that job's pipeline. Omit for the global pool.
  uploadFiles: async (files: File[], jobId?: string | null): Promise<BulkIngestResponse> => {
    // The whole folder can far exceed any single-request limit (nginx caps the
    // request *total*, fastify caps per-file). Send it as byte-bounded chunks so
    // no one request is huge and the api never buffers the whole folder at once
    // (a single file is never split). Multi-chunk drops are STORE-then-SEAL: the
    // first request opens a batch (?grouped=1) and carries the full folder count
    // (?expectedTotal) so the server sets a correct, fixed total; the rest append
    // by ?batchId; only the final request (?sealed=1) enqueues the parse work for
    // the whole batch at once — so nothing parses (and the batch can't complete)
    // until every chunk has landed. Single-chunk drops take the plain path.
    // Cap the drop up front (it's on the user to split a huge folder). A bounded
    // upload finishes in one sitting, so an abandoned mid-upload — which would strand
    // a partial batch server-side — stays rare. Friendly, actionable error.
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (files.length > UPLOAD_MAX_FILES || totalBytes > UPLOAD_MAX_BYTES) {
      throw new ApiError(
        413,
        `That's a large drop (${files.length} files, ${Math.round(totalBytes / 1024 / 1024)} MB). ` +
          `Please upload up to ${UPLOAD_MAX_FILES} files / ${UPLOAD_MAX_BYTES / 1024 / 1024} MB at a time.`,
      );
    }

    const chunks = chunkFiles(files);
    const multi = chunks.length > 1;
    const items: BulkIngestResponse["items"] = [];
    let batchId: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const params = new URLSearchParams();
      if (jobId) params.set("jobId", jobId);
      if (batchId) params.set("batchId", batchId);
      else if (multi) {
        // First request of a multi-chunk drop: open the batch with the true total.
        params.set("grouped", "1");
        params.set("expectedTotal", String(files.length));
      }
      if (multi && i === chunks.length - 1) params.set("sealed", "1"); // last chunk
      const qs = params.toString();
      const form = new FormData();
      for (const file of chunks[i]!) form.append("files", file);
      const res = await upload<BulkIngestResponse>(
        workspacePath(`/uploads${qs ? `?${qs}` : ""}`),
        form,
      );
      batchId ??= res.batchId;
      items.push(...res.items);
    }

    return { batchId, items };
  },
  getImportBatch: (id: string) =>
    request<ImportBatchDto>(workspacePath(`/import-batches/${id}`)),
  getActiveBatches: () =>
    request<ImportBatchDto[]>(workspacePath("/import-batches/active")),

  // Dedup review (design-system Principle 6) — name-only matches awaiting a
  // confirm (merge) / dismiss (keep both) decision.
  listDuplicates: () =>
    request<DuplicateSuggestionDto[]>(workspacePath("/duplicates?status=pending")),
  // The badge needs only the count — never pull PII DTOs to show a number (§2).
  countDuplicates: () =>
    request<DuplicateCountDto>(workspacePath("/duplicates/count?status=pending")),
  resolveDuplicate: (id: string, action: ResolveDuplicateInput["action"]) =>
    request<void>(workspacePath(`/duplicates/${id}/resolve`), {
      method: "POST",
      body: { action } satisfies ResolveDuplicateInput,
    }),

  // A short-lived signed URL to view a candidate's original uploaded file (§2).
  // Backed by GET /candidates/:id/file (candidate-centric — the web doesn't track
  // fileIds). Storage keys are workspace-namespaced server side (CLAUDE.md §1), so
  // this never crosses a tenant boundary.
  getCandidateFileUrl: (id: string) =>
    request<SignedUrlDto>(workspacePath(`/candidates/${id}/file`)),

  // Workspace-configurable custom candidate fields (Settings → Candidate fields).
  // Listing is readable by any member (needed to render a profile); creating/
  // editing/deleting is owner-only, enforced server-side (CLAUDE.md §1).
  listCustomFields: () =>
    request<CustomFieldDefinitionDto[]>(workspacePath("/custom-fields")),
  createCustomField: (input: CreateCustomFieldInput) =>
    request<CustomFieldDefinitionDto>(workspacePath("/custom-fields"), {
      method: "POST",
      body: input,
    }),
  updateCustomField: (id: string, input: UpdateCustomFieldInput) =>
    request<CustomFieldDefinitionDto>(workspacePath(`/custom-fields/${id}`), {
      method: "PATCH",
      body: input,
    }),
  deleteCustomField: (id: string) =>
    request<void>(workspacePath(`/custom-fields/${id}`), { method: "DELETE" }),

  // Jobs & pipeline (workspace-scoped). Routes carry IDs only; candidate names
  // live in response bodies, never in the URL (CLAUDE.md §2). Pipeline value +
  // per-stage counts are computed server-side (Decimal) and arrive on JobDto.
  // Server-side title/client search + offset pagination (mirrors listCandidates).
  // The web no longer filters jobs client-side — the bounded list endpoint scopes +
  // pages server-side and returns the workspace `total` for the numbered pager.
  listJobs: (search?: string, page = 1, limit = PAGE_SIZE) => {
    const term = search?.trim();
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (term) params.set("search", term);
    return request<Paginated<JobDto>>(workspacePath(`/jobs?${params}`));
  },
  createJob: (input: CreateJobInput) =>
    request<JobDto>(workspacePath("/jobs"), { method: "POST", body: input }),
  getJob: (id: string) => request<JobDto>(workspacePath(`/jobs/${id}`)),
  updateJob: (id: string, input: UpdateJobInput) =>
    request<JobDto>(workspacePath(`/jobs/${id}`), { method: "PATCH", body: input }),
  deleteJob: (id: string) =>
    request<void>(workspacePath(`/jobs/${id}`), { method: "DELETE" }),

  // Embedding-matched candidate suggestions for a job (§5) — PII-lean rows ranked
  // by relevance, each with its deterministic constraint verdict. Free (embeddings),
  // never gated. Returns only relevant candidates (server thresholds on cosine).
  suggestedCandidates: (jobId: string, limit?: number) =>
    request<CandidateMatchDto[]>(
      workspacePath(`/jobs/${jobId}/candidates/suggested${limit ? `?limit=${limit}` : ""}`),
    ),

  // Applications — a candidate's position against a job in the pipeline.
  listApplications: (jobId: string) =>
    request<ApplicationDto[]>(workspacePath(`/jobs/${jobId}/applications`)),
  attachCandidate: (jobId: string, candidateId: string) =>
    request<ApplicationDto>(workspacePath(`/jobs/${jobId}/applications`), {
      method: "POST",
      body: { candidateId } satisfies AttachCandidateInput,
    }),
  moveStage: (jobId: string, appId: string, stage: PipelineStage) =>
    request<ApplicationDto>(workspacePath(`/jobs/${jobId}/applications/${appId}`), {
      method: "PATCH",
      body: { stage } satisfies MoveStageInput,
    }),
  detachApplication: (jobId: string, appId: string) =>
    request<void>(workspacePath(`/jobs/${jobId}/applications/${appId}`), { method: "DELETE" }),

  // Qualification trail (§2C, F4) — the per-application record of WHY a candidate
  // is in or out against the req's hard constraints. Deterministic, human-authored
  // notes (NOT an AI score). Routes carry IDs only; the note body lives in the
  // request body, never the URL (CLAUDE.md §2). workspaceId is route-param derived.
  listTrail: (jobId: string, appId: string) =>
    request<QualificationTrailEntryDto[]>(
      workspacePath(`/jobs/${jobId}/applications/${appId}/trail`),
    ),
  addTrailEntry: (jobId: string, appId: string, input: AddTrailEntryInput) =>
    request<QualificationTrailEntryDto>(
      workspacePath(`/jobs/${jobId}/applications/${appId}/trail`),
      { method: "POST", body: input },
    ),

  // Revenue & placements (workspace-scoped, design-system §6.6/§6.7). Money is
  // display-only on the client — fees resolve to a Decimal server-side and arrive
  // as strings on PlacementDto/RevenueSummaryDto (CLAUDE.md §3). Routes carry IDs
  // only; candidate names live in bodies, never the URL (§2).
  getRevenueSummary: () => request<RevenueSummaryDto>(workspacePath("/revenue/summary")),
  listPlacements: (page = 1, limit = PAGE_SIZE) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return request<Paginated<PlacementDto>>(workspacePath(`/placements?${params}`));
  },
  createPlacement: (input: CreatePlacementInput) =>
    request<PlacementDto>(workspacePath("/placements"), { method: "POST", body: input }),
  deletePlacement: (id: string) =>
    request<void>(workspacePath(`/placements/${id}`), { method: "DELETE" }),

  // Guarantee lifecycle (§2E). A fall-through REVERSES the booked fee (optionally
  // keeping a pro-rated retainedAmount); a replace carries the ORIGINAL fee forward
  // to a new candidate with NO new fee and a fresh guarantee window. Both return the
  // updated PlacementDto so the caller can refresh cleared/at-risk. Routes carry IDs
  // only — candidate names live in bodies, never the URL (§2).
  fallThroughPlacement: (id: string, input: FallThroughInput) =>
    request<PlacementDto>(workspacePath(`/placements/${id}/fall-through`), {
      method: "POST",
      body: input,
    }),
  replacePlacement: (id: string, input: ReplacePlacementInput) =>
    request<PlacementDto>(workspacePath(`/placements/${id}/replace`), {
      method: "POST",
      body: input,
    }),

  // Submissions (§2D, Wedge 2). A submission turns a candidate into a clean,
  // branded, CONTACT-MASKED client-ready profile. Masking + AI prose happen
  // server-side; the web only renders what's returned (never email/phone — the
  // masked DTO has no such fields, CLAUDE.md §2). Generation is the AI action the
  // daily credit meter now gates (Model B) — a POST may return 402 `no_credits`,
  // handled like ingest via ApiError.isOutOfCredits (calm upgrade invitation).
  generateSubmission: (input: GenerateSubmissionInput) =>
    request<SubmissionDto>(workspacePath("/submissions"), { method: "POST", body: input }),
  // Scope to one candidate server-side (the profile panel) — never fetch the whole
  // workspace's submissions to filter client-side. Omit for the full list.
  listSubmissions: (candidateId?: string, page = 1, limit = PAGE_SIZE) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (candidateId) params.set("candidateId", candidateId);
    return request<Paginated<SubmissionDto>>(workspacePath(`/submissions?${params}`));
  },
  getSubmission: (id: string) => request<SubmissionDto>(workspacePath(`/submissions/${id}`)),
  deleteSubmission: (id: string) =>
    request<void>(workspacePath(`/submissions/${id}`), { method: "DELETE" }),

  // Client-feedback loop (§2D, F5). The recruiter relays the client's verdict on a
  // submission; the server sets the status and — when the submission is job-linked —
  // nudges the candidate's pipeline stage forward and appends a qualification-trail
  // entry. The web does none of that itself: it POSTs the verdict and refreshes from
  // the returned SubmissionDto. Re-recording is allowed (the client changed their
  // mind). Routes carry IDs only; no PII in the URL (CLAUDE.md §2).
  recordVerdict: (submissionId: string, input: RecordVerdictInput) =>
    request<SubmissionDto>(workspacePath(`/submissions/${submissionId}/verdict`), {
      method: "POST",
      body: input,
    }),

  // PUBLIC, tokenized share view — the artifact a client opens. Deliberately
  // unauthenticated and NOT workspace-scoped: no auth header, no workspaceId, no
  // ids, no contact (§1/§2). Reached only via the unguessable share token.
  getSharedSubmission: (token: string) =>
    request<SharedSubmissionDto>(`/shared/submissions/${encodeURIComponent(token)}`, {
      auth: false,
    }),

  // Credits
  getCredits: () => request<CreditBalanceDto>(workspacePath("/credits")),

  // Forwarding inbox (F9). The workspace's email-ingest address: forward a CV or
  // chat there and it lands parsed in the pool. The address is a CAPABILITY
  // (anyone who knows it can drop CVs into this workspace) — not PII, fine to
  // display, but never logged. The token is minted lazily on first GET; regenerate
  // rotates it (invalidating the old address) for when it leaks. workspaceId is
  // route-param derived (CLAUDE.md §1).
  getInboxAddress: () => request<InboxAddressDto>(workspacePath("/inbox")),
  regenerateInboxAddress: () =>
    request<InboxAddressDto>(workspacePath("/inbox/regenerate"), { method: "POST" }),

  // Home / cockpit (account-at-a-glance). One lean call: the cleared-revenue
  // headline, pool/job counts, and the few queues that need the recruiter today
  // (placements clearing, submissions awaiting a verdict, duplicates to review).
  // Counts + the recruiter's own records only — no cross-tenant data (§1/§2).
  getHomeOverview: () => request<HomeOverviewDto>(workspacePath("/stats/home")),

  // Upgrade interest (design-system §6.8, MVP-SPEC §4). No payment — this only
  // captures intent so we can reach out when Team is ready. The optional note is
  // free-text the recruiter may add; never carries PII in the URL (§2).
  registerUpgradeInterest: (note?: string) =>
    request<void>(workspacePath("/upgrade-interest"), {
      method: "POST",
      body: { note } satisfies UpgradeInterestInput,
    }),

  // Stripe billing (F8). Both endpoints are OWNER-ONLY (a non-owner gets a 403,
  // surfaced calmly in the UI). The client never sees a card — it just redirects
  // the browser to the returned Stripe-hosted URL. workspaceId is route-param
  // derived (CLAUDE.md §1); no price/card data crosses the wire.
  //
  // startCheckout(): a Checkout Session URL. On return Stripe sends the recruiter
  // to /settings/billing?upgrade=success|cancelled; the webhook flips plan→team
  // server-side, asynchronously.
  startCheckout: () =>
    request<BillingRedirectDto>(workspacePath("/billing/checkout"), { method: "POST" }),
  // openBillingPortal(): a billing-portal URL (only valid once the workspace has a
  // Stripe customer — i.e. after a checkout). For managing an active Team sub.
  openBillingPortal: () =>
    request<BillingRedirectDto>(workspacePath("/billing/portal"), { method: "POST" }),

  // Notifications (Phase 0/1). Workspace-scoped in-app feed for the header bell.
  // The badge polls unread-count (just the number — never PII DTOs, §2); the
  // dropdown lists recent rows and marks-read on click. workspaceId is route-param
  // derived (CLAUDE.md §1). `params` is the shared ListNotificationsInput so a
  // renamed field is a compile error on both sides.
  listNotifications: (params: ListNotificationsInput = {}) => {
    const q = new URLSearchParams();
    if (params.page !== undefined) q.set("page", String(params.page));
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.unreadOnly) q.set("unreadOnly", "true");
    const qs = q.toString();
    return request<Paginated<NotificationDto>>(
      workspacePath(`/notifications${qs ? `?${qs}` : ""}`),
    );
  },
  notificationUnreadCount: () =>
    request<NotificationUnreadCountDto>(workspacePath("/notifications/unread-count")),
  markNotificationRead: (id: string) =>
    request<NotificationDto>(workspacePath(`/notifications/${id}/read`), { method: "POST" }),
  markAllNotificationsRead: () =>
    request<NotificationUnreadCountDto>(workspacePath("/notifications/read-all"), {
      method: "POST",
    }),
};
