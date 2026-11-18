"""One row of evenly spaced frames per footage folder, several folders per image.

    python strips.py <footage-root> <out-prefix> [--per 6] [--rows 6] [--width 320] [names...]
"""
import argparse
import glob
import json
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("out")
    ap.add_argument("names", nargs="*")
    ap.add_argument("--per", type=int, default=6)
    ap.add_argument("--rows", type=int, default=6)
    ap.add_argument("--width", type=int, default=320)
    a = ap.parse_intermixed_args()
    names = a.names or sorted(d for d in os.listdir(a.root) if os.path.isdir(os.path.join(a.root, d)))
    rows = []
    for name in names:
        files = sorted(glob.glob(os.path.join(a.root, name, "*.jpg")))
        if not files:
            continue
        idx = [round(i * (len(files) - 1) / (a.per - 1)) for i in range(a.per)]
        ims = []
        for i in idx:
            im = Image.open(files[i]).convert("RGB")
            im.thumbnail((a.width, a.width * 3))
            ims.append((i, im))
        rows.append((name, ims))
    for page in range(0, len(rows), a.rows):
        chunk = rows[page : page + a.rows]
        cw = a.width
        ch = max(im.height for _, ims in chunk for _, im in ims)
        sheet = Image.new("RGB", (cw * a.per, len(chunk) * (ch + 20)), (22, 22, 22))
        d = ImageDraw.Draw(sheet)
        for r, (name, ims) in enumerate(chunk):
            y = r * (ch + 20)
            d.text((4, y + 4), name, fill=(255, 220, 0))
            for c, (i, im) in enumerate(ims):
                sheet.paste(im, (c * cw, y + 20))
                d.text((c * cw + cw - 40, y + 4), f"#{i}", fill=(180, 180, 180))
        out = f"{a.out}-{page // a.rows}.jpg"
        sheet.save(out, quality=86)
        print(out, sheet.size)


if __name__ == "__main__":
    main()
