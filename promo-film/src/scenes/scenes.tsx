import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { At, Backdrop, Eyebrow, Footage, Glass, Grain, LightSweep, Monitor, Particles, Phone, POPPINS, Stage, TAKES, Vignette, Words } from "../components/kit";
import { LogoMark, Wordmark } from "../components/logo";
import { EASE, lerp, ramp, window as win } from "../lib/anim";
import { C, SITE_URL } from "../lib/config";

/**
 * The eight scenes of the film. Each takes its own frame `f` (0 at the
 * scene's first frame); the film's timeline is in compositions/films.tsx.
 * Film times in the comments are seconds.
 */
export type SceneProps = { f: number };

const Still: React.FC<{ name: string; o: number; s: number; x?: number; y?: number; soft?: number; dim?: number }> = ({ name, o, s, x = 0, y = 0, soft = 0, dim = 0 }) =>
  o <= 0 ? null : (
    <AbsoluteFill style={{ opacity: o, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${x}%, ${y}%) scale(${s})` }}>
        <Img src={staticFile(`renders/desk/${name}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {soft > 0 && <Img src={staticFile(`renders/desk/${name}-soft.jpg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: soft }} />}
      </AbsoluteFill>
      {dim > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />}
    </AbsoluteFill>
  );

/** Darkens one side so type reads over pictures and UI. */
const Scrim: React.FC<{ side?: "left" | "bottom"; o?: number; strength?: number }> = ({ side = "left", o = 1, strength = 0.78 }) => (
  <AbsoluteFill
    style={{
      opacity: o,
      background:
        side === "left"
          ? `linear-gradient(90deg, rgba(2,6,18,${strength}) 0%, rgba(2,6,18,${strength * 0.55}) 34%, transparent 62%)`
          : `linear-gradient(0deg, rgba(2,4,10,${strength}) 0%, rgba(2,4,10,${strength * 0.5}) 26%, transparent 48%)`,
    }}
  />
);

/* ── 01 The challenge (0–6.2 s) ─────────────────────────────────── */

export const S1Challenge: React.FC<SceneProps> = ({ f }) => {
  const a = win(f, 0, 22, 90, 106);
  const b = win(f, 90, 104, 124, 140);
  const c = win(f, 124, 140, 168, 186);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Still name="notebook" o={a} s={lerp(1.18, 1.06, ramp(f, 0, 106, EASE.soft))} x={lerp(2.2, -1.6, ramp(f, 0, 106, EASE.soft))} soft={1 - ramp(f, 2, 44, EASE.inOut)} />
      <Still name="clock" o={b} s={lerp(1.02, 1.1, ramp(f, 90, 140, EASE.soft))} soft={1 - ramp(f, 92, 116, EASE.inOut)} />
      <Still name="wide" o={c} s={lerp(1.3, 1.06, ramp(f, 124, 186, EASE.out))} y={lerp(3, 0, ramp(f, 124, 186, EASE.out))} dim={ramp(f, 160, 184, EASE.soft) * 0.6} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(8,22,60,0.35), rgba(2,6,20,0.25))", mixBlendMode: "multiply" }} />
      <Vignette strength={0.75} />
      <Scrim o={Math.max(win(f, 12, 30, 84, 100), win(f, 96, 112, 168, 184))} strength={0.7} />
      <div style={{ position: "absolute", top: 400, left: 140 }}>
        <Words text="One of the" t={f} at={16} out={80} size={58} weight={300} tracking={0.16} color="rgba(235,242,255,0.86)" />
        <Words text="toughest journeys." t={f} at={24} out={80} size={104} weight={600} tracking={-0.01} gradient />
      </div>
      <div style={{ position: "absolute", top: 400, left: 140 }}>
        <Words text="Yet most preparations" t={f} at={98} out={170} size={54} weight={300} tracking={0.14} color="rgba(235,242,255,0.86)" />
        <Words text="have no single direction." t={f} at={106} out={170} size={94} weight={600} tracking={-0.01} gradient />
      </div>
      <Grain t={f} opacity={0.1} />
    </AbsoluteFill>
  );
};

/* ── 02 The reveal (6–14 s) ─────────────────────────────────────── */

const bez = (p: number, a: number[], b: number[], c: number[], d: number[]) => {
  const u = 1 - p;
  return [0, 1].map((k) => u * u * u * a[k] + 3 * u * u * p * b[k] + 3 * u * p * p * c[k] + p * p * p * d[k]);
};

/** A point of light that travels in and becomes the node of the mark, which then draws itself. */
export const LogoReveal: React.FC<{ f: number; cx: number; cy: number; size: number; path: number[][]; hit: number }> = ({ f, cx, cy, size, path, hit }) => {
  const unit = size / 40; // the mark's viewBox runs -4..36
  const node = [cx - size / 2 + (16 + 4) * unit, cy - size / 2 + (3.5 + 4) * unit];
  const travel = ramp(f, 0, hit, EASE.inOut);
  const pos = bez(travel, path[0], path[1], path[2], node);
  const before = f < hit;
  const trail = Array.from({ length: 22 }, (_, k) => ({ p: bez(ramp(f - k * 1.1, 0, hit, EASE.inOut), path[0], path[1], path[2], node), k }));
  const born = ramp(f, 0, 14, EASE.out);
  const flash = f >= hit ? Math.exp(-(f - hit) / 7) : 0;
  return (
    <>
      {before &&
        trail.map(({ p, k }) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: p[0],
              top: p[1],
              width: 34 - k * 1.2,
              height: 34 - k * 1.2,
              marginLeft: -(34 - k * 1.2) / 2,
              marginTop: -(34 - k * 1.2) / 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(127,211,255,${0.45 * (1 - k / 22) * born}) 0%, rgba(59,139,255,0) 70%)`,
            }}
          />
        ))}
      {before && (
        <div style={{ position: "absolute", left: pos[0], top: pos[1], width: 0, height: 0 }}>
          <div style={{ position: "absolute", left: -90, top: -90, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, rgba(127,211,255,${0.55 * born}) 0%, rgba(59,139,255,${0.18 * born}) 35%, transparent 70%)` }} />
          <div style={{ position: "absolute", left: -9 * born, top: -9 * born, width: 18 * born, height: 18 * born, borderRadius: "50%", background: "radial-gradient(circle, #fff 0%, #bfe8ff 45%, #3b8bff 100%)" }} />
        </div>
      )}
      <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2 }}>
        <LogoMark
          size={size}
          node={f >= hit ? 1 : 0}
          stem={ramp(f, hit, hit + 18, EASE.out)}
          ring={ramp(f, hit - 2, hit + 36, EASE.inOut)}
          inner={ramp(f, hit + 8, hit + 42, EASE.inOut)}
          glow={0.75 + 0.25 * Math.sin(f / 9)}
          spin={(f - hit) * 4.2}
        />
      </div>
      {flash > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: node[0] - 600,
            top: node[1] - 600,
            width: 1200,
            height: 1200,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(200,235,255,${0.75 * flash}) 0%, rgba(80,150,255,${0.25 * flash}) 18%, transparent 55%)`,
            mixBlendMode: "screen",
          }}
        />
      )}
    </>
  );
};

