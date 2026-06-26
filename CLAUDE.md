# hiredesq — Engineering Rules for Claude

hiredesq is an **AI-powered recruitment platform** for solo recruiters (free) and
small agencies of 5–10 (paid). Its north star: *"forward your WhatsApp chats and
messy resumes → instant clean candidate database + see your revenue."* The wedge
is onboarding — **kill the empty state**: a recruiter pastes their mess and watches
it become a clean, searchable DB before committing anything. See [MVP-SPEC.md](MVP-SPEC.md).

It is **multi-tenant** (every firm is a `Workspace`), holds **candidate PII**
(resumes, contacts), tracks **money** (placement fees, revenue), and gates AI
features on **credits**. The rules below are non-negotiable invariants — they
encode the failure modes that would sink the product. Skills, subagents, and
hooks under `.claude/` reference this file.

Monorepo: **pnpm + turbo**. `apps/api` (NestJS/Fastify), `apps/web` (Next.js),
`apps/worker` (pg-boss — the CV-parse pipeline). `packages/*` = `database`
(Prisma + Postgres), `core` (tenancy, credits, domain), `ai` (Anthropic client,
parse prompt + schema), `shared` (types/utils). Deploy: Docker over SSH/rsync to
a droplet (`deploy/`), modeled on the tradex pipeline.

---

## 1. Tenant isolation is sacred

Every firm is a `Workspace`. A single leaked candidate row across workspaces is a
data breach and an existential trust failure for a recruiting product.

- **Every** Prisma read/write on workspace-scoped data MUST filter by
  `workspaceId`. Pattern: `where: { id, workspaceId }` — never `where: { id }`
  alone. A `findUnique`/`findMany`/`update`/`delete` without a `workspaceId`
  predicate on a tenant table is a bug until proven otherwise.
- API controllers are mounted under `workspaces/:workspaceId/...` and guarded by
  `@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)` with
  `@RequirePermission(action, resource)`. New endpoints touching tenant data MUST
  carry the full guard stack. Never read `workspaceId` from the request body —
  only from the authenticated route param.
- **Enforcement is app-layer for v1.** The `workspaceId` predicate above plus the
  guard stack is the *only* thing isolating tenants. Postgres **RLS is a deferred
  hardening step** (add it when the first paying team onboards), not a launch
  requirement — so there is no backstop catching a forgotten predicate. The
  predicate is mandatory, never optional.
- Raw SQL (`$queryRaw`) bypasses Prisma scoping — it must include an explicit
  `workspace_id` predicate and be reviewed.
- File storage keys are namespaced by workspace (`workspaces/<id>/...`); a signed
  URL must never grant access across that boundary.

## 2. Candidate data is PII — protect it

Resumes contain names, emails, phones, addresses, employment history. Treat all
of it as sensitive personal data (GDPR / India DPDP / equivalents apply).

- **Never log PII.** No `console.log`/`logger.log` of resume text, parsed
  candidate fields, contact details, or raw upload bytes. Log IDs and counts, not
  contents. A hook scans edits for the obvious cases — don't rely on it alone.
- Sensitive contact fields are encrypted at rest with `ENCRYPTION_KEY` where the
  schema marks them so; never persist a secret or token in plaintext.
- Support **deletion and export** per candidate/workspace from day one — a delete
  must remove the DB rows *and* the stored files, not just soft-flag.
- When sending resume content to the AI provider for parsing, send only what the
  parse needs; never attach unrelated workspace data to the prompt.
- Uploaded files live in object storage, not the DB; the DB holds a key + metadata.
- **Notifications carry no PII.** A notification's title/body/`data` is counts, ids,
  and system-rendered copy only — never a candidate name, email, phone, or resume
  fragment. The copy is built by the shared `buildNotification` (see *Architecture* +
  [docs/notifications.md](docs/notifications.md)); don't pass contact fields into its
  params.

## 3. Money is Decimal, never float

Placement fees, revenue, pipeline value drive the recruiter's headline dashboard.

- Monetary fields are `Decimal @db.Decimal(14, 2)` in the schema (currency-aware).
  In TypeScript do arithmetic with Prisma `Decimal` / a decimal library —
  **never** JS `number`. `0.1 + 0.2 !== 0.3` loses money.
- A placement fee can be a flat amount or a % of salary — compute and store the
  resolved amount; be explicit about rounding and currency at every boundary.
- A placement carries a **guarantee/replacement window** (e.g. 30 days). Fee booked
  inside the window is **at-risk**, not earned; a fall-through must **reverse** the
  booked amount (full or pro-rated refund) or link a **no-new-fee replacement** —
  exact to the cent, never a float. Revenue numbers distinguish *cleared* (window
  elapsed) from *at-risk*; never present at-risk money as final (MVP-SPEC §2E).
