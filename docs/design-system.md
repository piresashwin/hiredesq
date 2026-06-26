# hiredesq — Design System & Guidelines (v1)

> Companion to [MVP-SPEC.md](../MVP-SPEC.md) and [CLAUDE.md](../CLAUDE.md).
> Scope: the product the MVP actually ships — ingest/onboarding, candidate DB,
> jobs/pipeline, revenue dashboard. Everything here serves the north star:
> **"forward your mess → clean DB + see your revenue, in under 2 minutes."**

This is a *design* document, not a component library spec. It defines the
principles, the visual language (tokens), the component behavior, and — most
importantly — a **recruiter we run every decision past**. If a choice doesn't
survive her, it doesn't ship.

---

## 0. Meet the recruiter we design for

Every design decision in this doc is stress-tested against one person. When in
doubt, ask: *"What would Priya do, and would this slow her down?"*

**Priya — solo recruiter, 1-person desk, growing toward a 3-person agency.**

- Places 2–4 candidates/month; each placement is ₹/$ thousands in fees. Money is
  not abstract to her — it's rent.
- Lives in **WhatsApp, Gmail, Excel, and a phone call**. Her "ATS" today is a
  spreadsheet + her inbox + her memory. She has 200+ resumes in a Drive folder.
- **Not technical.** Has never "configured" software and won't start. If onboarding
  asks her to set up fields, pick a workflow, or watch a demo, she closes the tab.
- **Time-poor and mobile-half-the-day.** Sources candidates between meetings, on a
  phone, one-handed. Does focused data work at a laptop in the evening.
- **Has been burned by Bullhorn-class tools**: "slow," "cluttered," "too many
  clicks," "looks like 2009," "I had to enter everything twice." Her bar for trust
  is low and her patience is lower.
- **What earns her trust:** speed, seeing her own data appear instantly, being able
  to fix the AI when it's wrong, and a number that says *how much money she's made*.

> Priya's one-line verdict test, applied throughout this doc:
> **"Does this get me to my candidates and my money faster than my spreadsheet — without making me learn anything?"**

---

## 1. Design principles (the non-negotiables)

These are derived directly from the incumbent failure modes (slow, cluttered,
many clicks, config-heavy, dated) and from the north star.

1. **Speed is the brand.** Perceived performance is the #1 feature. Optimistic UI,
   skeletons over spinners, instant local feedback. If something takes >400ms,
   show progress, never a frozen screen. *Priya left Bullhorn because it was slow;
   we win on the opposite.*

2. **Kill the empty state.** No screen is ever a blank "create your first X." The
   first screen is an **ingest surface that already invites her mess in**. The DB
   populates before she's committed to anything. (MVP-SPEC §1, §2A.)

3. **Zero config to value.** No setup wizard, no field mapping, no "choose your
   pipeline." Smart defaults everywhere; customization is opt-in and deferred. She
   reaches a clean candidate without a single settings decision.

4. **Density with hierarchy.** Recruiters scan lists of dozens of people. Default
   to **information-dense, table-first** layouts — but with strong typographic
   hierarchy so density never reads as clutter. *More rows visible = fewer clicks =
   her spreadsheet replaced, not mimicked badly.*

5. **One click to the money.** The revenue view is a differentiator incumbents
   bury. It's a top-level destination, always one click away, never behind a
   reports menu. (MVP-SPEC §2D.)

6. **Trust through correction & transparency.** The AI will be wrong sometimes.
   Every parsed field is **visibly editable in place**; AI-derived data is marked
   as such; low-confidence extractions are flagged, not hidden. Trust = letting her
   fix it. (MVP-SPEC §2B.)

7. **Calm by default, loud only for money and errors.** Color and emphasis are a
   budget. Spend them on revenue figures, placement wins, destructive actions, and
   PII-deletion confirmations — not on chrome.

8. **Mobile-respectful, desktop-optimal.** Sourcing and quick lookups must work
   one-handed on a phone; heavy data work (bulk import, editing) is laptop-first.
   Responsive, not a separate mobile app (MVP-SPEC §3).

