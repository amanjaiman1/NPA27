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
| `--shadow` | shadow tint, warm on ivory and black on dark |
| `--accent` / `--accent-fg` | the brand colour and text that sits on it |
| `--positive` `--warning` `--danger` `--info` | semantic colours |
| `--bloom-1…6` | categorical data palette for charts |

Note the naming: **`ink` is the background and `paper` is the foreground**, and
they swap with the surface. A tint like `bg-paper/[0.04]` is therefore a subtle
recessed fill on every surface, not a light or dark one.

### Surfaces (`data-surface`)

| id | Name | Canvas |
| --- | --- | --- |
| `white` | **Ivory** (default) | warm off-white `#f6f4f0`, white cards |
| `black` | **Charcoal** | soft near-black `#121214` — never flat pure black |
| `navy` | **Indigo** | deep blue night `#0f1221` |

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

## Adding UI

Reach for the primitives in `src/components/ui` — `Card`, `Button`, `Badge`,
`Segmented`, `Chip`, `Progress`, `Modal`, `PageHeader`, `Stat`, `EmptyState` —
before writing new class strings. When you do write them, compose from the
tokens (`bg-card`, `border-line`, `text-paper/55`, `bg-accent`) so all three
surfaces and all six palettes keep working.
