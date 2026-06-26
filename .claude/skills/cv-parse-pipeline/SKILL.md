---
name: cv-parse-pipeline
description: Build or change hiredesq's CV/resume parsing pipeline — type-detect → extract text (or OCR/vision) → Haiku 4.5 structured extraction → validate → dedup → store, as an idempotent pg-boss job behind the credit gate. Use when working on packages/ai or apps/worker parse code, or adding an ingest source.
---

# CV-parse pipeline

The magic moment: messy input → clean candidate. Read `CLAUDE.md` §5 and the full
design in [docs/cv-parsing-pipeline.md](../../../docs/cv-parsing-pipeline.md).

## Pipeline stages (one pg-boss job per file)

1. **Reserve the ingest slot** — `reserveIngestSlot(workspaceId, contentHash)`
   (`/credit-gate`, Model B). Parsing is free but bounded by the lifetime ingest
   quota; this atomically takes a slot under the cap AND claims the job's
   queued→processing transition (idempotent per content hash), before any provider
   call. (Not the daily credit balance — that gates submission generation.)
2. **Detect type** — PDF (text layer?), DOCX, image (JPG/PNG from WhatsApp), or
   pasted text blob.
3. **Get text:**
   - Text-extractable (PDF text layer, DOCX, pasted text) → extract locally
     (`pdf-parse`/`pdfjs`, `mammoth`). **Cheapest path — no OCR, no vision.**
   - Image / scanned PDF → **OCR** (provider per the doc's cost table) *or* send
     the image directly to Haiku as an image block. Pick per cost/accuracy.
4. **Extract** with `claude-haiku-4-5` using **structured output**
   (`output_config.format` json_schema, or strict tool use) → a validated
   `CandidateProfile`. Never free-text-parse the response.
5. **Validate** against the schema; on failure, **`releaseIngestSlot`** (give the
   quota slot back) and surface a retryable error.
6. **Dedup** — match normalized email/phone/name against existing candidates in
   the workspace; merge instead of creating a duplicate (resume + chat = one
   person). The normalized columns are `@@index`-only (no unique backstop), so the
   find-then-create runs under a `pg_advisory_xact_lock` on (workspaceId, normalized
   email/phone) to serialize concurrent ingests of the same person.
7. **Store** — candidate row (PII fields per `CLAUDE.md` §2), file in object
   storage under `workspaces/<id>/...`. **`markParseDone`** finalizes the job
   (the slot reserved in step 1 is now committed; the counter isn't touched again).

## Model & API facts (verified — see the doc)

- Model id: **`claude-haiku-4-5`** ($1 / $5 per 1M in/out, 200K context). Do not
  set `effort` (400s on Haiku) or thinking for a pure extraction call.
- Vision: Haiku accepts image and PDF (document) blocks — so scanned input can be
  read without a separate OCR step (higher token cost; see the doc's table).
- **Caching:** the schema prompt is small and **below Haiku's 4096-token cache
  minimum** — `cache_control` on it silently won't cache. Verify
  `cache_read_input_tokens` before assuming savings.
- **Bulk** (folder/CSV import): use the **Batch API** (50% cost, async, up to 100k
  requests), not a loop of live calls.

## Idempotency & concurrency

- Job id = content hash → re-running the same file is a no-op (no second
  candidate, no double charge). **Compute the hash once and carry it** in the job
  payload — never recompute it independently in the worker (a future
  trim/lowercase on one side silently breaks dedup).
- The idempotency short-circuit should key on "did this content already produce a
  candidate?", not only `status === "done"` — a retry that crashed after the
  provider call but before the meter committed must not re-invoke the model.
- Many parses for one workspace run concurrently. Two guards make that safe:
  **(a)** the ingest quota is **pre-reserve** (`reserveIngestSlot` atomically
  increments under the cap before the provider call; `releaseIngestSlot` on every
  failure path), so concurrent in-flight parses can't overshoot the free cap — when
  adding a parse path, every catch/early-return between reserve and `markParseDone`
  MUST release. **(b)** dedup's find-then-create has no unique-constraint backstop,
  so it runs under a `pg_advisory_xact_lock` on (workspaceId, normalized email/phone)
  to keep concurrent ingests of the same person from both inserting.

## Resilience pitfalls (these have bitten this codebase)

- **Fallback for every text format, not just PDF.** If local extraction returns
  empty/near-empty text (image-only DOCX, scanned PDF), route to vision or fail
  cleanly — **never send an empty string to Haiku**. Guard every text branch with a
  substantive-content floor.
- **Accept only what you can extract.** Keep the upload `detectKind` accept-set in
  lockstep with the worker's real extractors. Legacy binary `.doc`/`.xls` (mammoth/
  xlsx can't read them) must be rejected at upload with a "convert to PDF/DOCX"
  message — don't accept bytes that become a guaranteed failed job.
- **Handle `stop_reason: "max_tokens"`.** Branch on it distinctly from `"refusal"`;
  truncated structured output makes `JSON.parse` throw. Throw a typed retryable
  error (retry with a higher cap), don't treat it as a permanent failure.
- **Never persist raw error text.** `ParseJob.error` is a closed enum of safe codes
  (`parse_failed`, `unreadable_file`, `extraction_failed`, `quota_exhausted`),
  produced by one `toSafeParseErrorCode(err)` helper. `err.message` from the model
  output / extractors embeds candidate PII and is surfaced to the browser — log the
  raw `err.name`/stack server-side only (`CLAUDE.md` §2).

## Verify

Run the `cv-parsing-reviewer` agent and (for the credit path) `credit-metering-auditor`.
For concurrency changes (dedup lock, ingest reserve/release), the DB-backed
`pnpm test:integration` suite (`apps/worker/test/race.itest.ts`) proves the invariants
against a real Postgres — fire the racing ops with `Promise.allSettled` and assert
one outcome (one candidate, counter never past the cap).

## Output

The job processor, the `packages/ai` extraction call (model + schema + image/text
routing), the dedup step, and the credit reserve/commit/refund wiring.
