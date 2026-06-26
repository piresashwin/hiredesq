# hiredesq — Final Feature Set (v1)

> **PM verdict, 2026-06-18.** This document is the canonical v1 scope. It supersedes
> the remaining-work framing in [PLAN.md](PLAN.md), which was written before a
> code-level audit and overstates what's left. The loop is ~80% built. v1 is **one
> feature away from launchable** and **one fix away from trustworthy** — everything
> else is post-launch.

North star (unchanged): **"Forward your messy CVs and chats → a clean, searchable
candidate pool → one-click client-ready submissions → see your revenue."**
Activation metric: **time-to-first-clean-candidate < 2 min.**

---

## 1. The one-paragraph product

hiredesq turns a solo recruiter's mess (scattered CVs, WhatsApp exports, a Drive
folder of 200 resumes) into a clean, deduplicated, searchable candidate pool, lets
them run that pool against a real open position, produces a **client-ready, contact-
masked submission** in one click, and shows them the **revenue** that flows from
placements — distinguishing money *earned* from money still *at risk*. It is
multi-tenant, holds candidate PII, tracks money, and gates AI volume on credits. We
win on the **return path** (taming what comes back from an ad), never on outbound
posting/scraping.

---

## 2. Reality check — what is actually shipped (code-verified)

**Shipped & solid**
- **Ingest-anything + bulk + object storage** — drag/drop PDF/DOCX/image, paste-a-blob,
  folder/CSV/XLSX bulk with batch progress, dedup-on-ingest, R2/S3 storage with
  tenant-namespaced keys + signed URLs. *(PLAN.md calls this "R4, not built" — that
  entry is stale; it's in the repo.)*
- **Clean pool + keyword/structured search**, manual edit/correct, per-candidate
  delete **and** export (DB rows + files), AES-GCM PII encryption at rest.
- **Jobs + stage pipeline** (Sourced → Submitted → Interview → Placed → Rejected),
  weighted pipeline value via the `Money` value object.
- **Revenue dashboard** — fee capture (flat or %-of-salary), booked-this-month,
  trend, pipeline value; reconciles to placement rows. *(Missing the guarantee
  window — see R2.)*
- **Credits** — daily free allotment, lazy UTC-day renewal, reserve→commit/refund
  ledger, 402 on AI paths, upgrade-intent capture. *(Stripe deferred by request.)*
- **Foundation** — real auth + full guard stack (§1), CV-parse worker on Haiku 4.5
  with structured output + content-hash idempotency, full Next.js app. 8 workspaces
  typecheck, lint clean, unit tests green.

**Genuinely missing**
- 🔴 **Client-ready submission (Wedge 2)** — no model/API/UI. *The last [Launch] item.*
- 🔴 **Guarantee / replacement window on revenue** — correctness gap in shipped code.
- 🟠 **Qualification trail + deterministic constraint filter** on the job spine.
- 🟠 **Semantic search** (embeddings + pgvector).
- 🟠 **Forwarding inbox.**

---

## 3. The cut line

Four buckets. The discipline is in the order, not in dropping things.

### 🚀 LAUNCH — ✅ COMPLETE (2026-06-20). Stop and watch the activation metric.
The demoable, monetizable core. All three items shipped, audited, green.
1. **F1 — Client-ready submission (Wedge 2)** · ✅ **SHIPPED** (2026-06-19) — `Submission`
   model + migration; deterministic contact-masking in `packages/core` (all free-text
   scrubbed); Haiku prose via the credit gate; submissions API (full guard stack) +
   public tokenized share endpoint; web generator/preview/share + public share page.
   Audited PII/credit/tenant, findings fixed.
2. **F2 — Revenue guarantee/replacement window** · ✅ **SHIPPED** (2026-06-20) — `Placement`
   gains `guaranteeDays`/`clearsAt`/`status`/`replacesPlacementId`/`retainedAmount`
   (expand-and-contract migration + backfill); fall-through reverses the fee (full or
   pro-rated, to the cent) and replacement carries it forward with no new fee, all via
   `Money`; `revenue/summary` splits **cleared vs at-risk** (cleared is the only earned
   number); web hero splits cleared/at-risk + fall-through/replace actions. Money review
   + tenant audit clean.
3. **F3 — Credit model = Model B: gate submissions, free ingest** · ✅ **SHIPPED** (2026-06-19) —
   parse is free under a 1,000-lifetime ingest quota; the daily-5 meter now gates
   submission generation; 402 copy + web meters updated.

Everything else in "Shipped & solid" above is already in this tier and done.
**The Launch tier is complete — the next move is to ship and watch activation, then
start the V1.1 loop (F4 → F8).** 13/13 typecheck, 89/89 tests, lint clean.

### 📈 V1.1 — the loop, shipped right after launch (still pre-deferred-line)
4. **F4 — Job spine: qualification trail + deterministic constraint filter** (no AI, no credit).
5. **F5 — Submission ↔ job link + client-feedback loop** (Sent → Viewed → verdict, auto-nudges stage).
6. **F6 — Semantic search** over the recruiter's own pool (pgvector).
7. **F7 — Job-centric inbound** (aim ingest at a specific open position).
8. **F8 — Stripe checkout + plan-tier flip** (paid upgrade).

### 🤖 V2 — AI Mode (the fully-AI recruiter), gated on a healthy V1.1
9. **F10 — AI Mode**: a **confirm-before-write** conversational agent (a self-hosted
   Haiku 4.5 tool-use loop) that runs the desk in natural language over the **shipped
   services** — pool search/Q&A, jobs+pipeline, submissions, revenue+placements. Holds
   the deferred ranking/scoring line (it's an orchestration layer, **not** a scorer).
   Introduces the **usage-based (Haiku COGS + margin)** credit meter (Decision 4).
   Additive V2 bet — it does **not** displace any v1 item; ship dark behind a flag,
   dogfood, then enable.

### 🗓️ LATER — real, but only after v1's activation metric is healthy
10. **F9 — Forwarding inbox** (`you@inbox.hiredesq…`).
11. Live WhatsApp Business API · team tier (seats/roles/shared pipelines) · a thin
    host-admin sliver (suspend / comp-credits / delete+audit) once real tenants exist.

### 🚫 NEVER (permanent non-goals, CLAUDE.md §7)
- Posting/advertising to external job boards.
- Scraping or programmatically searching third-party candidate databases.
- **AI candidate↔job ranking/scoring** (ordered fit scores). Semantic search and the
  *deterministic* constraint filter are in v1; *scored ranking* waits for data
  volume — and stays out of v1 entirely so we never ship an AI guess we can't defend.
  **F10 / AI Mode does not breach this:** the agent has no scoring tool — it surfaces
  semantic recall (F6) and the deterministic filter (F4), never an ordered fit-score.

---

## 4. Final feature set — detail

### F1 · Client-ready submission (Wedge 2) — BUILD, launch blocker
*One click turns a candidate into a clean, branded, **contact-masked** profile — the
first same-day monetizable deliverable.*
- `Submission` model (workspace-scoped; links a candidate, optionally a job): stable
  share token, generated-artifact metadata, status (Launch: `Sent`; V1.1 extends to
  `Viewed → Advance/Interview/Reject`).
- **Masking is deterministic, never AI** (§2/§5) — redact contact fields as a post-step
  on the parsed record; never trust the model to redact.
- **AI prose generation goes through the credit gate** (§4) on Haiku 4.5, structured
  output, refund on failure. Search/masking/preview are free.
- API `submissions` module (full guard stack); generate / get / list / shareable
  link + export. Web: generator → preview → share/export, on the design system.
- Reviewers: `pii-privacy-auditor`, `credit-metering-auditor`, `tenant-security-auditor`.

### F2 · Revenue guarantee / replacement window — FIX, trust gate
*The headline number must distinguish **cleared** from **at-risk** and survive a
fall-through to the cent (CLAUDE.md §3, MVP-SPEC §2E).*
- Schema (expand-and-contract): `Placement.guaranteeDays`, derived `clearsAt`,
  `status` (`at_risk | cleared | fell_through | replaced`), self-relation
  `replacesPlacementId`. Backfill past-window rows as `cleared`.
- Domain (`Money`): fall-through **reverses** the fee (full or pro-rated) exactly; a
  replacement re-places against the same job with **no new fee**, linked to the
  original. Never float.
- `revenue/summary` splits **cleared vs at-risk**; only cleared is "earned."
- Web: hero splits cleared/at-risk; placement actions for fall-through + replacement.

### F3 · Credit model — RESOLVED: ship Model B
*The credit meter gates the monetizable output (submissions) and the expansion path
(seats), never the activation moment (ingest). Decided 2026-06-18.*

**The model:**
- **Ingest (parse) is free**, protected by a quota, not a price:
  - **Onboarding grant: 1,000 lifetime free parses.** Covers any realistic solo
    backlog (worst-case COGS ~$5 batched; a typical 500-CV dump is ~$1–2).
  - After the grant, ongoing free ingest is soft-capped at **~100 parses/day** —
    purely an abuse damper; no honest recruiter touches it. Sustained hammering
    trips an upgrade nudge, not a hard wall.
- **Submission generation consumes the daily meter: the existing 5/day, no
  rollover.** This is now the free tier's real credit. Hitting it = genuine upgrade
  intent (they're actively sending candidates to clients). *Lands with F1.*
- **Search, masking, dedup, constraint filter, jobs, revenue stay free** (§4).
- **Paid (team):** high/unlimited submissions + multi-seat (F8/Stripe, later).

**Invariant note (§4):** parse still passes through the credit gate
(reserve→commit/refund, idempotent, refund-on-failure) — it just reserves at **0
daily-credit cost** and is metered against the **ingest quota** instead. The gate
machinery is never removed; only the economic meter moves.

**Ships in two halves:**
1. *Now / F1-independent (unblocks the demo today):* stop drawing parse from the
   daily-5; add the ingest quota (onboarding grant + daily abuse cap); repoint the
   402 pre-check to the quota.
2. *With F1:* submission generation reserves 1 against the daily-5 meter.

### F4 · Qualification trail + deterministic constraint filter — ✅ SHIPPED (2026-06-23)
- Hard-constraint **structured fields** on `Job` (`requiredNationalities`,
  `residenceTransferableRequired`, `requiredLicenses`) + matching parsed/editable
  fields on `Candidate` (`nationality`, `residenceTransferable`, `licenses`);
  the parser extracts them (optional, never guessed) and they enrich the embedding.
- **Deterministic constraint filter** (`jobs/constraints.ts`, pure, unit-tested):
  side-by-side required-vs-candidate with pass/fail/**unknown** (unknown ≠ fail) —
  surfaced as a qualification chip on each pipeline card + a side-by-side drawer.
  **No AI call, no credit** — holds the deferred ranking/scoring line (§3).
- **QualificationTrailEntry** per application (note/qualified/disqualified) with a
  trail UI in the application drawer — the per-position record of why each is in/out.
- Audited tenant (clean) + cv-parse (sound). 96/96 tests.

### F5 · Submission ↔ job link + client-feedback loop — ✅ SHIPPED (2026-06-23)
- A job-linked submission now ensures the candidate sits at *Submitted* and writes a
  "Submitted to client" trail entry on generate.
- **Sent → Viewed** (auto on public-link open) **→ verdict** (Advance / Interview /
  Reject), recorded by the recruiter via `POST :id/verdict`. The verdict auto-nudges
  the pipeline stage **forward-only** (never disturbs a booked win — pure mapping in
  `submissions/verdict.ts`, unit-tested) and appends the decision to the qualification
  trail. Web: status lifecycle badges + a calm "Client verdict" control.
- No AI, no credit (verdicts are free). Tenant audit clean. 102/102 tests.

### F6 · Semantic search — ✅ SHIPPED (2026-06-23)
- **Voyage** embeddings (`voyage-4-lite`, 1024-dim) via `packages/ai` (`embedText` +
  batched `embedTexts`); candidates embedded best-effort at ingest (bulk drops
  batch-embed in one call per 128, not one per candidate), the query embedded as
  `input_type=query` at search time. **pgvector** column + HNSW (cosine) index;
  meaning-based search over the recruiter's **own** pool alongside keyword/fuzzy
  (pg_trgm), with a keyword⇄semantic toggle in the candidates UI. **Search stays
  free** (§4). PII (§2): only the contact-free candidate summary is embedded; raw
  email/phone never leaves. Tenant raw-SQL carries the `workspace_id` predicate (§1).

### F7 · Job-centric inbound — ✅ SHIPPED (2026-06-24)
- Ingest can be aimed at a specific open position (`jobId` on paste body / upload
  `?jobId=`, verified in-tenant §1). Threaded through the queue payloads; the worker
  attaches each resulting candidate to the job's pipeline (`sourced`) idempotently +
  best-effort. `ImportBatch.jobId` carries the target so bulk progress reads "12 CVs
  for {jobTitle}". Web: "Add CVs to this role" on the job board + targeted ingest
  surface. Reuses shipped storage/parse; no new AI/credit.
- Audited tenant + cv-parse (clean; also fixed a pre-existing latent §1 merge-write).
  102/102 tests.

### F8 · Stripe checkout + plan-tier flip — ✅ SHIPPED (2026-06-24)
- `billing` module: owner-only **Checkout** + **billing-portal** endpoints, and a
  **public, signature-verified webhook** (`POST /billing/stripe-webhook`, raw-body)
  that flips `Workspace.plan` free↔team. Workspace resolved from the **verified Stripe
  customer mapping** (never request metadata, §1); downgrades guarded to the current
  subscription (replay/ordering-safe); idempotent. `Workspace.stripeCustomerId`
  (unique) + `stripeSubscriptionId`.
- **Paid tier now delivers**: `applyPlanAllotment` lifts the daily submission cap for
  team (≈unlimited) via the `CreditAccount` aggregate (§4-safe); ingest already
  unmetered for paid. Web BillingPage → real Checkout redirect + Manage-billing +
  success/cancel return states.
- Stripe owns the money — we store only linking ids, never card/amount data (§3/§6).
  Audited tenant (HIGH metadata-trust + MED replay both fixed) + credit (clean).
  111/111 tests. **Operator setup**: `deploy/STRIPE.md` (product/price, webhook, keys).

### F9 · Forwarding inbox — ✅ SHIPPED (2026-06-24)
- Each workspace gets an unguessable, rotatable address `<token>@inbox.hiredesq.com`
  (`Workspace.inboxToken`). A **provider-agnostic** webhook (`POST /inbound/email`,
  shared-secret authed, token→workspace resolve) feeds attachments through the
  shipped upload path and body text through the paste path; **plus-addressing**
  (`<token>+<jobId>@…`) routes to a position (F7). The email front is a **Cloudflare
  Email Worker** (`deploy/email-worker/`, postal-mime → normalized POST) — swappable
  without touching the API. Web: Settings → forwarding address (copy + regenerate).
- Reuses the entire ingest/storage/parse pipeline (no worker change); no new AI/credit
  beyond the existing ingest quota. Audited tenant + PII (both clean). 111/111 tests.
- **Operator setup** (not run from the repo): MX via Cloudflare Email Routing, the
  catch-all → Worker rule, and the shared secret — see `deploy/email-worker/README.md`.

### F10 · AI Mode — the conversational AI recruiter — V2 (post-loop)
*One chat surface where the recruiter runs the whole desk in natural language —
"find ICU nurses with a transferable Gulf visa for the Kuwait req", "draft a masked
submission for Aisha", "what clears in the next 7 days?" — and the system does it. It
adds an **interface**, not a second copy of the loop.*
- **Self-hosted tool-use loop on Haiku 4.5** — **not** Managed Agents: tenant isolation
  is app-layer (§1) and PII cannot leave to a hosted sandbox (§2). The provider call
  lives in `packages/ai` (SDK boundary, §4); the loop, metering, and confirm-gate live
  in a new `apps/api` `agent` module (full guard stack, mounted under
  `workspaces/:workspaceId/…`); **tools are thin wrappers over the shipped services**
  (candidates/jobs/applications/submissions/placements/revenue) so the `workspaceId`
  predicate + guard stack are reused untouched. `workspaceId` is bound from the
  authenticated route param, **never** read from model output.
- **Confirm-before-write.** Read/search/draft tools run inline; every state-changing or
  money-affecting call (create job, move stage, generate submission, record placement)
  renders an in-chat confirmation the recruiter approves before it executes.
- **Holds the ranking/scoring line (§3 NEVER, Decision 3).** There is deliberately **no
  scoring tool** — the agent surfaces semantic recall (F6) and the *deterministic*
  constraint filter (F4); it never emits an ordered AI fit-score. Enforced by
  tool-surface omission, not just prompting.
- **PII (§2):** tool results are masked by default (omit email/phone unless explicitly
  asked); submissions stay deterministically masked (the agent can't bypass it); no raw
  resume bytes to the model; no PII in logs; transcripts encrypted at rest, workspace-
  scoped, and wired into the existing per-candidate/-workspace delete + export.
- **Credit model — usage-metered (§4, Decision 4):** each agent turn settles at **actual
  Haiku tokens × rate × margin**, stored as **integer micro-USD** (never float, §3),
  reserve-estimate→settle-actual, idempotent per turn; free tier gets a generous monthly
  allowance, hitting it nudges upgrade. Actions the agent triggers (a submission) still
  draw their own **flat** meter — no double-charge, no special-casing. The usage meter is
  an **extension of the credit-ledger aggregate** in `packages/core`, not a new aggregate
  (Architecture stays at three).
- **Sequencing:** post-V1.1, gated on healthy activation; ship dark behind a flag,
  dogfood, enable. Reviewers: `tenant-security-auditor`, `credit-metering-auditor`,
  `pii-privacy-auditor`.

---

## 5. Four PM decisions I'm forcing

**Decision 1 — RESOLVED (2026-06-18): ship Model B.** The daily-5 credit model
collided head-on with the activation wedge — a resume parse costing a credit means
"I had 200 resumes in Drive" takes 40 days and paywalls the user 90 seconds in, which
MVP-SPEC §4 forbids. We sized the fear first: a 500-CV dump costs **~$1–2** (Haiku
parse <½¢, batched). Cost isn't the threat; abuse and a failing submission wedge are.
**Resolution:** ingest is free under a quota (1,000-parse onboarding grant + ~100/day
abuse damper), and the daily-5 meter moves to **submission generation** — we gate the
monetizable output, not the magic moment. Full model in F3.

**Decision 2 — Revenue already ships and it's currently lying. F2 is not a feature, it's a correctness fix.**
The dashboard presents booked fees as final with no guarantee window, violating
CLAUDE.md §3 ("never present at-risk money as final"). The headline number is the
differentiator; an untrustworthy one is worse than none. F2 ships *with* launch, not after.

**Decision 3 — Hold the ranking/scoring line. Permanently, in v1.**
Semantic search (recall) and the deterministic constraint filter (qualification) are
in v1 and deliver the search value on a small pool with zero AI guesswork. **Ordered
AI fit-scores stay out** until there's data volume and real signal — shipping a
scored ranking we can't defend erodes trust on the exact surface (qualification) where
recruiters are most skeptical. Keep F4 deterministic.

**Decision 4 — Usage-meter the agent (COGS+margin); scope the "credits aren't for COGS" rule to fixed-cost actions.**
The free-tier credit doctrine (CLAUDE.md §4, MVP-SPEC §4) was written for **fixed-cost**
actions — a parse, a submission, each a fraction of a cent — where credits exist to drive
upgrade intent, not to recover cost. **F10's agent is open-ended:** a single chat turn can
fan out across many tool calls and tokens, so a flat per-turn credit would either paywall
exploration or bleed margin. **Resolution:** AI Mode is the one **usage-metered** surface —
each turn settles at actual Haiku tokens × rate × margin, integer micro-USD (§3), through the
unchanged gate machinery (reserve→settle, idempotent, workspace-scoped). The old rule stands
for everything fixed-cost; only the agent's meter is usage-based. Ratified into CLAUDE.md §4
and MVP-SPEC §4. **This does not regate free-forever surfaces** — pool, search, jobs, trail,
and the revenue view stay free (§4); the meter applies to the agent's own AI turns.

---

## 6. Sequencing

```
LAUNCH GATE   F1 submission ─┬─ F2 guarantee window ─┬─ F3 credit/activation fix → SHIP, watch activation
                             │  (correctness)        │  (don't paywall day 1)
V1.1 (loop)   F4 trail+filter → F5 feedback loop → F6 semantic search → F7 job-centric inbound → F8 Stripe
V2 (AI mode)  F10 AI Mode — confirm-before-write agent over the shipped loop (usage-metered)
LATER         F9 inbox → WhatsApp API → team tier → host-admin sliver
```
F1/F2/F3 are independent and can run in parallel. F5 depends on F1+F4. F7 depends on F4.
F10 depends on the shipped loop (F1, F4–F7), ships behind a flag, and is gated on healthy
post-launch activation — it must not jump the 2-minute wedge or the launch-activation watch.

---

## 7. Success metrics & launch gate

- **Activation:** % of signups reaching a clean candidate < 2 min (north star).
- **Submission love:** % generating a client-ready submission in the first session
  (proves Wedge 2 — and proves F3 didn't strangle it).
- **Ingest love:** avg candidates ingested in first session.
- **Loop closed:** % who create a job + log a placement.
- **Placement quality:** % of placements that **clear** the guarantee window vs fall
  through inside it (this is what makes "revenue cleared" real).
- **Free→paid intent:** % who hit the credit cap.

**Launch gate:** F1 shipped + audited (PII masking, credit gate, tenant), F2 shipped
(cleared-vs-at-risk reconciles to the cent), F3 in place (no day-1 paywall on ingest).
Then stop and watch activation before building the V1.1 loop.
