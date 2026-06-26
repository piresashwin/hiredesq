import type { CandidateProfile } from "@hiredesq/shared";

/**
 * Candidate identity & dedup rules (CLAUDE.md §5). The same person across a resume
 * and a WhatsApp chat must collapse to one candidate. Matching is domain logic,
 * not an ad-hoc query — the repository fetches existing candidates in the
 * workspace and hands them here.
 */

/** Normalize an email for comparison (lowercase, trim). */
export function normalizeEmail(email: string | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** Normalize a phone to digits only, keeping the last 10 (local) for matching. */
export function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/** Normalize a name for a weak fallback match. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ExistingCandidate {
  id: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedName: string;
}

export interface MatchResult {
  candidateId: string;
  matchedOn: "email" | "phone" | "name";
}

/**
 * Find the existing candidate this profile should merge into, if any.
 * Precedence: email > phone > name (name alone is a weak signal — callers may
 * choose to confirm rather than auto-merge on a name-only hit).
 */
export function findDuplicate(
  profile: CandidateProfile,
  existing: readonly ExistingCandidate[],
): MatchResult | null {
  const email = normalizeEmail(profile.email);
  const phone = normalizePhone(profile.phone);
  const name = normalizeName(profile.fullName);

  if (email) {
    const hit = existing.find((c) => c.normalizedEmail === email);
    if (hit) return { candidateId: hit.id, matchedOn: "email" };
  }
  if (phone) {
    const hit = existing.find((c) => c.normalizedPhone === phone);
    if (hit) return { candidateId: hit.id, matchedOn: "phone" };
  }
  const hit = existing.find((c) => c.normalizedName === name);
  if (hit) return { candidateId: hit.id, matchedOn: "name" };

  return null;
}