- Money lives as a `Money` value object in `packages/core` (amount + currency +
  rounding), not loose Decimals scattered across services (see *Architecture*).
- The revenue dashboard is a differentiator (incumbents bury it) — its numbers
  must reconcile exactly with the placement records behind them.

## 4. Credits gate every AI action

The free tier is gated by credits; AI volume + team seats are what we charge for
(see [MVP-SPEC.md](MVP-SPEC.md) §4). For **fixed-cost** actions (a parse, a submission —
each a fraction of a cent) credits exist to drive upgrade intent and cap abuse, **not**
to cover COGS. The one exception is the **open-ended AI Mode agent** (FEATURE-SET F10):
its per-turn cost is unbounded, so it is **usage-metered** at Haiku token cost + margin —
see the usage-meter bullet below.

- **Every** AI/parse action MUST check-and-reserve credits *before* the work and
  settle (commit or refund) *after* — atomically, scoped to the workspace. No code
  path calls the AI provider without passing through the credit gate. Use the
  `/credit-gate` skill.
- A failed parse must **refund** the reserved credit — never charge for work that
  didn't produce a result.
- Reservation + settlement is a single transaction (or an idempotent two-phase
  ledger). Concurrent parses must not oversell a workspace's balance.
- The credit balance is a **domain aggregate** in `packages/core` that guards its
  own invariants (balance never negative, reserve→commit/refund lifecycle,
  idempotency). Services go through it — they never mutate a balance row directly
  (see *Architecture*).
- Paid tiers have high/unlimited credits; the *clean database, search, jobs, and
  revenue view are free forever* — never gate those behind credits.
- **Usage-metered surface (AI Mode, FEATURE-SET F10):** the conversational agent is the
  one action billed by **actual usage**, not a flat credit — each turn settles at Haiku
  `tokens × rate × margin`, stored as **integer micro-USD** (never float, §3), through the
  same gate machinery (reserve an estimate → settle the actual, idempotent per turn,
  workspace-scoped, refund on failure). It is an **extension of the credit-ledger
  aggregate**, not a fourth aggregate (Architecture stays at three). Actions the agent
  triggers (e.g. a submission) still draw their own flat meter — no double-charge. This
  does not regate any free-forever surface; the meter applies only to the agent's own AI
  turns. Still: **no code path reaches the AI provider except through `packages/ai` and
  the gate.**

## 5. The CV-parse pipeline is the product

Parsing messy input into a clean candidate is the magic moment. It must be cheap,
correct, idempotent, and resilient. See [docs/cv-parsing-pipeline.md](docs/cv-parsing-pipeline.md)
and the `/cv-parse-pipeline` skill.

- **Model:** `claude-haiku-4-5` for extraction (cheap/fast). Use **structured
  outputs** (`output_config.format` json_schema, or strict tool use) so every
  parse is schema-validated — never free-text-parse the model output.
- **Idempotency:** parses run as **pg-boss jobs** (Postgres-backed queue, no Redis)
  keyed by a content hash; the same
  file parsed twice must not create two candidates or double-charge credits.
- **Dedup on ingest:** the same person across a resume + a chat = one candidate.
  Match on normalized email/phone/name before insert. Candidate identity + matching
  is a **domain service** in `packages/core`, not ad-hoc query logic (see
  *Architecture*). The normalized columns are `@@index`-only (no unique backstop), so
  the find-then-create is serialized by a `pg_advisory_xact_lock` on (workspaceId,
  normalized email/phone) — without it, concurrent ingests of the same person both
  insert. The free ingest quota (Model B) is **pre-reserve + release**
  (`reserveIngestSlot`/`releaseIngestSlot`/`markParseDone`), so concurrent parses
  can't overshoot the cap and a failed parse never consumes quota.
- **OCR only when needed:** text-extractable inputs (PDF text layer, DOCX) skip
  OCR entirely. Image/scanned inputs go through OCR *or* are sent to Haiku as an
  image block — decided per the doc's cost table.
- **Caching caveat:** the parse prompt + schema is small (~hundreds of tokens) and
  **falls below Haiku's 4096-token cache minimum**, so `cache_control` on it
  silently won't cache. Don't assume caching savings on the schema prompt — verify
  `cache_read_input_tokens` before relying on it.
- For bulk imports (a folder of 200 resumes), use the **Batch API** (50% cost,
  async) rather than firing 200 live requests.

## 6. Secrets never touch logs, the DB plaintext, or git

- `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL*`, storage
  keys are secrets. Never `console.log` one, never persist one in plaintext, never
  commit `.env*`. Hooks block the obvious cases — don't rely on them alone.
- Production migrations and deploys go through the reviewed `deploy/` pipeline,
  never an ad-hoc `prisma migrate deploy` against a prod URL from a laptop.

