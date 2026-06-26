/**
 * One-off backfill: re-embed every candidate with the CURRENT candidateEmbeddingText
 * (which now front-loads role titles, §search-quality). Existing embeddings were built
 * from the old text and rank title queries weakly, so they must be regenerated.
 *
 * Idempotent + re-runnable: it simply overwrites each candidate's embedding. Free
 * (embeddings aren't credit-gated). Logs ids/counts only — never PII or the vector (§2).
 *
 * Run:  pnpm --filter @hiredesq/worker backfill:embeddings
 *   (= dotenv -e ../../.env -- tsx src/backfill-embeddings.ts)
 */
import { PrismaClient } from "@hiredesq/database";
import {
  candidateEmbeddingText,
  embedTexts,
  toVectorLiteral,
} from "@hiredesq/ai";
import type { CandidateProfile, EducationEntry, ExperienceEntry } from "@hiredesq/shared";

const BATCH = 128;
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.candidate.findMany({
    select: {
      id: true,
      workspaceId: true,
      fullName: true,
      location: true,
      currentTitle: true,
      currentCompany: true,
      skills: true,
      nationality: true,
      residenceTransferable: true,
      licenses: true,
      experience: true,
      education: true,
    },
  });
  console.warn(`[backfill] candidates to re-embed: ${rows.length}`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const texts = chunk.map((r) => {
      const profile: CandidateProfile = {
        fullName: r.fullName,
        location: r.location ?? undefined,
        currentTitle: r.currentTitle ?? undefined,
        currentCompany: r.currentCompany ?? undefined,
        skills: r.skills,
        nationality: r.nationality ?? undefined,
        residenceTransferable: r.residenceTransferable,
        licenses: r.licenses,
        experience: (r.experience as unknown as ExperienceEntry[]) ?? [],
        education: (r.education as unknown as EducationEntry[]) ?? [],
      };
      return candidateEmbeddingText(profile);
    });

    try {
      const vectors = await embedTexts(texts);
      for (let j = 0; j < chunk.length; j += 1) {
        // Workspace-scoped write (§1); $executeRaw because Prisma has no vector type.
        await prisma.$executeRaw`
          UPDATE "candidate" SET "embedding" = ${toVectorLiteral(vectors[j]!)}::vector
          WHERE "id" = ${chunk[j]!.id} AND "workspace_id" = ${chunk[j]!.workspaceId}
        `;
        ok += 1;
      }
    } catch (err) {
      failed += chunk.length;
      console.warn(
        `[backfill] chunk failed n=${chunk.length} err=${err instanceof Error ? err.name : "unknown"}`,
      );
    }
    console.warn(`[backfill] progress ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  console.warn(`[backfill] done ok=${ok} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(`[backfill] fatal: ${err instanceof Error ? err.message : "unknown"}`);
  await prisma.$disconnect();
  process.exit(1);
});
