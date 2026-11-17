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

### Theme: Light, Dark, Blue Glass and Auto

There are three surfaces and four choices. The choice (`themeMode` on the
store: `light`, `dark`, `blue` or `system`) is what syncs with the account, so
it follows the person to every device. The surface it resolves to is what the
CSS sees, as `data-surface` on `<html>`.

| Choice | Surface | Canvas | Cards | Text | `--wash` |
| --- | --- | --- | --- | --- | --- |
| **Light** (default) | `white` | warm ivory `#f6f4f0` | white | near-black | 0.55 |
| **Dark** | `black` | near-black `rgb(11 11 13)` | `rgb(22 22 25)` | soft white `rgb(238 238 242)` | 0.32 |
| **Blue Glass** | `blue` | pale sky `rgb(226 237 249)` and its sky | frosted white glass | deep navy `#0C1D38` | 1 |
| **Auto** | `white` or `black` | follows the device's `prefers-color-scheme`, live | | | |

Dark is a night theme, not an OLED one. On true `#000`, cards, inputs and
dialogs melted into the floor, so the canvas is lifted slightly, cards sit a
clear step above it, and hairlines (`--line: 46 46 52`) actually show. The
quietest text steps (`text-paper/25` to `/60`) and the faint wells
(`bg-paper/[0.02]` to `[0.04]`) are lifted one step on Dark only, so secondary
text clears AA there. Those overrides are wrapped in `:where()`, so they keep
the specificity of a plain utility and hover or focus colours still win.

**No flash on load.** The inline script in `app/layout.tsx` runs before first
paint. It reads the account's `upsc-chronicle-theme:<id>` key (falling back to
the old `upsc-chronicle-surface:<id>` key, and to `matchMedia` for Auto) and
sets `data-surface` before any CSS is applied. `ThemeModeSync`
(`components/pwa/theme-mode-sync.tsx`) then keeps Auto in step when the device
switches between day and night. The e2e run checks the surface at the moment
`<body>` appears, before the app's scripts run, for Dark and for Blue Glass.
A switch made in Appearance eases colours across for under half a second
(`data-appearance-switching`, set by `lib/theme.ts`).

**Older choices.** There used to be five surfaces: Ivory, Pure Black, Indigo,
Velvet and Abyss. Ivory becomes Light and the other four become Dark
(`themeModeFromSurface` in `lib/theme.ts`), both in the store migration (v12)
and in `normalizeSnapshot`, so a device still on an older version can't bring
them back.

### Blue Glass (`data-surface="blue"`)

The third theme: frosted panes on a pale sky-blue canvas, with soft blue-grey
shadows and a navy type colour. It is a surface of its own, not Light with a
tint, so it sets every token itself in the "Blue Glass" section of
`globals.css`, placed after the palettes on purpose:

| Group | Tokens | Blue Glass values |
| --- | --- | --- |
| Canvas | `--ink`, `--aura-1`, `--aura-2`, `--wash` | pale sky; cyan and azure glows; full wash |
| Panes | `--card`, `--line`, `--shadow`, `--scrim` | near-white; cool hairline; blue-grey shadow; navy scrim |
| Text | `--paper`, `--quiet`, `--quiet-canvas` | deep navy; the floor for quiet text on a pane and on the canvas |
| Accent | `--accent`, `--accent-ink`, `--accent-fg`, `--selection` | royal blue fills `#1A50CC`; deeper `#1646BA` for accent text and icons; white on fills |
| Status | `--positive` `--warning` `--danger` `--info` | deepened so small text clears 4.5:1 on its own tint |
| Charts | `--bloom-1…6` | led by the theme's blue, then cyan, violet, green, amber and rose, far enough apart to tell series apart |
| Hero | `--hero-ink`, `--hero-tile`, `--hero-ring` | the dashboard hero becomes deep sapphire with frosted tiles |

**It brings its own colours.** The palette and the wallpaper rest while Blue
Glass is on (`themeHasOwnColours` in `lib/theme.ts`; `Wallpaper` renders
nothing, and every wallpaper rule in `globals.css` excludes
`[data-surface="blue"]`). Both choices are kept and come back with Light, Dark
or Auto, and Appearance says so beside each picker.

**The sky.** `.bg-aura` on Blue Glass is daylight from the top, pale cyan and
light azure pooled in the upper corners, softer pools through the middle where
the panes sit, and cooler blues low down. It is static and every pool fades to
nothing, so it has no edges wherever it is used (the app canvas, the morning
check-in, the boot screen, the public pages).

