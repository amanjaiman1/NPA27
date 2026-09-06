# Design system

The Chronicle's look: **warm, light, rounded and modern**. Big soft-cornered
white cards on a warm ivory canvas, one vivid accent, a rounded geometric
display face, and depth from wide low-contrast shadows rather than hard borders.

Everything is driven by CSS custom properties in `src/app/globals.css` and
surfaced to Tailwind in `tailwind.config.ts`, so pages never hard-code a colour.

## Tokens

| Token | Role |
| --- | --- |
| `--ink` | the canvas behind everything (`bg-ink`) |
| `--card` | elevated surfaces: cards, sheets, floating chrome (`bg-card`) |
| `--paper` | foreground / text (`text-paper`, and tints like `bg-paper/[0.04]`) |
| `--line` | hairline borders (`border-line`, and the default `border` colour) |
| `--scrim` | modal/drawer backdrop — always darkens, on light *and* dark (`bg-scrim/45`) |
| `--aura-1` / `--aura-2` | the canvas glow colours, set per surface (not by the palette) |
| `--wash` | how strongly that glow is applied, 0–1, set per surface |
| `--shadow` | shadow tint, warm on ivory and black on dark |
| `--accent` / `--accent-fg` | the brand colour and text that sits on it |
| `--positive` `--warning` `--danger` `--info` | semantic colours |
| `--bloom-1…6` | categorical data palette for charts |

Note the naming: **`ink` is the background and `paper` is the foreground**, and
they swap with the surface. A tint like `bg-paper/[0.04]` is therefore a subtle
recessed fill on every surface, not a light or dark one.

### Surfaces (`data-surface`)

| id | Name | Canvas | Aura | `--wash` |
| --- | --- | --- | --- | --- |
| `white` | **Ivory** (default) | warm off-white `#f6f4f0`, white cards | crimson + blue | 0.55 |
| `black` | **Pure Black** | true `#000`, cards at `#0d0d0f` | rose + indigo | 0.40 |
| `navy` | **Indigo** | deep blue night `#0f1221` | blue + violet | 0.80 |
| `velvet` | **Velvet** | aubergine `#100719` | violet + magenta | 1 |
| `abyss` | **Abyss** | deep ocean `#030e14` | cyan + electric blue | 1 |

Each surface owns its glow through `--aura-1`/`--aura-2`, which is what makes
Velvet and Abyss feel different rather than just darker — the palette only drives
the accent and chart colours. `--wash` scales the whole ambient layer: Pure Black
keeps the least of it, because glow over true black just reads as grey.

### Palettes (`data-palette`)

Crimson (default), Amber, Teal, Violet, Emerald, Coral.

Each palette declares its **dark-surface** values, then a
`[data-surface="white"][data-palette="…"]` block deepens the accent so it keeps
roughly 4.5:1 against the ivory canvas — the fill stays vivid, small accent text
stays legible. Add a palette by declaring both blocks and appending to
`PALETTES` in `src/lib/theme.ts`.

## Type

**Two faces, and only two** — both geometric, so the whole app speaks with one
voice. Anything else (a serif, a monospace, a system fallback creeping in) is a
bug.

| Face | Variable / class | Used for |
| --- | --- | --- |
| **Comfortaa** | `--font-display` · `font-display` | headings, big numbers, the brand |
| **Poppins** | `--font-sans` | body, labels, controls, tabular figures |

- `h1`–`h4` pick up Comfortaa automatically; everything else is Poppins.
- Headings are **bold and tight** (`tracking-tightest`, `-0.045em`). Body text is
  tracked in slightly (`-0.015em`) because Poppins runs wide and open.
- `.eyebrow` is the small uppercase label above a heading: Poppins, semibold,
  `0.11em`. `.tabular` locks figures to one width for anything that has to line
  up in a column.
- `font-mono` deliberately resolves to Poppins too, so a stray utility can never
  pull in a third typeface — `kbd`, `code`, `pre` and `samp` are Poppins with
  tabular figures. There is no monospace face in this app.
- No italics: Comfortaa has none, and a synthesised oblique looks broken.

### Symbols must be drawn, not typed

