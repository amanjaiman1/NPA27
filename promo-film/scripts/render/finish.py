"""Encodes rendered frames with the mix, writes captions, and checks the result.

    python finish.py hero|promo30|vertical

Frames come from scripts/render/frames.mjs (.work/<cut>/element-NNNN.jpeg).
The encode adds a fine film grain (ffmpeg noise) and muxes the mix from
scripts/audio/score.py as AAC 320 kb/s at 48 kHz. Captions (SRT) are built
from where each narration line was placed, split at Whisper's word timings
when a line is long.
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WORK = os.path.join(ROOT, ".work")
EXPORTS = os.path.join(ROOT, "exports")
AUD = os.path.join(ROOT, "public", "audio")

CUTS = {
    "hero": {"out": "doordie-hero-4k.mp4", "srt": "doordie-subtitles.srt", "size": (3840, 2160), "frames": 1740,
             # About 70 MB: well inside GitHub's 100 MB per-file limit.
             "video": ["-b:v", "9500k", "-maxrate", "16M", "-bufsize", "24M"]},
    "vertical": {"out": "doordie-vertical-15s.mp4", "srt": "doordie-vertical-15s.srt", "size": (1080, 1920), "frames": 450, "grain": 2,
                 "video": ["-crf", "21", "-maxrate", "6M", "-bufsize", "12M"]},
}


def ts(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def captions(cut):
    cues = json.load(open(os.path.join(AUD, f"cues-{cut}.json")))
    blocks = []
    for c in cues:
        text = c["text"]
        words = text.split()
        # Long lines become two captions, split at the nearest word boundary to the middle.
        if len(words) > 7 and c.get("words"):
            k = len(words) // 2
            split_t = c["start"] + c["words"][min(k, len(c["words"]) - 1)]["s"]
            blocks.append((c["start"], split_t, " ".join(words[:k])))
            blocks.append((split_t, c["end"] + 0.25, " ".join(words[k:])))
        else:
            blocks.append((c["start"], c["end"] + 0.35, text))
    # Never overlap the next caption.
    fixed = []
    for i, (a, b, t) in enumerate(blocks):
        if i + 1 < len(blocks):
            b = min(b, blocks[i + 1][0] - 0.04)
        fixed.append((a, b, t))
    srt = "\n".join(f"{i + 1}\n{ts(a)} --> {ts(b)}\n{t}\n" for i, (a, b, t) in enumerate(fixed))
    return srt


def promo30():
    """The 30-second cut: four pieces of the master's frames, crossfaded, at 1080p."""
    sys.path.insert(0, os.path.join(ROOT, "scripts", "audio"))
    from score import CUT30, XFADE, cut_map

    _, total, starts = cut_map()
    src = os.path.join(WORK, "hero", "element-%04d.jpeg")
    inputs, chains = [], []
    for i, (a, b) in enumerate(CUT30):
        inputs += ["-framerate", "30", "-start_number", str(round(a * 30)), "-i", src]
        n = round((b - a) * 30)
        chains.append(f"[{i}:v]trim=end_frame={n},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos:out_range=limited,format=yuv420p,settb=1/30[v{i}]")
    prev, acc = "v0", CUT30[0][1] - CUT30[0][0]
    for i in range(1, len(CUT30)):
        off = acc - XFADE
        chains.append(f"[{prev}][v{i}]xfade=transition=fade:duration={XFADE}:offset={off:.3f}[x{i}]")
        prev = f"x{i}"
        acc = off + (CUT30[i][1] - CUT30[i][0])
    chains.append(f"[{prev}]noise=alls=2:allf=t,format=yuv420p[vout]")
    out = os.path.join(EXPORTS, "doordie-promo-30s.mp4")
    audio_index = len(CUT30)
    cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-i", os.path.join(AUD, "mix-promo30.wav"),
           "-filter_complex", ";".join(chains), "-map", "[vout]", "-map", f"{audio_index}:a",
           "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level", "4.2", "-crf", "21", "-maxrate", "5M", "-bufsize", "10M",
           "-g", "60", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-t", f"{total:.3f}", out]
    subprocess.run(cmd, check=True)
    with open(os.path.join(EXPORTS, "doordie-promo-30s.srt"), "w") as f:
        f.write(captions("promo30"))
    print(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", out], capture_output=True, text=True).stdout)


def web():
    """The film for the public site: 1080p for larger screens, 720p for phones, the cover and captions."""
    site = os.path.abspath(os.path.join(ROOT, "..", "public", "media"))
    os.makedirs(site, exist_ok=True)
    frames = os.path.join(WORK, "hero", "element-%04d.jpeg")
    mix = os.path.join(AUD, "mix-hero.wav")
    for name, size, rate in (("doordie-film.mp4", "1920:1080", ["-crf", "22", "-maxrate", "3500k", "-bufsize", "7M", "-level", "4.1"]),
                             ("doordie-film-720.mp4", "1280:720", ["-crf", "24", "-maxrate", "1800k", "-bufsize", "3600k", "-level", "3.1"])):
        out = os.path.join(site, name)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", "30", "-i", frames, "-i", mix,
                        "-vf", f"scale={size}:flags=lanczos:out_range=limited,format=yuv420p",
                        "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", *rate,
                        "-g", "60", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
                        "-c:a", "aac", "-b:a", "160k" if "720" not in name else "128k", "-ar", "48000", "-movflags", "+faststart", "-shortest", out], check=True)
        print(name, os.path.getsize(out) // 1024, "KB")
    # The cover: the end card without its call to action, which the page draws as real buttons.
    cover_dir = os.path.join(WORK, "cover")
    subprocess.run(["node", os.path.join(ROOT, "scripts", "render", "stills.mjs"), "Cover", "1", cover_dir, "0"], check=True, cwd=ROOT)
    from PIL import Image

    Image.open(os.path.join(cover_dir, "Cover-0000.jpeg")).save(os.path.join(site, "doordie-film-poster.jpg"), quality=86, optimize=True, progressive=True)
    srt = open(os.path.join(EXPORTS, "doordie-subtitles.srt")).read()
    vtt = "WEBVTT\n\n" + "\n".join(line.replace(",", ".") if "-->" in line else line for line in srt.splitlines()) + "\n"
    open(os.path.join(site, "doordie-film.vtt"), "w").write(vtt)


def main():
    cut = sys.argv[1]
    if cut == "promo30":
        return promo30()
    if cut == "web":
        return web()
    spec = CUTS[cut]
    frames = sorted(glob.glob(os.path.join(WORK, cut, "element-*.jpeg")))
    if len(frames) != spec["frames"]:
        raise SystemExit(f"{cut}: {len(frames)} frames rendered, expected {spec['frames']}")
    os.makedirs(EXPORTS, exist_ok=True)
    out = os.path.join(EXPORTS, spec["out"])
    w, h = spec["size"]
    first = int(os.path.basename(frames[0]).split("-")[1].split(".")[0])
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-framerate", "30", "-start_number", str(first), "-i", os.path.join(WORK, cut, "element-%04d.jpeg"),
        "-i", os.path.join(AUD, f"mix-{cut}.wav"),
        "-vf", f"scale={w}:{h}:flags=lanczos:out_range=limited,noise=alls={spec.get('grain', 5)}:allf=t,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level", "5.1" if w * h > 2e6 else "4.2",
        *spec["video"], "-g", "60", "-bf", "3", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
        "-movflags", "+faststart", "-shortest", out,
    ]
    subprocess.run(cmd, check=True)
    with open(os.path.join(EXPORTS, spec["srt"]), "w") as f:
        f.write(captions(cut))
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=codec_name,width,height,r_frame_rate,sample_rate", "-of", "json", out], capture_output=True, text=True).stdout
    print(probe)


if __name__ == "__main__":
    main()
