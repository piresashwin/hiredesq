---
name: design-system
description: Apply hiredesq's design system to any UI work in apps/web — the teal-green/terracotta token palette, recruiter-first principles, and the base components (Button, Badge/StageBadge, Money/Stat). Use when building or restyling any screen, component, or layout so it matches the house style and the "kill the empty state, one click to the money" product brief.
---

# hiredesq design system

The full reference is [docs/design-system.md](../../../docs/design-system.md) —
read it for the rationale, the recruiter persona ("Priya"), and per-component
specs. This skill is the working checklist. Read `MVP-SPEC.md` for the product.

## The one test for every decision

> **"Does this get Priya (a solo, non-technical, time-poor recruiter who lives in
> WhatsApp + Excel) to her candidates and her money faster — without making her
> learn anything?"** If a screen adds config, a click, or an empty void, it fails.

## Principles (don't violate)

1. **Speed is the brand** — skeletons over spinners, optimistic UI, no frozen screens.
2. **Kill the empty state** — first surface is the ingest dropzone, never "create your first X".
3. **Zero config to value** — no setup wizards, smart defaults, customization deferred.
4. **Density with hierarchy** — table-first, compact rows (40px); it's her spreadsheet, better.
5. **One click to the money** — Revenue is a top-level tab, never buried.
6. **Trust through correction** — AI-derived fields are visibly editable; mark them, flag low confidence.
7. **Calm by default** — spend color only on money, wins, and destructive/error actions.
8. **Mobile-respectful, desktop-optimal** — sourcing works one-handed; bulk work is laptop-first.

## Tokens — use these, never raw hex

Defined in [globals.css](../../../apps/web/src/app/globals.css), mapped in
[tailwind.config.ts](../../../apps/web/tailwind.config.ts). Reference by Tailwind class:

- **Brand (teal-green):** `bg-brand` / `text-brand` / `bg-brand-hover` / `bg-brand-tint`, fg `text-brand-fg`. Accent (terracotta): `accent` — win moments / sparing highlights only.
- **Surfaces:** `bg-canvas` (app), `bg-surface` (cards), `bg-subtle` (hover/section), `border-line`.
- **Text:** `text-ink` (strong), `text-muted` (secondary), `text-faint` (disabled/placeholder).
- **Money/semantic:** `text-money` (= brand green, revenue), `success`/`warning`/`danger` (+ `-tint` bg), `info`.
- **Pipeline stages:** `stage-sourced|submitted|interview|placed|rejected` — Placed = green, Rejected = muted (never red).
- **Type:** `text-display|h1|h2|h3|body|sm|label`; body default is 14px. Money/counts get `.nums` (tabular figures).
- **Radius** `rounded-sm|md|lg`; **shadow** `shadow-sm|md|lg` (floating things only); transitions ~140ms ease-out.
- Alpha modifiers work on every color (`border-ink/10`, `ring-brand/40`).

## Spacing — breezy frame, dense data (design-system.md §5)

Density belongs to the **data**, not the frame. Let containers breathe; keep rows tight.

