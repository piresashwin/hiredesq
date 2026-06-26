---
name: viral-content
description: Generate viral-optimized B2B social content for Hiredesq's Instagram, LinkedIn, and Facebook — recruiter-audience hooks, platform-native formats, and the viral mechanics (golden hour, signal hierarchy, native-over-links) distilled from competitor and viral-B2B-account research. Use when drafting, reviewing, or planning any social post, caption, carousel, Reel script, or content calendar.
---

# Hiredesq viral content

This skill turns a content idea into a platform-native post engineered to travel.
The full evidence base — named accounts, the competitor/influencer landscape, the
white-space Hiredesq can own, and cited sources — is in [playbook.md](playbook.md).
The channel calendars and brand voice live in the git-ignored `marketing/` folder
(`marketing/README.md`, `instagram.md`, `linkedin.md`, `facebook.md`). This file is
the working checklist; read `MVP-SPEC.md` for the product.

## The one test for every post

> **"Would a skeptical solo recruiter — who lives in WhatsApp + a spreadsheet and
> distrusts vendor marketing — stop scrolling, feel seen, and either save it or
> tag a colleague?"** If it reads like a logo talking or a product announcement,
> it fails. Founder voice, operator-to-operator, always.

## Positioning the content must reinforce (our owned white-space)

Research found the recruiting-vendor field is crowded with SEO listicles but thin on
personality. Four lanes are essentially unclaimed — every post should advance one:

1. **Show me the money.** Revenue visibility is uncontested — incumbents bury it,
   recruiters obsess over billings. Own "see your revenue, not just your pipeline."
2. **WhatsApp/spreadsheet chaos → clean DB.** The mess is the hero. Viscerally
   relatable (esp. India / US-IT / small agencies), demoable, meme-able. Nobody owns it.
3. **Solo-recruiter underdog with personality.** Rivals *say* "for solo recruiters" on
   comparison pages; none *feel* by-a-recruiter-for-a-recruiter. Be the charismatic one.
4. **Fair/free pricing as a story.** "Database, search, jobs, revenue view free forever;
   we only charge for AI volume + seats." High-trust with a burned, skeptical crowd.

**Recurring villains to position against:** Bullhorn (bloat/cost/$10k implementation),
the spreadsheet/WhatsApp "CRM", the empty ATS you feed more than it feeds you.
**Recurring heroes:** the solo biller, the placement/fee win, the clean database, the revenue dashboard.

## Hook first — the first line is ~95% of the work

Only lines 1–2 show before "see more". End the hook on an open loop (colon/question);
hide the "how". Lead with payoff, contrarian claim, or a specific number — context after.
Pick a formula (full bank + examples in [playbook.md](playbook.md)):

- **Contrarian:** `Everyone says [chase more candidates]. They're wrong — your problem is your database, not your pipeline.`
- **Number + outcome (+ negative qualifier):** `$0 → [N] placements/mo with no [ATS / cold calls / team].`
- **Counterintuitive subtraction:** `We deleted our "Book a demo" button. On purpose. Here's why:`
- **Confession:** `I wasted $12k on a recruiting CRM we used twice. Here's what I'd buy instead:`
- **"I did X for N days":** `I ran my whole desk out of WhatsApp for 30 days. Here's what broke:`
- **Relatable callout:** `If your candidate database is a WhatsApp group called "Candidates ✅✅", this is for you.`
- **Data drop (our highest-ceiling format):** `We cleaned [N] messy resumes. [Counterintuitive stat about recruiter mess]:`

## Match format to the signal you can earn

Signal hierarchy: **Comments > Saves > Shares-w/commentary > Reposts > Likes.**

- Want **comments** → hot take, genuine question, debate-starter (AI-replacing-recruiters, fees, agency-vs-in-house).
- Want **saves** → listicle, named framework, data drop, how-to carousel.
- Want **shares** → relatable meme (ghosting, req chaos, spreadsheet CRM), origin story.

