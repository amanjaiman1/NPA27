import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { At, Backdrop, Eyebrow, Footage, Glass, Grain, Particles, Phone, POPPINS, Stage, TAKES, Vignette, Words } from "../components/kit";
import { LogoMark, Wordmark } from "../components/logo";
import { EASE, lerp, ramp, window as win } from "../lib/anim";
import { C } from "../lib/config";
import { LogoReveal, S1Challenge, S2Reveal, S3Command, S4Track, S5Understand, S6Life, S7Experience, S8Final, type SceneProps } from "../scenes/scenes";

/**
 * Plays a scene from its frame `offset`, at `speed` scene frames per film
 * frame, for `dur` film frames, with optional fades at either end.
 */
const Cut: React.FC<{ from: number; dur: number; scene: React.FC<SceneProps>; offset?: number; speed?: number; fadeIn?: number; fadeOut?: number }> = ({
  from,
  dur,
  scene: Scene,
  offset = 0,
  speed = 1,
  fadeIn = 0,
  fadeOut = 0,
}) => (
  <Sequence from={from} durationInFrames={dur}>
    <Inner dur={dur} Scene={Scene} offset={offset} speed={speed} fadeIn={fadeIn} fadeOut={fadeOut} />
  </Sequence>
);

const Inner: React.FC<{ dur: number; Scene: React.FC<SceneProps>; offset: number; speed: number; fadeIn: number; fadeOut: number }> = ({ dur, Scene, offset, speed, fadeIn, fadeOut }) => {
  const t = useCurrentFrame();
  const o = Math.min(fadeIn ? ramp(t, 0, fadeIn, EASE.soft) : 1, fadeOut ? 1 - ramp(t, dur - fadeOut, dur, EASE.soft) : 1);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Scene f={offset + t * speed} />
    </AbsoluteFill>
  );
};

/**
 * The film: 58 seconds. Scene starts (s): 0 challenge, 6 reveal, 14 command
 * center, 20 features, 30 analytics, 37 life, 43 themes, 50.5 end card.
 * The 30-second cut is edited from this master's frames (scripts/render/finish.py).
 */
export const HERO_FRAMES = 1740;
export const Hero: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Cut from={0} dur={186} scene={S1Challenge} />
    <Cut from={180} dur={240} scene={S2Reveal} />
    <Cut from={414} dur={186} scene={S3Command} fadeIn={14} />
    <Cut from={594} dur={306} scene={S4Track} fadeIn={12} />
    <Cut from={894} dur={216} scene={S5Understand} fadeIn={14} />
    <Cut from={1104} dur={186} scene={S6Life} fadeIn={12} />
    <Cut from={1284} dur={231} scene={S7Experience} fadeIn={12} />
    <Cut from={1509} dur={231} scene={S8Final} fadeIn={10} />
  </AbsoluteFill>
);

/* ── the vertical cut, composed for 9:16 ─────────────────────────── */

const V_W = 1080;

