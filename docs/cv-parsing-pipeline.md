# CV Parsing Pipeline — OCR + Haiku 4.5

What's required to turn a messy resume (PDF, DOCX, a WhatsApp image, or pasted
text) into a clean, validated `CandidateProfile`. This is hiredesq's magic moment;
see `CLAUDE.md` §5 and the `/cv-parse-pipeline` skill.

> Model facts below are grounded against the Claude API docs (verified):
> `claude-haiku-4-5`, **$1 / $5 per 1M tokens** (input/output), **200K context**,
> **64K max output**. Haiku 4.5 supports image and PDF (document) input, structured
> outputs, and the Batch API. It does **not** support the `effort` parameter (400s).

---

## 1. The pipeline (one pg-boss job per file)

```
upload ──► [reserve credit] ──► detect type ──► get text ──► Haiku extract ──►
           validate schema ──► dedup ──► store candidate + file ──► [commit credit]
                    │
                    └─ any failure ──► [refund credit] + retryable error
```

Each step, and why:

| Step | What | Why |
|---|---|---|
| Reserve credit | `/credit-gate`, keyed by content hash | No uncharged AI work; idempotent retries |
| Detect type | PDF (text layer?), DOCX, image, text blob | Decides the cheapest path |
| Get text | local extract **or** OCR/vision | OCR only when there's no text layer |
| Extract | Haiku 4.5 + structured output | Schema-validated `CandidateProfile` |
| Validate | against the JSON schema | Never trust free-text output |
| Dedup | normalized email/phone/name | Resume + chat = one candidate |
| Store | DB row + object storage | PII handling per `CLAUDE.md` §2 |
| Commit/refund | settle the reservation | Pay only for successful parses |

> The "reserve / commit / refund" here is the **lifetime ingest quota** (Model B —
> parsing is free), not the daily credit balance: `reserveIngestSlot` before the
> work, `releaseIngestSlot` on failure, `markParseDone` on success. It's pre-reserve
> + release so concurrent parses can't overshoot the cap — see §5.

---

## 2. Getting text: when you need OCR, and when you don't

This is the cost-driver decision. Three input classes:

### (a) Text-extractable — **no OCR, no vision** (the cheap majority)
- **PDF with a text layer** → `pdf-parse` / `pdfjs` extracts text locally.
- **DOCX** → `mammoth` extracts text locally.
- **Pasted blob** (WhatsApp export, email, notes) → already text.

Local extraction is free and instant. Feed the text straight to Haiku. **Most
recruiter resumes are text-layer PDFs or DOCX — this path covers them.**

### (b) Image / scanned PDF — **needs OCR or vision**
WhatsApp photos of a CV, scanned documents, image-only PDFs. Two options:

| Option | How | Trade-off |
|---|---|---|
| **B1. Dedicated OCR → text → Haiku** | Run OCR to get text, then parse the text with Haiku (cheap text path) | Extra infra/cost for OCR; best when you parse high image volume and want to minimize LLM image tokens |
| **B2. Send the image to Haiku directly** | Pass the image as an image block; Haiku reads it and extracts in one call (no separate OCR) | Simplest (no OCR infra); higher token cost (images cost more input tokens than the equivalent text); accuracy is strong on typical resumes |

**Recommendation for v1:** start with **B2 (direct vision)** — it removes an entire
moving part (no OCR provider, no second hop) and Haiku reads resume images well.
Move image-heavy volume to **B1** later only if the image-token cost shows up in
the unit economics. Measure with `count_tokens` before optimizing.

### OCR provider options (if/when you choose B1)
- **AWS Textract** — best accuracy on document/form layouts; pay-per-page; managed.
- **Google Cloud Vision / Azure Document Intelligence** — comparable managed OCR.
- **Tesseract** — open-source, self-hosted, $0; weaker on messy layouts/handwriting.

Don't build B1 until B2's cost proves it's needed.

---

## 3. Extraction with Haiku 4.5 (structured output)

- **Model:** `claude-haiku-4-5`. Cheap, fast, good at extraction. No `effort`, no
  thinking — it's a deterministic extraction, not reasoning.
- **Structured output:** use `output_config.format` with a `json_schema` (or strict
  tool use) so the response is always a valid `CandidateProfile`. Validate before
  insert; on validation failure, **refund the credit** and mark the job retryable.
