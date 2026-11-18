# DoOrDie — promotional films

The launch film for DoOrDie and its cut-downs, made from the real app as it
is today (Lavender, Light and Dark, the split-flap countdown, liquid-glass
buttons).

| File | What |
| --- | --- |
| `exports/doordie-hero-4k.mp4` | The film: **58 s**, 3840 × 2160, 30 fps, H.264 High, AAC 320 kb/s, 48 kHz, −14 LUFS |
| `exports/doordie-promo-30s.mp4` | 29.5 s cut for posts and ads, 1920 × 1080, edited from the master's frames |
| `exports/doordie-vertical-15s.mp4` | 15 s vertical film composed for 9:16 (Reels, Shorts), 1080 × 1920 |
| `exports/doordie-thumbnail.png` | Thumbnail, 3840 × 2160 (`doordie-thumbnail-1280.jpg` for YouTube) |
| `exports/doordie-subtitles.srt` | Captions for the film (`-30s.srt` and `-15s.srt` for the cuts) |
| `VOICEOVER.md` | The narration, line by line, with its timings |
| `../public/media/doordie-film.mp4` | The film for the public site: 1080p, 17 MB. It opens the home page (see [On the website](#on-the-website)) |
| `../public/media/doordie-film-720.mp4` | The same film at 720p, 8 MB, for phones |
| `../public/media/doordie-film-poster.jpg` | The cover: the end card without its call to action (the `Cover` still) |
| `../public/media/doordie-film.vtt` | Captions for the site, made from `doordie-subtitles.srt` |

## The film

| Time | Scene | On screen |
| --- | --- | --- |
| 0:00 | The challenge | A study desk at night, rendered in Blender: the notebook, the clock, the whole desk. "One of the toughest journeys." |
| 0:06 | The reveal | A point of light travels in and becomes the node of the DoOrDie mark; the ring draws itself. "Introducing DoOrDie." |
| 0:14 | Command center | The real dashboard builds in 3D; its cards lift off the page. |
| 0:20 | Track every step | Logging a day in the journal, the syllabus, a revision marked as recalled, goals, habits, "Day accomplished." |
| 0:30 | Understand | The heatmap and mock analytics, in Dark. "Your preparation, made visible." |
| 0:37 | More than study hours | Sleep, the Life Dashboard, running, screen time, reflections, mistakes. |
| 0:43 | The experience | The dashboard switching Lavender → Light → Dark on a display, and on two phones. |
| 0:50 | The end card | The mark, "Your civil services preparation command center", Plan · Track · Analyze · Improve, the call to action. |

## On the website

The film is the first thing on the home page, above the hero
(`src/components/marketing/home-film.tsx`, paths in `src/lib/film.ts`).

- **It starts by itself, with sound when the browser allows it.** Chrome,
  Safari and Firefox block sound that starts on its own until the visitor
  has interacted with the site, so on a first visit it plays muted with
  captions and a "Turn sound on" button. The visitor's first tap, click or
  key press on the page turns the sound on (links excepted). The button, or
  a tap on the picture, also goes back to the start if the film is less than
  10 seconds in. Where sound is allowed, it plays with sound and no
  captions.
- **Muting is remembered.** Muting with the player's controls stores
  `doordie-film-sound=off` in `localStorage`, and from then on it plays
  muted on that device.
- **It pauses** when less than 30% of it is on screen or the tab is in the
  background, and carries on when it's back. Arriving further down the
  page, it starts when scrolled into view.
- **Less data.** Nothing downloads until it plays. Phones (up to 767 px
  wide) get the 720p file. Visitors who ask for reduced motion or data
  saving get the cover and a "Watch the film · 58 s" button instead.
- **The end.** The cover fades back in with the site's own "Start tracking
  free" and "Watch again" buttons, placed where the film's end card has its
  call to action.

## How it was made

1. **Real footage.** `scripts/capture/` builds the app against the local mock
   Supabase, creates made-up demonstration accounts ("Meera", every number
   invented, see `demo-data.ts`) and films them in Playwright one frame at a
   time: the browser's clock and every animation are stepped exactly 1/30 s
   per frame (`recorder.ts`), so each take plays back at a true 30 fps, at
   2880 × 1800. The choreography (`choreo.js`) only animates what the app
   rendered: cards rise in, numbers count up to the values the app computed,
   charts reveal the paths it drew. The theme switch is the app's own
   Appearance control; only the sheet is made transparent for that take so
   the page can be seen changing. The mock database lives in memory and is
   discarded: no real account or production data is touched.
2. **3D.** The desk is modelled and rendered in Blender Cycles
   (`scripts/blender/desk.py`), with textures drawn in `textures.py`
   (Kalam handwriting).
3. **Edit and motion.** Remotion + React + TypeScript (`src/`): CSS 3D stages,
   glass panes, kinetic type, the mark (the app's own geometry from
   `src/components/layout/logo.tsx`), particles and light.
4. **Sound.** `scripts/audio/score.py` composes and mixes an original score
   (pads, pulse, percussion, a sampled piano), the sound design (risers,
   impacts, whooshes, UI ticks and data blips placed on picture events) and
   the narration, ducked under the voice and normalised to −14 LUFS with true
   peaks under −1 dBTP.
5. **Voice.** `scripts/audio/vo.py` generates the narration with Kokoro-82M
   (voice `am_michael`) one line at a time. Whisper transcribes it back: 1.1%
   word error rate on the final mix, the only slip being "civil service's".
6. **Finish.** `scripts/render/frames.mjs` renders the frames;
   `scripts/render/finish.py` encodes the deliverables (fine grain, BT.709,
   limited range), cuts the 30-second version from the master and writes the
   captions. `finish.py web` writes the site's 1080p and 720p files, the
   cover (it renders the `Cover` still) and the WebVTT captions.

Checked on the exported files: every frame present (1,740 / 885 / 450), no
black frames, loudness −14.0 LUFS, true peak −1.2 dBTP, captions in step.

## Re-render

```bash
# From the repository root: the app built against the mock, then the takes.
node scripts/mock-supabase.mjs --print-env > /tmp/mock.env
set -a; . /tmp/mock.env; set +a; MOCK_APP_URL=http://localhost:3100 npx next build
FILM_OUT=$PWD/promo-film/public/f FILM_WORKERS=4 npx tsx promo-film/scripts/capture/film.ts
# Then in promo-film/ (write src/lib/footage.json from public/f/*/meta.json first).
python scripts/audio/vo.py && python scripts/audio/score.py hero && python scripts/audio/score.py promo30 && python scripts/audio/score.py vertical
node scripts/render/frames.mjs Hero 2 .work/hero && node scripts/render/frames.mjs Vertical15 1 .work/vertical
python scripts/render/finish.py hero && python scripts/render/finish.py promo30 && python scripts/render/finish.py vertical && python scripts/render/finish.py web
```

The desk stills in `public/renders/desk/` are committed, so Blender is only
needed to change the desk. `npm run studio` opens the compositions in
Remotion Studio. Run `npm run build` in the app afterwards: the capture build
points at the mock.

## Notes

- **No URL on the end card.** The only deployment found (the repository's
  homepage) is behind Vercel's login, so it could not be checked as public.
  Set `SITE_URL` in `src/lib/config.ts` and re-render to add it.
- **No claims.** The film shows what the app does. It names no user counts,
  rankings, awards or results, and promises no selection.
- **Size.** The 4K master is about 9.5 Mb/s (70 MB) so it fits GitHub's
  100 MB file limit. For a higher-bitrate master change `video` for `hero` in
  `scripts/render/finish.py` and re-run it.

## Credits and licences

- Footage: the DoOrDie app, filmed with made-up demonstration accounts.
- Fonts: Poppins, Comfortaa, Kalam, Caveat, Playfair Display (SIL Open Font License).
- Piano: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
- Voice: generated with Kokoro-82M by hexgrad, Apache 2.0.
- Everything else in the score and the sound design is synthesised in `scripts/audio/score.py`.
- Remotion is free for individuals and companies of up to three people; a
  larger company needs a Remotion company licence to render with it.
