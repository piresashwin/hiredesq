import type { CandidateProfile } from "@hiredesq/shared";

/**
 * Embeddings for semantic candidate search (search upgrade #2, §5). Uses Voyage AI
 * (Anthropic's recommended embeddings partner) over its REST API. All provider
 * calls stay in packages/ai (§4); embeddings are FREE — not credit-gated (like
 * parsing under Model B).
 *
 * PII posture (§2): we embed only `candidateEmbeddingText`, which EXCLUDES contact
 * details (email/phone) — the same minimize-what-leaves principle as the Haiku
 * parse call. A reduced candidate summary (name, title, company, location, skills,
 * history) is sent to Voyage; raw contact never is.
 *
 * The DB column is `vector(EMBEDDING_DIM)` — Voyage MUST return exactly this many
 * dimensions or the insert fails, so embedText validates the length loudly rather
 * than silently storing a wrong-width vector.
 */

/** Must match the migration's `vector(N)` column. voyage-4* default to 1024. */
export const EMBEDDING_DIM = 1024;

const BASE_URL = process.env.VOYAGE_BASE_URL ?? "https://api.voyageai.com/v1";
const MODEL = process.env.EMBEDDINGS_MODEL ?? "voyage-4-lite";
// The user provisions VOYAGER_API_KEY; also accept Voyage's own VOYAGE_API_KEY name.
const API_KEY = process.env.VOYAGER_API_KEY ?? process.env.VOYAGE_API_KEY;

/** Voyage tailors the vector for retrieval when told whether it's a stored doc or a query. */
export type EmbeddingInputType = "document" | "query";

// Voyage returns an OpenAI-compatible `data[].embedding` (with an `index`); some
// surfaces also expose a top-level `embeddings[]`. Accept either so a minor shape
// change doesn't break us.
interface EmbeddingResponse {
  data?: Array<{ embedding: number[]; index?: number }>;
  embeddings?: number[][];
}

/** One Voyage call for N inputs → N vectors, in input order. Validates count + dim. */
async function callVoyage(input: string[], inputType: EmbeddingInputType): Promise<number[][]> {
  if (!API_KEY) throw new Error("VOYAGER_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input,
      input_type: inputType,
      output_dimension: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`embeddings endpoint ${res.status}`);
  }
  const body = (await res.json()) as EmbeddingResponse;
  // Reorder by `index` (Voyage may return out of order); fall back to positional.
  const vectors = body.data
    ? body.data.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding)
    : (body.embeddings ?? []);
  if (vectors.length !== input.length) {
    throw new Error(`embedding count ${vectors.length} != ${input.length}`);
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIM) {
      const got = Array.isArray(v) ? v.length : "none";
      throw new Error(`embedding dim ${got} != expected ${EMBEDDING_DIM} (model mismatch)`);
    }
  }
  return vectors;
}

/**
 * Embed a single string into a comparable vector. Pass `inputType: "query"` for a
 * search string, `"document"` (default) for stored candidate text — Voyage tunes
 * the vector for retrieval accordingly. Throws on a missing key, transport error,
 * non-OK status, or a dimension mismatch so the caller can skip (best-effort at
 * ingest) or fall back (search).
 */
export async function embedText(
  text: string,
  inputType: EmbeddingInputType = "document",
): Promise<number[]> {
  return (await callVoyage([text], inputType))[0]!;
}

/**
 * Embed many strings in ONE request (bulk ingest). Returns vectors aligned to the
 * input order. Caller chunks to stay under Voyage's per-request limits. Throws on
 * the same conditions as embedText, so a bulk caller can skip the failed chunk.
 */
export async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return callVoyage(texts, inputType);
}

/**
 * Build the text we embed for a candidate. Deliberately EXCLUDES contact PII
 * (email/phone) — semantic matching doesn't need it, and we minimize what flows
 * into the vector (§2). Captures the searchable substance: title, company,
 * location, skills, and the experience/education narrative.
 */
export function candidateEmbeddingText(profile: CandidateProfile): string {
  const lines: string[] = [profile.fullName];

  // Front-load EVERY role title the candidate has held — current plus their whole
  // experience history — deduped (case-insensitive), as a single emphasized line.
  // Recruiters search by job title ("case officer"), but a title buried in one of
  // several long experience summaries gets diluted in the single profile vector and
  // ranks weakly. Surfacing the titles up front restores that signal so a candidate
  // is found by what they've *done*, not just their current role (search-quality fix).
  const seen = new Set<string>();
  const roles = [profile.currentTitle, ...profile.experience.map((e) => e.title)]
    .map((t) => t?.trim())
    .filter((t): t is string => {
      if (!t) return false;
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (roles.length) lines.push(`Roles: ${roles.join(", ")}`);

  if (profile.currentTitle) lines.push(profile.currentTitle);
  if (profile.currentCompany) lines.push(profile.currentCompany);
  if (profile.location) lines.push(profile.location);
  if (profile.skills.length) lines.push(`Skills: ${profile.skills.join(", ")}`);
  // Constraint fields feed semantic queries like "ICU nurses with a transferable visa".
  if (profile.nationality) lines.push(`Nationality: ${profile.nationality}`);
  if (profile.residenceTransferable) lines.push("Residence/visa transferable");
  if (profile.licenses?.length) lines.push(`Licenses: ${profile.licenses.join(", ")}`);
  for (const e of profile.experience) {
    lines.push([e.title, e.company, e.summary].filter(Boolean).join(" — "));
  }
  for (const ed of profile.education) {
    lines.push([ed.degree, ed.field, ed.institution].filter(Boolean).join(" — "));
  }
  return lines.filter(Boolean).join("\n");
}

/** The job fields we embed for candidate-match suggestions (§5). */
export interface JobEmbeddingFields {
  title: string;
  description?: string | null;
  requiredNationalities?: string[];
  residenceTransferableRequired?: boolean;
  requiredLicenses?: string[];
}

/**
 * Build the text we embed for a job — the mirror of `candidateEmbeddingText`, so a
 * job and a fitting candidate land near each other in the SAME vector space (same
 * Voyage model, "document" input). Captures the searchable substance: title, the req
 * prose, and the hard-constraint signal (nationality/visa/license) so a query for
 * "ICU nurse, transferable Gulf visa" matches candidates whose embedding text carries
 * the same. No PII — a job req has none.
 */
export function jobEmbeddingText(job: JobEmbeddingFields): string {
  const lines: string[] = [job.title];
  if (job.description) lines.push(job.description);
  if (job.requiredNationalities?.length)
    lines.push(`Nationality: ${job.requiredNationalities.join(" or ")}`);
  if (job.residenceTransferableRequired) lines.push("Residence/visa transferable required");
  if (job.requiredLicenses?.length) lines.push(`Licenses: ${job.requiredLicenses.join(", ")}`);
  return lines.filter(Boolean).join("\n");
}

/** pgvector text literal for a vector value: `[0.1,0.2,...]` (cast `::vector` in SQL). */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