/** Rings rushing past and a floor grid: travelling through space. */
const Tunnel: React.FC<{ f: number; o: number; cx: number; cy: number }> = ({ f, o, cx, cy }) => (
  <AbsoluteFill style={{ opacity: o }}>
    {Array.from({ length: 9 }, (_, i) => {
      const p = ((f * 0.012 + i / 9) % 1 + 1) % 1;
      const s = 0.08 + Math.pow(p, 2.3) * 5;
      const a = Math.sin(p * Math.PI) * 0.32;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: cx - 300,
            top: cy - 300,
            width: 600,
            height: 600,
            borderRadius: "50%",
            border: `${2 / Math.max(0.5, s)}px solid rgba(127,190,255,${a})`,
            transform: `scale(${s}) rotate(${i * 13 + f * 0.2}deg)`,
            boxShadow: `0 0 ${30 / s}px rgba(59,139,255,${a * 0.6})`,
          }}
        />
      );
    })}
    <div style={{ position: "absolute", left: 0, right: 0, top: cy + 60, bottom: 0, perspective: 600, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "-50%",
          width: "200%",
          top: 0,
          height: 1400,
          transformOrigin: "50% 0",
          transform: "rotateX(72deg)",
          backgroundImage: "linear-gradient(rgba(90,160,255,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(90,160,255,0.22) 2px, transparent 2px)",
          backgroundSize: "120px 120px",
          backgroundPosition: `0 ${(f * 9) % 120}px`,
          maskImage: "linear-gradient(180deg, transparent, #000 30%, #000 60%, transparent)",
          WebkitMaskImage: "linear-gradient(180deg, transparent, #000 30%, #000 60%, transparent)",
        }}
      />
    </div>
  </AbsoluteFill>
);