Poppins (latin subset) has **no arrows and no `⌘`** — `→ ↗ ↔ ⌘ ✓` are all
missing, so typing them either falls back to a system font (a third typeface) or
renders a tofu box. Use a `lucide-react` icon instead (`ArrowRight`,
`ChevronRight`, `Command`, `Check`). Characters that *are* safe and in use:
`− — · › » ± % ₹ • “ ” ’`. When in doubt, measure rather than guess — render the
character in `--font-sans` on a canvas and compare its width against a
private-use codepoint.

## Shape and depth

- Radii: cards `rounded-2xl` (1.25rem), sheets and hero panels `rounded-3xl`,
  every button, chip, pill and nav item `rounded-full`.
- Shadows: `shadow-soft` for resting cards, `shadow-lift` for hover and modals,
  `shadow-accent` for accent buttons. Depth comes from these, not from borders.
- Hover on a card: `-translate-y-0.5` plus `shadow-lift` and an accent-tinted
  border (`<Card hover>` does this for you).

## Wallpapers

A third appearance dimension, on top of surface and palette: `data-wallpaper` on
`<html>`, rendered by `components/layout/wallpaper.tsx` as one static layer
behind everything.

| | |
| --- | --- |
| `none` | just the surface |
| `mesh` `aurora` `beams` | colour, built from `--aura-1`/`--aura-2` |
| `grid` `dots` `rings` | structure, built from `--paper` at low alpha |
| `academy` | the still from the command-centre film |
| `custom` | the user's own photo |

Six of the eight are **pure CSS gradients keyed to the palette** — no bytes to
download, and they re-tint themselves when the palette changes. The layer is
deliberately static: no animation, no `filter`, no `backdrop-filter`. Measured
on a phone at 20x CPU throttle, a wallpaper costs nothing (median 50 fps against
51 without).

**`--wp-dim` is the legibility dial.** It lays canvas colour (`--ink`) back over
the art, which lightens on Ivory and darkens on the dark surfaces — one control
that works in both directions. Every wallpaper ships with a default that was
measured, not guessed: the page header's three text sizes must clear WCAG AA over
it. The photo wallpapers need far more (0.85) than the patterns (0.10–0.40).

Chrome that sits directly on the wallpaper firms up automatically — `.chrome-glass`
on the topbar, and `.sidebar-panel` on the sidebar, go to 94% opacity whenever a
wallpaper is active, because translucent glass over a busy photo is where
readability dies.

The sidebar's rule is scoped to `lg` and up, which is the one place the two
differ. Above `lg` the sidebar is chrome standing beside the canvas and reads well
as glass. Below it, the same element is a full-height drawer pulled over the page,
and any transparency there prints the wallpaper and the page through the nav you
are trying to read — so on a phone it stays flatly opaque `bg-card`.

A custom photo is downscaled to 1920px and re-encoded in the browser, then kept
in **IndexedDB on the device** (`lib/wallpaper-store.ts`). It deliberately never
enters the synced snapshot: that snapshot is one JSON row pushed on every edit,
and a megabyte of base64 would be re-uploaded each time. Only the *id* travels.

## Loading states

There are two waits, they are different events, and they get different
animations. Both come from dotLottie files in `public/`, unpacked to plain JSON
by `scripts/extract-lottie.py` because `lottie-web` cannot read the zip.

| Wait | What you see | Where it lives |
| --- | --- | --- |
| Browser refresh / cold start | A cyan→blue→magenta gradient ring | `SleepGate`, via `.boot-ring` + `animations/boot.json` |
| Page to page | Three quiet dots over a dimmed scrim | `RouteTransition`, via `animations/page-transition.json` |

**The cold-start ring is CSS, not Lottie, and it has to be.** That wait *ends* at
hydration — the moment React takes over is the moment the app is usable — and a
Lottie player is JavaScript, so it cannot start until the wait is already over.
Measured on a throttled cold load, the pre-hydration window was about 3.6s and
the Lottie never mounted at all: the boot branch unmounted before its dynamic
import resolved. So `.boot-ring` in `globals.css` reproduces the reference as a
masked conic gradient, which is in the server-rendered HTML and therefore turning
before a single line of JavaScript has run. `LottieWithFallback` still swaps the
real animation in if it does get there first, which is what happens on the
auth/sync screens — those are genuine post-hydration waits.

