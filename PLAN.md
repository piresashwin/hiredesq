# hiredesq — Phased Implementation Plan

> North star: **"Forward your messy CVs and chats → a clean, searchable candidate
> pool → one-click client-ready submissions → see your revenue."** Activation
> metric: *time-to-first-clean-candidate < 2 min* (see [MVP-SPEC.md](MVP-SPEC.md)).

This plan is grounded in the current codebase state, not the spec alone. It is
**reconciled (2026-06-17) with the revised [MVP-SPEC.md](MVP-SPEC.md)**, which added
a *middle* to the loop — the **qualify → submit** spine. The product is a **dual
wedge** on one spine: *kill the empty state* (ingest) **and** *produce the daily
deliverable* (client-ready submission), both organized by the **job/position**.

Everything in MVP-SPEC §3 stays deferred (incl. any platform-operator / host-admin
console — that is ops tooling outside v1, built only when real tenants exist).

---

## Current state (2026-06-17)

**Shipped / solid**
- Schema — [schema.prisma](packages/database/prisma/schema.prisma): tenancy,
  credits (account + ledger), candidate (encrypted PII), job, application,
  placement, uploads, parse_job, import_batch, duplicate_suggestion, notification;
  tenant-scoped indexes, `Decimal(14,2)` money, idempotency uniques.
- Domain core — [credit-ledger.ts](packages/core/src/credit/credit-ledger.ts),
  [money.ts](packages/core/src/money/money.ts),
  [identity.ts](packages/core/src/candidate/identity.ts) (dedup).
- Real auth + guard stack (§1), AES-GCM PII encryption (§2), the CV-parse worker
  loop (reserve→extract→dedup→store→commit/refund) on Haiku 4.5.
- Phases 1, 3, 4, 5 below are shipped (with the two scope gaps called out).

**Reconciliation gaps surfaced by the 2026-06-17 review** (this revision adds them
to the plan):
- 🔴 **Wedge 2 — client-ready submission is unbuilt.** A **[Launch]-tier P0**
  co-wedge (MVP-SPEC §1, §2D, §7 step 3) with no model, API, or UI. → **R1**.
