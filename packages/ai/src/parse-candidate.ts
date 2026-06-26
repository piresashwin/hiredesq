import type { CandidateProfile } from "@hiredesq/shared";
import { anthropic, PARSE_MODEL } from "./client.js";
import { CANDIDATE_SCHEMA, PARSE_SYSTEM_PROMPT } from "./schema.js";

/** Text-extractable input (PDF text layer, DOCX, pasted blob) — the cheap path. */
export interface TextSource {
  kind: "text";
  text: string;
}

/** Image / scanned input — read directly by Haiku vision (no separate OCR). */
export interface ImageSource {
  kind: "image";
  /** base64-encoded image bytes. */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * Scanned / image-only PDF — sent as a `document` block (Anthropic reads the PDF
 * natively). Raw PDF bytes are NOT a valid image block, so this must not be routed
 * through ImageSource (CLAUDE.md §5).
 */
export interface DocumentSource {
  kind: "document";
  /** base64-encoded PDF bytes. */
  data: string;
  mediaType: "application/pdf";
}

export type ParseSource = TextSource | ImageSource | DocumentSource;

/** The message content blocks for a source — shared by the live and batch paths. */
export function buildParseContent(source: ParseSource): Array<Record<string, unknown>> {
  if (source.kind === "text") {
    return [{ type: "text", text: source.text }];
  }
  if (source.kind === "document") {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: source.data },
      },
      { type: "text", text: "Extract the candidate profile from this document." },
    ];
  }
  return [
    {
      type: "image",
      source: { type: "base64", media_type: source.mediaType, data: source.data },
    },
    { type: "text", text: "Extract the candidate profile from this document." },
  ];
}

/**
 * The Messages-API params for one parse request — identical for the live call and
 * each request inside a batch, so extraction is byte-for-byte consistent.
 */
export function buildParseParams(source: ParseSource): Record<string, unknown> {
  return {
    model: PARSE_MODEL,
    max_tokens: 2048,
    system: PARSE_SYSTEM_PROMPT,
    // Structured output — the first content block is guaranteed valid JSON
    // matching the schema. Never free-text-parse the model output.
    output_config: { format: { type: "json_schema", schema: CANDIDATE_SCHEMA } },
    messages: [{ role: "user", content: buildParseContent(source) }],
  };
}

/** Narrowed shape of the (non-stream) message response we read. */
export interface MessageResponse {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
}

/** Pull the validated profile out of a structured-output message, or throw. */
export function profileFromMessage(response: MessageResponse): CandidateProfile {
  if (response.stop_reason === "refusal") {
    throw new Error("parse refused by safety classifier");
  }
  // Truncation (hit max_tokens) yields invalid/partial JSON. Surface it as a
  // distinct, retryable signal (the caller can retry with a higher cap) rather than
  // letting JSON.parse throw a SyntaxError whose message embeds the model's output.
  if (response.stop_reason === "max_tokens") {
    throw new Error("parse output truncated (max_tokens)");
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") {
    throw new Error("no text block in parse response");
  }
  try {
    return JSON.parse(block.text) as CandidateProfile;
  } catch {
    // NEVER include block.text in the thrown message — structured-output JSON
    // contains the parsed candidate fields (PII, CLAUDE.md §2).
    throw new Error("invalid parse output");
  }
}

/**
 * Parse one resume/blob into a structured CandidateProfile using Haiku 4.5 with
 * structured output. Throws on a malformed response so the caller can refund the
 * reserved credit and retry (CLAUDE.md §4–§5).
 *
 * Caching note: the schema/prompt is well under Haiku's 4096-token cache minimum,
 * so it won't cache — don't set cache_control expecting savings (see the doc).
 */
export async function parseCandidate(source: ParseSource): Promise<CandidateProfile> {
  // `output_config` is newer than the installed SDK's param types, so the create
  // call is cast — which collapses the non-stream return to the Stream|Message
  // union. We don't stream, so narrow the awaited result to the message shape we
  // read (stop_reason + content blocks).
  const response = (await anthropic.messages.create(
    buildParseParams(source) as unknown as Parameters<typeof anthropic.messages.create>[0],
  )) as unknown as MessageResponse;

  return profileFromMessage(response);
}
