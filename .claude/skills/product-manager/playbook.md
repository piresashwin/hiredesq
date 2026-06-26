# Product Manager — Playbook

Reference material for the `product-manager` skill. SKILL.md is the doctrine; this is
the toolkit, the canon map, and the market picture. Pull from it; don't recite it.

---

## 1. The canon map (what lives where)

| Doc | Owns | You touch it… |
|---|---|---|
| **CLAUDE.md** | Non-negotiable engineering invariants (§1 tenancy, §2 PII, §3 money, §4 credits, §5 pipeline, §6 secrets, §7 outbound non-goal) + the DDD architecture note | Rarely, and only with explicit user sign-off — these are constitutional |
| **MVP-SPEC.md** | What v1 *is*: dual wedge, [Launch]/[v1.1] tiers, scope boundaries (§3), free/paid split (§4), AI notes (§5), success metrics (§6), build order (§7) | When *scope* or *what-we-build* changes |
| **PLAN.md** | Current shipped state, reconciliation gaps R1–R6, priority/sequence | When *how/when* changes, or a sync sweep finds drift |
| **docs/cv-parsing-pipeline.md** | The parse pipeline design + cost table | When the pipeline design changes |
| **docs/design-system.md** | Token palette, components, UX principles | When UI conventions change |
| **.claude/skills + agents** | Executable expertise (credit-gate, cv-parse, nestjs-module, prisma-migration-safe, brand-voice, viral-content, design-system; + reviewer agents) | When a workflow/convention changes |
| **The code** | What *actually* shipped — final arbiter | To verify any "DONE" claim before trusting it |

**Reconciliation gaps currently open (PLAN.md), keep these warm:**

- **R1 — Wedge 2 client-ready submission** 🔴 [Launch] P0, unbuilt. The same-day
  monetizable deliverable. Masking is deterministic (not AI); generation goes through
  the credit gate.
- **R2 — Revenue guarantee/replacement window** 🔴 correctness fix. Phase 4 shipped
  fees but can't split cleared vs at-risk, reverse a fall-through, or link a no-new-fee
  replacement. Violates SPEC §2E + CLAUDE.md §3.
- **R3 — Job spine: qualification trail + deterministic constraint filter** 🟠 [v1.1].
- **R4 — Ingest-anything + bulk + object storage (R2/Cloudflare)** 🟠.
- **R5 — Semantic search (pgvector + embeddings)** 🟠.
- **R6 — Forwarding inbox** 🟠.

(Verify against PLAN.md on each invocation — these move.)

---

## 2. The sync sweep (checklist)

Run this on any planning/feature/scope ask. Produce a **reconciliation note**, then
edit only if authorized.

**a. SPEC ↔ PLAN coverage**
- Every MVP-SPEC §2 item ([Launch] + [v1.1]) maps to a shipped phase or an R-item?
- Every PLAN phase/R-item traces back to a SPEC clause? (Orphans = drift.)
- Build-order in PLAN matches MVP-SPEC §7 sequencing, or the divergence is explained?

**b. PLAN ↔ code truth**
- Each "DONE" claim verified against schema/services? (Grep the model, the module.)
- Tracked gaps on "done" phases still accurate? (R2/R3 are the template.)

**c. Everything ↔ CLAUDE.md invariants** — does the change implicate one?
- New/changed **AI or parse call** → §4 credit gate (`credit-gate` skill, `credit-metering-auditor`).
- New **tenant-scoped table / endpoint** → §1 workspaceId predicate + guard stack (`tenant-security-auditor`).
- New **contact/PII field** or logging → §2 (`pii-privacy-auditor`).
- Any **fee / revenue math** → §3 Money value object (manual money review + Money tests).
- **Schema/migration** → `prisma-migration-safe` + `db-migration-reviewer`.
- Anything resembling **outbound/board** → §7 hard stop.

**d. Vocabulary consistency** — same concept, same name across all docs:
wedge 1 (ingest) / wedge 2 (submission); the **job spine**; **cleared vs at-risk**;
**constraint filter = deterministic, no AI, no credit**; activation = *time-to-first-
clean-candidate < 2 min*; magic moment.

**Reconciliation note format:**
```
IN SYNC: …
DRIFT: <doc A says X, doc B/code says Y> → <minimal fix, in which doc>
INVARIANT TOUCHED: <§n + which reviewer agent>
RECOMMENDATION: <BLUF>
```

---

## 3. Consulting toolkit (use to clarify, not decorate)

- **RICE** = (Reach × Impact × Confidence) / Effort — for ranking the R-backlog.
  **ICE** when effort is fuzzy. Score in ICP units, not abstractions.
