/*
 * Choreography for filming the real app. Injected into the page after the
 * recorder's controller (window.__film). It only animates elements the app
 * rendered: cards rise into place, numbers count up to the values the app
 * computed, charts reveal the paths and bars the app drew. Nothing here
 * paints UI of its own.
 */
(() => {
  if (window.__choreo) return;
  const F = () => window.__film;
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const main = () => document.querySelector("main.app-stage") || document.body;
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el, pad = 40) => {
    const r = rect(el);
    return r.width > 0 && r.height > 0 && r.bottom > -pad && r.top < innerHeight + pad && r.right > 0 && r.left < innerWidth;
  };
  const topCards = (root = main()) =>
    q("div.bg-card, section.bg-card, a.bg-card, li.bg-card, button.bg-card", root).filter(
      (el) => !el.parentElement.closest(".bg-card") && visible(el),
    );
  const byReadingOrder = (a, b) => {
    const ra = rect(a), rb = rect(b);
    return Math.abs(ra.top - rb.top) > 24 ? ra.top - rb.top : ra.left - rb.left;
  };

  if (window.CSS && CSS.registerProperty) {
    try { CSS.registerProperty({ name: "--film-sweep", syntax: "<angle>", inherits: false, initialValue: "0deg" }); } catch {}
    try { CSS.registerProperty({ name: "--film-wipe", syntax: "<percentage>", inherits: false, initialValue: "0%" }); } catch {}
  }

  const C = {
    q, main, topCards, visible, rect,

    rise(el, delay = 0, { dur = 1000, y = 46, scale = 0.96, blur = 10 } = {}) {
      return F().animate(
        el,
        [
          { opacity: 0, transform: `translateY(${y}px) scale(${scale})`, filter: `blur(${blur}px)` },
          { opacity: 1, transform: "translateY(0px) scale(1)", filter: "blur(0px)" },
        ],
        { duration: dur, delay },
      );
    },

    fade(el, delay = 0, dur = 600) {
      return F().animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay, easing: "ease-out" });
    },

    /** A ring or donut drawn clockwise from 12 o'clock. */
    sweep(el, delay = 0, dur = 1300) {
      el.style.webkitMaskImage = el.style.maskImage = "conic-gradient(from 0deg, #000 var(--film-sweep), transparent 0)";
      return F().animate(el, [{ "--film-sweep": "0deg" }, { "--film-sweep": "361deg" }], {
        duration: dur, delay, easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      });
    },

    /** A chart revealed left to right, as if drawn. */
    wipe(el, delay = 0, dur = 1200, soft = 6) {
      el.style.webkitMaskImage = el.style.maskImage = `linear-gradient(90deg, #000 calc(var(--film-wipe) - ${soft}%), transparent var(--film-wipe))`;
      return F().animate(el, [{ "--film-wipe": "0%" }, { "--film-wipe": `${100 + soft}%` }], {
        duration: dur, delay, easing: "cubic-bezier(0.45, 0, 0.2, 1)",
      });
    },

    /** Bars grow from their baseline, one after another. */
    bars(root, delay = 0, { stagger = 34, dur = 760 } = {}) {
      const bars = q('[class*="rounded-t-"]', root).filter((b) => rect(b).height > 0.5);
      bars.sort((a, b) => rect(a).left - rect(b).left);
      bars.forEach((b, i) => {
        b.style.transformOrigin = "50% 100%";
        F().animate(b, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: dur, delay: delay + i * stagger });
      });
      return bars.length;
    },

    /** Progress fills slide out to the width the app gave them. */
    progress(root, delay = 0, { stagger = 60, dur = 1100 } = {}) {
      const fills = q("div[style*='width']", root).filter((d) => {
        const p = d.parentElement;
        return p && /rounded-full|overflow-hidden/.test(p.className) && /%/.test(d.style.width) && rect(p).height <= 14;
      });
      fills.forEach((d, i) => {
        F().animate(d, [{ width: "0%" }, { width: d.style.width }], { duration: dur, delay: delay + i * stagger });
      });
      return fills.length;
    },

    /** Heatmap cells light up column by column. */
    heatmap(root, delay = 0, { col = 16, row = 9, dur = 520 } = {}) {
      const cols = q("div.flex.flex-col", root).filter(
        (d) => d.children.length >= 5 && d.children.length <= 7 && [...d.children].every((x) => x.tagName === "DIV" && x.children.length === 0),
      );
      const shown = cols.filter((c) => visible(c, 0));
      shown.sort((a, b) => rect(a).left - rect(b).left);
      cols.forEach((c) => [...c.children].forEach((cell) => (cell.dataset.film = "1")));
      shown.forEach((c, ci) => {
        [...c.children].forEach((cell, ri) => {
          F().animate(
            cell,
            [{ opacity: 0, transform: "scale(0.35)" }, { opacity: 1, transform: "scale(1)" }],
            { duration: dur, delay: delay + ci * col + ri * row, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" },
          );
        });
      });
      return shown.length;
    },

    /** Small dot rows (streak dots, habit grids) pop in. */
    dots(root, delay = 0, { stagger = 12, dur = 420 } = {}) {
      const dots = q("span, div", root).filter((d) => {
        const r = rect(d);
        return !d.dataset.film && d.children.length === 0 && r.width >= 4 && r.width <= 16 && Math.abs(r.width - r.height) < 1.5 && /rounded/.test(d.className) && !d.textContent.trim();
      });
      dots.sort(byReadingOrder);
      // Keep the whole ripple under ~0.7 s however many dots there are.
      stagger = Math.min(stagger, 700 / Math.max(1, dots.length));
      dots.forEach((d, i) =>
        F().animate(d, [{ opacity: 0, transform: "scale(0.2)" }, { opacity: 1, transform: "scale(1)" }], {
          duration: dur, delay: delay + i * stagger, easing: "cubic-bezier(0.34, 1.5, 0.64, 1)",
        }),
      );
      return dots.length;
    },

    /** Numbers count up to the value the app shows. */
    counts(root, delay = 0, { dur = 1500 } = {}) {
      const plain = /^[-−+]?[\d,]*\.?\d+\s*(%|h|d|days?|km|L|min|kg|pp)?$/;
      let n = 0;
      for (const el of q(".tabular, p, span", root)) {
        if (el.children.length > 1 || el.closest(".flap, [aria-hidden='true'], [aria-hidden=''], .sr-only")) continue;
        const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").trim();
        if (!own || !plain.test(own) || own.length > 9) continue;
        const r = rect(el);
        if (r.height < 14) continue; // only figures large enough to read
        F().countUp(el, { start: delay, dur });
        n++;
      }
      return n;
    },

    /** Every visible SVG chart: rings sweep, line charts wipe on. */
    svgs(root, delay = 0) {
      let n = 0;
      for (const svg of q("svg", root)) {
        const r = rect(svg);
        if (r.width < 40 || r.height < 24 || svg.closest("button, a[class*='rounded-full']")) continue;
        const circles = q("circle", svg).filter((c) => c.getAttribute("stroke-dasharray") || c.style.strokeDasharray);
        const paths = q("path", svg).filter((p) => (p.getAttribute("d") || "").length > 30);
        if (circles.length) { C.sweep(svg, delay, 1400); n++; }
        else if (paths.length) { C.wipe(svg, delay, 1300); n++; }
      }
      return n;
    },

    /** Everything inside a card, timed from the card's own entrance. */
    inner(card, d) {
      C.svgs(card, d + 160);
      C.heatmap(card, d + 120);
      C.bars(card, d + 200);
      C.progress(card, d + 260);
      C.counts(card, d + 120);
      C.dots(card, d + 260);
    },

    /** The page's header, then its cards in reading order. */
    build({ start = 0, stagger = 85, header = true, inner = true, limit = 40 } = {}) {
      const m = main();
      let t = start;
      if (header) {
        const h1 = q("h1", m).find((h) => visible(h));
        const head = h1 && (h1.closest("header") || h1.parentElement.parentElement);
        if (head && !head.closest(".bg-card")) { C.rise(head, t, { y: 30, blur: 8 }); t += 140; }
      }
      const cards = topCards(m).sort(byReadingOrder).slice(0, limit);
      cards.forEach((card, i) => {
        const d = t + i * stagger;
        C.rise(card, d);
        if (inner) C.inner(card, d);
      });
      return cards.length;
    },

    /** Boxes of the visible top-level cards, the page header, the shell and any dialog (CSS px). */
    layoutBoxes() {
      const out = {};
      const put = (key, el) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        out[key] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const m = main();
      put("stage", m);
      const h1 = m.querySelector("h1");
      put("header", h1 && (h1.closest("header") || h1.parentElement.parentElement));
      const seen = new Map();
      for (const c of q("div.bg-card, section.bg-card, a.bg-card, li.bg-card", m).filter((el) => !el.parentElement.closest(".bg-card"))) {
        const r = rect(c);
        if (r.bottom < 0 || r.top > innerHeight || r.width < 60) continue;
        const h = c.querySelector("h2, h3, .eyebrow, p");
        let label = ((h && h.textContent) || "card").trim().replace(/\s+/g, " ").slice(0, 40) || "card";
        const k = seen.get(label) || 0;
        seen.set(label, k + 1);
        if (k) label += " #" + (k + 1);
        put("card:" + label, c);
      }
      put("dialog", document.querySelector("[role='dialog']"));
      return out;
    },

    /** Smooth programmatic scroll of the page, driven by the virtual clock. */
    scroll(to, delay = 0, dur = 2400) {
      const m = main();
      const from = m.scrollTop;
      F().custom(delay, dur, (e) => { m.scrollTop = from + (to - from) * e; }, "inOutCubic");
    },
  };
  window.__choreo = C;
})();