- 🔴 **Revenue shipped without the guarantee/replacement window.** Phase 4 books a
  fee but cannot split **cleared vs at-risk**, reverse on fall-through, or link a
  no-new-fee replacement — required by MVP-SPEC §2E *and* CLAUDE.md §3 ("never
  present at-risk money as final"). The [Placement model](packages/database/prisma/schema.prisma#L238-L255)
  has no guarantee fields. → **R2** (correctness fix to shipped code).
- 🟠 **Job spine shipped without the trail or constraint filter** (MVP-SPEC §2C):
  no per-candidate qualification trail, no deterministic constraint filter
  (nationality/visa/license — *no AI, no credit*), no hard-constraint fields on
  `Job`. → **R3**.
- 🟠 **Ingest-anything + bulk + object storage** not built (original Phase 2). → **R4**.
- 🟠 **Semantic search** (embeddings + pgvector, MVP-SPEC §2B/§5) absent. → **R5**.
- Forwarding inbox not built (original Phase 6). → **R6**.

---

# Shipped phases

## Phase 1 — Foundation + full frontend design + magic-moment loop  ✅ DONE

> Shipped 2026-06-16. All 6 workspaces typecheck, lint clean, 29/29 unit tests
> pass. Built: shared contracts; AES-256-GCM PII encryption (core) + worker now
> encrypts email/phone and drives ParseJob status/candidateId; initial Prisma
> migration (`20260616151334_init`) applied + seeded; real auth (signup/login/
> refresh/me, HS256 JWT + scrypt) and the real guard stack (Auth/Tenant/
> Permissions) enforcing §1; candidate edit/delete/export + decrypt-at-boundary;
> parse-status + credit-balance endpoints; full Next.js app — shell, API client,
> fixtures, auth screens, live candidate DB + ingest parse-reveal loop, and
> fixture-backed jobs Kanban / revenue dashboard / credits-upgrade. Tests cover
> field-crypto, the credit ledger, dedup, and the cross-tenant guard rejection.

The complete design was built against typed fixtures so later phases **wire screens
to real APIs — they do not redesign**. Contracts live in `packages/shared`.

## Phase 3 — Jobs + pipeline  ✅ DONE (⚠️ trail + constraint filter outstanding → R3)

> Shipped. `jobs` + `applications` NestJS modules (full guard stack, tenant-scoped,
> idempotent attach with P2002-race handling); real pipeline value = Σ in-flight
> apps × `Job.expectedFee` × `STAGE_PROBABILITY` via the `Money` value object
> (migration `jobs_expected_fee`). Jobs index + Kanban wired live and redesigned for
> friendliness (drag + accessible move menu, one-click advance, candidate picker,
> avatars, collapsible Rejected). Tenant audit clean; 45/45 tests.

⚠️ **Gap vs MVP-SPEC §2C:** the stage pipeline shipped, but the **per-candidate
qualification trail** and the **deterministic constraint filter** did not. Tracked
as **R3** below.

## Phase 4 — Revenue visibility  ✅ DONE (⚠️ guarantee window outstanding → R2)

> Shipped. `placements` module — fee resolved server-side via the `Money` value
> object (flat or %-of-salary), stored as Decimal; create runs in one transaction
> that also moves the matching application to `placed`. `revenue/summary` computes
> booked-this-month, placements count, avg fee, 6-month trend, and pipeline value —
> all through `Money`, reconciling to the placement rows (§3). Web dashboard wired
> live. Tenant + money audit clean (single-currency aggregation a documented v1
> boundary); 54/54 tests.

⚠️ **Gap vs MVP-SPEC §2E + CLAUDE.md §3:** the dashboard currently presents booked
fees without a **guarantee window**, so at-risk money can read as final. Closing
this is a **correctness fix**, not an enhancement — tracked as **R2** below.

## Phase 5 — Credits UI + daily renewal  ✅ DONE (Stripe deferred by request)

> Shipped, minus Stripe. Free tier = **5 AI credits per day, reset daily, no
> rollover** (use-it-or-lose-it). Lazy **daily renewal** — `ensureDailyGrant`
> resets the free allotment at a UTC day boundary through the `CreditAccount`
> aggregate's `renew(allotment)` (FOR-UPDATE locked, idempotent-by-day, preserves
> in-flight reservations — a HIGH bug caught + regression-tested in the credit
> audit). `CreditAccount.dailyAllotment` (default 5); credits endpoint returns
> `used` + `resetsAt` (next-day). AI-parse paths pre-check credits and return
> **402 `no_credits`** (CSV/XLSX and all free actions never gated, §4).
> `upgrade-interest` captures intent (no payment). Web billing page + calm
> upgrade invitation wired live; DB/search/jobs/revenue stay ungated. 68/68 tests.
> (Stripe checkout + plan-tier flip remain when payments are wanted. Reset boundary
> is UTC for v1 — revisit for local-timezone resets.)

## Phase 6 — Notifications (cross-cutting primitive + first trigger)  ✅ DONE (triggers 2–3 gated → R7)

> Shipped 2026-06-26. A **reusable in-app notification primitive** any module emits
> into — *the* systematic delivery path, built as pragmatic NestJS CRUD (no
> domain-event bus, no `packages/core` aggregate; tactical DDD stays the three §
> areas). `Notification` model (workspace-scoped, nullable `userId` for seat-targeting
> later, `type`/`title`/`body`/`data` JSON, `readAt`), expand-only migrations
> (`add_notifications` + `notification_feed_index`). Shared `buildNotification()` pure
> renderer so API `emit()` and the worker produce one byte-identical shape (one
> contract, §). `notifications` API module — full guard stack, `@RequirePermission(_,
> "notification")`, list (`?unreadOnly`) / unread-count / mark-read / mark-all-read,
> cross-tenant negative test. Web: `NotificationBell` in the top bar (unread badge,
> 60s poll + refetch-on-focus, design-system tokens). **Delivery is in-app only for
> v1** (no email/push — deliberate scope choice). `pnpm typecheck`/`lint` clean;
> 124/124 unit tests. Tenant + migration + PII audits all clean.
>
> **Trigger 1 — bulk-upload-complete** ships with it: the worker emits inside the
> exactly-once `bumpBatch` `processing→done` flip (idempotent, fires once per batch)
> with a counts summary. Serves the §2A "I dropped 200 resumes" activation moment.