export const S2Reveal: React.FC<SceneProps> = ({ f }) => {
  const HIT = 108; // 9.6 s, on "Clarity."
  const cx = 960;
  const cy = 395;
  const exit = ramp(f, 222, 240, EASE.in);
  const group = lerp(1, 0.86, ramp(f, 140, 184, EASE.inOut));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: ramp(f, 10, 120, EASE.soft) }}>
        <Backdrop t={f} mood="night" />
      </AbsoluteFill>
      <Tunnel f={f} o={win(f, 0, 26, 100, 130)} cx={cx} cy={cy} />
      <Particles t={f} n={70} opacity={ramp(f, 20, 80) * (1 - exit)} />
      <AbsoluteFill style={{ transform: `scale(${lerp(1, 2.4, exit)}) translateY(${(1 - group) * -260}px)`, transformOrigin: `${cx}px ${cy}px`, opacity: 1 - exit }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${group})`, transformOrigin: `${cx}px ${cy}px` }}>
          <LogoReveal f={f} cx={cx} cy={cy} size={300} hit={HIT} path={[[180, 940], [520, 220], [1480, 980], []]} />
        </div>
        <div style={{ position: "absolute", top: 560, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Eyebrow text="Introducing" t={f} at={HIT + 20} size={26} align="center" color={C.cyan} />
          <div style={{ height: 22 }} />
          <Wordmark size={150} p={ramp(f, HIT + 30, HIT + 62, EASE.out)} />
          <div style={{ height: 46 }} />
          <Words text="Your UPSC preparation." t={f} at={HIT + 60} size={40} weight={500} tracking={0.12} align="center" color="rgba(230,240,255,0.92)" />
          <div style={{ height: 6 }} />
          <Words text="One command center." t={f} at={HIT + 72} size={40} weight={600} tracking={0.12} align="center" gradient />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(190,225,255,${exit > 0 ? Math.sin(exit * Math.PI) * 0.5 : 0})` }} />
      <Vignette strength={0.55} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 03 Command center (14–20 s) ─────────────────────────────────── */

const DASH_CARDS = ["card:Meera", "card:Study streak", "card:Total hours", "card:Days studied", "card:Average mood", "card:Today", "card:Study activity"];

