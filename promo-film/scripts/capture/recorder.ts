/**
 * Frame-accurate recording of the real app.
 *
 * A browser can't screenshot a 3840-pixel page thirty times a second, so the
 * page is filmed one frame at a time instead. Before each frame:
 *
 *   1. Playwright's fake clock moves JavaScript time on by 1/30 s, so
 *      framer-motion, requestAnimationFrame and timers advance exactly one
 *      frame (`page.clock.runFor`).
 *   2. Every CSS animation, CSS transition and Web Animation on the page is
 *      paused and set to the same virtual time (`document.getAnimations()`).
 *   3. The choreography layer (cards rising in, bars growing, numbers
 *      counting up) is driven from that same time.
 *
 * Then the frame is captured. The result plays back at a true 30 fps no
 * matter how long each screenshot took. Choreography only animates the real
 * DOM the app rendered; it never draws UI of its own.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright";

export const FPS = 30;

/** In-page controller, injected once per page as a plain script. */
const CONTROLLER = String.raw`
(() => {
  if (window.__film) return;
  const ease = {
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outBack: (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const film = {
    t: 0,
    birth: new Map(),
    tweens: [],
    frozen: new WeakSet(),
    /** Pause every animation and put it at virtual time. */
    sync() {
      for (const a of document.getAnimations()) {
        if (!film.birth.has(a)) {
          film.birth.set(a, film.t - (a.__filmOffset || 0));
          try { a.pause(); } catch {}
        }
        const local = film.t - film.birth.get(a);
        try { a.currentTime = Math.max(0, local); } catch {}
      }
      for (const tw of film.tweens) {
        const p = Math.min(1, Math.max(0, (film.t - tw.start) / tw.dur));
        tw.apply((ease[tw.ease] || ease.outExpo)(p), p);
      }
    },
    advance(ms) { film.t += ms; film.sync(); },
    /** A Web Animation that starts "delay" ms from now on the virtual clock. */
    animate(el, keyframes, opts) {
      const a = el.animate(keyframes, { fill: "both", easing: "cubic-bezier(0.16, 1, 0.3, 1)", ...opts });
      a.pause();
      film.birth.set(a, film.t);
      a.currentTime = 0;
      return a;
    },
    /** Count a number up inside a text node, keeping its formatting. */
    countUp(el, { start = 0, dur = 1200, from = 0, decimals } = {}) {
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.textContent)) || el;
      const text = node.textContent;
      const m = text.match(/-?[\d,]*\.?\d+/);
      if (!m) return;
      const raw = m[0];
      const to = parseFloat(raw.replace(/,/g, ""));
      const dec = decimals ?? (raw.includes(".") ? raw.split(".")[1].length : 0);
      const comma = raw.includes(",");
      const fmt = (v) => {
        let s = v.toFixed(dec);
        if (comma) s = Number(s).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
        return s;
      };
      film.tweens.push({
        start: film.t + start, dur, ease: "outExpo",
        apply: (e) => { node.textContent = text.replace(raw, fmt(from + (to - from) * e)); },
      });
      node.textContent = text.replace(raw, fmt(from));
    },
    custom(start, dur, apply, easing = "outExpo") {
      film.tweens.push({ start: film.t + start, dur, ease: easing, apply });
    },
    ease,
  };
  window.__film = film;
})();
`;

export interface SequenceMeta {
  name: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  scale: number;
  theme: string;
  /** Element boxes in CSS px on the final frame, keyed by role. */
  boxes: Record<string, { x: number; y: number; w: number; h: number }>;
  notes?: string;
}

export class Recorder {
  private n = 0;
  private dir: string;
  private tick = 0;
  constructor(
    private page: Page,
    private root: string,
    public name: string,
    private opts: { quality?: number; theme: string },
  ) {
    this.dir = join(root, name);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }

  /** Freeze the page's clock and take control of its animations. */
  async begin() {
    await this.page.addScriptTag({ content: CONTROLLER });
    const now = await this.page.evaluate(() => Date.now());
    await this.page.clock.pauseAt(now + 50);
    await this.page.evaluate(() => (window as any).__film.sync());
  }

  /** Run something in the page with the controller as `f`. */
  async inPage<T>(fn: (f: any, arg: any) => T, arg?: unknown): Promise<T> {
    return this.page.evaluate(([src, a]) => {
      // eslint-disable-next-line no-new-func
      const f = (window as any).__film;
      return new Function("f", "arg", `return (${src})(f, arg);`)(f, a);
    }, [fn.toString(), arg] as const);
  }

  private async stepClock() {
    // 33, 33, 34 ms: exactly 100 ms every three frames.
    const ms = this.tick % 3 === 2 ? 34 : 33;
    this.tick++;
    await this.page.clock.runFor(ms);
    await this.page.evaluate((d) => (window as any).__film.advance(d), ms);
  }

  private cdp?: CDPSession;
  private clip?: { x: number; y: number; width: number; height: number; scale: number };

  /**
   * One frame, straight from the DevTools protocol at the device's scale.
   * Same pixels as page.screenshot() (checked: mean difference 0.002/255),
   * about a quarter faster at 5120 × 3200.
   */
  async shoot() {
    if (!this.cdp) {
      this.cdp = await this.page.context().newCDPSession(this.page);
      const vp = this.page.viewportSize()!;
      const scale = await this.page.evaluate(() => window.devicePixelRatio);
      this.clip = { x: 0, y: 0, width: vp.width, height: vp.height, scale };
    }
    const file = join(this.dir, `${String(this.n).padStart(4, "0")}.jpg`);
    const shot = (await this.cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: this.opts.quality ?? 93,
      clip: this.clip,
    })) as { data: string };
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    this.n++;
  }

  /** Advance and capture `count` frames. */
  async frames(count: number) {
    for (let i = 0; i < count; i++) {
      await this.stepClock();
      await this.shoot();
    }
  }

  /** Advance time without capturing (between takes). */
  async skip(count: number) {
    for (let i = 0; i < count; i++) await this.stepClock();
  }

  get count() {
    return this.n;
  }

  async finish(boxes: SequenceMeta["boxes"] = {}, notes?: string) {
    const vp = this.page.viewportSize()!;
    const scale = await this.page.evaluate(() => window.devicePixelRatio);
    const meta: SequenceMeta = {
      name: this.name,
      fps: FPS,
      frames: this.n,
      width: Math.round(vp.width * scale),
      height: Math.round(vp.height * scale),
      scale,
      theme: this.opts.theme,
      boxes,
      notes,
    };
    writeFileSync(join(this.dir, "meta.json"), JSON.stringify(meta, null, 2));
    await this.page.clock.resume();
    await this.cdp?.detach().catch(() => {});
    return meta;
  }
}

/** Boxes of elements on the page, in CSS px. */
export async function boxesOf(page: Page, selectors: Record<string, string>) {
  const out: SequenceMeta["boxes"] = {};
  for (const [key, sel] of Object.entries(selectors)) {
    const b = await page.locator(sel).first().boundingBox().catch(() => null);
    if (b) out[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }
  return out;
}