- **MECE** — any landscape/option set must be mutually exclusive, collectively
  exhaustive. If two options overlap or a gap is uncovered, the frame is wrong.
- **Hypothesis-driven:** state "We believe **X**, because **Y**; we'll know we're
  right if **Z** (a metric from MVP-SPEC §6)." Bets, not opinions.
- **So-what laddering:** every finding must end in an action. "Bullhorn costs $10k to
  implement" → so-what → "our zero-setup activation is the wedge — lead with it."
- **2×2s** that earn their axes (e.g. *same-day value* × *moat depth*; *effort* ×
  *activation impact*). Don't force a 2×2 when a ranked list is honest.
- **Opportunity sizing** bottom-up: reachable solo billers × conversion × ARPU;
  desks-per-agency for the team tier. Never headline a top-down TAM.
- **One-pagers (BLUF):** PRD-lite (problem → user → scope → success metric →
  non-goals), decision memo (recommendation → options → rationale → risks),
  reconciliation note. Recommendation first, always.

---

## 4. Competitive & market picture

Keep consistent with the marketing view in `.claude/skills/viral-content` — a divergent
market story between product and marketing is itself drift.

**Recurring villains (position against):**
- **Bullhorn / legacy ATS** — bloat, cost, ~$10k implementation, enterprise-shaped;
  the empty ATS you feed more than it feeds you.
- **The spreadsheet / WhatsApp "CRM"** — what the ICP actually uses today; the chaos
  is the status quo we replace.
- **General CRMs bent into recruiting** — no candidate parsing, no revenue lens, no
  guarantee-window honesty.

**Recurring heroes:** the solo biller; the placement/fee win; the clean deduplicated
pool; the revenue dashboard.

**Four white-space lanes (uncontested — every product bet should deepen one):**
1. **Revenue visibility** — incumbents bury it; recruiters obsess over billings. The
   cleared-vs-at-risk honesty (R2) is the credible version of this.
2. **WhatsApp/spreadsheet chaos → clean DB** — the mess is the hero; viscerally
   relatable (India / US-IT / small agencies); nobody owns it.
3. **Solo-recruiter underdog with personality** — rivals *say* "for solo recruiters";
   none *feel* by-a-recruiter-for-a-recruiter.
4. **Fair/free pricing as a story** — pool/search/jobs/revenue free forever; charge
   only for AI volume + seats. High-trust with a burned crowd.

**The moat (what every feature must serve):** the clean, deduplicated, *semantically
searchable* candidate pool built **inside** Hiredesq + the revenue view. Not outbound,
not scraping (§7), not AI ranking before there's data.

**Research discipline:** competitor pricing/features/funding move — pull live via
WebSearch/WebFetch and **date + cite** every claim. Don't assert market facts from
memory. Land findings as a MECE landscape or white-space map tied to a SPEC/PLAN
consequence, never a link dump.

---

## 5. Recruitment-domain truths (the 15-year lens)

- **Searches are constraint-driven hunts, not backlog dumps.** The hard req (visa
  transferable, nationality, license) disqualifies most of the pool; the value is
  surfacing the scarce qualified few. → why the job spine + trail + deterministic
  constraint filter (R3) exist, and why they're *no-AI, no-credit*.
- **The guarantee/replacement window is real money anxiety.** A fall-through inside
  the window reverses the fee or triggers a no-new-fee replacement. A recruiter who's
  been stung will not trust a tool that shows at-risk money as earned (R2 / §2E).
- **Same-day deliverable beats back-office cleanup** for the demo and for retention:
  "messy CV → masked client-ready profile" (wedge 2) monetizes today; "clean my DB"
  pays later. Sequence wedge 2 early (it's [Launch]).
- **Trust = letting them fix the AI.** Every parsed field is editable; the pool is
  *theirs*. Don't propose flows that lock them out of correcting the machine.
- **The return path is the pain, not the posting.** Recruiters post ads in minutes;
  the chaos is the CVs coming *back* scattered. Job-centric inbound (§2A) tames that —
  the permanent reason §7 outbound stays out.

---

## 6. Decision defaults

- When SPEC and PLAN disagree → SPEC wins; fix PLAN (or propose a SPEC change with
  reasoning, for user sign-off).
- When a "DONE" phase has a known gap → keep it DONE *with the gap tracked as an
  R-item* (the R2/R3 pattern); don't silently reopen or silently hide.
- When new scope is requested → it must **displace** something or wait for the
  deferred list; protect the 2-minute activation. Default answer to scope creep is
  "not in v1 — here's where it queues."
- When asked to build outbound/board features → **no** (§7), with the one-line why.
- When a decision is genuinely the user's (pricing change, invariant change, cutting a
  [Launch] item) → surface options + recommendation, let them choose. Don't decide it
  for them.