**Readable on glass.** The quiet text steps (`text-paper/25` to `/65`) are
raised to a floor on Blue Glass (`--quiet`, 0.66), and further on the open
canvas (`--quiet-canvas`, 0.74), so secondary text still reads as secondary
and none of it falls under AA. Placeholders, chart labels and accent text are
covered the same way. Measured with a script that samples the real rendered
background behind every visible piece of text, on 35 screens at desktop,
tablet and phone sizes: on Blue Glass one of about 1,700 text items was
flagged, the tiny notification count, where the sample catches the bar around
the badge (worked out from its colours it is about 6:1); with Liquid Glass on,
none of about 1,660. For comparison, the same check flags about 40 items on
Dark and over 900 on Light, mostly its deliberately faint secondary text.

**Materials.** Blue Glass is frosted by design, so it uses the glass
materials below whether Liquid Glass is on or off. On its own its panes are
firmer (62% white, with an icy fall-off and a bright rim); with Liquid Glass
on they become clearer (42%) and pick up the corner glint over a more
colourful sky. The desktop sidebar floats as a pane of its own, inset and
rounded like the top bar; nothing else about the navigation changes.

### Liquid Glass (`data-material`)

An appearance mode, separate from the theme. The theme says Light, Dark or
Blue Glass; the material says how surfaces are drawn on it. Every combination
exists, and changing one never changes the other.

| Setting | Store / synced key | On `<html>` | Pre-paint key |
| --- | --- | --- | --- |
| Liquid Glass | `material`: `standard` \| `glass` | `data-material` | `upsc-chronicle-material:<id>` |
| Reduce transparency | `reduceTransparency`: boolean | `data-transparency="reduced"` | `upsc-chronicle-transparency:<id>` |

Both travel with the account like the theme: synced in the snapshot, painted
by the inline script before first paint, reset to Standard on sign-out, and
never read from another account's keys. `applyMaterial` in `lib/theme.ts`
puts them on screen and eases the switch like a theme change.

**Materials.** All the rules live in one section of `globals.css`. Every
selector is scoped to `[data-material="glass"]` or `[data-surface="blue"]`, so
Standard on Light and Dark is unchanged. They map from what the markup already
says, rather than a new class on every component:

| Material | Matched by | Treatment |
| --- | --- | --- |
| panel | `bg-card` (and `/60` `/80` `/85` `/95`) | translucent tint, top sheen, corner glint, lit edge; no blur |
| inner pane | a panel inside a panel, dialog or `.glass-overlay` | on Blue Glass lighter and flat, so layers read as layers; elsewhere the same as a panel |
| overlay | `bg-card` + `shadow-lift`, or `.glass-overlay` | firmer tint, `blur(28–32px)` |
| chrome | `.chrome-glass`, `.sidebar-panel`, `.glass-sticky` | the most translucent layer, `blur(22–26px)` |
| field | `.field` (every `Input`, `Select`, `Textarea`, time button) | lighter recess, visible edge, brighter on focus |
| ghost | `.glass-ghost` (outline buttons, filter toggles at rest) | on Blue Glass a faint frosted fill |
| accent | `bg-accent` | a soft gloss and a lit top edge |

The attribute part of each selector sits in `:where()`, so a rule has the
weight of a single utility class: it beats the utility it replaces (it comes
later in the file) and still loses to `hover:` and `focus:` states. The edge
colour only replaces the plain `border-line`, so accent, warning and selected
borders keep their colour. The chrome rule doubles its classes on purpose:
Tailwind appends responsive variants (`sm:bg-card/80`, `lg:backdrop-blur-xl`)
after this file, and on glass the material, not the utility, has to decide.

**Tokens, and why the two never stack.** Each rule reads `--glass-*` tokens,
and only the values change between combinations. The token blocks are wrapped
in `:where()`, so they all weigh nothing and their order in the file is their
precedence: Light glass, Dark glass, Blue Glass, Blue Glass with Liquid Glass,
firmer panes over a wallpaper, phones, the no-blur fallback, then Reduce
transparency, which therefore wins over everything before it. A surface is
tinted and blurred once, whatever is switched on.

Light glass is white panes at about 55% over a brighter canvas glow; Dark
glass is smoked charcoal panes at about 52% with a fine lit edge. Both keep
the theme's text colours, so contrast stays where the theme put it. Over a
wallpaper the panes firm up (74% and 68%) so text stays legible.