**The page-to-page overlay is driven from the tap, not from the router.**
`app/loading.tsx` looks like the right tool and is not: Next only falls back to
that boundary when a segment suspends, and because the router prefetches every
link in the viewport, navigation normally resolves *inside* the transition. With
a route's page chunk deliberately stalled for three seconds, the boundary
rendered zero times while the old page sat there — which is the whole "did my tap
register?" complaint. `RouteTransition` therefore starts on a capture-phase
click, on `popstate`, and on an explicit `beginRouteTransition()` for
`router.push` callers like the command palette; it ends when `usePathname` /
`useSearchParams` change plus two animation frames, so it lifts only once the
next page has painted.

It waits 140ms before appearing, so a warm navigation shows nothing, and stays a
minimum of 450ms once it does, because a 50ms flash reads as a glitch.

The dots are three light greys, which sit well on the four dark surfaces and all
but vanish on the light one. `.lottie-neutral` inverts them under
`[data-surface="white"]`; they are near-neutral, so nothing shifts hue.

## Opening animations

Every route plays a short rise-and-fade, and the page's own top-level sections
follow in a cascade — `.page-enter` in `globals.css`, applied by
`components/layout/page-transition.tsx`, which is keyed on the pathname so each
navigation replays it.

- **CSS, not JavaScript.** The stagger is `nth-child` animation delays, so there
  is no per-element work on the main thread and nothing to hydrate.
- **No exit animation, on purpose.** Waiting for the old page to leave before the
  new one arrives reads as latency, and the point is that it feels quicker.
- **Six steps, then stop.** Past ~0.31s of delay the cascade stops feeling like
  choreography and starts feeling like a slow app.
- **Sticky descendants.** An ancestor with a transform breaks
  `position: sticky`. `animation-fill-mode: both` settles on `transform: none`
  so stickiness returns, and direct sticky children get a plain fade instead.
  There's a check for this in the perf probe.
- `prefers-reduced-motion` collapses all of it via the global block at the end of
  `globals.css` (verified: animation duration drops to 1e-05s).

## Marking a day accomplished

`accomplished: ISODate[]` on the store, toggled by `toggleAccomplished(date)`,
which **returns true only on the transition into accomplished**. The celebration
listens to that return value rather than to state, so unmarking, re-rendering or
returning tomorrow never replays it.

The celebration itself (`components/celebrate/`) is a medal whose ring sweeps in
and then ticks, a confetti burst, the day's motivational line, and three facts
(streak, hours logged, days to exam). The confetti is a **single canvas**, not
DOM elements — one composited layer, colours read from the live palette, and it
stops itself once the pieces fall. Under `prefers-reduced-motion` it doesn't run
and the static medal carries the moment.

Lines live in `lib/motivation.ts`, chosen by day index rather than at random so
the same day always shows the same line, with streak milestones (3, 7, 14, 21,
30, 50, 75, 100, 150, 200, 365) taking over when they land.

## Text over media

Video and photography are unpredictable — bright khaki one frame, dark foliage
the next — so a region sitting on media gets the `.on-media` class. It pins that
subtree to a fixed light-on-dark palette (`--paper` white, `--card` near-black,
`--line` a soft grey), which means every token-based utility inside it resolves
correctly on all five surfaces without a single conditional.

On top of the media, stack cheap scrims rather than one flat overlay: a base
tint, a horizontal gradient darkest where the copy sits, a vertical gradient,
and a breath of accent. Small text also takes a `drop-shadow`, and floating
controls sit on their own `backdrop-blur` disc or pill.

**Measure it, don't eyeball it.** Screenshot the text's bounding box with the
content layer hidden, at several timestamps across the clip, and compute contrast
between the declared colour (composited with its own alpha) and the 98th
percentile background luminance. WCAG AA is 4.5:1, or 3:1 for text ≥24px. The
command centre hero passes every region at the worst frame of its loop.

## Chrome

The topbar is a **floating pill** (`rounded-full bg-card/80 backdrop-blur-xl`)
inset from the edges, with round icon buttons. The sidebar is a translucent
card-coloured rail whose active item is a filled accent pill. The ambient
background is deliberately quiet: two very soft accent washes, no texture.

## Data colour

- **Single series** (hours per month, weekday rhythm, sleep) → the accent.
  `BarChart` does this by default; pass `multicolor` only for genuinely
  categorical bars.