export const S3Command: React.FC<SceneProps> = ({ f }) => {
  const W = 1380;
  const k = W / 1600;
  const enter = ramp(f, 0, 50, EASE.out);
  const drift = ramp(f, 30, 180, EASE.soft);
  const lift = (i: number) => ramp(f, 92 + i * 6, 134 + i * 6, EASE.out);
  const exit = ramp(f, 162, 180, EASE.in);
  const boxes = TAKES["L-dashboard-build"].boxes;
  const last = TAKES["L-dashboard-build"].frames - 1;
  return (
    <AbsoluteFill>
      <Backdrop t={f + 300} mood="sky" />
      <Particles t={f} n={40} opacity={0.5} />
      <Stage perspective={2100}>
        <At
          x={lerp(235, 285, drift) + exit * 300}
          y={lerp(150, 40, enter)}
          z={lerp(-1100, 0, enter) + drift * 90 + exit * 500}
          rx={lerp(28, 10, enter) - drift * 3}
          ry={lerp(-30, -14, enter) + drift * 9}
          rz={lerp(4, 0, enter)}
          o={ramp(f, 0, 14) * (1 - exit)}
        >
          <div style={{ position: "relative", transformStyle: "preserve-3d" }}>
            <Glass radius={26} sweep={ramp(f, 40, 104, EASE.inOut)}>
              <Footage take="L-dashboard-build" t={f} at={4} rate={1.05} width={W} />
              <div style={{ position: "absolute", inset: 0, background: `rgba(4,14,40,${ramp(f, 92, 134) * 0.38})` }} />
            </Glass>
            {DASH_CARDS.map((key, i) => {
              const b = boxes[key];
              const p = lift(i);
              if (!b || p <= 0) return null;
              const z = [190, 120, 150, 110, 160, 130, 90][i] * p;
              return (
                <div
                  key={key}
                  style={{
                    position: "absolute",
                    left: b.x * k,
                    top: b.y * k,
                    transform: `translateZ(${z}px)`,
                    borderRadius: 20,
                    boxShadow: `0 ${30 * p}px ${70 * p}px rgba(0,10,40,${0.45 * p}), 0 0 0 1.5px rgba(255,255,255,${0.5 * p})`,
                  }}
                >
                  <Footage take="L-dashboard-build" t={f} start={last} rate={0} width={b.w * k} crop={b} radius={18} />
                </div>
              );
            })}
          </div>
        </At>
      </Stage>
      <Scrim o={1} strength={0.62} />
      <div style={{ position: "absolute", left: 110, top: 360 }}>
        <Eyebrow text="Command center" t={f} at={20} out={92} />
        <div style={{ height: 18 }} />
        <Words text="Everything" t={f} at={26} out={90} size={84} weight={600} />
        <Words text="that matters." t={f} at={32} out={90} size={84} weight={600} gradient />
      </div>
      <div style={{ position: "absolute", left: 110, top: 360 }}>
        <Eyebrow text="At a glance" t={f} at={98} out={162} />
        <div style={{ height: 18 }} />
        <Words text="Finally," t={f} at={104} out={160} size={84} weight={300} />
        <Words text="in one place." t={f} at={110} out={160} size={84} weight={600} gradient />
      </div>
      <Vignette strength={0.45} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 04 Track every step (20–30 s): four features, 2.5 s each ─────── */

const Feature: React.FC<{ f: number; at: number; n: string; label: string; l1: string; l2: string }> = ({ f, at, n, label, l1, l2 }) => (
  <div style={{ position: "absolute", left: 110, top: 380, width: 640 }}>
    <Eyebrow text={`${n}  —  ${label}`} t={f} at={at + 2} out={at + 62} />
    <div style={{ height: 20 }} />
    <Words text={l1} t={f} at={at + 5} out={at + 60} size={70} weight={600} stagger={3} />
    <Words text={l2} t={f} at={at + 10} out={at + 60} size={70} weight={600} gradient stagger={3} />
  </div>
);

export const S4Track: React.FC<SceneProps> = ({ f }) => {
  const W = 1180;
  const p1 = ramp(f, 0, 22), x1 = ramp(f, 66, 84, EASE.inOut);
  const p2 = ramp(f, 68, 90, EASE.out), x2 = ramp(f, 141, 159, EASE.inOut);
  const p3 = ramp(f, 143, 165, EASE.out), x3 = ramp(f, 216, 232, EASE.in);
  const p4 = ramp(f, 218, 242, EASE.out);
  const X = 1180 - 960;
  const jl = TAKES["L-journal-log"];
  const done = jl.boxes["celebration"];
  return (
    <AbsoluteFill>
      <Backdrop t={f + 600} mood="sky" />
      <Particles t={f + 200} n={36} opacity={0.45} seed={4} />
      <Stage perspective={2000}>
        {/* 01 daily study: today's entry, filled in */}
        {x1 < 1 && (
          <At x={X + lerp(0, -1100, x1)} y={20} z={lerp(-420, 0, p1)} ry={lerp(-12, -9, p1) + x1 * 28} rx={4} s={lerp(0.9, 1, p1)} o={p1 * (1 - x1)}>
            <Glass radius={24} sweep={ramp(f, 12, 64, EASE.inOut)}>
              <Footage take="L-journal-log" t={f} at={0} start={22} rate={2.1} width={W} />
            </Glass>
          </At>
        )}
        {/* 02 syllabus progress */}
        {p2 > 0 && x2 < 1 && (
          <At x={X + lerp(1150, 0, p2)} y={20 + x2 * -820} z={x2 * -200} ry={lerp(42, -9, p2)} rx={4 + x2 * 30} o={Math.min(1, p2 * 1.4) * (1 - x2)}>
            <Glass radius={24} sweep={ramp(f, 84, 136, EASE.inOut)}>
              <Footage take="L-subjects-build" t={f} at={68} start={4} rate={1.2} width={W} />
            </Glass>
          </At>
        )}
        {/* 03 revision: a topic marked as recalled */}
        {p3 > 0 && x3 < 1 && (
          <At x={X} y={lerp(900, 20, p3)} z={x3 * 900} rx={lerp(-38, 4, p3)} ry={-9} o={Math.min(1, p3 * 1.5) * (1 - x3)}>
            <Glass radius={24} sweep={ramp(f, 160, 210, EASE.inOut)}>
              <Footage take="L-revision-build" t={f} at={143} start={28} rate={1.3} width={W} />
            </Glass>
          </At>
        )}
        {/* 04 goals, habits, and a day marked accomplished */}
        {p4 > 0 && (
          <>
            <At x={X + 60} y={-30} z={lerp(-900, -160, p4)} ry={-12} rx={5} o={p4}>
              <Glass radius={24}>
                <Footage take="L-goals-build" t={f} at={218} start={8} rate={1.2} width={1040} />
              </Glass>
            </At>
            <At x={X - 170} y={170} z={lerp(-500, 110, ramp(f, 226, 252, EASE.out))} ry={-12} rx={5} o={ramp(f, 226, 240)}>
              <Glass radius={20}>
                <Footage take="L-habits-build" t={f} at={226} start={40} rate={1.0} width={780} crop={{ x: 368, y: 84, w: 1220, h: 620 }} />
              </Glass>
            </At>
            {done && (
              <At x={X + 330} y={140} z={lerp(-200, 260, ramp(f, 238, 262, EASE.out))} ry={-12} rx={5} o={ramp(f, 238, 252)}>
                <Glass radius={26} rim={0.4}>
                  <Footage take="L-journal-log" t={f} at={238} start={jl.frames - 70} rate={1.1} width={380} crop={done} />
                </Glass>
              </At>
            )}
          </>
        )}
      </Stage>
      <Scrim o={1} strength={0.66} />
      <Feature f={f} at={0} n="01" label="Daily study" l1="Know where" l2="your hours go." />
      <Feature f={f} at={72} n="02" label="Syllabus progress" l1="Measure every" l2="milestone." />
      <Feature f={f} at={147} n="03" label="Revision" l1="Never lose track of" l2="what needs revision." />
      <Feature f={f} at={222} n="04" label="Goals and habits" l1="Turn daily discipline" l2="into consistency." />
      <Vignette strength={0.45} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 05 Understand your progress (30–37 s), in Dark ──────────────── */

export const S5Understand: React.FC<SceneProps> = ({ f }) => {
  const push = ramp(f, 0, 110, EASE.out);
  const orbit = Math.sin(f / 60) * 3.5;
  const dimBack = ramp(f, 150, 172, EASE.inOut);
  const pc = ramp(f, 0, 26), pl = ramp(f, 10, 38), pr = ramp(f, 20, 48);
  return (
    <AbsoluteFill>
      <Backdrop t={f} mood="black" />
      <Particles t={f} n={50} opacity={0.6} color="220,230,255" seed={21} />
      <Stage perspective={1900}>
        <At z={lerp(-700, -60, push) - dimBack * 250} ry={orbit} rx={3} y={-30} o={1 - dimBack * 0.55} filter={dimBack > 0.02 ? `blur(${dimBack * 6}px)` : undefined}>
          <div style={{ position: "relative", width: 0, height: 0, transformStyle: "preserve-3d" }}>
            <At x={-960} y={20} z={-260} ry={36} o={pl}>
              <Glass radius={24} rim={0.16} sweep={ramp(f, 30, 100, EASE.inOut)}>
                <Footage take="D-mocks-build" t={f} at={6} rate={1.15} width={980} />
              </Glass>
            </At>
            <At x={960} y={20} z={-260} ry={-36} o={pr}>
              <Glass radius={24} rim={0.16} sweep={ramp(f, 46, 116, EASE.inOut)}>
                <Footage take="D-mocks-lower" t={f} at={14} rate={1.15} width={980} />
              </Glass>
            </At>
            <At z={lerp(-300, 0, pc)} o={pc}>
              <Glass radius={26} rim={0.2} sweep={ramp(f, 24, 92, EASE.inOut)}>
                <Footage take="D-heatmap-build" t={f} at={0} rate={1.15} width={1180} />
              </Glass>
            </At>
          </div>
        </At>
      </Stage>
      <Scrim side="bottom" o={1 - dimBack} strength={0.85} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 110, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 1600, height: 110 }}>
          <div style={{ position: "absolute", inset: 0 }}><Words text="Not just tracking." t={f} at={12} out={54} size={84} weight={300} align="center" /></div>
          <div style={{ position: "absolute", inset: 0 }}><Words text="Understanding." t={f} at={70} out={98} size={84} weight={600} align="center" /></div>
          <div style={{ position: "absolute", inset: 0 }}><Words text="Improving." t={f} at={114} out={144} size={84} weight={600} align="center" gradient /></div>
        </div>
      </div>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <Eyebrow text="Analytics" t={f} at={154} align="center" color="rgba(255,255,255,0.7)" />
        <div style={{ height: 22 }} />
        <Words text="Your preparation," t={f} at={158} size={104} weight={300} align="center" />
        <Words text="made visible." t={f} at={166} size={104} weight={600} align="center" gradient />
      </AbsoluteFill>
      <LightSweep p={ramp(f, 150, 206, EASE.inOut)} opacity={0.1} />
      <Vignette strength={0.6} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 06 More than study hours (37–43 s) ─────────────────────────── */

const LIFE = [
  ["L-sleep-build", "L-wellbeing-build", "L-running-build"],
  ["L-screen-build", "L-reflections-build", "L-mistakes-build"],
];

export const S6Life: React.FC<SceneProps> = ({ f }) => {
  const pan = ramp(f, 0, 180, EASE.soft);
  const PW = 700;
  const PH = PW * (1800 / 2880);
  return (
    <AbsoluteFill>
      <Backdrop t={f + 900} mood="sky" />
      <Stage perspective={2300}>
        <At x={lerp(260, 140, pan)} y={lerp(80, -30, pan)} z={lerp(-260, -140, pan)} rx={24} ry={-16} rz={-7}>
          <div style={{ position: "relative", width: 0, height: 0, transformStyle: "preserve-3d" }}>
            {LIFE.flatMap((row, r) =>
              row.map((take, c) => {
                const i = r * 3 + c;
                const p = ramp(f, 2 + i * 7, 34 + i * 7, EASE.out);
                return (
                  <At key={take} x={(c - 1) * (PW + 46)} y={(r - 0.5) * (PH + 46)} z={lerp(-420, 0, p) + (i === 1 ? 60 : 0)} o={p}>
                    <Glass radius={20}>
                      <Footage take={take} t={f} at={4 + i * 7} rate={1.25} width={PW} />
                    </Glass>
                  </At>
                );
              }),
            )}
          </div>
        </At>
      </Stage>
      <Scrim o={1} strength={0.8} />
      <div style={{ position: "absolute", left: 110, top: 340 }}>
        <Eyebrow text="Life dashboard · Sleep · Running · Screen time · Reflections" t={f} at={8} out={168} size={18} />
        <div style={{ height: 22 }} />
        <Words text="Build the system" t={f} at={12} out={82} size={88} weight={600} />
        <Words text="behind the success." t={f} at={18} out={82} size={88} weight={600} gradient />
      </div>
      <div style={{ position: "absolute", left: 110, top: 400 }}>
        <Words text="Study smarter." t={f} at={90} out={166} size={78} weight={600} />
        <Words text="Live better." t={f} at={104} out={166} size={78} weight={300} />
        <Words text="Stay consistent." t={f} at={118} out={166} size={78} weight={600} gradient />
      </div>
      <Vignette strength={0.45} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 07 The experience (43–50.5 s): three themes, desktop and phone ── */

export const S7Experience: React.FC<SceneProps> = ({ f }) => {
  const enter = ramp(f, 0, 40, EASE.out);
  // The take switches Lavender -> Light at its frame ~36 and Light -> Dark at ~81.
  const cycle = f - 6;
  const theme = cycle < 36 ? "Lavender  ·  the new default" : cycle < 81 ? "Light  ·  frosted glass" : "Dark  ·  pure black";
  const dark = ramp(f, 6 + 80, 6 + 94, EASE.inOut);
  const toScroll = ramp(f, 134, 146, EASE.soft);
  const exit = ramp(f, 206, 225, EASE.in);
  const bob = (ph: number) => Math.sin(f / 26 + ph) * 8;
  const MW = 1180;
  const SW = MW - MW * 0.032;
  return (
    <AbsoluteFill>
      <Backdrop t={f} mix={dark} />
      <Particles t={f + 50} n={40} opacity={0.4} />
      <Stage perspective={2400}>
        <At y={lerp(260, -10, enter)} z={lerp(-600, -40, enter) - exit * 700} rx={4} ry={lerp(-14, -4, ramp(f, 0, 225, EASE.soft))} o={ramp(f, 0, 16) * (1 - exit)}>
          <Monitor width={MW} sweep={ramp(f, 100, 170, EASE.inOut)}>
            <div style={{ position: "relative" }}>
              <Footage take="V-theme-cycle" t={f} at={6} rate={1} width={SW} />
              <div style={{ position: "absolute", inset: 0, opacity: toScroll }}>
                <Footage take="D-dashboard-scroll" t={f} at={136} start={26} rate={1} width={SW} />
              </div>
            </div>
          </Monitor>
        </At>
        <At x={-640} y={lerp(700, 80, ramp(f, 22, 66, EASE.out)) + bob(0)} z={130 - exit * 500} ry={18} rx={2} o={ramp(f, 22, 38) * (1 - exit)}>
          <Phone height={660}>
            <Footage take="PV-dashboard-scroll" t={f} at={10} start={16} rate={1} width={660 * (390 / 844)} />
          </Phone>
        </At>
        <At x={640} y={lerp(700, 80, ramp(f, 32, 76, EASE.out)) + bob(2)} z={130 - exit * 500} ry={-18} rx={2} o={ramp(f, 32, 48) * (1 - exit)}>
          <Phone height={660} dark>
            <Footage take="PD-dashboard-scroll" t={f} at={20} start={16} rate={1} width={660 * (390 / 844)} />
          </Phone>
        </At>
      </Stage>
      <Scrim side="bottom" o={1} strength={0.8} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 1700, height: 100 }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <Words text="Designed for the long journey." t={f} at={16} out={104} size={64} weight={600} align="center" />
          </div>
          <div style={{ position: "absolute", inset: 0 }}>
            <Words text="Built for the serious aspirant." t={f} at={114} out={204} size={64} weight={600} align="center" gradient />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 46, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Eyebrow text={theme} t={f} at={10} out={200} size={18} color="rgba(255,255,255,0.78)" align="center" />
      </div>
      <Vignette strength={0.5} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

/* ── 08 The final reveal (50.5–58 s) ─────────────────────────────── */

const Rings: React.FC<{ f: number; cx: number; cy: number; o: number }> = ({ f, cx, cy, o }) => (
  <AbsoluteFill style={{ opacity: o }}>
    {Array.from({ length: 6 }, (_, i) => {
      const p = ((f / 150 + i / 6) % 1 + 1) % 1;
      const r = 160 + p * 1100;
      return (
        <div
          key={i}
          style={{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", border: "1.5px solid rgba(127,190,255,0.5)", opacity: Math.sin(p * Math.PI) * 0.35 }}
        />
      );
    })}
    <div
      style={{
        position: "absolute",
        left: cx - 1100,
        top: cy - 1100,
        width: 2200,
        height: 2200,
        borderRadius: "50%",
        background: "conic-gradient(from 0deg, transparent 0deg, rgba(90,160,255,0.10) 20deg, transparent 40deg, transparent 120deg, rgba(90,160,255,0.08) 140deg, transparent 165deg, transparent 240deg, rgba(127,211,255,0.09) 262deg, transparent 290deg)",
        transform: `rotate(${f * 0.25}deg)`,
        maskImage: "radial-gradient(closest-side, #000 15%, transparent 70%)",
        WebkitMaskImage: "radial-gradient(closest-side, #000 15%, transparent 70%)",
      }}
    />
  </AbsoluteFill>
);

/** `hideCta` leaves the call to action out: the site puts real buttons in that spot (the Cover still). */
export const S8Final: React.FC<SceneProps & { hideCta?: boolean }> = ({ f, hideCta = false }) => {
  const cx = 960;
  const cy = 330;
  const HIT = 40; // 51.8 s
  const plan = ["Plan.", "Track.", "Analyze.", "Improve."];
  const end = ramp(f, 214, 225, EASE.in);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: ramp(f, 0, 36, EASE.soft) }}>
        <Backdrop t={f} mood="night" />
      </AbsoluteFill>
      <Rings f={f} cx={cx} cy={cy} o={ramp(f, HIT, HIT + 36)} />
      <Particles t={f} n={80} converge={1 - ramp(f, 0, HIT + 10, EASE.out)} opacity={0.8} seed={33} />
      <div style={{ position: "absolute", inset: 0, opacity: 1 - end }}>
        <LogoReveal f={f} cx={cx} cy={cy} size={250} hit={HIT} path={[[960, 1180], [1700, 700], [200, 260], []]} />
        <div style={{ position: "absolute", top: 490, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Wordmark size={136} p={ramp(f, HIT + 12, HIT + 44, EASE.out)} />
          <div style={{ height: 40 }} />
          <Words text="Your civil services preparation command center." t={f} at={HIT + 40} size={34} weight={500} tracking={0.12} align="center" color="rgba(230,240,255,0.9)" stagger={2.4} />
          <div style={{ height: 30 }} />
          <div style={{ display: "flex", gap: 34, fontFamily: POPPINS, fontWeight: 600, fontSize: 30, letterSpacing: "0.2em", color: C.white }}>
            {plan.map((w, i) => {
              const p = ramp(f, HIT + 70 + i * 12, HIT + 86 + i * 12, EASE.back);
              return (
                <span key={w} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px) scale(${lerp(0.9, 1, p)})`, color: i === 3 ? C.cyan : C.white }}>
                  {w.toUpperCase()}
                </span>
              );
            })}
          </div>
          <div style={{ height: 56 }} />
          <div
            style={{
              opacity: hideCta ? 0 : ramp(f, HIT + 120, HIT + 140),
              transform: `translateY(${(1 - ramp(f, HIT + 120, HIT + 144, EASE.out)) * 24}px)`,
              padding: "22px 44px",
              borderRadius: 999,
              border: "1.5px solid rgba(160,210,255,0.55)",
              background: "linear-gradient(180deg, rgba(80,150,255,0.28), rgba(30,80,200,0.18))",
              boxShadow: "0 0 60px rgba(59,139,255,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
              fontFamily: POPPINS,
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: "0.14em",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            TAKE CONTROL OF YOUR PREPARATION
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
          {SITE_URL && (
            <div style={{ marginTop: 26, fontFamily: POPPINS, fontSize: 26, letterSpacing: "0.06em", color: "rgba(220,235,255,0.8)", opacity: ramp(f, HIT + 136, HIT + 156) }}>{SITE_URL}</div>
          )}
        </div>
      </div>
      <Vignette strength={0.55} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};