**Where blur goes.** Only where content moves or opens underneath: menus,
popovers, tooltips, the bars and sticky headers. Cards sit on the canvas,
which is soft light with nothing sharp in it, so blurring it would cost frames
on every scroll and change nothing visible; their glass comes from
translucency, the sheen, the glint and the edge, all painted as backgrounds
and shadows on the element itself. A dialog or the palette sits over a scrim
that is already blurred, so it skips its own blur (`.glass-on-scrim`). There
are no pseudo-elements and no extra layers. Phones use smaller blur radii.

Measured with a scripted three-second scroll at 4x CPU throttling in headless
Chromium, on the journal, dashboard and Life Dashboard: phone-sized views held
60 fps in every look, and on desktop Blue Glass (42–57 fps) and Liquid Glass
(45–59 fps) ran at or above Light and Dark Standard (37–47 fps) in that
software-rendered setup.

**Fallbacks.** *Reduce transparency* (in Appearance, or the device's own
`prefers-reduced-transparency`) makes every glass surface 94–98% solid and
turns blur off, in the same theme; in Standard it makes the frosted bars
solid. A browser without `backdrop-filter` gets nearly solid bars and
dialogs instead of see-through ones. With reduced motion, switching is
instant.

### Palettes (`data-palette`)

Crimson (default), Amber, Teal, Violet, Emerald, Coral.

Each palette declares its **dark-surface** values, then a
`[data-surface="white"][data-palette="…"]` block deepens the accent so it keeps
roughly 4.5:1 against the ivory canvas — the fill stays vivid, small accent text
stays legible. Blue Glass sets its own accent and chart colours after these
blocks, so the palette rests while it's on. Add a palette by declaring both blocks and appending to
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

Six of the eight are **pure CSS gradients keyed to the palette** — no bytes to
download, and they re-tint themselves when the palette changes. The layer is
deliberately static: no animation, no `filter`, no `backdrop-filter`. Measured
on a phone at 20x CPU throttle, a wallpaper costs nothing (median 50 fps against
51 without).

**`--wp-dim` is the legibility dial.** It lays canvas colour (`--ink`) back over
the art, which lightens on Light and darkens on Dark — one control
that works in both directions. Every wallpaper ships with a default that was
measured, not guessed: the page header's three text sizes must clear WCAG AA over
it. The photo wallpaper needs far more (0.85) than the patterns (0.10–0.40).

Chrome that sits directly on the wallpaper firms up automatically — `.chrome-glass`
on the topbar, and `.sidebar-panel` on the sidebar, go to 94% opacity whenever a
wallpaper is active, because translucent glass over a busy photo is where
readability dies.

The sidebar's rule is scoped to `lg` and up, which is the one place the two
differ. Above `lg` the sidebar is chrome standing beside the canvas and reads well
as glass. Below it, the same element is a full-height drawer pulled over the page,
and any transparency there prints the wallpaper and the page through the nav you
are trying to read — so on a phone it stays flatly opaque `bg-card`.

There used to be a "Your photo" wallpaper (`custom`): the user's own image, kept
in IndexedDB on the device. It was removed to save storage. A saved choice of it
now reads as plain (`normalizeWallpaper` in `lib/account/normalize.ts`), and the
stored photos are deleted from the device when an account loads
(`deleteWallpaperPhotos` in `lib/wallpaper.ts`).

## Loading states

There are two waits, they are different events, and they get different
animations. Both come from dotLottie files in `public/`, unpacked to plain JSON
by `scripts/extract-lottie.py` because `lottie-web` cannot read the zip.

| Wait | What you see | Where it lives |
| --- | --- | --- |
| Browser refresh / cold start | A cyan→blue→magenta gradient ring | `SleepGate`, via `.boot-ring` |
| Page to page (**desktop only**) | Three quiet dots over a dimmed scrim | `RouteTransition`, via `animations/page-transition.json` |
| Signing in, loading an account, first cloud pull | The gradient ring | `BootScreen` in `components/account/boot-screen.tsx`, via `.boot-ring` |

**One wait, one animation.** An earlier version faded a CSS ring into the real
Lottie once it loaded; on a slower device that hand-off was slow enough to be
legible, so a single refresh appeared to play two different animations. Each wait
now picks one technique and stays with it.

**The cold-start ring is CSS, not Lottie, and it has to be.** That wait *ends* at
hydration — the moment React takes over is the moment the app is usable — and a
Lottie player is JavaScript, so it cannot start until the wait is already over.
Measured on a throttled cold load, the pre-hydration window was about 3.6s and
the Lottie never mounted at all: the boot branch unmounted before its dynamic
import even resolved. So `.boot-ring` in `globals.css` reproduces the reference as
a masked conic gradient, which is in the server-rendered HTML and therefore
turning before a single line of JavaScript has run. `loading (1).lottie` itself
plays on the auth/sync screens, which are genuine post-hydration waits and need no
stand-in.

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

