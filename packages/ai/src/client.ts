import Anthropic from "@anthropic-ai/sdk";

// The single Anthropic client. Everything that calls the provider goes through
// this package (lint bans @anthropic-ai/sdk imports elsewhere) so the credit gate
// can never be bypassed — CLAUDE.md §4.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extraction model. Cheap/fast; structured output; no effort/thinking (Haiku 4.5
// rejects `effort`). See docs/cv-parsing-pipeline.md.
export const PARSE_MODEL = "claude-haiku-4-5";
