import React from "react";
import { C } from "../lib/config";
import { COMFORTAA } from "./kit";

/**
 * The DoOrDie mark, from src/components/layout/logo.tsx in the app: a ring
 * (the cycle of days), an inner ring, and a single bright node (today) on a
 * short stem at the top. Same geometry (viewBox 32), drawn here as glass with
 * light, and animatable part by part.
 */
export const LogoMark: React.FC<{
  size: number;
  ring?: number; // 0..1 outer ring drawn clockwise from the node
  inner?: number;
  stem?: number;
  node?: number;
  glow?: number;
  spin?: number; // specular glint angle, degrees
}> = ({ size, ring = 1, inner = 1, stem = 1, node = 1, glow = 1, spin = 0 }) => {
  const R = 12.5;
  const r = 7;
  const CR = 2 * Math.PI * R;
  const Cr = 2 * Math.PI * r;
  const id = "lm";
  return (
    <svg width={size} height={size} viewBox="-4 -4 40 40" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor={C.ice} stopOpacity="0.75" />
          <stop offset="100%" stopColor={C.cyan} stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id={`${id}-node`}>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={C.cyan} />
          <stop offset="100%" stopColor={C.electric} />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor={C.cyan} stopOpacity="0.85" />
          <stop offset="30%" stopColor={C.electric} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C.electric} stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      {/* soft glass body of the outer ring */}
      <circle cx="16" cy="16" r={R} fill="none" stroke={C.electric} strokeOpacity={0.35 * glow} strokeWidth="3.2"
        strokeDasharray={CR} strokeDashoffset={CR * (1 - ring)} transform="rotate(-90 16 16)" filter={`url(#${id}-blur)`} />
      <circle cx="16" cy="16" r={R} fill="none" stroke={`url(#${id}-ring)`} strokeWidth="1.5" strokeLinecap="round"
        strokeDasharray={CR} strokeDashoffset={CR * (1 - ring)} transform="rotate(-90 16 16)" />
      {/* specular glint travelling round the ring */}
      {ring > 0.98 && (
        <circle cx="16" cy="16" r={R} fill="none" stroke="#ffffff" strokeOpacity={0.9 * glow} strokeWidth="0.55" strokeLinecap="round"
          strokeDasharray={`${CR * 0.09} ${CR}`} transform={`rotate(${spin - 90} 16 16)`} />
      )}
      <circle cx="16" cy="16" r={r} fill="none" stroke={C.ice} strokeOpacity="0.42" strokeWidth="1.5"
        strokeDasharray={Cr} strokeDashoffset={Cr * (1 - inner)} transform="rotate(-90 16 16)" />
      <line x1="16" y1="3.5" x2="16" y2={3.5 + 5.5 * stem} stroke={C.electric} strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="3.5" r={9 * node} fill={`url(#${id}-halo)`} opacity={glow} />
      <circle cx="16" cy="3.5" r={2.4 * node} fill={`url(#${id}-node)`} />
    </svg>
  );
};

export const Wordmark: React.FC<{ size: number; p?: number; color?: string }> = ({ size, p = 1, color = "#ffffff" }) => {
  const letters = "DoOrDie".split("");
  return (
    <div style={{ display: "flex", fontFamily: COMFORTAA, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", color, lineHeight: 1 }}>
      {letters.map((ch, i) => {
        const q = Math.max(0, Math.min(1, p * 1.6 - i * 0.09));
        return (
          <span key={i} style={{ display: "inline-block", opacity: q, transform: `translateY(${(1 - q) * 0.25}em)`, filter: `blur(${(1 - q) * 10}px)` }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};
