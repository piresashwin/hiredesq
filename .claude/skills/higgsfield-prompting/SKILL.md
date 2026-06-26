---
name: higgsfield-prompting
description: Expert prompting for Higgsfield AI image/video/ad generation via the connected Higgsfield MCP — model selection, the Image/Identity/Motion three-job structure, camera-motion presets, Marketing Studio (hooks/settings/avatars), Soul vs Elements consistency, credit-economical parameters, and copy-ready prompt templates. Use when generating or refining any Higgsfield image, video, UGC ad, talking-head, or marketing b-roll.
---

# Higgsfield prompting

Turns a creative idea into a high-performing Higgsfield generation. The dense model
catalog, preset library, cost data, and verbatim example prompts are in
[reference.md](reference.md). This is the working checklist. Pairs with the
`viral-content` skill (what to make + hook strategy) and `marketing/assets-and-tooling.md`.

> **Higgsfield ships fast — the live MCP is ground truth.** Model IDs, presets, durations,
> and prices drift between versions. Pull current data at runtime with `models_explore`,
> `presets_show`, `show_marketing_studio`, and **always `get_cost: true` before a real
> generation.** Don't hardcode preset UUIDs from reference.md — re-list them.

## The one rule that fixes most bad output

> **One scene = three separate prompt jobs: Image, Identity, Motion.** Most broken clips
> come from prompt *conflicts*, not weak models. Don't cram framing + face + camera-move +
> action into one block — they fight.

| Layer | Owns | Where it lives |
|---|---|---|
| **Image / keyframe** | framing, lighting, lens, environment, mood | `soul_2` / `cinematic_studio_2_5` (still) |
| **Identity** | face, age, build, wardrobe (locked, reused) | Soul ID (`soul_cast`→`soul_id`) or Reference Elements (`<<<element_id>>>`) |
| **Motion** | ONE camera move + ONE subject action + sound | video model (`kling3_0`, `seedance_2_0`, `veo3_1`…) or a selected preset |

Mnemonic: **MCSLA — Model · Camera · Subject · Look · Action.** Nail the image first, then
animate it (image-to-video beats text-to-video for marketing control).

## Always go through the MCP tools (not the REST script)

The pay-as-you-go REST API needs separate API credits (it 403s); the **MCP uses the
subscription plan**. Use: `balance` → `models_explore`/`presets_show` → `generate_image` /
`generate_video` (with `get_cost:true` first) → `job_status` (use `sync:true`) → download URL.
For local source media use `media_upload_widget`; for a web URL use `media_import_url` then
pass the returned `media_id` — **never** put a raw `https://` in `medias[].value`.

## Model picker (job → model) — verify with `models_explore action='recommend'`

- **Product hero still:** `marketing_studio_image` or DTC Ads (`ms_image`, needs `style_id` + brand kit). Crisp packaging/logo text → `nano_banana_pro` / `gpt_image_2`; clean vector/mockup → `recraft-v4-1`.
- **Portrait / UGC still:** `soul_2` (default; 2k; injects real-photo grain → anti-AI-slop). Cinematic still → `cinematic_studio_2_5` (to 4k) or `soul_cinematic`.
- **UGC / talking-head video:** still in `soul_2` → `marketing_studio_video` (UGC preset) or `seedance_2_0` (identity-consistent). Ultra-real talking-head w/ audio → `veo3_1`.
- **Cinematic hook b-roll:** `cinematic_studio_video_v2` (pro + `genre`) or `veo3_1`; or `higgsfield_preset` + a camera-motion `preset_id`.
- **Fast/cheap b-roll:** `seedance_2_0` `mode:fast` 720p, or `kling3_0` `sound:off`, shortest duration.
- **Logos/icons/vector:** `recraft-v4-1` (`vector`/`utility_vector`, exact `#RRGGBB` palette).

## Prompt frameworks

**Image (6 fields):** shot type + subject · framing/angle · lighting (direction/intensity) ·
environment · lens/film look · mood. Opener: `Cinematic [shot] of [subject] [place]. [lighting]. [mood]. 35mm, shallow DoF.`
Keep **50–100 words** — overloading dilutes the signal (and the Soul tag). Reference the
**cinematographer, not the film** ("Roger Deakins," not "Blade Runner").

**Video (5 beats):** opening action → camera position/move → environment interaction →
camera effect (focus/shake) → end mood. **One camera move + one subject action, strong
specific verbs** (dolly in, orbit, snap) — never vague "cinematic/dynamic." **Do NOT
re-describe lighting/lens/framing in the video prompt** — they're locked in the source
image; restating them causes mid-clip morphing.

**Soul character (5 parts):** `Soul: [age]yo [build] [ethnicity] [gender]` · 3–5 facial
anchors · style/mood + lighting · pose/scene/wardrobe · iterate.

Verbatim, proven templates live in [reference.md](reference.md).

## Camera motion = a *selected preset*, not prose

Higgsfield's signature is 50+ named camera moves (Crash Zoom, Bullet Time, 360 Orbit, Robo
Arm, FPV Drone, Snorricam, Super Dolly, Whip Pan…). **Select the preset** (`higgsfield_preset`
+ `preset_id` from `presets_show`, image-to-video) and let your prompt describe only subject +
scene. Typing the move as text is unreliable. Marketing mapping:

