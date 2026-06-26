import type { CandidateProfile } from "@hiredesq/shared";
import type { ImportRow } from "./extract.js";

// Smart-map for CSV/XLSX rows (INGEST PROTOCOL v2). If a row's columns map to
// known candidate fields by a case-insensitive header match, we build a clean
// CandidateProfile and store it DIRECTLY — no AI call, no credit charge. A row
// that has no recognizable name column is "messy" → null → AI-parse it as text.
//
// Pure and unit-testable: no I/O, no PII logging.

/** Known candidate fields and the header aliases that map to them. */
// Aliases are written in NORMALIZED form (see normalizeHeader): lowercase, with
// "_" and "-" collapsed to a single space.
const FIELD_ALIASES: Record<string, readonly string[]> = {
  fullName: ["name", "full name", "fullname", "candidate", "candidate name"],
  email: ["email", "email address", "e mail", "mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact", "tel", "telephone"],
  currentTitle: ["title", "job title", "current title", "role", "position", "designation"],
  currentCompany: ["company", "current company", "employer", "organization", "organisation"],
  location: ["location", "city", "address", "region", "based in"],
  skills: ["skills", "skill", "skillset", "tags", "expertise"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Build header → field lookup for a row's actual columns. */
function resolveColumns(row: ImportRow): Map<string, string> {
  const map = new Map<string, string>(); // field → source header
  for (const header of Object.keys(row)) {
    const norm = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map.has(field)) continue;
      if (aliases.includes(norm)) {
        map.set(field, header);
        break;
      }
    }
  }
  return map;
}

function clean(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

/** Split a skills cell on common delimiters. */
function parseSkills(value: string | undefined): string[] {
  const v = clean(value);
  if (!v) return [];
  return v
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Map a single import row to a CandidateProfile, or null if it can't be smart-
 * mapped (no recognizable name) — null means "send this row to the AI text path".
 */
export function mapRow(row: ImportRow): CandidateProfile | null {
  const cols = resolveColumns(row);

  const nameHeader = cols.get("fullName");
  const fullName = nameHeader ? clean(row[nameHeader]) : undefined;
  // A row with no usable name is not cleanly mappable — let the AI handle it.
  if (!fullName) return null;

  const get = (field: string): string | undefined => {
    const header = cols.get(field);
    return header ? clean(row[header]) : undefined;
  };
  const skillsHeader = cols.get("skills");

  return {
    fullName,
    email: get("email"),
    phone: get("phone"),
    location: get("location"),
    currentTitle: get("currentTitle"),
    currentCompany: get("currentCompany"),
    skills: skillsHeader ? parseSkills(row[skillsHeader]) : [],
    experience: [],
    education: [],
  };
}