- **Fixed schema/prompt** (so it's identical across every parse): name, contacts,
  current role/company, skills[], experience[], education[], location, source.

### Cost per parse (text path)
Rough sizes: resume text ~1,500 in + prompt/schema ~700 in = ~2,200 input;
structured profile ~500 output.

| | Input (2,200 × $1/1M) | Output (500 × $5/1M) | **Per resume** |
|---|---|---|---|
| Text path | ~$0.0022 | ~$0.0025 | **~$0.0047** (about half a cent) |

The image (B2) path costs more on input (image tokens > text tokens) — measure per
representative image with `count_tokens`. Either way, **a free-tier allotment of
~50–100 parses/month is pennies of COGS** — credits exist for upgrade intent and
abuse-capping, not to cover cost (`CLAUDE.md` §4).

### ⚠️ Caching caveat (important, corrects an earlier assumption)
The parse prompt + schema is small (a few hundred tokens). **Haiku 4.5's minimum
cacheable prefix is 4,096 tokens** — anything shorter **silently won't cache** even
with `cache_control` set (`cache_creation_input_tokens` stays 0). So don't bank on
prompt-cache savings for the schema prompt. If you want caching to matter, the
cacheable prefix would need to clear 4,096 tokens (e.g. a large few-shot block) —
usually not worth it here. Always verify `cache_read_input_tokens` before claiming
savings.

---

## 4. Bulk imports — use the Batch API

A recruiter dropping a folder of 200 resumes (the "I had 200 in Drive" moment)
should **not** fire 200 live requests. The **Batch API**:
- **50% cheaper** on all tokens.
- Async — up to 100,000 requests per batch; most finish within an hour.
- Supports the same vision + structured-output features.

Flow: enqueue the folder → create one batch with one request per resume (same
schema/prompt) → poll for completion → ingest each result through validate → dedup
→ store. Reserve credits up front for the batch; refund the ones that error.

**Retry-safe coordinator (CLAUDE.md §5).** The coordinator pg-boss job runs under
`retryLimit:3`, so a batch-level throw (Anthropic submit failure, the 24h poll
timeout, or a worker restart) re-runs the whole job. Two durable anchors keep that
idempotent — never re-submitting, re-paying, or double-counting:
- **`ImportBatch.providerBatchId`** — the Anthropic Message Batch id, persisted right
  *after* submit and *before* polling. On retry the coordinator **reconnects** to that
  live batch and settles it instead of submitting a second batch for the same resumes.
- **`ParseJob.status`** — items already `done`/`failed` are skipped; the
  submitted-but-unsettled set is exactly those left `processing`. Per-item failures
  release the reserved ingest slot from durable DB state (`failParseAndReleaseSlot`),
  so a slot is freed exactly once across retries and never leaks.

Use live single-call parsing for the **interactive** moment (one paste, instant
result — the activation metric); use the Batch API for **bulk backfill**.

---

## 5. Idempotency, dedup, and concurrency

- **Idempotent jobs:** pg-boss `singletonKey` = content hash. The same file parsed
  twice is a no-op — no duplicate candidate, no double charge.
- **Dedup on ingest:** before insert, look up existing candidates in the workspace
  by normalized email → phone → name. Match = merge (resume + chat = one person);
  no match = create. This is what makes the DB feel clean. The normalized columns
  are `@@index` only (no unique constraint), so the find-then-create is serialized
  by a `pg_advisory_xact_lock` on (workspaceId, normalized email/phone) — without
  it, two concurrent ingests of the same person each find no match and both insert.
- **Concurrency & the ingest meter:** parsing is gated by the **lifetime ingest
  quota** (Model B), not the daily credit balance. The gate is **pre-reserve +
  release**: `reserveIngestSlot` atomically increments the counter under its cap
  (`… WHERE ingest_used_lifetime < limit`; zero rows ⇒ `IngestQuotaError`) before
  any provider call, so concurrent parses can't overshoot the free cap;
  `releaseIngestSlot` gives the slot back on any failure (a failed parse never
  consumes quota); `markParseDone` finalizes without touching the counter. The daily
  credit ledger (submission generation) reserves atomically the same way.

---

## 6. What you need to build it

| Component | Choice |
|---|---|
| Queue + worker | pg-boss on Postgres (`apps/worker`) — no Redis |
| Object storage | S3 / Cloudflare R2 — files keyed `workspaces/<id>/...` |
| Local text extract | `pdf-parse`/`pdfjs`, `mammoth` |
| OCR (only if B1) | AWS Textract / Tesseract — defer until B2's cost forces it |
| LLM | Anthropic SDK, `claude-haiku-4-5`, structured output (`packages/ai`) |
| Bulk | Batch API |
| Metering | credit gate (`/credit-gate`) in front of every provider call |
| Dedup | normalized email/phone/name match before insert |

**v1 shortest path:** text-extract what you can locally, send images straight to
Haiku (B2), structured-output extraction, dedup, store — all behind the credit gate
and an idempotent job. Add dedicated OCR and any prompt-cache tuning only if
measurement says they're worth it.