- **Hook / scroll-stop (first 1s):** Crash Zoom In, Rapid Zoom In, Whip Pan, Bullet Time.
- **Product reveal:** 360 Orbit, Lazy Susan turntable, Super Dolly In, Robo Arm, Through Object In.
- **Establishing / lifestyle scale:** Aerial Pullback, Crane Up, FPV Drone.
- **UGC authenticity:** Handheld, Snorricam, Head Tracking (the "shot on a phone" feel).

## Marketing Studio (one prompt → publish-ready ad)

`show_marketing_studio` → create a `product` (specific SKU; the item is the star) or
`webproduct` (a whole site/app) + optional `brand_kit` (logo/colors/fonts/tone). Then
`generate_video model='marketing_studio_video'`. Compose with:
- **`hook_id`** = the *what* (attention mechanic) · **`setting_id`** = the *where* (location/vibe). Independent; supported on UGC/Tutorial/Unboxing/Product Review/Virtual-Try-On.
- **OR `ad_reference_id`** = recreate a winning ad's scene/pacing (mutually exclusive with hook/setting; you must still pass `avatars[]` + `product_ids[]`).
- Batch the same prompt across **multiple avatars/hooks** to build an ad *library* and let performance pick the winner — don't polish one hero. (Refer to it as **"DTC Ads,"** not `ms_image`.)

## Character consistency: pick the right system

- **Soul ID** (`show_characters action='train'`, 5–20 photos, ~10 min → `soul_id`): identity-faithful digital twin, **one** character per gen, **only** `soul_2`/`soul_cinematic`.
- **Reference Elements** (`show_reference_elements`, from 1 image, instant; embed `<<<element_id>>>` in the prompt): **multiple** subjects/props per shot, non-Soul models. Use for multi-character scenes.
- `seedance_2_0` also keeps identity from an image/video reference (good for multi-SKU product video) without either.

## Credit-economical defaults (you're on a metered plan)

- **Always `get_cost:true` first.** Check `balance` before a batch.
- Cheapest stills: `soul_2`/`nano_banana`/`z_image` (~1cr). Pay up only for 4k/text/vector.
- Cheapest video: Seedance `mode:fast` 720p, or Kling `sound:off`, shortest duration.
- Cost rises with: resolution (1080p/4k), duration, `mode` pro/4k, `quality` high/ultra, `sound`/`generate_audio`, `count`/`batch_size`. **Find winners at low-res/no-audio, then re-render the winner at 1080p + audio.**
- Reserve `veo3_1` ultra (~10× a cheap clip) for hero shots only.

## Quality boosters & "negative" prompting

Boosters: "photorealistic film still," "consistent volumetric lighting," explicit lens
("35mm f/1.4"), "shallow depth of field," named cinematographer, film-stock/grain. Higgsfield
favors **positive alternatives over negatives** — write the desired trait ("clean even skin,
natural symmetric hands, sharp in-focus eyes") rather than "no extra fingers." Don't fight
Soul's built-in grain/flash — that's what kills the plastic AI look.

## Anti-patterns (reject/redo if present)

- Camera + identity + motion in one block · two camera moves in one clip · vague motion words.
- Typing a camera move as prose instead of selecting the preset.
- Re-describing lighting/lens in the video prompt (→ morphing) · changing identity *and* moving camera in one step (do identity first, then animate; use Recast for swaps).
- Soul for logos/packaging text (→ garbled; route to `nano_banana_pro`/`recraft`).
- Overloaded >100-word Soul prompts · stacking multiple styles · referencing a film by title.
- Skipping `get_cost` and burning credits blind.

## Hard rules (inherited — apply to all marketing assets)

- **No real candidate PII, no real brand UI** (e.g. don't recreate WhatsApp's interface). Generated people/scenes only; real product UI comes from screen recordings, composited later (CLAUDE.md §2).
- Keys/credentials never logged or committed; MCP auth is OAuth (no key in repo).
- Match the `viral-content` brief: hook in the first 1.5s, native-UGC look beats glossy CGI for trust, founder/operator voice. The generated clip is usually *atmosphere b-roll* — the real screen-recorded magic moment converts best.

## Workflow for one asset

1. From `viral-content`, know the **post + target signal + hook**. Decide image-only or image→video.
2. **Pick model** (`models_explore` if unsure). Split into Image / Identity / Motion jobs.
3. Write the image prompt (6-field, 50–100w). `get_cost:true` → generate → `job_status sync:true` → download to `marketing/assets/`.
4. If video: select a motion preset or video model, write motion beats (one move + one action), pass the still as `start_image`. `get_cost` → generate → poll → download.
5. **Evaluate** before shipping (`virality_predictor` for hook strength; or self-review vs the `viral-content` "one test"). Iterate on the weak layer only.
6. Note credits spent; keep outputs in git-ignored `marketing/assets/`.

## Boundaries

Generation + prompting only. Strategy/copy/calendar live in `viral-content` + `marketing/`.
Editing (captions, overlays, trending audio, the real screen-recording layer) happens in CapCut, not here.
