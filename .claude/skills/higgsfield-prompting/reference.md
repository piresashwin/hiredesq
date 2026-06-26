# Higgsfield Prompting — Reference (Models · Presets · Costs · Templates)

Evidence base for the `higgsfield-prompting` skill. Synthesized from Higgsfield's own
guides/docs, the live Higgsfield MCP catalog (ground truth), the OSideMedia community skill,
Segmind, selfielab, and creator/agency tutorials (2024–2026).

> **Re-pull at runtime.** Model IDs/durations/prices and preset UUIDs change between
> versions. Treat everything below as a current snapshot; confirm with `models_explore`,
> `presets_show`, `show_marketing_studio`, and `get_cost` when you actually generate.

---

## 1. Model catalog

### First-party IMAGE
| Model ID | Name | Best for | Key params |
|---|---|---|---|
| `soul_2` | Soul 2.0 | **Default** realistic UGC/portrait/editorial; real-photo grain (anti-slop) | `quality` 1.5k/`2k`(def), `soul_id`, 1 ref img |
| `soul_cinematic` | Soul Cinema | Cinema-grade stills, dramatic light | `quality` 1.5k/2k, `soul_id` |
| `cinematic_studio_2_5` | Cinema Studio Image 2.5 | Cinematic stills to 4K | `resolution` 1k/2k/4k |
| `marketing_studio_image` | Marketing Studio Image | One-click product image ads | `resolution` 1k/2k/4k |
| `ms_image` | **DTC Ads** (don't say `ms_image` to user) | Brand-kit ad images w/ avatars+products | **`style_id` REQUIRED**, `brand_kit_id`, `product_ids`≤4, `quality` low/med/high, `batch_size` 1–20 |
| `image_auto` | Auto | Routes to best by intent | — |

### Third-party IMAGE (via Higgsfield)
| Model ID | Provider | Best for |
|---|---|---|
| `nano_banana_pro` | Google | **Top quality + best text/diagrams**; default 4k/text |
| `nano_banana_2` / `nano_banana` | Google | Fast high-quality / budget |
| `seedream_v4_5` / `seedream_v5_lite` | Bytedance | 4K, precise edits/transformations, visual reasoning |
| `gpt_image_2` / `gpt_image` | OpenAI | **Best text rendering**, logos, diagrams, editing |
| `recraft-v4-1` | Recraft | **Logos/icons/vector/SVG/mockups**; `model_type` standard/vector/utility/utility_vector, `colors`≤10 hex, `background_color` |
| `flux_2` / `flux_kontext` | BFL | Precise adherence / context edit + typography |
| `kling_omni_image` | Kuaishou | Photoreal, wide aspect ratios |
| `grok_image` | xAI | Bold, high-contrast |
| `z_image` | Tongyi-MAI | **Cheapest/fastest** stylized t2i |

### VIDEO
| Model ID | Best for | Key params | Duration |
|---|---|---|---|
| `seedance_2_0` (alias `video_standard`) | **Reference-driven, identity-consistent, multi-SKU** | `resolution` 480/720/1080p, `mode` std/fast (fast=cheap, no 1080p), `genre`, refs: image/start/end/video/audio | 4–15s |
| `kling3_0` | **Multi-shot, audio sync, motion transfer** | `mode` std/pro/4k, `sound` on/off, start+end | 3–15s |
| `kling2_6` | Cinematic physics | `sound` bool | 5/10 |
| `veo3_1` | **Ultra-real, top cinematic** | `quality` basic/high/ultra, `model` preview/fast | 4/6/8 |
| `veo3` | Reliable cinematic + audio | `model` preview/fast; start_image req | — |
| `wan2_7` | Synced audio, char-consistent; start/end/audio | `resolution` 720/1080p | 2–15s |
| `cinematic_studio_video_v2` | Refined cinematic + genre | `genre`, `mode` pro/std | 3–12s |
| `cinematic_studio_video` | Dramatic cinematic | `slow_motion` bool, `sound` bool | 5/10 |
| `grok_video_v15` / `grok_video` | Versatile i2v w/ native audio | `resolution` 480/720p | 1–15s |
| `marketing_studio_video` | **One-click product ads** | `resolution` 480/720/1080p, `generate_audio`, `product_ids[]`, `hook_id`, `setting_id`, `ad_reference_id`, `avatars[]` | 4–15s |
| `higgsfield_preset` | Preset-routed i2v (viral templates) | **`preset_id` REQUIRED** + 1 image | per preset |

### AUDIO (`generate_audio`)
`sonilo_music` (text→music, `duration`) · `mirelo_text_to_audio` (SFX, `duration`) ·
`inworld_text_to_speech` (TTS, `voice` required; ~120 voices across 15+ langs incl. hi/ar/es).

**Not currently in the MCP catalog (don't promise):** Sora (absent); Minimax/Hailuo (only a
plan-bundle option, not a callable model); legacy **DoP** (superseded by Cinema Studio Video +
the camera-motion library — "DoP" effectively = today's camera presets).

---

## 2. Camera-motion preset library (the signature "motions")

Applied as a selected motion preset on a still (`higgsfield_preset` + `preset_id`, i2v). Full
list (re-list with `presets_show`):

Aerial Pullback, Arc Left, BTS, Buckle Up, **Bullet Time**, Car Chasing, Car Grip, Crane Down,
Crane Over The Head, Crane Up, **Crash Zoom In/Out**, Dolly In/Left/Out/Right, **Dolly Zoom
In/Out** (vertigo), Double Dolly, Dutch Angle, Eating Zoom, Fisheye, Flying Cam Transition,
Focus Change, **FPV Drone**, Glam, **Handheld**, Head Tracking, Hero Cam, Hyperlapse, Incline,
Jib Up/Down, **Lazy Susan**, Low Shutter, Mouth In, Object POV, Overhead, Pan Left/Right,
**Rapid Zoom In/Out**, Road Rush, **Robo Arm**, **Snorricam**, Static, **Super Dolly In/Out**,
**Through Object In/Out**, Tilt Up/Down, Timelapse (Glam/Human/Landscape), **Whip Pan**,
Wiggle, YoYo Zoom, **360 Orbit**.

**Kling 3.0 Motion Control** (`motion_control` tool) is distinct: transfers motion+camera from
a *driving video* onto a character still — `image_id`, `motion_video_id`, `resolution`,
`scene_control` image|video.

**Scene/template presets** (`presets_show`, bigger system — full scenarios, not just camera):
DRIFT RACING, CGI BREAKDOWN (mesh→beauty turntable, great for product CGI), 2000'S/CANDID
PAPARAZZI (Y2K viral hook), RED CARPET, 3D RENDER, ANDROID ASSEMBLE / FREE FALL (parts-fly-in
build), NEON CITY, etc. Each carries a UUID `preset_id` — **always re-list, never hardcode.**

---

## 3. Marketing Studio building blocks

`show_marketing_studio` entities: `image_style` (a.k.a. `ad_format`), `brand_kit`, `product`,
`webproduct`, `avatar`, `hook`, `setting`, `ad_reference`.

- **Modes:** UGC, Tutorial, Unboxing, Hyper Motion, Product Review, TV Spot, Wild Card, UGC Virtual Try On, Pro Virtual Try On.
- **Hooks** (`stunt`/`subtle`): Product Hit, Spicy, Interview, Random Object Mic, Product Crash, Blizzard, Camera Bump, Product Dodge, Epic Fail…
- **Settings** — realistic: Bedroom, Nature, Gym, Bathroom, Kitchen, In Car, Street, Office. Viral: Airplane Wing, Roofing, Volcano Rim, Tiny Reviewer, Car Roof, Train Surf.
- `product` = specific SKU the ad features; `webproduct` = promote a whole site/app (App Store/SaaS). Default `product`.
- `ms_image` (DTC Ads) needs `style_id` (from `image_style`/`ad_format` list) + optional `brand_kit_id`.

**Content-factory workflow (creator-proven):** generate UI/brand frames first (GPT Image 2) →
reference with `@image_1` / `<<<element_id>>>` for consistency → UGC structure
**Problem → Solution → Result** (~15s) → batch the same prompt across avatars → use Hyper
Motion for CGI product reveals, TV Spot for 16:9 + avatar speaks at the end.

---

## 4. Credit / cost model (live preflight, 2026-06-16 — verify with `get_cost`)

**Images (per image):** `nano_banana` 1 · `soul_2` 2k ≈1 (exact ~0.12, subsidized) ·
`nano_banana_pro` 1k 2 / 4k 4.

**Videos (5s unless noted):** `kling3_0` std 5s (sound on) 10 / pro 10s 25 · `seedance_2_0`
fast 720p 5s 17.5 · `veo3_1` fast 8s basic 22 / ultra 48.

**Cost levers (raise credits):** resolution↑, duration↑, `mode` pro/4k, `quality` high/ultra,
`sound`/`generate_audio` on, `bitrate_mode` high, `count`>1, `batch_size`↑.
**Plans:** PLUS $49/mo→1,000cr; ULTRA $99/mo→3,000cr. Top-ups expire 90d. Aspect: 9:16 Reels/
TikTok, 1:1 feed, 16:9 TV/YouTube; **2.35:1 is a letterbox *look*, not an output ratio.**

---

## 5. Verbatim example prompts (proven; adapt the brackets)

**Image keyframe (Higgsfield Popcorn):**
> "Medium close up of a tired detective in a rain-soaked street. Eye level, centered on the face. Soft streetlight from the left, light rain reflections on skin. 35mm, shallow depth of field, moody."

**Lifestyle/marketing (Higgsfield template):**
> "35mm cinematic realism, natural light. Setting: early morning café terrace, gentle rain outside. Subject: young entrepreneur working on a laptop, coffee steam rising. Action: looks up, smiles, and waves as a friend arrives. Camera: medium close-up, slow dolly in from left. Lighting: soft daylight with warm bounce from wooden table."

**Soul character (selfielab):**
> "Soul: 28yo athletic Latina hacker. Sharp cheekbones, neon tattoos, short purple hair, confident smirk. Cyberpunk cinematic, hacking terminal glow, leather jacket."

**Product/UGC templates (AI Academy — pick the matching preset):**
- Floating spin (360 Orbit): "Premium product ad of [PRODUCT] floating and slowly rotating against a seamless gradient backdrop, soft studio key light, subtle reflections."
- Liquid splash (High-Speed Splash): "High-speed commercial shot of [PRODUCT] emerging from a dynamic splash of [LIQUID], droplets frozen mid-air, crisp studio lighting."
- Lifestyle in-use (Handheld): "Aspirational lifestyle ad of [SUBJECT] using [PRODUCT] in a sunlit modern apartment, handheld camera drifts closer."
- Unboxing macro (Super Dolly In): "Satisfying macro push-in on hands opening the packaging of [PRODUCT], camera slowly creeps closer as the lid lifts."
- Talking-head hook (Crash Zoom In): "Vertical 9:16 clip of [SUBJECT] speaking to camera with an energetic crash-zoom-in on the first word."

**Sora-2-style ad (Higgsfield Marketing Studio):**
> "A 12-second cinematic sportswear ad for [BRAND] — high-energy, multi-sport montage in six dynamic cuts."

**Sound block (Sora-2 guide):** put dialogue in a dedicated block for lip-sync; specify
concrete foley per action + ambient bed.

---

## 6. Sources

Higgsfield: [camera-controls](https://higgsfield.ai/camera-controls) ·
[Prompt Guide](https://higgsfield.ai/blog/Prompt-Guide-to-Cinematic-AI-Videos) ·
[soul-intro](https://higgsfield.ai/soul-intro) ·
[SOUL-ID](https://higgsfield.ai/blog/SOUL-ID-Superior-Level-of-AI-Character-Consistency) ·
[marketing-studio-intro](https://higgsfield.ai/marketing-studio-intro) ·
[marketing-studio-video-2](https://higgsfield.ai/blog/marketing-studio-video-2) ·
[sora-2-prompt-guide](https://higgsfield.ai/sora-2-prompt-guide).
Community/creators: [Segmind](https://blog.segmind.com/higgsfield-ai-prompt-guide-video-creation/) ·
[AI Academy 30 prompts](https://academy.techpresso.co/prompts/higgsfield-prompts) ·
[OSideMedia skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill) ·
[selfielab Soul guide](https://selfielab.me/blog/higgsfield-soul-20-custom-character-prompts-guide-20260330).
**Ground truth:** live Higgsfield MCP (`models_explore`, `presets_show`, `show_marketing_studio`, `get_cost`).

### Flagged / verify before relying
- Sora not exposed as a callable model; Minimax/Hailuo only a plan bundle; DoP legacy.
- Public docs (docs.higgsfield.ai) are thin/stale vs the MCP — prefer the MCP tools.
- Exact cost formulas unpublished — derived from preflights; always `get_cost`.
