"use client";

import { useEffect, useRef } from "react";

/**
 * A one-shot confetti burst on a canvas — no dependency, no DOM churn.
 *
 * Everything is drawn on a single canvas rather than as elements, so the whole
 * thing is one composited layer and the main thread does nothing but move
 * numbers. It stops itself once the pieces fall past the bottom, and it takes
 * its colours from the live palette so it always belongs to the theme.
 *
 * Under `prefers-reduced-motion` it doesn't run at all; the modal shows its
 * static medal instead.
 */
export function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const read = (name: string, fallback: string) => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return v ? `rgb(${v})` : fallback;
    };
    const colours = [
      read("--accent", "#e11d48"),
      read("--bloom-2", "#7c3aed"),
      read("--bloom-3", "#2563eb"),
      read("--bloom-4", "#0d9488"),
      read("--bloom-5", "#d97706"),
      read("--paper", "#ffffff"),
    ];

    type Piece = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      spin: number;
      angle: number;
      colour: string;
      ribbon: boolean;
    };

    // Two fountains, angled inwards, so the burst frames the medal instead of
    // covering it.
    const pieces: Piece[] = [];
    const origins = [
      { x: rect.width * 0.22, dir: 1 },
      { x: rect.width * 0.78, dir: -1 },
    ];
    for (const origin of origins) {
      for (let i = 0; i < 55; i++) {
        const spread = (Math.random() - 0.5) * 1.1;
        const speed = 5.5 + Math.random() * 6.5;
        pieces.push({
          x: origin.x,
          y: rect.height * 0.62,
          vx: (spread + origin.dir * 0.55) * speed * 0.55,
          vy: -speed * (0.85 + Math.random() * 0.6),
          size: 4 + Math.random() * 6,
          spin: (Math.random() - 0.5) * 0.28,
          angle: Math.random() * Math.PI,
          colour: colours[i % colours.length],
          ribbon: Math.random() > 0.45,
        });
      }
    }

    let raf = 0;
    let frame = 0;
    const gravity = 0.19;
    const drag = 0.992;

    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, rect.width, rect.height);
      let alive = 0;

      for (const p of pieces) {
        p.vy += gravity;
        p.vx *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        if (p.y < rect.height + 40) alive++;
        // fade out over the last third of the flight
        const fade = Math.max(0, 1 - Math.max(0, frame - 70) / 60);
        if (fade <= 0) continue;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.colour;
        if (p.ribbon) ctx.fillRect(-p.size / 2, -p.size / 6, p.size, p.size / 3);
        else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      if (alive > 0 && frame < 135) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [fire]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