- **Breathe (the frame):** page gutter `px-4 sm:px-6 lg:px-8`, page vertical `py-6 sm:py-8`, section gap `space-y-8` (32), card-grid gap `gap-4 lg:gap-5`, card padding `p-5` (hero/glance tiles `p-6 lg:p-7`), `PageHeader` `py-4` with title→subtitle `mt-1`, sidebar `py-5` / items `space-y-1.5`, ingest dropzone `py-10 sm:py-12`, empty/first-run `p-10 sm:p-12`.
- **Stay dense (the data — don't loosen):** table/list rows (40px / 48px revenue), chips & badges (`px-1.5 py-0.5`), kanban *cards* (`p-2.5`), inline icon+text gaps in a row. Kanban *column* gaps are frame, so they may breathe.
- **The test:** container/separator → breathe; the data itself or a control packed into a row → leave it dense.
- **Rule of thumb:** card padding ≥ the gap between cards (a card is a contained surface, not a tile shoved against its neighbor). Don't scatter raw spacing per page — the rhythm lives in the shared `PageHeader` / `PageBody` / `Section` primitives.

## Reuse the base components — don't re-roll them

In [apps/web/src/components/ui/](../../../apps/web/src/components/ui/):

- **`Button`** — variants `primary` (one per view) / `secondary` / `ghost` / `destructive`; sizes `sm|md|lg`.
- **`StageBadge` / `AiBadge` / `Chip`** (Badge.tsx) — pipeline chips, the AI-derived marker, neutral tags.
- **`Money` / `Stat`** (Money.tsx) — all revenue/fees render here (tabular, money-green, currency-formatted). **Display only — never do money math in the web layer;** amounts arrive pre-resolved as Decimal from `packages/core` (CLAUDE.md §3).
- **`PageHeader`** — every top-level screen's header, and it holds **only three things**: **title** (`text-h1`, required) + **subtitle** (`text-sm text-muted`, one line, required) + **at most one** primary action (top-right; omit on pages with no create action, e.g. Revenue). Sticky + full-bleed, content capped `max-w-screen-2xl`. Don't hand-roll the band per page. Everything that *operates on the data* — the page **search box**, filters, mode toggles, result count — lives in the **BODY** as a toolbar leading the content (`mb-4`), **not** the header. The search-mode toggle is **icon + label** for both modes (`⌨ Keyword` `TypeIcon` ⇄ `✦ Semantic` `SparkleIcon`). The test: names the page or is its single top action → header; data + any control that filters/searches/sorts it → body. (design-system.md §5.)

Extend this `ui/` layer for new primitives; don't scatter one-off styled markup.

**Behaviour primitives come from Radix (+ cmdk), styling is ours.** The interaction
layer — focus trap/restore, Esc, scroll-lock, `aria-modal`, roving focus, dismissable
layers, portals — is **Radix primitives** (`@radix-ui/react-*`), wrapped behind the
`ui/` components and styled entirely with our tokens (shadcn-style, but we *own* the
source — we don't take the shadcn CLI/`cva`/`tailwind-merge`). For the command palette
and any typeahead/combobox (Radix has none) use **`cmdk`**. **Never hand-roll a dialog,
menu, focus trap, or popover** — reach for the primitive and skin it. The migration is
complete and lives behind the existing `ui/` APIs: `Modal`/`SlideOver`/`OnboardingCarousel`
on Radix `Dialog`, `Menu`/`ProfileMenu` on Radix `DropdownMenu`, `NotificationBell` on
Radix `Popover`, `Spotlight` on `cmdk`. The hand-rolled `useFocusTrap` hook is retired —
don't reintroduce one. The local icon set stays (below).

## Hard rules (also enforced elsewhere)

- **Never render candidate PII into logs or analytics events** (CLAUDE.md §2). IDs in routes, names in the body.
- **Accessible by default:** semantic HTML, labelled controls, keyboard nav, visible `:focus-visible` ring (already global), `prefers-reduced-motion` respected — degrade the parse-reveal animation to instant fill.
- **One font family, one icon set** — a local inline-SVG set in [Icon.tsx](../../../apps/web/src/components/ui/Icon.tsx) (1.5px stroke, `currentColor`); **no icon-library dependency**. Add a new glyph there; don't pull in Lucide/etc. No purple gradients / generic AI-slop aesthetics.
- Loading/empty/error states are part of every component — but the candidate-DB "empty" state is a guided ingest CTA, never a dead blank screen.

## Boundaries

Don't invent backend behavior — consume the API via `packages/shared` types; hand
data wiring / new endpoints to the `fullstack-developer` agent.

## When done

State which screens/components you built or changed and how they're responsive +
accessible, then run `pnpm typecheck` / `pnpm lint` on the touched files.
