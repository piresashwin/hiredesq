import type { QualificationTrailEntry } from "@hiredesq/database";
import type { QualificationTrailEntryDto, TrailEntryKind } from "@hiredesq/shared";

// Single mapper from a Prisma QualificationTrailEntry row to the API DTO. The note
// is recruiter-authored free text — passed through, never logged (CLAUDE.md §2).
export function toQualificationTrailEntryDto(row: QualificationTrailEntry): QualificationTrailEntryDto {
  return {
    id: row.id,
    applicationId: row.applicationId,
    kind: row.kind as TrailEntryKind,
    note: row.note,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}
