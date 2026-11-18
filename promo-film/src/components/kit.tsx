import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import footage from "../lib/footage.json";
import { EASE, lerp, ramp, rng } from "../lib/anim";
import { C } from "../lib/config";

type Box = { x: number; y: number; w: number; h: number };
type Take = { frames: number; w: number; h: number; cssW: number; theme: string; boxes: Record<string, Box> };
export const TAKES = footage as unknown as Record<string, Take>;

export const POPPINS = "Poppins, sans-serif";
export const COMFORTAA = "Comfortaa, Poppins, sans-serif";

/* ── footage ──────────────────────────────────────────────────── */

/**
 * One take of the real app, as an image sequence. `t` is the scene's frame;
 * the take starts at `at`, from its frame `start`, at `rate` frames per frame,
 * and holds its last frame. `crop` is in the capture's CSS pixels.
 */
export const Footage: React.FC<{
  take: string;
  t: number;
  width: number;
  at?: number;
  start?: number;
  rate?: number;
  crop?: Box;
  radius?: number;
  style?: React.CSSProperties;
}> = ({ take, t, width, at = 0, start = 0, rate = 1, crop, radius = 0, style }) => {
  const m = TAKES[take];
  if (!m) throw new Error(`no take ${take}`);
  const cssH = (m.h / m.w) * m.cssW;
  const c = crop ?? { x: 0, y: 0, w: m.cssW, h: cssH };
  const idx = Math.max(0, Math.min(m.frames - 1, Math.floor(start + Math.max(0, t - at) * rate)));
  const k = width / c.w;
  return (
    <div style={{ position: "relative", width, height: c.h * k, overflow: "hidden", borderRadius: radius, ...style }}>
      <Img
        src={staticFile(`f/${take}/${String(idx).padStart(4, "0")}.jpg`)}
        style={{ position: "absolute", left: -c.x * k, top: -c.y * k, width: m.cssW * k, height: cssH * k, maxWidth: "none" }}
      />
    </div>
  );
};