It waits 140ms before appearing, so a warm navigation shows nothing, stays a
minimum of 450ms once it does because a 50ms flash reads as a glitch, and gives up
after 8s — a stalled indicator is worse than no indicator. It sets
`pointer-events: none`: blocking taps would stop an impatient double-tap queueing
a second navigation, but a mistimed overlay would then trap the user, and a second
navigation is harmless where that is not.

**It is desktop only** (`hidden lg:grid`, so `display: none` below 1024px, which
also removes it from the accessibility and hit-testing trees). On a phone it did
more harm than good: a slower device plus a real chunk fetch kept it on screen
long enough to read as a hang, which is worse than the brief unannounced pause it
was replacing. `PageLoading` carries the same cut-off, so neither path shows a
page-to-page animation on a phone.

The dots are three light greys, which sit well on the dark surface and all
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
correctly on both surfaces without a single conditional.

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
background is deliberately quiet: two very soft accent washes, no texture. On
Blue Glass the desktop sidebar floats too, as a rounded pane inset like the
top bar; its width, collapse and items are the same.

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

The command centre used to play a looping film behind the greeting. It was
retired along with journal photos: nothing in the app downloads video now. The
panel is painted in CSS from the palette (two radial `--aura` washes and an
accent gradient on a near-black card, deep sapphire on Blue Glass through the
`--hero-*` tokens), so it costs no bytes and re-tints with the accent. It keeps the `.on-media` class, which pins its copy to a fixed
light-on-dark palette on every surface.

The one image left in `public/media/` is the still behind the optional
"The Academy" wallpaper (`hero-poster.jpg`, 61 KB, and a 30 KB phone cut used as
its picker swatch). It isn't precached; the service worker caches it the first
time someone chooses that wallpaper.

### Performance rules that still apply

- **No `backdrop-filter` on anything that scrolls.** The sticky topbar re-blurs
  the page behind it on every scroll tick, so in Standard it is opaque below
  `sm` and frosted only on desktop. Liquid Glass and Blue Glass frost the bars
  on phones too, with a smaller radius (16px), measured at 60 fps; cards never
  blur. Use a flat translucent fill instead.
- **Don't transform-animate blurred layers on phones.** The drifting aura orbs
  are 130px blurs; animating them is continuous GPU work. They're `hidden sm:block`.
- `content-visibility: auto` on the cards below the fold was tried and removed:
  it bought nothing here and added a scroll-height quirk. Measure before keeping
  a trick like that.

## A Tailwind trap worth knowing

`bg-accent/12` compiles silently and emits **no CSS at all** — 12 isn't on
Tailwind's opacity scale, which moves in steps of 5. The element just loses its
background with no error anywhere.

This has bitten the codebase twice: once it stripped the scrims off the old hero
video, and once it left every `Badge` tone, the topic-mastery ramp, the form
focus ring and the celebration medal with no fill for several releases. So there
is now a guard:

```bash
npm run check:classes
```

It scans for off-scale opacity modifiers and exits non-zero. Use a multiple of 5,
or an arbitrary value (`bg-black/[0.12]`) when you really need something between.

A second trap: with no `@tailwind variants` directive, Tailwind appends every
variant utility (`hover:`, `focus:`, `sm:`, `lg:`, `placeholder:`) **after**
`globals.css`. That is why hover and focus colours beat the theme and glass
overrides, as intended, but it also means a rule meant to win over a variant
needs one step more weight: the glass chrome rule doubles its classes, and the
Blue Glass placeholder rule adds `:is(input, textarea)`.

## Adding UI

Reach for the primitives in `src/components/ui` — `Card`, `Button`, `Badge`,
`Segmented`, `Chip`, `Progress`, `Modal`, `PageHeader`, `Stat`, `EmptyState` —
before writing new class strings. When you do write them, compose from the
tokens (`bg-card`, `border-line`, `text-paper/55`, `bg-accent`) so all three
themes, both materials and all six palettes keep working. The glass materials
find surfaces by those classes, plus a few hooks: `field` on any hand-styled
input or select, `glass-ghost` on an outline control with no fill,
`.glass-overlay` on a custom floating panel, and `glass-on-scrim` on a dialog
that sits over a blurred scrim.
