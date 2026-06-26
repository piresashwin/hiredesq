import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { CandidateSource, IngestInput, UploadKind } from "@hiredesq/shared";

const KINDS: UploadKind[] = ["pdf", "docx", "image", "text"];
const SOURCES: CandidateSource[] = [
  "resume_upload",
  "bulk_import",
  "whatsapp_paste",
  "email_forward",
  "manual",
];

// No workspaceId here — it comes from the route param (CLAUDE.md §1).
// `implements IngestInput` ties this DTO to the shared contract the web client
// sends: rename/retype a field and BOTH sides fail to compile (the `text` vs
// `payload` drift that shipped a broken ingest box can't recur).
export class IngestDto implements IngestInput {
  @IsIn(KINDS)
  kind!: UploadKind;

  // Extracted text for text/pdf/docx, or base64 image data for image kind.
  @IsString()
  @MaxLength(2_000_000)
  payload!: string;

  @IsIn(SOURCES)
  source!: CandidateSource;

  @IsOptional()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";

  // Job-centric inbound (§2A, F7): target an open position so the parsed candidate
  // lands attached to it. Verified in-tenant in the service. Omit = the global pool.
  @IsOptional()
  @IsString()
  jobId?: string;
}