/** A pane of glass around footage: hairline rim, soft drop, and a light sweep. */
export const Glass: React.FC<{
  children: React.ReactNode;
  radius?: number;
  sweep?: number; // 0..1 position of the light sweep, or -1 for none
  shadow?: number;
  rim?: number;
  style?: React.CSSProperties;
}> = ({ children, radius = 22, sweep = -1, shadow = 1, rim = 0.22, style }) => (
  <div
    style={{
      position: "relative",
      borderRadius: radius,
      boxShadow: `0 0 0 1.5px rgba(255,255,255,${rim}), 0 ${50 * shadow}px ${130 * shadow}px rgba(0,6,24,${0.55 * shadow}), 0 ${14 * shadow}px ${40 * shadow}px rgba(0,0,0,${0.3 * shadow})`,
      ...style,
    }}
  >
    <div style={{ borderRadius: radius, overflow: "hidden", position: "relative" }}>
      {children}
      {sweep >= 0 && sweep <= 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(115deg, transparent ${lerp(-40, 110, sweep) - 18}%, rgba(255,255,255,0.16) ${lerp(-40, 110, sweep)}%, transparent ${lerp(-40, 110, sweep) + 18}%)`,
            mixBlendMode: "screen",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: "linear-gradient(180deg, rgba(255,255,255,0.07), transparent 22%)",
          pointerEvents: "none",
        }}
      />
    </div>
  </div>
);

/* ── atmosphere ───────────────────────────────────────────────── */

export const Backdrop: React.FC<{ t: number; mood?: "night" | "sky" | "black"; mix?: number }> = ({ t, mood = "night", mix }) => {
  const drift = Math.sin(t / 90) * 4;
  const night = (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 55% at ${50 + drift}% 18%, rgba(40,96,220,0.38), transparent 70%),
          radial-gradient(45% 50% at ${12 - drift}% 85%, rgba(20,170,230,0.16), transparent 70%),
          radial-gradient(50% 60% at ${88 + drift}% 80%, rgba(70,60,220,0.18), transparent 70%),
          linear-gradient(180deg, ${C.midnight} 0%, ${C.night} 100%)`,
      }}
    />
  );
  const sky = (
    <AbsoluteFill
      style={{
        background: `radial-gradient(55% 60% at ${30 + drift}% 20%, rgba(130,210,255,0.55), transparent 70%),
          radial-gradient(60% 60% at ${80 - drift}% 75%, rgba(40,120,240,0.55), transparent 70%),
          linear-gradient(160deg, #0b3a8a 0%, #072258 55%, #041233 100%)`,
      }}
    />
  );
  const black = (
    <AbsoluteFill
      style={{
        background: `radial-gradient(55% 45% at 50% ${-5 + drift}%, rgba(255,255,255,0.13), transparent 70%),
          radial-gradient(40% 40% at 50% 110%, rgba(70,110,200,0.12), transparent 70%),
          linear-gradient(180deg, #0c0d10 0%, #040405 100%)`,
      }}
    />
  );
  if (mix !== undefined) {
    return (
      <AbsoluteFill>
        {sky}
        <AbsoluteFill style={{ opacity: mix }}>{black}</AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return mood === "sky" ? sky : mood === "black" ? black : night;
};

/** Film grain is added at encode time by ffmpeg (cheaper, truly per-pixel); set GRAIN=1 to preview it here. */
export const Grain: React.FC<{ t: number; opacity?: number }> = ({ t, opacity = 0.07 }) => {
  if (!(globalThis as any).__GRAIN__) return null;
  const r = rng(Math.floor(t) + 7);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile("images/grain.png")})`,
        backgroundSize: "512px 512px",
        backgroundPosition: `${Math.floor(r() * 512)}px ${Math.floor(r() * 512)}px`,
        opacity,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.6 }) => (
  <AbsoluteFill
    style={{ background: `radial-gradient(75% 70% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)`, pointerEvents: "none" }}
  />
);

export const Particles: React.FC<{ t: number; n?: number; seed?: number; opacity?: number; converge?: number; color?: string }> = ({
  t,
  n = 60,
  seed = 11,
  opacity = 1,
  converge = 0,
  color = "160,210,255",
}) => {
  const r = rng(seed);
  const items = Array.from({ length: n }, () => ({ x: r(), y: r(), s: 1 + r() * 3.2, sp: 0.2 + r() * 0.8, ph: r() * 6.28, a: 0.2 + r() * 0.6 }));
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {items.map((p, i) => {
        let x = p.x * 100 + Math.sin(t / 60 + p.ph) * 2;
        let y = ((p.y * 100 - t * 0.05 * p.sp) % 100 + 100) % 100;
        x = lerp(x, 50, converge * 0.85);
        y = lerp(y, 42, converge * 0.85);
        const tw = 0.6 + 0.4 * Math.sin(t / 14 + p.ph * 3);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: p.s * 3,
              height: p.s * 3,
              marginLeft: -p.s * 1.5,
              marginTop: -p.s * 1.5,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${color},${p.a * tw}) 0%, rgba(${color},0) 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** A diagonal beam of light that crosses the frame once. */
export const LightSweep: React.FC<{ p: number; angle?: number; width?: number; opacity?: number }> = ({ p, angle = 112, width = 16, opacity = 0.18 }) =>
  p <= 0 || p >= 1 ? null : (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, transparent ${lerp(-30, 130, p) - width}%, rgba(180,220,255,${opacity}) ${lerp(-30, 130, p)}%, transparent ${lerp(-30, 130, p) + width}%)`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );

/* ── type ─────────────────────────────────────────────────────── */

/**
 * A line of words that rise into place one after another through a mask,
 * and leave together.
 */
export const Words: React.FC<{
  text: string;
  t: number;
  at: number;
  out?: number;
  size: number;
  weight?: number;
  tracking?: number;
  color?: string;
  stagger?: number;
  gradient?: boolean;
  align?: "left" | "center" | "right";
  font?: string;
  style?: React.CSSProperties;
  upper?: boolean;
}> = ({ text, t, at, out = 1e9, size, weight = 600, tracking = 0.01, color = C.white, stagger = 3.5, gradient, align = "left", font = POPPINS, style, upper = true }) => {
  const words = (upper ? text.toUpperCase() : text).split(" ");
  const leave = ramp(t, out, out + 14, EASE.in);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        gap: `0 ${size * 0.26}px`,
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: `${tracking}em`,
        color,
        opacity: 1 - leave,
        transform: `translateY(${-leave * size * 0.35}px)`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const p = ramp(t, at + i * stagger, at + i * stagger + 18, EASE.out);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 105}%)`,
                opacity: Math.min(1, p * 1.6),
                ...(gradient
                  ? {
                      backgroundImage: `linear-gradient(100deg, #ffffff 0%, ${C.ice} 40%, ${C.cyan} 100%)`,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }
                  : {}),
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const Eyebrow: React.FC<{ text: string; t: number; at: number; out?: number; size?: number; color?: string; align?: "left" | "center" }> = ({
  text,
  t,
  at,
  out = 1e9,
  size = 22,
  color = C.cyan,
  align = "left",
}) => {
  const p = ramp(t, at, at + 26, EASE.out);
  const leave = ramp(t, out, out + 12, EASE.in);
  return (
    <div
      style={{
        fontFamily: POPPINS,
        fontWeight: 600,
        fontSize: size,
        letterSpacing: `${lerp(0.6, 0.32, p)}em`,
        color,
        opacity: p * (1 - leave),
        textAlign: align,
        whiteSpace: "nowrap",
      }}
    >
      {text.toUpperCase()}
    </div>
  );
};

