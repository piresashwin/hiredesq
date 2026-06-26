# AI Recruitment Platform — MVP Feature Spec (v1)

> North star: **"Forward your messy CVs and chats → a clean, searchable candidate pool → one-click client-ready submissions → see your revenue."**
> Activation metric: **time-to-first-clean-candidate < 2 minutes**, zero setup, no demo call, no empty state.

The MVP proves the recruiter's loop end-to-end: a recruiter dumps their mess, watches it become a clean searchable pool, runs it **against a real open position**, and produces a **client-ready submission** — all before committing anything. We protect scope ruthlessly, but the loop has a **middle** (qualify → submit) the first draft of this spec under-served. That middle is now in v1.

---

## 1. The two jobs v1 must nail (dual wedge)

**Wedge 1 — Kill the empty state (ingest).** A recruiter pastes/forwards scattered candidate data and within 2 minutes sees a clean, deduplicated, *semantically* searchable candidate pool they didn't have to type.

**Wedge 2 — Produce the daily deliverable (submission).** From a messy CV, one click yields a clean, branded, **client-ready profile with contact details masked** — the thing the recruiter sends to a client *today* and gets paid on. Clean structured data falls out as a byproduct, so this feeds Wedge 1 for free.

The two wedges share a spine: the **job/position** organizes everything — inbound, qualification, submission, and revenue all hang off it.

If v1 does the loop *Ingest → Qualify against a job → Submit to client → Placement → Revenue*, it's a product. The kitchen sink still waits.

> **Why both, and why the spine:** "clean my database" is a back-office benefit that pays off later; "messy CV → client-ready profile" is a same-day, monetizable moment. And real searches aren't backlog dumps — they're constraint-driven hunts (e.g. *8 nurses for Kuwait, residence must be transferable, the few you find have issues*). That reality demands a job-centric spine with a per-candidate qualification trail, not a global pool with a stage chip.

---

## 2. P0 — Must-have

P0 is **two tiers** so the 2-minute activation never blurs into a nine-feature launch:
- **[Launch]** — the demoable, monetizable core: ingest → pool → *keyword* search, the submission co-wedge, auth.
- **[v1.1]** — ships immediately after, before anything in §3: the job spine + trail, semantic search, the constraint filter, job-centric inbound, the full revenue dashboard, credits/billing.

Sequencing is in §7. Both tiers are still pre-§3 (the deferred/non-goal line) — the split is about *focus order*, not whether they ship.

### A. Ingest-anything (the empty-state killer)
- **[Launch] Resume upload / drag-drop** (PDF, DOCX, images) → AI parse → structured candidate profile.
- **[Launch] Paste-a-blob**: paste raw text (a WhatsApp export, an email, a messy note) → AI extracts one or many candidates.
- **[Launch] Bulk**: drop a folder of resumes / a CSV / an Excel sheet → batch parse with a progress view (the "I had 200 resumes in Drive" moment).
- **[v1.1] Forwarding inbox**: a dedicated email address (`you@inbox.hiredesq...`) — forward a resume or chat and it lands parsed. (WhatsApp *export* via paste for v1; live WhatsApp API is P1.)
- **[v1.1] Job-centric inbound**: ingest can be aimed **at a specific open position**, not just the global pool. CVs trickling back from an ad (WhatsApp, email, forward) get collected against the req they were sourced for — the inbound chaos lands organized. (Depends on the job spine, §2C.)

### B. Clean candidate pool + semantic search
- **[Launch]** Auto-extracted fields: name, contact, current role/company, skills, experience, location, source.
- **[Launch] Dedup on ingest** (same person across resume + chat = one record, merged).
- **[Launch]** Keyword/structured filters (skill, role, location, free-text).
- **[v1.1] Semantic search**: meaning-based query over your *own* pool — "ICU nurses with a transferable Gulf visa", not just a skills filter. Sits alongside the keyword filters.
- **[Launch]** Manual edit / correct any parsed field (trust = letting them fix the AI).