> **Recruiter check:** Priya never sees a blank screen, never configures anything,
> always sees more candidates per screen than her spreadsheet showed, and her
> revenue is one tap away. ✅ All eight principles map to a thing she'd actually
> notice.

---

## 2. Brand personality & tone

**Personality:** *Fast, sharp, quietly premium, on her side.* Think "a really good
assistant," not "enterprise software." Modern fintech-adjacent confidence (because
money is core) without the coldness — warm enough that a solo recruiter feels it's
*for her*, not for an HR department.

**Voice & microcopy:**
- Plain, direct, recruiter-native language. "Add candidates," not "Ingest records."
  "This client," not "Account entity."
- Active and reassuring during AI work: *"Reading 12 resumes…"*, *"Found 11
  candidates, 1 looked like a duplicate of Sarah Chen — merged."*
- Celebrate the money moments without being cheesy: *"Placement logged. +$8,000
  booked this month."*
- Never blame the user. On a bad parse: *"Couldn't read this one — want to paste
  the text?"* not *"Invalid file."*

> **Recruiter check:** Priya reads UI copy the way she reads a WhatsApp from a good
> colleague — fast, no jargon, knows what to do next. ✅

---

## 3. Color system

Strategy: a **neutral, near-white workspace** (long sessions, lots of text/data,
low eye strain) + **one confident brand color** for action + **strict semantic
colors** for money, pipeline stages, and risk. Color is rationed (Principle 7).

### 3.1 Brand & neutrals

Locked direction (matches the committed `tailwind.config.ts`) — a **calm
teal-green** primary that means *placements / growth / revenue*, with a
**terracotta** accent for warmth and win moments, on a warm off-white canvas.
Teal-green doubles as the money color (revenue = the brand), and it sidesteps the
sea of recruiting-blue incumbents.

| Token (CSS var) | Hex | Use |
|---|---|---|
| `--color-brand` (primary) | `#2F6F5E` | Primary buttons, active nav, links, focus |
| `--color-brand-hover` | `#255A4C` | Primary hover/active |
| `--color-brand-tint` | `#E9F1EE` | Selected rows, subtle highlights, AI chips |
| `--color-accent` | `#E07A5F` | Terracotta — win moments, sparing highlights |
| `--color-canvas` | `#F7F6F3` | App background (warm off-white, not stark) |
| `--color-surface` | `#FFFFFF` | Cards, tables, panels |
| `--color-subtle` | `#F0EEE9` | Section backgrounds, table header, hover rows |
| `--color-line` | `#E4E1DA` | Hairlines, dividers, input borders |
| `--color-ink` | `#1A1A2E` | Headings, names, primary values (text-strong) |
| `--color-muted` | `#6B6B78` | Labels, metadata, timestamps, secondary |
| `--color-faint` | `#A3A3AD` | Placeholders, disabled |

> Neutrals are a warm gray on a warm off-white canvas rather than cold slate —
> softer for the all-day, list-heavy sessions Priya runs, and it reads less
> "corporate IT." Body text (`--color-ink`) over canvas clears WCAG AA easily.

### 3.2 Semantic — money & status

Money reuses the **brand teal-green** so revenue literally *is* the brand —
reinforcing the "placements / growth" identity every time a number appears.

| Token | Hex | Use |
|---|---|---|
| `--color-money` / `--color-success` | `#2F6F5E` | Revenue figures, placements, "booked" (= brand) |
| `--color-success-tint` | `#E9F1EE` | Win backgrounds, placement toasts |
| `--color-warning` | `#C17A35` | Low credits, low-confidence parse, attention |
| `--color-warning-tint` | `#FAF2E6` | Warning banners (e.g. "12 credits left") |
| `--color-danger` | `#C0392B` | Delete PII, reject candidate, hard errors |
| `--color-danger-tint` | `#FBEAE7` | Destructive confirm surfaces |
| `--color-info` | `#3F7C92` | Neutral informational, AI-processing states |

> Warning is a warm amber and danger a warm brick red — chosen to sit in the
> teal/terracotta family rather than fight it with a stock blue-red.

### 3.3 Pipeline stage colors

