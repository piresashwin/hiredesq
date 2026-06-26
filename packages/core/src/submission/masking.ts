import type { ExperienceEntry, EducationEntry } from "@hiredesq/shared";

/**
 * DETERMINISTIC contact masking for client-ready submissions (CLAUDE.md §2,
 * MVP-SPEC §2D/§5). The client-facing artifact must NEVER carry raw contact data
 * so the client can't go direct — and per §2 we never trust the AI to redact.
 * This is pure domain logic: the only place contact gets stripped, applied as a
 * post-step on the parsed/stored record.
 *
 * It does two things:
 *   1. Drops email/phone entirely (they are never copied into the masked profile).
 *   2. Scrubs any email/phone that leaked into FREE-TEXT fields (experience
 *      summaries, and — via `redactContactText` — the AI-generated summary prose),
 *      because a model can put a phone number anywhere.
 */

// Conservative contact patterns. Over-redaction (e.g. a long ID) is acceptable on
// a client artifact; under-redaction is a PII leak, so we err toward masking.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// 7+ digits with common phone separators. The run may START with a digit, "(", or
// "+" so standalone "(212) 555-0199" and "+965 1234 5678" both match.
const PHONE_RE = /\+?[\d(][\d\s().\-]{6,}\d/g;
const REDACTED = "[contact hidden]";

/** Scrub email/phone patterns out of free text (model output included). */
export function redactContactText(text: string): string {
  return text.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
}

/** Candidate fields the masker reads. email/phone are accepted only to DROP them. */
export interface MaskableCandidate {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: string[];
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
}

/**
 * The client-facing, contact-free profile snapshot stored on a Submission. Note
 * the ABSENCE of email/phone — there is no field for them, by design (§2).
 */
export interface MaskedProfile {
  fullName: string;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  /** Always true — signals the UI to render the "contact via agency" treatment. */
  contactMasked: true;
}

const scrub = (v: string | null | undefined): string | null =>
  v === null || v === undefined ? null : redactContactText(v);

/**
 * Build the masked, client-ready profile. email/phone are dropped (no field for
 * them) and EVERY free-text field is run through `redactContactText` — a model can
 * put a phone number in any field (§2). Entries are rebuilt from an ALLOW-LIST of
 * known keys; we never spread `...e`, so a stray model-added key (e.g. a `contact`)
 * can't smuggle raw data into the client artifact. Date fields aren't scrubbed.
 */
export function maskCandidate(c: MaskableCandidate): MaskedProfile {
  return {
    fullName: redactContactText(c.fullName),
    location: scrub(c.location),
    currentTitle: scrub(c.currentTitle),
    currentCompany: scrub(c.currentCompany),
    skills: (c.skills ?? []).map(redactContactText),
    experience: (c.experience ?? []).map((e) => ({
      company: redactContactText(e.company),
      title: redactContactText(e.title),
      ...(e.startDate !== undefined ? { startDate: e.startDate } : {}),
      ...(e.endDate !== undefined ? { endDate: e.endDate } : {}),
      ...(e.summary !== undefined ? { summary: redactContactText(e.summary) } : {}),
    })),
    education: (c.education ?? []).map((ed) => ({
      institution: redactContactText(ed.institution),
      ...(ed.degree !== undefined ? { degree: redactContactText(ed.degree) } : {}),
      ...(ed.field !== undefined ? { field: redactContactText(ed.field) } : {}),
      ...(ed.endDate !== undefined ? { endDate: ed.endDate } : {}),
    })),
    contactMasked: true,
  };
}