## 7. We don't build outbound job-board features — ever

This is a **permanent product non-goal**, not a deferral. The pain we solve was
never *posting* ads — recruiters already do that in minutes — it was the **chaos
coming back**: CVs arriving scattered across WhatsApp, email, and phone. We win on
the *return path*, not the outbound.

- **Out, permanently:** posting/advertising to external job boards (Bayt, Naukri,
  LinkedIn, Indeed, …); and scraping or programmatically searching third-party
  candidate databases. It's commodity (incumbents own it), legally fraught (board
  ToS prohibit scraping), operationally fragile (scrapers break on every redesign),
  and it's not the moat — the **clean, deduplicated, semantically searchable
  candidate pool** the recruiter builds *inside* hiredesq is.
- **In, and where the effort goes:** the inbound return path — every CV from every
  channel landing **parsed, deduplicated, and attached to the job it was sourced
  for** (MVP-SPEC §2A, job-centric inbound). The recruiter keeps posting ads however
  they already do; hiredesq tames what comes back.
- A feature request to "post to / pull candidates from <board>" is rejected by
  default. If sourcing *from* a board ever resurfaces as a real need, it's a
  separate product decision — re-open it explicitly, don't slip it in.

---

## Architecture: where domain logic lives

Most of the app is **pragmatic NestJS CRUD** (candidates, jobs, search) — module →
controller + service + Prisma, no extra layers. **Tactical DDD applies only to the
three invariant-rich areas**, which live in `packages/core` as pure domain logic
(no Prisma import), reached through a thin repository boundary:

- **Credit ledger** — an aggregate guarding the reserve→commit/refund lifecycle,
  balance-never-negative, and idempotency (§4).
- **Money** — a `Money` value object (Decimal + currency + rounding) for fees and
  revenue (§3).
- **Candidate identity** — a domain service owning the dedup/merge rules, with
  normalized email/phone as value objects (§5).

NestJS services orchestrate and persist; `core` owns the invariants. Don't spread
aggregates, repositories, domain events, or bounded contexts across the CRUD parts
— that's overhead the MVP doesn't need. Keep the domain layer to these three.

**Notifications are a cross-cutting CRUD primitive, not a fourth aggregate.** A
single workspace-scoped in-app feed every module emits into — raise one through
`NotificationsService.emit` (API) or the shared pure `buildNotification` +
`prisma.notification.create` (worker), so both sides produce the byte-identical
shape. In-app only for v1 (no email/push). Worker triggers emit **inside the
exactly-once state transition** they key off, so they don't double-fire. Copy is
**counts/ids only — never PII (§2)**. No event bus, no `packages/core` model. See
[docs/notifications.md](docs/notifications.md).

---

## Workflow conventions

- Commands: `pnpm dev` (docker + turbo), `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm build`. DB: `pnpm db:migrate`, `pnpm db:generate`.
  `pnpm test:integration` runs the DB-backed concurrency/race tests (`*.itest.ts`
  under `apps/{api,worker}/test/`) against a real Postgres — they assert race
  invariants with `Promise.allSettled` and skip cleanly when no DB is reachable, so
  the pure-unit `pnpm test:unit` stays DB-free.
- Match surrounding code: guard stacks, DTO + class-validator, `@map` snake_case
  columns, the adapter pattern in `packages/ai`.
- **One contract, both sides.** Every request/response shape is defined once in
  `packages/shared` (`*Input` / `*Dto`). The API DTO declares `implements <Name>Input`
  and the web client *imports* that same type — never a hand-rolled local copy. This
  is what makes a renamed field a compile error instead of a silent runtime break:
  `ValidationPipe({ whitelist: true })` strips unknown body fields, so a client field
  the DTO doesn't declare just vanishes (the ingest box shipped sending `text` when
  the server wanted `payload` — caught only in prod). Inline bodies in `api.ts` carry
  `satisfies <Name>Input`. A green `pnpm typecheck` across `api` + `web` is the proof.
- Deploy: `./deploy/build.sh` then `./deploy/deploy.sh` (see `/deploy-release`),
  migrations via `deploy/remote/migrate.sh` on the droplet.
- **Lint enforces the statically-checkable invariants** (`eslint.config.mjs`):
  `no-console` (§2/§6), the AI SDK reachable only through `packages/ai` (§4), and
  the `packages/core` domain boundary — no Prisma / NestJS / AI imports
  (Architecture). The non-static ones (the `workspaceId` predicate, money-as-
  `Decimal`) are caught by the review agents, not lint. Prettier config is
  `.prettierrc.json`; the post-edit hook runs both on changed files.
- Prefer the `.claude/` skills and subagents for tenant-isolation audits, credit
  gating, PII review, safe migrations, and the parse pipeline.