The pipeline (Sourced → Submitted → Interview → Placed → Rejected) needs colors
that read as **progression**, with Placed = the money green and Rejected = muted
(not alarming red — a rejection isn't an error).

| Stage | Token | Hex | Rationale |
|---|---|---|---|
| Sourced | `--color-stage-sourced` | `#8A8782` (warm stone) | Neutral, just entered |
| Submitted | `--color-stage-submitted` | `#3F7C92` (blue) | In motion to client |
| Interview | `--color-stage-interview` | `#E07A5F` (terracotta) | Heating up — the warm accent |
| Placed | `--color-stage-placed` | `#2F6F5E` (brand green) | The win = money color |
| Rejected | `--color-stage-rejected` | `#A8A29E` (muted gray) | Closed, low-emphasis, *not* red |

> **Recruiter check:** "Is my dashboard going to be a Christmas tree?" No — the
> canvas is calm white/stone; green appears only where her money is; red only on
> things she could regret. The pipeline reads as a journey, and a rejection doesn't
> scream "FAILED" at her. ✅

### 3.4 Dark mode

Deferred for v1 (not on the activation path). Tokens are defined as CSS variables
so a `[data-theme="dark"]` override is a later, contained change — don't build two
palettes now.

---

## 4. Typography

Recruiters read **names, numbers, and short fields** at a glance. Optimize for
scannability and number legibility, not editorial prose.

- **UI / body:** the system sans stack ships today (`ui-sans-serif, system-ui,
  Segoe UI` — see the config) for zero font-loading cost and a native feel.
  Adopting `Inter` later is a one-line `next/font` swap if we want a more
  branded character — keep the budget at one family either way.
- **Numerals:** use **tabular figures** (the `.nums` / `tabular-nums` utility) for
  all money, counts, and table data so columns align and digits don't jump.
- **No separate display face** for v1 — the sans at large weights covers headings
  (speed + simplicity).

### Type scale (rem, 16px base)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-display` | 30 / 36 | 700 | Revenue headline number, win moments |
| `text-h1` | 24 / 32 | 600 | Page titles |
| `text-h2` | 20 / 28 | 600 | Section headers, candidate name on profile |
| `text-h3` | 16 / 24 | 600 | Card titles, sub-sections |
| `text-body` | 14 / 20 | 400 | Default UI text, table cells |
| `text-sm` | 13 / 18 | 400 | Secondary metadata in dense rows |
| `text-label` | 12 / 16 | 500, +0.02em | Field labels, table headers (uppercase optional) |
| `text-mono-num` | 14 / 20 | 500, tabular | Money & IDs |

> **14px is the default body size**, not 16px — recruiters scanning 40-row lists
> want density. We buy back legibility with generous line-height and strong
> contrast, not larger type.

> **Recruiter check:** Priya's candidate list shows ~2× the rows her 16px-everything
> competitor shows, money columns line up like a bank statement, and the revenue
> number is the biggest thing on the dashboard. ✅

---

## 5. Spacing, layout & density

- **4px base grid.** Spacing tokens: `4, 8, 12, 16, 24, 32, 48`. Most in-component
  spacing is `8`/`12`; section gaps `24`/`32`.
- **Density modes are real.** Tables/lists default to a **compact** row (40px),
  with a comfortable mode (52px) toggle for profile/edit views. Compact is the
  default because Priya's mental model is a spreadsheet.
- **Radius:** `--radius-sm: 6px` (inputs, chips), `--radius-md: 10px` (cards,
  buttons), `--radius-lg: 14px` (modals, dropzone). Rounded-but-not-pill — modern,
  not playful-toy.
- **Elevation:** flat-first. Borders (`line`) + `subtle` backgrounds do most separation work.
  Shadows reserved for things that float (dropdowns, modals, drag previews, toasts).
  - `shadow-sm`: `0 1px 2px rgba(28,25,23,.06)` — cards on hover, sticky headers
  - `shadow-md`: `0 4px 12px rgba(28,25,23,.10)` — popovers, dropdowns
  - `shadow-lg`: `0 12px 32px rgba(28,25,23,.16)` — modals, drag ghost

### App shell

```
┌───────────────────────────────────────────────────────────┐
│  Top bar:  hiredesq   [ + Add candidates ]   ◷credits  ⚙ ●  │  ← primary CTA always here
├──────────┬────────────────────────────────────────────────┤
│ Sidebar  │                                                  │
│ • Candid.│   Content area (list / pipeline / dashboard)     │
│ • Jobs   │                                                  │
│ • Revenue│                                                  │
│ ─────────│                                                  │
│ Search ⌘K│                                                  │
└──────────┴────────────────────────────────────────────────┘
```

- **4 destinations max** in the sidebar (Candidates, Jobs, Revenue, + Search).
  Resist menu growth — every added item is a vote against Principle 3.
- **"Add candidates" is a persistent primary button in the top bar**, present on
  every screen. Ingest is never more than one click away — it's the core loop.
- **⌘K / global search** is first-class: Priya thinks in "find me that Python dev
  in Bangalore," not "navigate to candidates → filter."

> **Recruiter check:** Four things in the nav, one big "Add" button she can always
> see, and search she can summon from anywhere. She never feels lost and never
> hunts for "where do I put the new resume." ✅

### Page header & body (every top-level screen)

One structure, one treatment, no exceptions. The header says *what the page is* and
offers *the one thing you'd do from it* — **nothing else**. Everything that *operates
on the data* lives in the **body**. Use the shared `PageHeader` (`components/ui/`);
don't hand-roll the band per page, or they drift (the symptom: Candidates shipped
with no subtitle while Jobs/Revenue had one).