---

# Remaining work (reprioritized to MVP-SPEC §7 order)

Priority follows the spec's logic: the missing **[Launch]-tier** wedge first, then
the correctness gap in shipped revenue, then the job-spine differentiators, then the
remaining ingest channels and semantic search. Each item **wires to existing
fixture-built screens where they exist — no redesign**.

## R1 — Wedge 2: client-ready submission  🔴 [Launch] P0, currently missing

*Goal: one click turns a candidate into a clean, branded, **contact-masked**
client-ready profile — the first same-day monetizable deliverable (§2D).*

- **Schema:** `Submission` model (workspace-scoped, links candidate **and**,
  optionally, a job) — status `Sent → Viewed → verdict(Advance/Interview/Reject)`,
  a stable share token, generated-artifact metadata. Migration via
  `/prisma-migration-safe`.
- **Masking is deterministic, not AI** (§5): redact contact fields as a post-step
  on the parsed record — never trust the model to redact (§2 PII).
- **AI generation** (the branded summary prose) goes **through the credit gate**
  (§4, `/credit-gate`) on Haiku 4.5 with structured output; refund on failure.
  Search/filter stay free.
- **API:** `submissions` module via `/nestjs-module` (full guard stack); generate,
  get, list, shareable link/export. Generating one **advances the candidate to
  Submitted and logs to the trail** (depends on R3 for the job-linked path; the
  pool-only path ships first).
- **Web:** submission generator + preview + share/export; build to the design
  system (`/design-system`).
- Reviewers: `pii-privacy-auditor` (masking), `credit-metering-auditor` (gate),
  `tenant-security-auditor`.

## R2 — Revenue guarantee / replacement window  🔴 correctness fix to shipped Phase 4

*Goal: the headline number distinguishes **cleared** from **at-risk** and survives a
fall-through to the cent (§2E, CLAUDE.md §3).*

- **Schema (expand-and-contract):** add to `Placement` a `guaranteeDays` (default
  per job/client), a derived `clearsAt`, a `status` (`at_risk | cleared |
  fell_through | replaced`), and a self-relation `replacesPlacementId` for no-new-fee
  replacements. Backfill existing rows as `cleared` if past window.
- **Domain (`Money`):** fall-through **reverses** the booked fee (full or pro-rated)
  exactly; a replacement re-places against the same job with **no new fee**, linked
  to the original. All arithmetic through the `Money` value object — never float.
- **Revenue recognition:** `revenue/summary` splits **cleared vs at-risk** (window
  elapsed vs in-window); cleared is the only "earned" number. Reconciles to the
  placement rows exactly.
- **Web:** dashboard hero splits cleared/at-risk; placement actions for
  fall-through (reverse) and replacement.
- Reviewer: `credit-metering-auditor` is N/A; this is money — careful manual money
  review + the `Money` tests.

## R3 — Job spine: qualification trail + deterministic constraint filter  🟠 [v1.1] §2C

*Goal: the per-position structure that makes the revenue view non-empty and powers
the hard, constraint-driven search.*

- **Schema:** hard-constraint fields on `Job` (e.g. nationality, residence/visa
  transferable, license) as **structured fields**; a `QualificationTrail` /
  trail-entry model per attached candidate per job (why each is in/out).
- **Constraint filter (NO AI, NO credit, §2C/§4):** show each attached candidate's
  parsed fields side-by-side against the req's hard constraints; flag mismatches
  (residence not transferable, license pending, nationality mismatch). Pure
  deterministic data + filter — stays on the right side of the deferred *AI
  ranking/scoring* line (§3).
- **Job-centric inbound (§2A):** ingest can be aimed **at a specific open
  position**, not just the global pool (depends on R4 storage for forwarded files).