/* ── devices ─────────────────────────────────────────────────── */

export const Monitor: React.FC<{ width: number; children: React.ReactNode; sweep?: number }> = ({ width, children, sweep = -1 }) => {
  const bezel = width * 0.016;
  const screenW = width - bezel * 2;
  return (
    <div style={{ position: "relative", width }}>
      <div
        style={{
          padding: bezel,
          borderRadius: width * 0.022,
          background: "linear-gradient(180deg, #23262d, #0d0f13)",
          boxShadow: "0 0 0 2px rgba(190,200,215,0.55), 0 0 0 3px rgba(20,22,26,0.9), 0 60px 140px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ borderRadius: width * 0.008, overflow: "hidden", position: "relative", width: screenW }}>
          {children}
          {sweep >= 0 && <LightSweep p={sweep} opacity={0.12} />}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(255,255,255,0.08) 0%, transparent 35%)" }} />
        </div>
      </div>
      <div
        style={{
          margin: "0 auto",
          width: width * 0.16,
          height: width * 0.07,
          background: "linear-gradient(90deg, #8d94a1, #d6dbe3 50%, #8d94a1)",
          clipPath: "polygon(18% 0, 82% 0, 100% 100%, 0 100%)",
        }}
      />
      <div style={{ margin: "0 auto", width: width * 0.3, height: width * 0.012, borderRadius: 8, background: "linear-gradient(90deg, #7d8491, #e0e4ea 50%, #7d8491)" }} />
      <div
        style={{
          margin: `${width * 0.01}px auto 0`,
          width: width * 0.5,
          height: width * 0.03,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(0,0,0,0.55), transparent)",
        }}
      />
    </div>
  );
};

export const Phone: React.FC<{ height: number; children: React.ReactNode; dark?: boolean }> = ({ height, children, dark }) => {
  const w = height * (390 / 844) + height * 0.034;
  const bezel = height * 0.017;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        padding: bezel,
        borderRadius: height * 0.075,
        background: dark ? "linear-gradient(160deg, #2a2d33, #0a0b0d)" : "linear-gradient(160deg, #e9edf3, #9aa3b0)",
        boxShadow: "0 0 0 1.5px rgba(255,255,255,0.35), 0 40px 110px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ borderRadius: height * 0.06, overflow: "hidden", position: "relative", background: "#000" }}>
        {children}
        <div
          style={{
            position: "absolute",
            top: height * 0.014,
            left: "50%",
            width: height * 0.13,
            height: height * 0.036,
            marginLeft: -height * 0.065,
            borderRadius: 999,
            background: "#050505",
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.10), transparent 30%)" }} />
      </div>
    </div>
  );
};

/** Fills the frame and centres a 3D stage with the given perspective. */
export const Stage: React.FC<{ children: React.ReactNode; perspective?: number; style?: React.CSSProperties }> = ({ children, perspective = 2200, style }) => (
  <AbsoluteFill style={{ perspective, perspectiveOrigin: "50% 45%", ...style }}>
    <div style={{ position: "absolute", left: "50%", top: "50%", transformStyle: "preserve-3d" }}>{children}</div>
  </AbsoluteFill>
);

/** An element placed in the 3D stage by its centre. */
export const At: React.FC<{
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number;
  o?: number;
  children: React.ReactNode;
  filter?: string;
}> = ({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, o = 1, children, filter }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s}) translate(-50%, -50%)`,
      transformStyle: "preserve-3d",
      opacity: o,
      filter,
    }}
  >
    {children}
  </div>
);