```
┌─ HEADER — sticky, bg-canvas/95 backdrop-blur, border-b, content capped 2xl ─────┐
│  Title (text-h1)                                          [ Primary action ]    │
│  Subtitle (text-sm text-muted, one line)                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
┌─ BODY — content capped 2xl ────────────────────────────────────────────────────┐
│  [ 🔍 search ........................ ] [ ⌨ Keyword | ✦ Semantic ]  12 results  │  ← toolbar leads the body
│  ──────────────────────────────────────────────────────────────────────────────│
│  Table / list / board / dashboard (the work)                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Header — only these three things:**
- **Title** — `text-h1`, **required**. One or two words; the page's name.
- **Subtitle** — `text-sm text-muted`, **required**, one line. What the page is *for*,
  in Priya's words ("Your clean, searchable talent pool."). Missing it is a bug.
- **Primary action** — **at most one** `Button variant="primary"` (`sm`), top-right:
  the highest-order action for that page (`Add candidates`, `New job`). Pages with no
  create action (Revenue) carry none — never invent one to fill the corner. (A low-key
  secondary, e.g. duplicate-review, may sit beside it, but only one *primary*.)
- **Treatment** — sticky `top-14`, `bg-canvas/95 backdrop-blur`, `border-b border-line`,
  full-bleed band with content capped at `max-w-screen-2xl` and centered (so it doesn't
  stretch on wide monitors). Home's warm gradient band is the **single sanctioned
  exception** (the first-run welcome). It stays sticky so the primary action stays
  reachable while the body scrolls.

**Body — the work, and the controls that drive it:**
- The **search box, filters, mode toggles, and result count** belong **in the body**,
  not the header — they operate on the data, so they live with it. They form a **toolbar
  that leads the body** (first block, `mb-4`), above the table/list. The count sits in
  that toolbar, never competing with the header's primary button. *(Decided 2026-06-26:
  search moved out of the header into the body — the header is identity + action only.)*
- **Search-mode toggle** is **icon + label**: `⌨ Keyword` (`TypeIcon`, the calm default)
  ⇄ `✦ Semantic` (`SparkleIcon`, meaning-based). Both modes carry an icon — not just one.
- This page-scoped search is **not** the global ⌘K spotlight (that lives in the sidebar
  and is summoned from anywhere).
- The body owns its own loading / empty / error states (empty = guided ingest CTA, never
  a blank void — Principle 2).
- **Tables paginate + carry row actions** *(decided 2026-06-26)*: every list-backing
  table is **server-side paginated** (the shared `Paginated<T>` envelope + the numbered
  `Pagination` pager in `components/ui/`, sat in the body footer) and every row carries a
  **3-dot kebab** (`Menu` + `MoreIcon`) for its per-row actions (open / export / edit /
  delete). A relevance *search* may return a single bounded page rather than offset-paging
  fuzzy ranks — only the browse list needs true paging. See the fullstack-developer agent
  for the exact contract (count's `where` must match the findMany's tenant scope).

> **The test:** if an element *names* the page or *is its single top action* → header.
> Everything else — the data and every control that filters, searches, or sorts it → body.

**Detail views** (e.g. a job's Kanban at `/jobs/:id`) are the exception to "use
`PageHeader`": they keep a richer hand-rolled header (back-link + contextual stat like
pipeline value) — but the same law applies, so view/sort/filter controls (the board⇄list
toggle) belong in the **body**, not that header.

---

## 6. Components

Build on **Radix primitives + a thin Tailwind component layer** (shadcn/ui-style):
accessible, headless, no heavy UI dependency, full control of tokens. This matches
the project's Tailwind setup and keeps a11y correct by default.

### 6.1 Buttons

| Variant | Use | Style |
|---|---|---|
| Primary | The one main action per view (Add candidates, Log placement) | `brand` fill, `brand-fg` text |
| Secondary | Common alternative actions | `surface` bg, `line` border, `ink` text |
| Ghost | Low-emphasis (table row actions, cancel) | transparent, hover `subtle` |
| Destructive | Delete PII, reject | `danger` fill or text + confirm |

Implemented in [Button.tsx](../apps/web/src/components/ui/Button.tsx).

Heights: `sm 32px`, `md 40px` (default), `lg 48px`. One primary per screen.

### 6.2 The ingest surface (the most important component)

This *is* the empty-state killer (Principle 2). It's a large, inviting **dropzone +
paste box hybrid**, present as the first screen and behind "Add candidates."

- Big `--radius-lg` dashed dropzone: *"Drop resumes, a folder, a CSV — or paste a
  WhatsApp chat / email below."* Accepts PDF, DOCX, images, folders, CSV/XLSX.
- A always-visible **paste textarea** under it ("Paste anything messy here").
- On drop/paste → immediate **per-item parse cards** appear, streaming results
  (see Motion §8). Each card: filename/source → spinner → extracted name + role +
  contact, with a green check or a "needs review" flag.
- **No "upload then click parse" two-step.** Drop = it starts.

```
╭───────────────────────────────────────────────╮
│   ⬆  Drop resumes, a folder, a CSV…             │
│      or click to browse                          │
│   ┌─────────────────────────────────────────┐  │
│   │ …or paste a WhatsApp chat / email here    │  │
│   └─────────────────────────────────────────┘  │
╰───────────────────────────────────────────────╯
   ▸ priya_resume.pdf      ✓ Sarah Chen · Sr. PM · Bangalore
   ▸ chat_export.txt       ⟳ reading… found 3 people
   ▸ old_cv_scan.jpg       ⚠ low confidence — review name