### C. Jobs as the spine + trail + constraint filter — [v1.1]
- Create a job/position (title, **client**, status, and the **hard constraints** of the req — e.g. nationality, residence/visa transferable, license).
- Attach candidates to a job; move through a simple stage pipeline (Sourced → Submitted → Interview → Placed → Rejected).
- **Per-candidate trail per position**: structured qualification notes capturing *why each candidate is in or out* against the req — the backbone of a long, hard search.
- **Constraint filter (deterministic — NO AI):** the req's hard constraints are **structured fields**; each attached candidate's parsed fields are shown side-by-side and **filtered/flagged** against them (residence not transferable, license pending, nationality mismatch) so the scarce qualified few surface. This is plain data + a filter — **no AI call, no credit cost** — and it stays firmly on the right side of the deferred *AI ranking/scoring* line (§3).
- This client-wise, per-position structure is what makes the revenue view non-empty.

### D. Client-ready submission (co-wedge)
- **[Launch]** One click: a candidate (messy CV or parsed record) → a **clean, branded, client-ready profile** — formatted, summarized, **contact details masked** so the client can't go direct.
- Masking aligns with the PII invariant (CLAUDE.md §2): the client-facing artifact never leaks raw contact data.
- **[Launch]** Output is shareable (link or export) for the client's review.
- **[v1.1] Tied to a job + client-feedback loop**: a submission links to a candidate **and** a job; generating one advances the candidate to *Submitted* and logs to the trail (§2C). Track the review outcome — **Sent → Viewed → Client verdict (Advance / Interview / Reject)** — which auto-nudges the pipeline stage and writes back to the trail. This closes "send it to the client for review" into the loop instead of leaving it manual. (Depends on the job spine, §2C.)

### E. Revenue visibility — [v1.1]
- Mark a placement → record fee (flat or % of salary).
- **Placement guarantee / replacement period.** A placement carries a **guarantee window** (default ~30 days, configurable per job/client). If the candidate leaves within it, the recruiter either **replaces** (re-place against the same job, **no new fee** — the replacement links to the original placement) or **refunds** (fee reversed, full or pro-rated). Both paths must reconcile to the cent (Money invariant, CLAUDE.md §3 — `Decimal`, never float).
- **Guarantee-aware revenue recognition.** Fee booked at placement is **at-risk** until the window clears; the dashboard splits **revenue cleared** (guarantee elapsed, truly earned) vs **at-risk** (still inside the window), and a fall-through **reverses** the booked amount. Don't show at-risk money as final — that's how the headline number stays trustworthy.
- Dashboard: placements this month, revenue cleared vs at-risk, pipeline value (candidates × stage × expected fee).
- A headline differentiator incumbents bury — keep it one click away.

### F. Account + billing plumbing
- **[Launch]** Auth, single-user workspace.
- **[v1.1]** Free tier with **credit metering** on AI *generation* actions (see §4).
- **[v1.1]** Stripe (or regional equivalent) for the paid upgrade.

---

## 3. Scope boundaries — protect the wedge

### Permanent non-goal (never, not "later")
**Outbound job-board features** — posting/advertising to external boards, and
scraping or searching third-party candidate databases. This is a standing product
boundary, not a deferral; see **CLAUDE.md §7**. The pain was never *posting* — it's
the chaos coming *back*, which §2A's job-centric inbound solves without the
ToS/scraper liability. We win on the return path; commodity outbound stays out.

### Deferred (not in v1, revisited later)

| Deferred | Why it waits |
|---|---|
| Live WhatsApp Business API integration | Paste/export covers the demo; API is heavy (Meta approval, per-message cost). P1. |
| Team tier (5–10 seats, roles, shared pipelines) | v1 proves solo activation first; team is the monetization expansion, not the wedge. |
| **AI candidate↔job ranking / scoring** | Semantic search (§2B) and the deterministic constraint filter (§2C) are now in v1 — they deliver the recall + qualification value even on a small pool, with no AI guess. Full *ranking* (ordered fit scores) still waits until the DB is full and we have signal. |
| Email sequences / outreach automation | Adjacent product; don't dilute the loop. |
| Mobile app | Responsive web is enough to validate. |
| Analytics beyond the revenue dashboard | Vanity until there's data volume. |

---

## 4. Free vs Paid split + credit model

