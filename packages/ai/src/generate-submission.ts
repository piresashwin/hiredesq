import { anthropic, PARSE_MODEL } from "./client.js";
import type { MessageResponse } from "./parse-candidate.js";

/**
 * Generate the branded, client-facing summary prose for a submission (Wedge 2,
 * MVP-SPEC §2D). Haiku 4.5 with structured output (§5) — cheap/fast; the prose is
 * the only generative part, gated by a credit in the API (§4).
 *
 * PII posture (§2): the input is the ALREADY-MASKED profile — the model never sees
 * raw email/phone at all. The system prompt also forbids emitting contact info, and
 * the API still runs the deterministic `redactContactText` scrub over the output —
 * defense in depth, never trusting the model to redact.
 */
export interface SubmissionContext {
  /** The masked, contact-free profile snapshot (no email/phone fields exist on it). */
  profile: {
    fullName: string;
    location: string | null;
    currentTitle: string | null;
    currentCompany: string | null;
    skills: string[];
    experience: unknown[];
    education: unknown[];
  };
  /** Optional job framing for the V1.1 job-linked path (tailors the prose to the req). */
  jobTitle?: string | null;
  client?: string | null;
}

// Single string field — structured output guarantees valid JSON (no free-text parse).
const SUBMISSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"],
} as const;

const SUBMISSION_SYSTEM_PROMPT =
  "You write a concise, professional candidate summary a recruiter sends to their " +
  "client. 2-4 sentences, third person, factual — highlight role fit, key skills, " +
  "and seniority. Use ONLY the provided fields; never invent employers, dates, or " +
  "qualifications, and NEVER include any contact information (email, phone, links).";

export async function generateSubmissionSummary(ctx: SubmissionContext): Promise<string> {
  const params = {
    model: PARSE_MODEL,
    max_tokens: 1024,
    system: SUBMISSION_SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: SUBMISSION_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(ctx) }] }],
  };
  // Same SDK-typing caveat as parseCandidate: output_config is newer than the
  // installed param types, so cast and narrow the awaited result.
  const response = (await anthropic.messages.create(
    params as unknown as Parameters<typeof anthropic.messages.create>[0],
  )) as unknown as MessageResponse;

  if (response.stop_reason === "refusal") {
    throw new Error("submission generation refused by safety classifier");
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") {
    throw new Error("no text block in submission response");
  }
  return (JSON.parse(block.text) as { summary: string }).summary;
}