```

> **Recruiter check:** This is the 2-minute promise made visible. Priya dumps her
> Drive folder and *watches* names appear — the exact "holy shit it works" moment
> the wedge depends on. She doesn't learn a flow; she dumps and watches. ✅

### 6.3 Candidate list (table-first, dense)

The home surface once she has data. Spreadsheet-grade density, app-grade polish.

- Columns: **Name** (strong) + tiny source icon, **Role @ Company**, **Location**,
  **Skills** (chips, truncated), **Stage** (if on a job), **Updated**. Money/owner
  later.
- 40px compact rows, zebra-free (use hover + hairlines), sticky header, sticky
  search/filter bar.
- **Inline everything:** click a cell to edit; hover a row for quick actions
  (attach to job, edit, delete). No "open record to change one field."
- Bulk select → bulk actions (attach to job, export, delete) — recruiters work in
  batches (the "200 resumes" reality, and the review-noted "bulk submission" gap).
- Row click → **slide-over profile panel** (not full navigation), so she keeps her
  place in the list.

> **Recruiter check:** It looks and moves like her spreadsheet but it dedupes,
> searches, and never makes her retype. She's not learning a database; she's using
> a better grid. ✅

### 6.4 Candidate profile (slide-over / detail)

- Header: name (`h2`), role @ company, contact actions (call/email/WhatsApp
  buttons — she lives in these), source badge.
- **AI-parsed fields are visibly editable** with a subtle pencil affordance; fields
  the AI was unsure about wear a `--warning` "review" dot.
- A small **"parsed from: resume.pdf · 2 min ago"** provenance line — transparency
  builds trust (Principle 6) and helps with PII accountability.
- Merge history visible when records were deduped ("merged from resume + chat").

### 6.5 Pipeline (Jobs → Kanban)

- Per-job **Kanban board** with the 5 stage columns (§3.3 colors as column
  accents). Drag candidates between stages — the visual model recruiters already
  expect from CRMs.
- Each card: candidate name, current role, days-in-stage, expected fee chip.
- Column headers show **count + summed pipeline value** (candidates × expected fee).
- Dragging to **Placed** triggers the placement/fee capture (see §6.7).
- A compact list/table view toggle for those who prefer rows (Priya's a spreadsheet
  person — give her both).

### 6.6 Revenue dashboard (the differentiator)

One click from anywhere. Three honest headline numbers, then the proof.

- **Hero number:** *Revenue booked this month* in `text-display`, `--money` green,
  tabular figures. This is the emotional payoff — make it the biggest thing.
- Secondary cards: **Placements this month**, **Pipeline value** (weighted),
  **Avg fee**.
- A simple month bar/trend and a **placements table that reconciles exactly** with
  the numbers above (CLAUDE.md §3: numbers must tie out to the records).
- Every figure clickable → the underlying placements. No black-box totals.

> **Recruiter check:** Priya opens the app some mornings *just to see this number*.
> It's the thing incumbents bury three menus deep, and here it's a tab. That's the
> habit loop and the upgrade motivation in one screen. ✅

### 6.7 Placement / fee capture

- Triggered from drag-to-Placed or a "Log placement" button.
- Flat amount **or** % of salary toggle → shows the **resolved computed fee**
  before save (CLAUDE.md §3 — Decimal, currency-aware, explicit rounding shown).
- On save: a green success toast with the new monthly total — *"+$8,000 · $24,000
  booked in June."* Money wins deserve a small celebration.

### 6.8 Supporting components

- **Chips/tags:** skills, sources, stages. `rounded-sm`, `subtle` fill,
  `text-label` size. Stage chips use §3.3 colors. See
  [Badge.tsx](../apps/web/src/components/ui/Badge.tsx).
- **AI badge:** a small `brand-tint` chip with a sparkle marking AI-derived values
  ("✦ AI") — sets expectation that it's editable.
- **Source badges:** tiny icons (WhatsApp, email, PDF, CSV) so provenance is
  glanceable in dense rows.
- **Credit meter:** a quiet pill in the top bar (`◷ 64 credits`). Turns
  `--warning` under ~15%. Never a blocking modal until actually empty — and even
  then it's an *upgrade invitation*, not a wall (MVP-SPEC §4: "never a paywall on
  day 1").
- **Toasts:** bottom-center, auto-dismiss; success (money/win) in green, errors
  persistent with an action.
- **Modals:** reserved for destructive confirms (PII delete) and the placement
  capture. Prefer slide-overs and inline edits elsewhere — modals interrupt flow.
- **Skeletons:** every async surface gets a skeleton matching its final shape (rows,
  cards). Never a centered spinner on a blank page (Principle 1).
- **Empty states (the rare allowed ones):** Jobs/Revenue before first data don't
  say "nothing here" — they say *"Attach a candidate to a job to see your pipeline
  value,"* with the action inline. Guidance, never a void.

### 6.9 Iconography

- One line-icon set, **Lucide** (clean, consistent, MIT, pairs with Inter). 1.5px
  stroke, 20px default. Icons support labels, rarely replace them (Priya isn't
  decoding glyphs).

---

## 7. Data density, tables & numbers (recruiter-critical)

Because recruiters live in lists, this gets its own section:

- **Tabular figures everywhere numbers compare** (money, counts, dates).
- **Right-align numbers, left-align text.** Money columns right-aligned with the
  currency symbol muted.
- **Truncate gracefully** with tooltips; never wrap a candidate name to two lines
  in a dense row.
- **Sticky headers + sticky filter bar** so scrolling 200 rows never loses context.
- **Sort + filter on every meaningful column**, persisted per user.
- **Keyboard:** ⌘K search, `j/k` row nav, `e` edit, `/` focus search — power users
  (and Priya by week two) move without the mouse.
- **Saved/quick filters** ("Bangalore · Python · available") — her recurring
  searches become one click.

---

## 8. Motion & the "magic moment"

Motion budget is small and purposeful — speed must never *feel* decorative.

- **Standard transitions:** 120–160ms, ease-out. Hovers, slide-overs, dropdowns.
- **The parse reveal (the one we invest in):** as each candidate is extracted, its
  card animates in and fields **populate progressively** (name → role → contact),
  with a soft check on completion. This *is* the product's wow — let her watch the
  mess become structure. Streaming-feel, not a single late dump.
- **Money moments:** a brief count-up on the revenue number when a placement is
  logged; a confetti-free, tasteful success toast (Priya finds confetti childish —
  a confident green number is the reward).
- **Respect `prefers-reduced-motion`:** replace transforms with instant
  state + opacity; the parse reveal degrades to instant fill.

> **Recruiter check:** The one animation Priya remembers is her resumes turning
> into a list in real time — that's the story she tells the next recruiter. We
> spend the motion budget there and keep everything else quick and quiet. ✅

---

## 9. Responsive / mobile

- **Breakpoints:** `sm 640 / md 768 / lg 1024 / xl 1280`. Design lg-first for the
  data work, ensure sm works for sourcing.
- **Mobile (sm):** sidebar collapses to a bottom tab bar (Candidates · Jobs ·
  Revenue · Add). Tables become **stacked candidate cards** (name + role + contact
  actions), not horizontally-scrolling grids.
- **Contact actions are thumb-sized** on mobile (call/WhatsApp/email) — the primary
  mobile job is "look someone up and reach them."
- **Bulk import & heavy editing are gently laptop-nudged** ("easier on a bigger
  screen") rather than blocked.

> **Recruiter check:** On her phone between meetings, Priya finds a candidate and
> hits WhatsApp in two taps. She doesn't try to bulk-import 200 resumes on a phone,
> and we don't pretend she would. ✅

---

## 10. Accessibility & trust (PII + money raise the stakes)

- **WCAG 2.1 AA contrast.** All token pairs above clear AA for their sizes; the
  warm-stone neutrals were chosen to keep `text-muted` legible on `bg-subtle`.
- **Full keyboard operability** (it's also the power-user win in §7). Visible
  `brand` focus rings (the global `:focus-visible` ring in globals.css), never
  `outline: none` without a replacement.
- **Radix primitives** give correct roles/ARIA/focus-trapping for menus, dialogs,
  comboboxes for free — a reason to build on them.
- **PII handling is a UX surface, not just backend:**
  - **Delete is explicit and honest** — a destructive modal that names what's
    removed ("This deletes Sarah Chen's profile *and* her resume file. Permanent.")
    matching CLAUDE.md §2 (delete removes rows *and* files).
  - **Export** is a visible per-candidate / per-workspace action (GDPR/DPDP).
  - **No PII in toasts/URLs that get cached or logged** — use IDs in routes,
    display names in the body (aligns with CLAUDE.md §2: never log PII).
- **Money integrity is visible:** computed fees show their basis (flat vs %),
  currency, and rounding before save; totals link to records (no unexplained sums).

> **Recruiter check:** When Priya deletes a candidate she knows *exactly* what
> vanishes (her client asked her to remove someone — she needs certainty). When she
> logs a fee she sees the math. Trust with PII and money is the whole game for a
> recruiting tool, and the UI shows its work. ✅

---

## 11. Implementation notes

- **Stack:** Tailwind + CSS variables for tokens + Radix primitives + a local
  `components/ui` layer (shadcn/ui pattern). One font (Inter), one icon set
  (Lucide). No heavy component framework.
- **Tokens as the single source of truth** — define the §3/§4/§5 values as CSS
  custom properties in `:root`, map them into `tailwind.config` `theme.extend`, and
  never hardcode a hex in a component. This keeps dark mode and rebrands contained.
- **Money & numbers:** a shared `<Money>` / `<Stat>` component enforcing tabular
  figures, currency formatting, and `--money` color — so revenue always renders
  consistently and ties to the `Money` value object in `packages/core`
  (CLAUDE.md §3).
- **Don't build what v1 doesn't need:** no dark mode, no theming UI, no settings/
  customization surface, no dashboard-builder. Smart defaults (Principle 3).

### Where the tokens live (shipped)

These are implemented in [apps/web/src/app/globals.css](../apps/web/src/app/globals.css)
as space-separated RGB channels (so Tailwind's `/<alpha>` modifiers work, e.g.
`border-ink/10`, `ring-brand/40`) and mapped into Tailwind in
[apps/web/tailwind.config.ts](../apps/web/tailwind.config.ts). Base components
live in [apps/web/src/components/ui/](../apps/web/src/components/ui/). The hex
reference:

```css
:root {
  /* brand — teal-green; accent — terracotta */
  --color-brand:#2F6F5E; --color-brand-hover:#255A4C; --color-brand-tint:#E9F1EE;
  --color-accent:#E07A5F;
  /* canvas / surface (warm) */
  --color-canvas:#F7F6F3; --color-surface:#FFFFFF; --color-subtle:#F0EEE9; --color-line:#E4E1DA;
  /* text */
  --color-ink:#1A1A2E; --color-muted:#6B6B78; --color-faint:#A3A3AD;
  /* semantic — money = brand green */
  --color-money:#2F6F5E; --color-success-tint:#E9F1EE;
  --color-warning:#C17A35; --color-warning-tint:#FAF2E6;
  --color-danger:#C0392B; --color-danger-tint:#FBEAE7; --color-info:#3F7C92;
  /* pipeline */
  --color-stage-sourced:#8A8782; --color-stage-submitted:#3F7C92; --color-stage-interview:#E07A5F;
  --color-stage-placed:#2F6F5E; --color-stage-rejected:#A8A29E;
}
```

> Implemented as RGB-channel triplets, not hex — see the shipped file. Radius
> (`sm 6 / md 10 / lg 14`) and shadows are Tailwind theme tokens in the config.

---

## 12. The recruiter's final walkthrough (end-to-end stress test)

Priya's first 2 minutes, scored against the system:

1. **Signs up → lands on the ingest surface, not an empty dashboard.** (P2 ✅) She
   isn't asked to configure anything. (P3 ✅)
2. **Drags her Drive folder of ~40 resumes in.** Cards stream in, names populate
   live. She *watches* her mess become a list. (§6.2, §8 — the wow ✅)
3. **One scanned CV flags "review name."** She clicks, fixes it inline in 2 seconds,
   trusts the rest more for having been shown the doubt. (P6 ✅)
4. **The list looks like her spreadsheet but better** — denser, searchable, deduped
   ("merged Sarah from resume + chat"). She didn't retype anything. (§6.3 ✅)
5. **Creates a job, drags 5 candidates into the pipeline,** moves one to Interview.
   Column shows pipeline value rising. (§6.5 ✅)
6. **Marks a placement, picks "% of salary," sees the resolved $8,000 fee,** saves.
   Green toast: "+$8,000 booked in June." (§6.7 ✅)
7. **Clicks Revenue.** The month's number is the biggest thing on screen, in money
   green, and it ties to the placement she just logged. She'll be back tomorrow
   to look at it. (§6.6, P5 ✅)

**Verdict:** Faster than her spreadsheet, nothing to learn, and she can see her
money. That's the design system doing its job.

---

### What's deliberately *not* here (and why)

Matching MVP-SPEC §3's scope discipline: no dark mode, no theming/branding UI, no
settings/customization screens, no analytics-beyond-revenue dashboards, no
team/permissions UI, no email-sequence composer. Each would add surface Priya must
navigate around before reaching value. They come after activation is healthy.
