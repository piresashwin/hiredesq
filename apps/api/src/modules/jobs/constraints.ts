// Deterministic qualification filter (MVP-SPEC §2C, F4). Compares a candidate's
// parsed fields against a job's hard constraints and flags mismatches — pure data,
// NO AI call, NO credit. This is the line we hold: recall + qualification without an
// AI guess, staying on the right side of the deferred ranking/scoring boundary (§3).
//
// Wire types (ConstraintFlagDto / ConstraintStatus / ConstraintSummary) live in
// @hiredesq/shared so the API and web share one definition.
import type { ConstraintFlagDto, ConstraintSummary } from "@hiredesq/shared";

export interface JobConstraints {
  requiredNationalities: string[];
  residenceTransferableRequired: boolean;
  requiredLicenses: string[];
}

export interface CandidateConstraintFields {
  nationality: string | null;
  residenceTransferable: boolean | null;
  licenses: string[];
}

export interface ConstraintResult {
  summary: ConstraintSummary;
  flags: ConstraintFlagDto[];
}

const norm = (s: string): string => s.trim().toLowerCase();
const includesCi = (list: string[], value: string): boolean =>
  list.some((x) => norm(x) === norm(value));

/**
 * Evaluate one candidate against a job's hard constraints. Only constraints the job
 * actually sets produce a flag; an unset constraint is silent. A constraint the job
 * sets but the candidate hasn't supplied data for is `unknown` (not a fail) — the
 * recruiter needs to fill it in, we don't guess.
 */
export function checkConstraints(
  job: JobConstraints,
  candidate: CandidateConstraintFields,
): ConstraintResult {
  const flags: ConstraintFlagDto[] = [];

  // Nationality — candidate's must be one of the accepted set.
  if (job.requiredNationalities.length > 0) {
    const required = job.requiredNationalities.join(" or ");
    if (!candidate.nationality) {
      flags.push({ key: "nationality", status: "unknown", required, candidate: "Unknown" });
    } else {
      const ok = includesCi(job.requiredNationalities, candidate.nationality);
      flags.push({
        key: "nationality",
        status: ok ? "pass" : "fail",
        required,
        candidate: candidate.nationality,
      });
    }
  }

  // Residence/visa transferable — required true.
  if (job.residenceTransferableRequired) {
    const required = "Transferable";
    if (candidate.residenceTransferable === null) {
      flags.push({ key: "residence_transferable", status: "unknown", required, candidate: "Unknown" });
    } else {
      flags.push({
        key: "residence_transferable",
        status: candidate.residenceTransferable ? "pass" : "fail",
        required,
        candidate: candidate.residenceTransferable ? "Transferable" : "Not transferable",
      });
    }
  }

  // Licenses — candidate must hold ALL required ones.
  if (job.requiredLicenses.length > 0) {
    const required = job.requiredLicenses.join(", ");
    if (candidate.licenses.length === 0) {
      flags.push({ key: "license", status: "unknown", required, candidate: "None listed" });
    } else {
      const missing = job.requiredLicenses.filter((req) => !includesCi(candidate.licenses, req));
      flags.push({
        key: "license",
        status: missing.length === 0 ? "pass" : "fail",
        required,
        candidate:
          missing.length === 0 ? candidate.licenses.join(", ") : `Missing: ${missing.join(", ")}`,
      });
    }
  }

  return { summary: summarize(flags), flags };
}

function summarize(flags: ConstraintFlagDto[]): ConstraintSummary {
  if (flags.length === 0) return "none";
  if (flags.some((f) => f.status === "fail")) return "fail";
  if (flags.some((f) => f.status === "unknown")) return "unknown";
  return "pass";
}
