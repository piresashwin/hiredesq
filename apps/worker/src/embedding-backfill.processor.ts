/**
 * Core embedding backfill logic — shared between the CLI one-shot script and the
 * 12-hour scheduled pg-boss job. Finds every candidate with a NULL embedding and
 * (re-)generates it via Voyage. Handles Voyage's free-tier rate limit (10K TPM)
 * by sending small chunks with a cooldown between them and retrying on 429.
 *
 * Logs ids/counts only — never PII or the raw vector (CLAUDE.md §2). Best-effort:
 * individual chunk failures are logged and skipped so one bad candidate doesn't
 * abort the rest. Idempotent: safe to run multiple times.
 */
import { PrismaClient } from "@hiredesq/database";
import { candidateEmbeddingText, embedTexts, toVectorLiteral } from "@hiredesq/ai";
import type { CandidateProfile, EducationEntry, ExperienceEntry } from "@hiredesq/shared";

/** Texts per Voyage request — 6 × ~700 tok ≈ 4 200 tok, well under the 10K TPM limit. */
const CHUNK_SIZE = 6;
/** Cooldown between successful chunks (ms). At 6 chunks/min we stay ~25 K TPM. */
const CHUNK_DELAY_MS = 10_000;
/** How many times to retry a 429 before giving up on a chunk. */
const MAX_RETRIES = 3;

interface CandidateRow {
  id: string;
  workspaceId: string;
  fullName: string;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  nationality: string | null;
  residenceTransferable: boolean | null;
  licenses: string[];
  experience: unknown;
  education: unknown;
}

function toProfile(r: CandidateRow): CandidateProfile {
  return {
    fullName: r.fullName,
    location: r.location ?? undefined,
    currentTitle: r.currentTitle ?? undefined,
    currentCompany: r.currentCompany ?? undefined,
    skills: r.skills,
    nationality: r.nationality ?? undefined,
    residenceTransferable: r.residenceTransferable,
    licenses: r.licenses,
    experience: (r.experience as ExperienceEntry[]) ?? [],
    education: (r.education as EducationEntry[]) ?? [],
  };
}

/** Sleep helper. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed one chunk with retries on 429. Returns the vectors or throws after
 * MAX_RETRIES exhausted.
 */
async function embedWithRetry(texts: string[]): Promise<number[][]> {
  let delay = 20_000;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await embedTexts(texts);
    } catch (err) {
      const is429 =
        err instanceof Error && err.message.includes("429") && attempt < MAX_RETRIES;
      if (!is429) throw err;
      console.warn(
        `[embed-backfill] 429 rate-limited — waiting ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error("unreachable");
}

/**
 * Backfill embeddings for all candidates that currently have a NULL embedding,
 * across all workspaces. Returns { ok, failed } counts.
 *
 * Pass an existing PrismaClient so callers control the connection lifecycle; if
 * omitted a local one is created and disconnected on return.
 */
export async function backfillMissingEmbeddings(
  prismaIn?: PrismaClient,
): Promise<{ ok: number; failed: number }> {
  const prisma = prismaIn ?? new PrismaClient();
  const owned = !prismaIn;

  try {
    // Prisma can't filter on the Unsupported("vector") column, so use raw SQL.
    const rows = await prisma.$queryRaw<CandidateRow[]>`
      SELECT
        id,
        workspace_id   AS "workspaceId",
        full_name      AS "fullName",
        location,
        current_title  AS "currentTitle",
        current_company AS "currentCompany",
        skills,
        nationality,
        residence_transferable AS "residenceTransferable",
        licenses,
        experience,
        education
      FROM "candidate"
      WHERE "embedding" IS NULL
      ORDER BY "created_at" ASC
    `;

    console.warn(`[embed-backfill] candidates without embeddings: ${rows.length}`);
    if (rows.length === 0) return { ok: 0, failed: 0 };

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const texts = chunk.map((r) => candidateEmbeddingText(toProfile(r)));

      try {
        const vectors = await embedWithRetry(texts);
        for (let j = 0; j < chunk.length; j += 1) {
          const literal = toVectorLiteral(vectors[j]!);
          await prisma.$executeRaw`
            UPDATE "candidate"
            SET    "embedding" = ${literal}::vector
            WHERE  "id" = ${chunk[j]!.id}
              AND  "workspace_id" = ${chunk[j]!.workspaceId}
          `;
          ok += 1;
        }
        console.warn(
          `[embed-backfill] progress ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length} ok=${ok}`,
        );
      } catch (err) {
        failed += chunk.length;
        console.warn(
          `[embed-backfill] chunk ${i}–${i + CHUNK_SIZE} failed: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        );
      }

      if (i + CHUNK_SIZE < rows.length) await sleep(CHUNK_DELAY_MS);
    }

    console.warn(`[embed-backfill] done ok=${ok} failed=${failed}`);
    return { ok, failed };
  } finally {
    if (owned) await prisma.$disconnect();
  }
}