const VReveal: React.FC<SceneProps> = ({ f }) => {
  const HIT = 58;
  const exit = ramp(f, 100, 112, EASE.in);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: ramp(f, 0, 50) }}>
        <Backdrop t={f} mood="night" />
      </AbsoluteFill>
      <Particles t={f} n={60} opacity={ramp(f, 10, 50)} />
      <AbsoluteFill style={{ opacity: 1 - exit, transform: `scale(${lerp(1, 1.5, exit)})` }}>
        <LogoReveal f={f} cx={540} cy={760} size={380} hit={HIT} path={[[120, 1700], [900, 1300], [80, 600], []]} />
        <div style={{ position: "absolute", top: 1010, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Eyebrow text="Introducing" t={f} at={HIT + 14} size={30} align="center" />
          <div style={{ height: 26 }} />
          <Wordmark size={170} p={ramp(f, HIT + 22, HIT + 52, EASE.out)} />
        </div>
      </AbsoluteFill>
      <Vignette strength={0.5} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

const VPhone: React.FC<SceneProps> = ({ f }) => {
  const enter = ramp(f, 0, 30, EASE.out);
  const dark = ramp(f, 150, 170, EASE.inOut);
  const boxes = TAKES["PV-dashboard-build"].boxes;
  const H = 1240;
  const k = (H * (390 / 844)) / 390;
  const float = [
    ["card:Study streak", -330, -170, 0],
    ["card:Total hours", 330, -40, 1],
    ["card:Days studied", -330, 240, 2],
    ["card:Average mood", 330, 360, 3],
  ] as const;
  const exit = ramp(f, 236, 246, EASE.in);
  return (
    <AbsoluteFill>
      <Backdrop t={f} mix={dark} />
      <Particles t={f + 30} n={40} opacity={0.45} />
      <Stage perspective={2200}>
        <At y={lerp(500, 40, enter)} z={lerp(-500, -60, enter)} rx={6} ry={Math.sin(f / 50) * 6} o={ramp(f, 0, 14) * (1 - exit)}>
          <Phone height={H} dark={dark > 0.5}>
            <Footage take="PV-dashboard-scroll" t={f} at={6} start={16} rate={1.05} width={H * (390 / 844)} />
            <div style={{ position: "absolute", inset: 0, opacity: dark }}>
              <Footage take="PD-dashboard-scroll" t={f} at={150} start={40} rate={1.1} width={H * (390 / 844)} />
            </div>
          </Phone>
        </At>
        {float.map(([key, x, y, i]) => {
          const b = boxes[key];
          const p = ramp(f, 36 + i * 8, 66 + i * 8, EASE.out) * (1 - ramp(f, 140, 156, EASE.in));
          if (!b || p <= 0) return null;
          return (
            <At key={key} x={x} y={y + 40 + (1 - p) * 60} z={220 * p} ry={x > 0 ? -14 : 14} o={p}>
              <Glass radius={26} rim={0.5}>
                <Footage take="PV-dashboard-build" t={f} start={TAKES["PV-dashboard-build"].frames - 1} rate={0} width={b.w * k * 0.82} crop={b} />
              </Glass>
            </At>
          );
        })}
      </Stage>
      <div style={{ position: "absolute", top: 120, left: 60, right: 60 }}>
        <Words text="Your UPSC preparation." t={f} at={10} out={140} size={64} weight={300} align="center" />
        <Words text="One command center." t={f} at={18} out={140} size={76} weight={600} align="center" gradient />
      </div>
      <div style={{ position: "absolute", top: 120, left: 60, right: 60 }}>
        <Words text="Track. Revise." t={f} at={156} out={232} size={78} weight={600} align="center" />
        <Words text="Improve." t={f} at={166} out={232} size={78} weight={600} align="center" gradient />
      </div>
      <div style={{ position: "absolute", bottom: 120, left: 0, right: 0 }}>
        <Eyebrow text={dark > 0.5 ? "Dark  ·  pure black" : "Lavender  ·  the new default"} t={f} at={30} out={232} size={24} align="center" color="rgba(255,255,255,0.78)" />
      </div>
      <Vignette strength={0.45} />
      <Grain t={f} />
    </AbsoluteFill>
  );
};

const VEnd: React.FC<SceneProps> = ({ f }) => (
  <AbsoluteFill>
    <Backdrop t={f} mood="night" />
    <Particles t={f} n={70} opacity={0.8} converge={1 - ramp(f, 0, 40)} />
    <div style={{ position: "absolute", left: 540 - 150, top: 520 }}>
      <LogoMark size={300} ring={ramp(f, 0, 30, EASE.inOut)} inner={ramp(f, 8, 36, EASE.inOut)} stem={ramp(f, 4, 20)} node={ramp(f, 0, 10, EASE.back)} spin={f * 4} />
    </div>
    <div style={{ position: "absolute", top: 900, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Wordmark size={150} p={ramp(f, 14, 44, EASE.out)} />
      <div style={{ height: 44 }} />
      <Words text="The civil services" t={f} at={30} size={44} weight={500} tracking={0.12} align="center" color="rgba(230,240,255,0.9)" />
      <Words text="preparation tracker." t={f} at={36} size={44} weight={600} tracking={0.12} align="center" gradient />
      <div style={{ height: 70 }} />
      <div
        style={{
          opacity: ramp(f, 54, 70),
          transform: `translateY(${(1 - ramp(f, 54, 74, EASE.out)) * 24}px)`,
          padding: "26px 48px",
          borderRadius: 999,
          border: "1.5px solid rgba(160,210,255,0.55)",
          background: "linear-gradient(180deg, rgba(80,150,255,0.3), rgba(30,80,200,0.18))",
          boxShadow: "0 0 60px rgba(59,139,255,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
          fontFamily: POPPINS,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: "0.12em",
          color: "#fff",
          textAlign: "center",
        }}
      >
        TAKE CONTROL OF YOUR PREPARATION
      </div>
    </div>
    <Vignette strength={0.5} />
    <Grain t={f} />
  </AbsoluteFill>
);

export const VERTICAL_FRAMES = 450;
export const Vertical15: React.FC = () => (
  <AbsoluteFill style={{ background: "#000", width: V_W }}>
    <Cut from={0} dur={112} scene={VReveal} />
    <Cut from={106} dur={246} scene={VPhone} fadeIn={8} />
    <Cut from={346} dur={104} scene={VEnd} fadeIn={10} />
  </AbsoluteFill>
);

/* ── the thumbnail ──────────────────────────────────────────────── */

export const Thumbnail: React.FC = () => {
  const boxes = TAKES["L-dashboard-build"].boxes;
  const W = 1180;
  const k = W / 1600;
  return (
    <AbsoluteFill>
      <Backdrop t={40} mood="night" />
      <Particles t={60} n={70} opacity={0.7} />
      <Stage perspective={1900}>
        <At x={420} y={40} z={-80} rx={10} ry={-24} rz={2}>
          <div style={{ position: "relative", transformStyle: "preserve-3d" }}>
            <Glass radius={24}>
              <Footage take="L-dashboard-build" t={0} start={119} rate={0} width={W} />
              <div style={{ position: "absolute", inset: 0, background: "rgba(4,14,40,0.32)" }} />
            </Glass>
            {["card:Meera", "card:Total hours", "card:Study activity", "card:Today"].map((key, i) => {
              const b = boxes[key];
              return (
                <div key={key} style={{ position: "absolute", left: b.x * k, top: b.y * k, transform: `translateZ(${[170, 140, 90, 120][i]}px)`, borderRadius: 18, boxShadow: "0 30px 70px rgba(0,10,40,0.45), 0 0 0 1.5px rgba(255,255,255,0.5)" }}>
                  <Footage take="L-dashboard-build" t={0} start={119} rate={0} width={b.w * k} crop={b} radius={18} />
                </div>
              );
            })}
          </div>
        </At>
        <At x={760} y={210} z={260} ry={-20} rx={4}>
          <Phone height={560} dark>
            <Footage take="PD-dashboard-scroll" t={0} start={18} rate={0} width={560 * (390 / 844)} />
          </Phone>
        </At>
      </Stage>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(2,6,18,0.92) 0%, rgba(2,6,18,0.7) 38%, transparent 62%)" }} />
      <div style={{ position: "absolute", left: 100, top: 150, display: "flex", alignItems: "center", gap: 22 }}>
        <LogoMark size={96} />
        <Wordmark size={64} />
      </div>
      <div style={{ position: "absolute", left: 100, top: 360, width: 900, fontFamily: POPPINS, lineHeight: 1.02 }}>
        <div style={{ fontWeight: 300, fontSize: 92, color: "#fff", letterSpacing: "-0.01em" }}>YOUR UPSC JOURNEY.</div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 112,
            letterSpacing: "-0.02em",
            backgroundImage: `linear-gradient(100deg, #ffffff 0%, ${C.ice} 35%, ${C.cyan} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            marginTop: 10,
          }}
        >
          ONE COMMAND
          <br />
          CENTER.
        </div>
        <div style={{ marginTop: 40, fontWeight: 600, fontSize: 26, letterSpacing: "0.22em", color: C.cyan }}>PLAN · TRACK · ANALYZE · IMPROVE</div>
      </div>
      <Vignette strength={0.5} />
      <Grain t={0} opacity={0.06} />
    </AbsoluteFill>
  );
};