- **Web:** trail UI on the job/candidate detail; constraint side-by-side + flags.

## R4 — Ingest-anything + bulk + object storage  🟠 (original Phase 2)

*Goal: the "I had 200 resumes in Drive" moment.*

- **Object storage: Cloudflare R2** (S3-compatible, no egress) behind an adapter;
  keys namespaced `workspaces/<id>/...` (§1); signed URLs never cross the boundary.
- File upload → `UploadedFile`; type-detect (PDF text layer / DOCX → text path;
  images → Haiku vision path, already routed in worker).
- Folder / CSV / Excel → many `ParseJob`s; **Batch API** for bulk (50% cost, async)
  per §5.
- **Web:** wire the Phase-1 bulk-progress + dedup-confirm screens to live status. No
  redesign.
- Reviewers: `cv-parsing-reviewer`, `pii-privacy-auditor`.

## R5 — Semantic search over the pool  🟠 [v1.1] §2B/§5

- Embedding model + **pgvector**; embed candidates on ingest, embed the query at
  search time. Meaning-based query over the recruiter's **own** pool ("ICU nurses
  with a transferable Gulf visa"), alongside the existing keyword filters.
- Reached only through `packages/ai` (SDK boundary). Search stays **free** (§4).

## R6 — Forwarding inbox  🟠 (original Phase 6)

- Dedicated `you@inbox.hiredesq…` address; inbound-email webhook → ingest pipeline
  (attachments + body). Reuses R4 storage + the Phase-1 parse path; routes to the
  job-centric inbound path (R3) when addressed to a position.

## R7 — Notification triggers 2–3 (at-risk window + low-balance nudge)  🟠 gated on R2 / billing

*Goal: extend the shipped Phase 6 primitive with the two triggers whose source
features aren't live yet — emit through the same `NotificationsService.emit` /
`buildNotification`, no new infra beyond a scheduled sweep.*

- **Trigger 2 — at-risk placement nearing window end** (gated on **R2**): once the
  guarantee window ships, a **daily pg-boss scheduled sweep** (the one genuinely new
  piece of infra — pg-boss is event-triggered only today) queries `Placement` where
  `status = at_risk AND clearsAt` falls inside an N-day window and emits per
  placement, deduped (a sent-key so it pings once per threshold). Highest **money**
  value — the moment to add an email channel if/when channels expand. Reconciles to
  the placement rows (§3); reads balances/fees through `Money`, never raw.
- **Trigger 3 — low-balance / cap-hit nudge** (gated on **billing**, §2F): **not**
  "credits expiring" — the credit model is daily use-it-or-lose-it (Phase 5), nothing
  accrues to expire. Emit when the balance crosses a low threshold or a parse is
  blocked with `no_credits`, wired to the upgrade prompt (drives the §6 free→paid
  metric). Routes through the credit aggregate (§4) — never reads a balance row
  directly.
- **Deferred within R7:** email/push channels, per-seat targeting (the `userId`
  column is already there), and notification preferences — all wait until in-app +
  the team tier justify them.

---

## Deferred (MVP-SPEC §3 — do not build in v1)

Live WhatsApp Business API · team tier (seats / roles / shared pipelines) ·
**platform-operator / host-admin console** (ops tooling — build a thin
suspend/comp-credits/delete+audit sliver only when real tenants exist; full
cross-tenant analytics & subscription/seat management stay deferred) · job-board /
LinkedIn scraping (permanent non-goal, §7) · AI candidate↔job **ranking/scoring**
(semantic search + the deterministic constraint filter are in v1; ordered fit scores
wait for data) · email sequences · mobile app · analytics beyond the revenue
dashboard.

> **Post-v1 (V2): F10 · AI Mode** — a confirm-before-write conversational agent (a
> self-hosted Haiku 4.5 tool-use loop) over the shipped services; **usage-metered**
> (Haiku COGS + margin), and it **holds the ranking/scoring line** (no scoring tool).
> This doc is superseded by [FEATURE-SET.md](FEATURE-SET.md) — F10 is specified and
> sequenced there (cut line §3, detail §4, Decision 4 §5).