- **Categorical** (subject split) → `--bloom-1…6`, e.g. the donut.
- **Directional** (mock candles, correlations, accuracy) → `positive` /
  `danger` / `warning`.
- **Progress ramps** (topic mastery) → the accent at rising opacity:
  `bg-paper/12` → `bg-accent/30` → `bg-accent/60` → `bg-accent`.

## Media assets

Source clips are optimised into `public/media/` — never referenced raw, and
always in **two renditions**: a desktop cut and a phone cut. The clip behind the
command centre came in as a 7.2 MB 1080×1920 portrait with `moov` at the end,
meaning a browser had to download the whole file before the first frame. The
recipe:

```bash
ffmpeg -i source.mp4 -an \
  -vf "fps=24,crop=1080:1200:0:480,scale=720:800:flags=lanczos,hqdn3d=4:3:6:4" \
  -c:v libx264 -crf 32 -preset slow -g 48 -pix_fmt yuv420p \
  -movflags +faststart public/media/hero-loop.mp4      # 3.1 MB, starts instantly

ffmpeg -ss 2.2 -i source.mp4 \
  -vf "crop=1080:1200:0:480,scale=720:800" -frames:v 1 -q:v 6 \
  public/media/hero-poster.jpg                          # 61 KB
```

Drop the audio (backgrounds are always muted), centre-crop to something closer to
the box it fills, denoise before encoding (it buys a lot of bitrate on noisy
footage), and always `+faststart`. The poster is mandatory: it paints
immediately, and it's the *only* thing downloaded for anyone on reduced-motion,
Save-Data or a 2G connection — see `components/dashboard/hero-video.tsx`, which
also pauses the clip off-screen and in hidden tabs.

### Performance rules for media panels

Measured on the command centre with a 4x–20x CPU handicap and Fast 3G, these are
the things that actually moved the needle — and one that didn't:

- **No `backdrop-filter` over video, or on anything that scrolls.** A blurred
  region compositing over moving frames re-rasterises every frame; the sticky
  topbar re-blurs the page behind it on every scroll tick. Both are now opaque
  below `sm` and frosted only on desktop. Use a flat translucent fill instead.
- **Don't transform-animate blurred layers on phones.** The drifting aura orbs
  are 130px blurs; animating them is continuous GPU work. They're `hidden sm:block`.
- **Serve a phone rendition** and attach the video on `requestIdleCallback`, not
  on mount, so it never competes with hydration.
- **Pause off-screen and in hidden tabs** (`IntersectionObserver` +
  `visibilitychange`).
- `content-visibility: auto` on the cards below the fold was tried and removed:
  54 fps without it, 55 with one wrapper, 49 applied per card. It bought nothing
  here and added a scroll-height quirk. Measure before keeping a trick like that.

Result on that harness (median of three runs — a single run swings by ±5 fps, so
don't trust one): scroll went from 42 to 51 fps, main-thread blocking from 1916 ms
to 1109 ms, and the hero from 3.15 MB to 1.40 MB on a phone.

The panel itself is responsive about how much film it shows: the four headline
numbers sit on the video from `sm` up, which is what gives the clip a tall canvas
on a desktop, and drop out below `sm` so a phone keeps a hero-sized panel with
the numbers as ordinary cards underneath. Stretching the panel on a narrow screen
just pushed the rest of the dashboard off the first view.

## A Tailwind trap worth knowing

`bg-accent/12` compiles silently and emits **no CSS at all** — 12 isn't on
Tailwind's opacity scale, which moves in steps of 5. The element just loses its
background with no error anywhere.

This has bitten the codebase twice: once it stripped the scrims off the hero
video, and once it left every `Badge` tone, the topic-mastery ramp, the form
focus ring and the celebration medal with no fill for several releases. So there
is now a guard:

```bash
npm run check:classes
```

It scans for off-scale opacity modifiers and exits non-zero. Use a multiple of 5,
or an arbitrary value (`bg-black/[0.12]`) when you really need something between.

## Adding UI

Reach for the primitives in `src/components/ui` — `Card`, `Button`, `Badge`,
`Segmented`, `Chip`, `Progress`, `Modal`, `PageHeader`, `Stat`, `EmptyState` —
before writing new class strings. When you do write them, compose from the
tokens (`bg-card`, `border-line`, `text-paper/55`, `bg-accent`) so all three
surfaces and all six palettes keep working.
