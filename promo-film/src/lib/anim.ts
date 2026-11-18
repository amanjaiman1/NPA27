import { Easing, interpolate } from "remotion";

export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 0.75, 0.2),
  soft: Easing.bezier(0.33, 0, 0.2, 1),
  back: Easing.bezier(0.34, 1.4, 0.64, 1),
};

/** 0 → 1 between frames a and b. */
export const ramp = (t: number, a: number, b: number, easing = EASE.out) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Visible between in and out, with soft edges. */
export const window = (t: number, a: number, b: number, c: number, d: number) =>
  Math.min(ramp(t, a, b, EASE.soft), 1 - ramp(t, c, d, EASE.soft));

export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
