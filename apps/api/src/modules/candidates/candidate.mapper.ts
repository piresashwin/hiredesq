import type { Candidate } from "@hiredesq/database";
import type {
  CandidateDto,
  CandidateListItemDto,
  EducationEntry,
  ExperienceEntry,
} from "@hiredesq/shared";
import { decryptField } from "@hiredesq/core";
import type { StorageService } from "../../common/storage.service.js";

// Profile-photo signed URLs live a week — long enough to outlast a session
// without being a durable public link (§1/§2), matching the user-avatar TTL.
const PHOTO_URL_TTL = 604_800;

// Columns the list/search projection selects — no encrypted contact fields and no
// experience/education blobs, so list rows are never decrypted and stay PII-lean (§2).
export const candidateListSelect = {
  id: true,
  fullName: true,
  location: true,
  currentTitle: true,
  currentCompany: true,
  skills: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CandidateListRow = Pick<
  Candidate,
  | "id"
  | "fullName"
  | "location"
  | "currentTitle"
  | "currentCompany"
  | "skills"
  | "source"
  | "createdAt"
  | "updatedAt"
>;

// List/search row mapper — no decryption (the row carries no encrypted columns).
export function toCandidateListItemDto(row: CandidateListRow): CandidateListItemDto {
  return {
    id: row.id,
    fullName: row.fullName,
    location: row.location,
    currentTitle: row.currentTitle,
    currentCompany: row.currentCompany,
    skills: row.skills,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Single mapper from a Prisma Candidate row to the API DTO. email/phone are
// DECRYPTED here at the boundary (stored encrypted at rest, CLAUDE.md §2). Never
// return raw rows — the encrypted columns must not leak past this layer.
//
// Async because the profile photo is returned as a short-lived signed GET URL
// scoped to the workspace (§1/§2) — null when no photo is set. The photoKey
// itself never leaves the server.
export async function toCandidateDto(
  row: Candidate,
  workspaceId: string,
  storage: StorageService,
): Promise<CandidateDto> {
  const photoUrl = row.photoKey
    ? await storage.signedGetUrl(workspaceId, row.photoKey, PHOTO_URL_TTL)
    : null;

  return {
    id: row.id,
    fullName: row.fullName,
    email: decryptField(row.emailEncrypted),
    phone: decryptField(row.phoneEncrypted),
    location: row.location,
    currentTitle: row.currentTitle,
    currentCompany: row.currentCompany,
    skills: row.skills,
    // Hard-constraint fields for the deterministic qualification filter (F4, §2C).
    nationality: row.nationality,
    residenceTransferable: row.residenceTransferable,
    licenses: row.licenses,
    photoUrl,
    experience: (row.experience as unknown as ExperienceEntry[]) ?? [],
    education: (row.education as unknown as EducationEntry[]) ?? [],
    customFields: (row.customFields as Record<string, string>) ?? {},
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
