# Design system

DoOrDie's look: **calm frosted glass**. Translucent panes on a soft sky-blue
backdrop with one luminous blue by day, black glass with white buttons by
night, Poppins throughout the app, and depth from soft wide shadows and lit
edges rather than hard borders.

Everything is driven by CSS custom properties in `src/app/globals.css` and
surfaced to Tailwind in `tailwind.config.ts`, so pages never hard-code a colour.

## Tokens

| Token | Role |
| --- | --- |
| `--ink` | the canvas behind everything (`bg-ink`) |
| `--card` / `--card-2` | a solid card colour and a quieter step, for the few surfaces drawn without glass |
| `--paper` | foreground / text (`text-paper`, and tints like `bg-paper/[0.04]`) |
| `--line` | hairline borders (`border-line`, and the default `border` colour) |
| `--scrim` | modal/drawer backdrop, always darkening (`bg-scrim/45`) |
| `--aura-1` / `--aura-2` | glow colours for `bg-aura` (sign-in, boot and check-in screens) |
| `--shadow` | shadow tint: blue-grey on Light, black on Dark |
| `--accent` / `--accent-fg` | fills for what's interactive (blue on Light, white on Dark), and the text that sits on them |
| `--accent-ink` | accent-coloured text and icons (`.text-accent` reads it) |
| `--accent-glow` | how strongly accent buttons glow beneath (`shadow-accent`, the avatar) |
| `--positive` `--warning` `--danger` `--info` | status colours, deep enough for small text |
| `--vivid-up` / `--vivid-down` | brighter trend strokes and dots, never text |
| `--bloom-1…6` | categorical data palette for charts |
| `--quiet` / `--quiet-canvas` | the floor for quiet text on a pane, and straight on the stage |

