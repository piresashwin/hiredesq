export { anthropic, PARSE_MODEL } from "./client.js";
export { CANDIDATE_SCHEMA, PARSE_SYSTEM_PROMPT } from "./schema.js";
export {
  parseCandidate,
  buildParseContent,
  buildParseParams,
  profileFromMessage,
  type ParseSource,
  type TextSource,
  type ImageSource,
  type DocumentSource,
  type MessageResponse,
} from "./parse-candidate.js";
export {
  parseCandidatesBatch,
  submitBatch,
  pollBatch,
  retrieveBatch,
  type BatchParseInput,
  type BatchParseResult,
} from "./batch.js";
export { generateSubmissionSummary, type SubmissionContext } from "./generate-submission.js";
export {
  embedText,
  embedTexts,
  candidateEmbeddingText,
  jobEmbeddingText,
  toVectorLiteral,
  EMBEDDING_DIM,
  type EmbeddingInputType,
  type JobEmbeddingFields,
} from "./embed.js";