**Principle:** the *clean pool, search, jobs, trail, and revenue view are free forever*; **AI generation volume** and **team** are what you charge for.

- **Free (individual):** full pool, **semantic search**, manual entry, jobs + trail + constraint filter, revenue view — all free. **AI generation** actions (resume parse **and** submission generation) gated by **monthly credits** (e.g. ~50–100 generations/mo). Hitting the cap is the upgrade prompt — never a paywall on day 1.
- **Paid (team, 5–10):** high/unlimited AI credits, multi-seat, shared pipelines, role permissions.

**What costs a credit:** generative AI calls only — a resume parse, a submission generation. **Search and the constraint filter are free** (semantic search is cheap embeddings; the constraint filter is pure deterministic data — no AI call at all; gating recall/qualification would defeat the point of the pool).

**Credit math is safe** — a resume parse on Haiku 4.5 (~2,200 in / ~500 out) costs a fraction of a cent; a submission generation is similar. 100 free generations/mo ≈ pennies of COGS. Credits exist to drive upgrade intent and cap abuse, **not** to cover cost.

> **Scope (ratified — see FEATURE-SET Decision 4):** the "not to cover cost" rule holds for **fixed-cost** actions (parse, submission). The **post-v1 AI Mode agent** (FEATURE-SET F10) is **open-ended**, so it is the one **usage-metered** surface — billed at Haiku token cost + margin, through the same reserve→settle gate. Free-forever surfaces (pool, search, jobs, trail, revenue) stay free; the meter applies only to the agent's own AI turns.

---

## 5. AI architecture notes (carry-over)
- **Haiku 4.5** for parsing/extraction and submission formatting (cheap, fast, structured output). Consider **Sonnet** only for the short client-facing summary prose if Haiku's quality isn't enough — measure first.
- Use a **fixed parsing prompt + JSON schema** with **structured output / tool-use** so parses are validated, not free-text. (Caching caveat per CLAUDE.md §5 — verify cache reads before assuming savings on the small schema prompt.)
- **Semantic search** needs an **embedding model + pgvector** (Voyage is Anthropic's recommended embeddings partner; provider TBD). Embed candidates on ingest; query-time embed the search string. Reached only through `packages/ai` per the SDK boundary.
- Submission masking is a deterministic post-step on the parsed record, not an AI guess — never trust the model to redact.

---

## 6. v1 success metrics
- **Activation:** % of signups who reach a clean candidate within 2 min (the north-star metric).
- **Submission love:** % who generate a client-ready submission in the first session (proves Wedge 2 lands).
- **Ingest love:** avg candidates ingested in first session (the "dumped my whole backlog" behavior).
- **Loop closed:** % who create a job + log a placement.
- **Placement quality:** % of placements that **clear the guarantee window** vs fall through inside it (fall-through rate is a trust + product-honesty signal, and it's what makes "revenue cleared" real).
- **Free→paid intent:** % who hit the credit cap.

---

## 7. Suggested build order

Scope grew, so the order is disciplined: **the 2-minute magic moment ships first**, the loop layers on, monetization last. Steps 1–3 are the **[Launch]** tier; 4–9 are **[v1.1]**.

**[Launch] — demoable, monetizable core**
1. **Resume/blob parse → structured candidate** (the magic moment) + pool + keyword search. *(Activation lives or dies here — ship it alone first.)*
2. Bulk ingest (folder/CSV) + dedup.
3. **Client-ready submission** (Wedge 2) — masked, branded profile from a candidate. *(First monetizable deliverable.)*

**[v1.1] — the loop, shipped right after (still all pre-§3)**
4. Jobs as the spine: client-wise jobs + stage pipeline + per-candidate trail.
5. Deterministic constraint filter against the req's hard disqualifiers + job-centric inbound + submission↔job link + client-feedback loop.
6. Semantic search over the pool (embeddings + pgvector).
7. Revenue dashboard — fee capture, **placement guarantee/replacement window, cleared-vs-at-risk recognition**.
8. Credits + billing + upgrade prompt.
9. Forwarding inbox.

Everything in §3 comes after v1 ships and the activation metric is healthy.
