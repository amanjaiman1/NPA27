#!/usr/bin/env python3
"""
Renders the Chronicle mark into the PNG app icons used by the PWA manifest.

The mark mirrors `src/components/layout/logo.tsx` — a ring (the cycle of days)
with a single bright node (today) sitting on the timeline — drawn in ivory over
a vivid crimson plate, matching the app's default Ivory + Crimson appearance.

Pure standard library (zlib + struct); no image dependencies required.

    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

# The installed icon carries the brand: a vivid crimson plate with the mark
# drawn in ivory, matching the app's Ivory + Crimson default appearance.
PLATE_TOP = (244, 63, 94)     # crimson, lit
PLATE_BOTTOM = (159, 18, 57)  # crimson, deep
IVORY = (255, 250, 251)
GLOW = (255, 214, 226)        # soft highlight in the plate

VIEWBOX = 32.0            # the logo's SVG viewBox


# ---------------------------------------------------------------- primitives

def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if v < lo else hi if v > hi else v


def coverage(sdf: float) -> float:
    """Antialiased coverage for a signed distance (in pixels)."""
    return clamp(0.5 - sdf)


def blend(dst, src, alpha: float):
    if alpha <= 0:
        return dst
    return (
        dst[0] + (src[0] - dst[0]) * alpha,
        dst[1] + (src[1] - dst[1]) * alpha,
        dst[2] + (src[2] - dst[2]) * alpha,
    )


def seg_distance(px, py, ax, ay, bx, by) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else clamp((wx * vx + wy * vy) / denom)
    return math.hypot(wx - vx * t, wy - vy * t)


# ---------------------------------------------------------------- png writer

def write_png(path: Path, pixels, width: int, height: int, alpha: bool) -> None:
    """pixels: flat list of (r, g, b, a) floats 0-255 / 0-1 alpha."""
    raw = bytearray()
    stride = 4 if alpha else 3
    for y in range(height):
        raw.append(0)  # filter type 0
        row = pixels[y * width : (y + 1) * width]
        for r, g, b, a in row:
            if alpha:
                raw += bytes(
                    (
                        int(round(clamp(r, 0, 255))),
                        int(round(clamp(g, 0, 255))),
                        int(round(clamp(b, 0, 255))),
                        int(round(clamp(a, 0, 1) * 255)),
                    )
                )
            else:
                raw += bytes(
                    (
                        int(round(clamp(r, 0, 255))),
                        int(round(clamp(g, 0, 255))),
                        int(round(clamp(b, 0, 255))),
                    )
                )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    color_type = 6 if alpha else 2
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


# ---------------------------------------------------------------- the mark

def render(size: int, content_scale: float, radius_ratio: float, transparent: bool):
    """Render one icon.

    content_scale  fraction of the canvas the mark occupies (maskable icons
                   keep the mark inside the 80% safe zone).
    radius_ratio   corner rounding as a fraction of the size (0 = square).
    """
    px_per_unit = (size * content_scale) / VIEWBOX
    cx = cy = size / 2.0

    def to_px(ux: float, uy: float):
        return (cx + (ux - 16.0) * px_per_unit, cy + (uy - 16.0) * px_per_unit)

    def u(v: float) -> float:
        return v * px_per_unit

    ring_outer_r = u(12.5)
    ring_inner_r = u(7.0)
    stroke = max(u(1.7), size * 0.014)
    node_x, node_y = to_px(16.0, 3.5)
    node_r = u(2.4)
    tick_ax, tick_ay = to_px(16.0, 3.5)
    tick_bx, tick_by = to_px(16.0, 9.0)

    corner_r = size * radius_ratio
    bloom_r = size * 0.85

    pixels = []
    for y in range(size):
        py = y + 0.5
        for x in range(size):
            px = x + 0.5

            # --- plate -------------------------------------------------
            # diagonal crimson gradient, lit from the top-left
            t = clamp((px * 0.35 + py * 0.85) / (size * 1.1))
            col = (
                PLATE_TOP[0] + (PLATE_BOTTOM[0] - PLATE_TOP[0]) * t,
                PLATE_TOP[1] + (PLATE_BOTTOM[1] - PLATE_TOP[1]) * t,
                PLATE_TOP[2] + (PLATE_BOTTOM[2] - PLATE_TOP[2]) * t,
            )
            # soft highlight so the plate has depth rather than reading flat
            d1 = math.hypot(px - size * 0.22, py - size * 0.14) / bloom_r
            col = blend(col, GLOW, clamp(1.0 - d1) ** 2 * 0.28)

            # --- the mark ----------------------------------------------
            d_center = math.hypot(px - cx, py - cy)
            col = blend(
                col, IVORY, coverage(abs(d_center - ring_outer_r) - stroke / 2) * 0.62
            )
            col = blend(
                col, IVORY, coverage(abs(d_center - ring_inner_r) - stroke / 2) * 0.3
            )
            col = blend(
                col,
                IVORY,
                coverage(
                    seg_distance(px, py, tick_ax, tick_ay, tick_bx, tick_by)
                    - stroke / 2
                )
                * 0.7,
            )

            d_node = math.hypot(px - node_x, py - node_y)
            # halo around today's node
            col = blend(col, IVORY, clamp(1.0 - d_node / (node_r * 3.0)) ** 2 * 0.35)
            col = blend(col, IVORY, coverage(d_node - node_r))

            # --- plate shape -------------------------------------------
            a = 1.0
            if transparent:
                a = 1.0  # opaque plate; rounding below carves the corners
            if corner_r > 0:
                qx = abs(px - cx) - (size / 2 - corner_r)
                qy = abs(py - cy) - (size / 2 - corner_r)
                d = (
                    math.hypot(max(qx, 0.0), max(qy, 0.0))
                    + min(max(qx, qy), 0.0)
                    - corner_r
                )
                a = coverage(d)

            pixels.append((col[0], col[1], col[2], a))

    return pixels


def emit(name: str, size: int, content_scale: float, radius_ratio: float, alpha: bool):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pixels = render(size, content_scale, radius_ratio, alpha)
    path = OUT_DIR / name
    write_png(path, pixels, size, size, alpha)
    print(f"  {path.relative_to(OUT_DIR.parent.parent)}  ({size}×{size})")


if __name__ == "__main__":
    print("Generating PWA icons…")
    # `any` icons — rounded plate, mark at a comfortable inset
    emit("icon-192.png", 192, 0.70, 0.22, True)
    emit("icon-512.png", 512, 0.70, 0.22, True)
    # `maskable` — full bleed, mark inside the 80% safe zone
    emit("icon-maskable-192.png", 192, 0.55, 0.0, False)
    emit("icon-maskable-512.png", 512, 0.55, 0.0, False)
    # iOS home screen — square, opaque (iOS applies its own mask)
    emit("apple-touch-icon.png", 180, 0.66, 0.0, False)
    print("Done.")