## Platform mechanics (the non-negotiables)

**LinkedIn** (credibility + paying audience; ~70% founder profile, page amplifies):
- Text 600–1,200 chars, ≤4-line paragraphs, ~4th–6th grade reading level (denser = less reach).
- Reach order: **polls > document carousels > images > video > plain text.** Carousels: 4:5, 5–10 slides, hook slide 1.
- **No link in the body** (≈40–50% fewer impressions) — value native; the first-comment trick is now largely dead, so deliver in-post or "comment X, I'll DM it."
- Cadence 3–5/wk, ≥24h apart, never >1/day. Tue–Thu 8–11am.

**Instagram** (reach + the visual magic moment):
- Reels: hook in first **1.5s** with motion; on-screen captions mandatory (~85% watch muted); peak completion 15–25s.
- Carousels = highest IG engagement: 8–10 slides, slide 1 = 5–8-word hook readable in <2s (save-bait).
- 3–5 posts/wk + daily Stories. B2B best 9am–12pm.

**Facebook** (Groups-first + retargeting): repurpose IG assets; be useful in recruiter Groups before promoting; install the Meta Pixel early.

## Viral mechanics to exploit

- **Golden hour:** the algo tests on 2–5% of network in the first ~60–120 min. **Author replies to every comment for ~90 min after posting** — strongest single lever.
- **Native > links** everywhere; keep people on-platform.
- **Proof beats promise:** real screen recordings of the magic moment and real numbers (placements, revenue, "cleaned 200 resumes") out-convert any generated visual. Data-as-content (Gong) + build-in-public metrics (RB2B) are the two highest-ceiling formats — both need *our* proprietary numbers.
- **Controversy calibration:** specific, slightly provocative, anchored in a truth you'll defend. ~10% pushback = calibrated; 0% = bland.

## Anti-patterns — reject a draft if it has these

- External link in the LinkedIn body; corporate jargon / "thrilled to announce"; over-pitching (keep ~4–6 give posts per ask).
- Stock photos / generic AI-slop visuals (down-ranked 30–50%); no hook / buried lede; >5 hashtags (use 3–5).
- Engagement-bait phrasing ("Comment YES", "Tag a friend") — now NLP-suppressed; ask a real question instead.
- Posting >1×/day on LinkedIn; deleting-and-reposting on IG; editing after the golden hour starts.
- **Fully AI-generated, voice-flat copy** (reported reach/engagement penalty) — always inject genuine specifics and founder voice; never ship a template verbatim.

## Hard rules (inherited from CLAUDE.md — apply to marketing too)

- **Never use real candidate PII** in any post, screenshot, or demo asset. Demo recordings use a seeded fake-data workspace only (CLAUDE.md §2).
- **Never expose secrets** (API keys for image/video gen are env vars, never committed) (CLAUDE.md §6).
- The clean DB / search / jobs / revenue view are **free forever** — never imply they're paywalled (CLAUDE.md §4).
- Don't imply AI replaces the recruiter — it kills the grunt work so they sell and place.

## Workflow for generating a post

1. Pick the **pillar + white-space lane** (1–4 above) and the **target signal** (comment/save/share).
2. Choose a **hook formula**, write 3 hook variants, keep the sharpest.
3. Draft platform-native to the mechanics above (length, format, line breaks).
4. Add the **payoff** (it must match the hook's promise) + a soft call-to-conversation, not a hard sell.
5. Note the **asset** needed (screen recording > generated visual; see `marketing/assets-and-tooling.md`).
6. Run the **anti-pattern checklist** and the "one test". Add a golden-hour reply plan.

## Boundaries

This skill is for content strategy and copy. It does **not** generate images/video — see
`marketing/assets-and-tooling.md` for the API options (pick one and ask me to wire it up).
It does not post to platforms. Keep brand voice and calendars in `marketing/` (git-ignored).
