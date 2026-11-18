"""Contact sheet of an image sequence or a video, for reviewing frames.

    python sheet.py <dir-of-jpgs | video.mp4> out.jpg [--every N] [--cols C] [--width W] [--start S] [--count K]
"""
import argparse
import glob
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw


def frames_from_video(path, every, start, count, width):
    tmp = tempfile.mkdtemp()
    vf = f"select='not(mod(n-{start}\\,{every}))*gte(n\\,{start})',scale={width}:-1"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-fps_mode", "vfr", "-frames:v", str(count), f"{tmp}/%05d.jpg"],
        check=True,
    )
    files = sorted(glob.glob(f"{tmp}/*.jpg"))
    return [(start + i * every, f) for i, f in enumerate(files)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--every", type=int, default=10)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--width", type=int, default=560)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int, default=16)
    a = ap.parse_args()
    if os.path.isdir(a.src):
        files = sorted(glob.glob(os.path.join(a.src, "*.jpg")) + glob.glob(os.path.join(a.src, "*.png")))
        picked = [(i, files[i]) for i in range(a.start, len(files), a.every)][: a.count]
    else:
        picked = frames_from_video(a.src, a.every, a.start, a.count, a.width)
    ims = []
    for idx, f in picked:
        im = Image.open(f).convert("RGB")
        im = im.resize((a.width, round(im.height * a.width / im.width)))
        ims.append((idx, im))
    if not ims:
        raise SystemExit("no frames")
    w, h = ims[0][1].size
    rows = (len(ims) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (a.cols * w, rows * (h + 18)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for k, (idx, im) in enumerate(ims):
        x, y = (k % a.cols) * w, (k // a.cols) * (h + 18)
        sheet.paste(im, (x, y + 18))
        d.text((x + 4, y + 3), f"#{idx}", fill=(255, 220, 0))
    sheet.save(a.out, quality=88)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