Every layer of the layout has its own tokens too, back to front: `--backdrop`
(the environment), `--shell-*` (rail, sidebar, top bar), `--stage-*` (the
panel the page sits in), `--drawer-*` (the phone's navigation drawer),
`--glass-*` (panes, tiles, overlays, fields) and `--nav-*` (hover and active
navigation states). `--stage-image` adds a sheen to the stage's top edge on
Dark.

Note the naming: **`ink` is the background and `paper` is the foreground**, and
they swap with the theme. A tint like `bg-paper/[0.04]` is therefore a subtle
recessed fill in both themes, not a light or dark one.

## Themes: Light and Dark

Two themes, both frosted glass. The choice (`themeMode` on the store, `light`
or `dark`) syncs with the account, so it follows the person to every device.
The CSS sees it as `data-surface` on `<html>`: `white` for Light, `black` for
Dark. Each theme sets every token itself, so a preview of one drawn inside the
other (the cards in Appearance) shows its own colours.

| Theme | Canvas | Panes | Text | Accent |
| --- | --- | --- | --- | --- |
| **Light** (default) | pale sky `rgb(214 238 251)` under a layered sky | white at 60%, a top sheen and a bright rim | navy `#163147` | `#0E6BC4` fills with white text; `#0A58A6` for accent text |
| **Dark** | near-black `rgb(8 8 9)` under a soft spotlight from above | charcoal `rgb(30 30 32)` at 70%, a fine lit top edge | soft white `#EDEDED` | white fills with black text; white for accent text |

**Light** is a soft sky of layered cyan and pale-blue light, brightest at the
top left, with frosted white panes, soft blue-grey shadows and one luminous
blue. **Dark** is black glass with no blue in its surfaces: a near-black
backdrop lit softly from above, charcoal panes with a lit top edge, tiles a
step lighter, and white for what's interactive. Primary buttons are white
with black text, selected items a lighter grey, and single-series charts,
progress and heatmaps are drawn in white and greys. Colour is kept for
meaning: status colours, and the categorical chart colours (white, violet,
lime, amber, green, pink).

**Readable on glass.** Contrast was worked out by compositing each layer
(backdrop, stage, pane, tile) at the backdrop's darkest and brightest points:

| | Light | Dark |
| --- | --- | --- |
| text on a pane | 11–13:1 | 13.7–15.4:1 |
| accent text on a pane | 5.8–6.8:1 | 16–18:1 (white) |
| text on an accent fill | 5.4:1 (white) | 18:1 (black on white) |
| status colours on a pane or tile | 4.6–6.3:1 | 4.9–11.8:1 |

Quiet text is written as low-opacity ink (`text-paper/40`), which suits an
opaque card but is hard to read on glass. Every step below the theme's floor
is raised to it: `--quiet` is 0.7 on Light panes (0.74 straight on the
stage) and 0.56 on Dark, the lowest strengths that still clear 4.5:1 there.
Placeholders, chart labels and gridlines are covered the same way. On Dark the
faint wells and hover fills (`bg-paper/[0.02]` to `[0.06]`) also take one more
step. These rules keep the weight of a single utility, so hover and focus
colours still win.

**No flash on load.** The inline script in `app/layout.tsx` runs before first
paint. It reads the account's `upsc-chronicle-theme:<id>` and
`upsc-chronicle-transparency:<id>` keys and sets `data-surface`,
`data-theme-mode` and `data-transparency` before any CSS is applied. The e2e
run checks the surface and the transparency at the moment `<body>` appears.
A switch made in Appearance eases colours across for under half a second
(`data-appearance-switching`, set by `lib/theme.ts`). `ThemeModeSync`
(`components/pwa/theme-mode-sync.tsx`) keeps the page in the saved theme
however it changed, and `ThemeColorSync` keeps the browser's `theme-color` on
the canvas colour.

**Older choices.** Earlier versions offered more, and each still opens as
something sensible (`legacyThemeMode` and `themeModeFromSurface` in
`lib/theme.ts`, used by the store migrations, `normalizeSnapshot` and the
pre-paint script):

| Saved by an older version | Opens as |
| --- | --- |
| Blue Glass (`blue`) | Light, which is the same look |
| Auto (`system`) | whichever theme the device shows when it's read |
| the five surfaces (Ivory, Pure Black, Indigo, Velvet, Abyss) | Ivory is Light, the rest Dark |
| a colour palette, Liquid Glass, a wallpaper | dropped; nothing else changes |

The store migrates once (v15 drops wallpapers, v16 settles the theme and drops
palettes and Liquid Glass), and `normalizeSnapshot` does the same for anything
an older device still sends through the cloud. Their old pre-paint keys are no
longer read; sign-out still removes them (`ACCOUNT_KEY_PREFIXES` in
`lib/account/scope.ts`).

## Materials

One layout and one set of materials for both themes; each theme only sets the
values. They map from what the markup already says, rather than a new class
on every component:

| Layer | Matched by | Treatment |
| --- | --- | --- |
| backdrop | `.app-backdrop` | the theme's layered gradients, static |
| shell | `.chrome-glass` (rail, sidebar, top bar, the phone's dock) | frosted, `blur(24px)` (18px on phones) |
| stage | `.app-stage`, from `lg` | the large translucent panel each page sits in |
| panel | `bg-card` (and `/60` `/80` `/85` `/95`) | translucent tint, top sheen, corner glint, lit edge; no blur |
| inner | a panel inside a panel or overlay, `.inset-panel`, `bg-card-2` | a lighter, flatter pane, so layers read as layers |
| overlay | `bg-card` + `shadow-lift`, or `.glass-overlay` | dialogs, menus, the palette: the firmest tint, `blur(28px)` |
| sticky | `.glass-sticky` (+ `.glass-strip` for a full-width header) | frosted like the shell |
| field | `.field` (every `Input`, `Select`, `Textarea`, time button) | a light recess with a visible edge, brighter on focus |
| ghost | `.glass-ghost` (outline buttons, filter toggles at rest) | a faint frosted fill |
| accent | `bg-accent` | a soft gloss and a lit top edge |

Each rule has the weight of a single utility class: it beats the utility it
replaces (it comes later in the file) and still loses to `hover:` and
`focus:` states. The edge colour only replaces the plain `border-line`, so
accent, warning and selected borders keep their colour. The sticky rule
doubles its class on purpose: Tailwind appends responsive variants
(`sm:bg-card/80`) after this file, and the material, not the utility, has to
decide.

**Where blur goes.** Only on the shell and on overlays, where content moves or
opens underneath. Cards sit on the stage, over soft light with nothing sharp
behind it; blurring that would cost frames on every scroll and change nothing
visible, so their glass comes from translucency, the sheen, the glint and the
edge, painted as backgrounds and shadows on the element itself. A dialog over
a blurred scrim skips its own blur (`.glass-on-scrim`): one backdrop filter
per layer, never two. Phones use smaller blur radii.

**Reduce transparency** (in Appearance, synced as `reduceTransparency`, or
asked for by the device through `prefers-reduced-transparency`) makes every
pane, tile, bar and dialog 94–98% solid and turns blur off, in the same theme.
The page behind a dialog dims instead of blurring. On Light, tiles take a pale
blue and the selected navigation item an accent tint, since near-solid white
leaves nothing for white to stand out against. A browser without
`backdrop-filter` gets nearly solid bars and dialogs instead of see-through
ones. With reduced motion, switching is instant.

## Type

**Two faces, and only two**, both geometric.

| Face | Variable / class | Used for |
| --- | --- | --- |
| **Poppins** | `--font-sans` | everything in the app: body, labels, controls, headings and figures |
| **Comfortaa** | `--font-brand` · `font-brand` | the wordmark, and the public site's headings |

- `--font-display` points at Poppins in the app (set on `<body>`, so dialogs
  portalled there get it too) and at Comfortaa inside the public site's
  `.site-root`. `h1`–`h4` and `font-display` read it.
- Headings are semibold to bold and tight. Body text is tracked in slightly
  (`-0.015em`) because Poppins runs wide and open.
- `.eyebrow` is the small label above a heading or a figure, **in sentence
  case**: 0.78rem, medium, at 75% ink. Quiet comes from size, weight and
  colour rather than capitals, so a page of labels never reads as shouting.
  The public site keeps its small tracked capitals. Avoid `uppercase` for UI
  labels; the few left are abbreviations drawn in charts.
- `.tabular` locks figures to one width for anything that has to line up in a
  column. `kbd`, `code`, `pre` and `samp` are Poppins with tabular figures;
  there is no monospace face.
- No italics in headings: Comfortaa has none, and a synthesised oblique looks
  broken.

### Symbols must be drawn, not typed

Poppins (latin subset) has **no arrows and no `⌘`**: `→ ↗ ↔ ⌘ ✓` are all
missing, so typing them either falls back to a system font (a third typeface) or
renders a tofu box. Use a `lucide-react` icon instead (`ArrowRight`,
`ChevronRight`, `Command`, `Check`). Characters that *are* safe and in use:
`− — · › » ± % ₹ • “ ” ’`. When in doubt, measure rather than guess: render the
character in `--font-sans` on a canvas and compare its width against a
private-use codepoint.

## Shape and depth

- Radii: cards `rounded-2xl` (1.25rem), the stage 1.75rem, sheets and hero
  panels `rounded-3xl`; buttons, chips, pills and nav items `rounded-full` or
  `rounded-xl`.
- Shadows: `shadow-soft` for resting cards, `shadow-lift` for hover and
  dialogs, `shadow-accent` for accent buttons. On glass both read the theme's
  `--glass-drop` values.
- Hover on a card: `-translate-y-0.5`, `shadow-lift` and an accent-tinted
  border (`<Card hover>` does this for you).

## The shell

Three zones on a desktop, all frosted, floating over the backdrop:

| Zone | Where | What |
| --- | --- | --- |
| **Rail** | `lg` and up, 76px | the logo, your avatar (account menu), shortcuts to the main pages, then search, notifications, appearance and settings |
| **Sidebar** | docked from `xl` (1280px), 256px | every page in its groups, with the revision count. Collapsible; the choice is kept per browser (`upsc-chronicle-sidebar`). Between `lg` and `xl` it opens as a flyout over the page |
| **Main stage** | `lg` and up | the top bar (the wide search field that opens the command palette, `⌘K` / `Ctrl K`; the days-to-exam chip; Log today) above the page, which sits in `.app-stage` |

Below `lg` the layout changes rather than shrinks: a slim top bar (menu,
search, notifications, account), the page edge to edge on the backdrop, a
floating bottom dock with the four most used pages and More, and the full
navigation in a drawer. Notifications and the account menu open from the rail on a
desktop and from the top bar on a phone, where they become bottom sheets; only
one instance of each is mounted (`useMatchMedia`).

## Wallpapers (retired)

Earlier versions offered wallpapers behind the app, including a photo of your
own kept in the browser. Each theme now paints its own backdrop. A saved
choice is dropped (store v15 and `normalizeSnapshot`), and any photo still
stored on a device is deleted when an account loads
(`deleteRetiredWallpaperPhotos` in `lib/account/session.ts`).

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
hydration (the moment React takes over is the moment the app is usable), and a
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
rendered zero times while the old page sat there, which is the whole "did my tap
register?" complaint. `RouteTransition` therefore starts on a capture-phase
click, on `popstate`, and on an explicit `beginRouteTransition()` for
`router.push` callers like the command palette; it ends when `usePathname` /
`useSearchParams` change plus two animation frames, so it lifts only once the
next page has painted.

It waits 140ms before appearing, so a warm navigation shows nothing, stays a
minimum of 450ms once it does because a 50ms flash reads as a glitch, and gives up
after 8s: a stalled indicator is worse than no indicator. It sets
`pointer-events: none`: blocking taps would stop an impatient double-tap queueing
a second navigation, but a mistimed overlay would then trap the user, and a second
navigation is harmless where that is not.

**It is desktop only** (`hidden lg:grid`, so `display: none` below 1024px, which
also removes it from the accessibility and hit-testing trees). On a phone it did
more harm than good: a slower device plus a real chunk fetch kept it on screen
long enough to read as a hang, which is worse than the brief unannounced pause it
was replacing. `PageLoading` carries the same cut-off, so neither path shows a
page-to-page animation on a phone.

The dots are three light greys, which sit well on Dark and all but vanish on
Light. `.lottie-neutral` inverts them under `[data-surface="white"]`; they are
near-neutral, so nothing shifts hue.

## Opening animations

Every route plays a short rise-and-fade, and the page's own top-level sections
follow in a cascade: `.page-enter` in `globals.css`, applied by
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
- `prefers-reduced-motion` collapses all of it via the global block at the end of
  `globals.css`.

## Marking a day accomplished

`accomplished: ISODate[]` on the store, toggled by `toggleAccomplished(date)`,
which **returns true only on the transition into accomplished**. The celebration
listens to that return value rather than to state, so unmarking, re-rendering or
returning tomorrow never replays it.

The celebration itself (`components/celebrate/`) is a medal whose ring sweeps in
and then ticks, a confetti burst, the day's motivational line, and three facts
(streak, hours logged, days to exam). The confetti is a **single canvas**, not
DOM elements: one composited layer, colours read from the live theme, and it
stops itself once the pieces fall. Under `prefers-reduced-motion` it doesn't run
and the static medal carries the moment.

Lines live in `lib/motivation.ts`, chosen by day index rather than at random so
the same day always shows the same line, with streak milestones (3, 7, 14, 21,
30, 50, 75, 100, 150, 200, 365) taking over when they land.

## Text over media

A region sitting on a photo or another busy image gets the `.on-media` class.
It pins that subtree to a fixed light-on-dark palette (`--paper` white,
`--card` near-black, `--line` a soft grey), so every token-based utility
inside it resolves correctly in both themes without a single conditional. On
top of the image, stack cheap scrims rather than one flat overlay, and give
small text a `drop-shadow`. Measure the result rather than eyeballing it:
WCAG AA is 4.5:1, or 3:1 for text 24px and up.

## Data colour

- **Single series** (hours per month, weekday rhythm, sleep) → the accent.
  `BarChart` does this by default; pass `multicolor` only for genuinely
  categorical bars.
- **Categorical** (subject split) → `--bloom-1…6`, e.g. the donut.
- **Directional** (mock candles, correlations, accuracy) → `positive` /
  `danger` / `warning`; trend strokes use `--vivid-up` / `--vivid-down`.
- **Intensity** (heatmaps, the subject × error matrix, topic mastery) → the
  accent at rising strength, with the count's text colour chosen per step so
  it stays readable.
- **Fixed scales** (a 1–5 rating) → pass `domain` and `ticks` to `LineChart`,
  so the axis never shows a value the scale can't have.

## Performance rules that still apply

- **No `backdrop-filter` on anything that scrolls with the page.** Only the
  shell, sticky headers and overlays blur; cards never do.
- **Don't transform-animate blurred layers on phones.** Animating a blur is
  continuous GPU work.
- `content-visibility: auto` on the cards below the fold was tried and removed:
  it bought nothing here and added a scroll-height quirk. Measure before keeping
  a trick like that.

## A Tailwind trap worth knowing

`bg-accent/12` compiles silently and emits **no CSS at all**: 12 isn't on
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
needs one step more weight: the sticky glass rule doubles its class, and the
placeholder rule adds `:is(input, textarea)`.

## Adding UI

Reach for the primitives in `src/components/ui` (`Card`, `Panel`,
`MetricCard`, `Button`, `IconButton`, `Badge`, `Segmented`, `Chip`,
`Progress`, `Modal`, `PageHeader`, `Stat`, `EmptyState`, `Avatar`) before
writing new class strings. When you do write them, compose from the tokens
(`bg-card`, `border-line`, `text-paper/55`, `bg-accent`) so both themes and
Reduce transparency keep working. The materials find surfaces by those
classes, plus a few hooks: `field` on any hand-styled input or select,
`glass-ghost` on an outline control with no fill, `.glass-overlay` on a custom
floating panel, and `glass-on-scrim` on a dialog that sits over a blurred
scrim. Check new screens in both themes, with Reduce transparency on, and at
phone, tablet and desktop widths.
