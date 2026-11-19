#!/usr/bin/env python3
"""
Renders the DoOrDie mark into the app icons: the PNGs the installable app's
manifest and the home screens use, and the browser tab's favicon.

The mark mirrors `src/components/layout/logo.tsx` — a ring (the cycle of days)
with a single bright node (today) sitting on the timeline — drawn in white over
a violet plate, the accent of Lavender, the default theme.

Pure standard library (zlib + struct); no image dependencies required.

    python3 scripts/generate-icons.py

The icons are served with a year-long, immutable cache (next.config.mjs), so a
browser that has them never asks again. After changing them, bump the `?v=`
on every reference to `/icons/`, or nobody sees the new ones: the manifest,
`app/layout.tsx`, `public/sw.js`, `public/offline.html`,
`components/notifications/notifier.tsx` and `lib/seo/config.ts`. The favicon
is not cached that way and needs nothing.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "icons"
FAVICON = ROOT / "src" / "app" / "favicon.ico"

# The plate: Lavender's violet (#6C5CE7), lit from the top left and deepening
# towards the bottom right, with a soft glow where the light falls.
PLATE_TOP = (146, 132, 250)    # violet, lit
PLATE_BOTTOM = (74, 58, 198)   # violet, deep
MARK = (255, 255, 255)
GLOW = (230, 224, 255)         # soft highlight in the plate

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

def encode_png(pixels, width: int, height: int, alpha: bool) -> bytes:
    """pixels: flat list of (r, g, b, a) floats 0-255 / 0-1 alpha."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        row = pixels[y * width : (y + 1) * width]
        for r, g, b, a in row:
            px = (
                int(round(clamp(r, 0, 255))),
                int(round(clamp(g, 0, 255))),
                int(round(clamp(b, 0, 255))),
            )
            raw += bytes(px + ((int(round(clamp(a, 0, 1) * 255)),) if alpha else ()))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    color_type = 6 if alpha else 2
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def encode_ico(images: list[tuple[int, bytes]]) -> bytes:
    """An .ico holding PNG images, which every current browser reads."""
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    data = b""
    for size, png in images:
        side = 0 if size >= 256 else size  # 0 means 256 in an icon directory
        entries += struct.pack("<BBBBHHII", side, side, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    return header + entries + data


# ---------------------------------------------------------------- the mark

def render(
    size: int,
    content_scale: float,
    radius_ratio: float,
    *,
    min_stroke: float = 0.0,
    inner_ring: bool = True,
):
    """Render one icon.

    content_scale  fraction of the canvas the mark occupies (maskable icons
                   keep the mark inside the 80% safe zone).
    radius_ratio   corner rounding as a fraction of the size (0 = square).
    min_stroke     the thinnest a line may be, in pixels, so the mark stays
                   legible at favicon sizes.
    inner_ring     the faint inner ring, which only blurs the mark when tiny.
    """
    px_per_unit = (size * content_scale) / VIEWBOX
    cx = cy = size / 2.0

    def to_px(ux: float, uy: float):
        return (cx + (ux - 16.0) * px_per_unit, cy + (uy - 16.0) * px_per_unit)

    def u(v: float) -> float:
        return v * px_per_unit

    ring_outer_r = u(12.5)
    ring_inner_r = u(7.0)
    stroke = max(u(1.7), size * 0.014, min_stroke)
    node_x, node_y = to_px(16.0, 3.5)
    node_r = max(u(2.4), min_stroke * 1.25)
    tick_ax, tick_ay = to_px(16.0, 3.5)
    tick_bx, tick_by = to_px(16.0, 9.0)

    corner_r = size * radius_ratio
    bloom_r = size * 0.85
    # Small icons get a brighter mark: thin lines at a few pixels wide lose
    # contrast quickly once antialiased.
    ring_a = 0.62 if size >= 64 else 0.9
    tick_a = 0.7 if size >= 64 else 0.95

    pixels = []
    for y in range(size):
        py = y + 0.5
        for x in range(size):
            px = x + 0.5

            # --- plate -------------------------------------------------
            # diagonal violet gradient, lit from the top-left
            t = clamp((px * 0.35 + py * 0.85) / (size * 1.1))
            col = (
                PLATE_TOP[0] + (PLATE_BOTTOM[0] - PLATE_TOP[0]) * t,
                PLATE_TOP[1] + (PLATE_BOTTOM[1] - PLATE_TOP[1]) * t,
                PLATE_TOP[2] + (PLATE_BOTTOM[2] - PLATE_TOP[2]) * t,
            )
            # soft highlight so the plate has depth rather than reading flat
            d1 = math.hypot(px - size * 0.22, py - size * 0.14) / bloom_r
            col = blend(col, GLOW, clamp(1.0 - d1) ** 2 * 0.3)

            # --- the mark ----------------------------------------------
            d_center = math.hypot(px - cx, py - cy)
            col = blend(
                col, MARK, coverage(abs(d_center - ring_outer_r) - stroke / 2) * ring_a
            )
            if inner_ring:
                col = blend(
                    col, MARK, coverage(abs(d_center - ring_inner_r) - stroke / 2) * 0.3
                )
            col = blend(
                col,
                MARK,
                coverage(
                    seg_distance(px, py, tick_ax, tick_ay, tick_bx, tick_by)
                    - stroke / 2
                )
                * tick_a,
            )

            d_node = math.hypot(px - node_x, py - node_y)
            # halo around today's node
            col = blend(col, MARK, clamp(1.0 - d_node / (node_r * 3.0)) ** 2 * 0.35)
            col = blend(col, MARK, coverage(d_node - node_r))

            # --- plate shape -------------------------------------------
            a = 1.0
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
    pixels = render(size, content_scale, radius_ratio)
    path = OUT_DIR / name
    path.write_bytes(encode_png(pixels, size, size, alpha))
    print(f"  {path.relative_to(ROOT)}  ({size}×{size})")


def emit_favicon():
    """The browser tab's icon: 16, 32 and 48 pixels, drawn bolder to stay legible."""
    images = []
    for size, inner in ((16, False), (32, False), (48, True)):
        pixels = render(size, 0.86, 0.22, min_stroke=1.15 if size == 16 else 1.5, inner_ring=inner)
        images.append((size, encode_png(pixels, size, size, True)))
    pixels = render(256, 0.72, 0.22)
    images.append((256, encode_png(pixels, 256, 256, True)))
    FAVICON.write_bytes(encode_ico(images))
    print(f"  {FAVICON.relative_to(ROOT)}  (16, 32, 48, 256)")


if __name__ == "__main__":
    print("Generating app icons…")
    # `any` icons — rounded plate, mark at a comfortable inset
    emit("icon-192.png", 192, 0.70, 0.22, True)
    emit("icon-512.png", 512, 0.70, 0.22, True)
    # `maskable` — full bleed, mark inside the 80% safe zone
    emit("icon-maskable-192.png", 192, 0.55, 0.0, False)
    emit("icon-maskable-512.png", 512, 0.55, 0.0, False)
    # iOS home screen — square, opaque (iOS applies its own mask)
    emit("apple-touch-icon.png", 180, 0.66, 0.0, False)
    # the browser tab
    emit_favicon()
    print("Done.")
