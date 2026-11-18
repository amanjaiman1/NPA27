"""Narration for the promo, generated with Kokoro-82M (Apache-2.0).

    python vo.py                # writes public/audio/vo/*.wav and public/audio/vo/vo.json

Each line is synthesised on its own so the edit can place it exactly, then
trimmed, resampled to 48 kHz and lightly treated (high-pass, a touch of
warmth and presence, gentle compression, de-essing). The text spells the
brand "Do or Die" and the exam "U.P.S.C." so they are pronounced as people
say them; captions use the written forms.

Whisper (faster-whisper, small.en) then transcribes every line and the
word timings are saved with it, so captions and the intelligibility check
use what was actually said.
"""
import json
import os
import re

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "audio", "vo")
VOICE = os.environ.get("VO_VOICE", "am_michael")
SPEED = float(os.environ.get("VO_SPEED", "0.9"))
SR = 48000

# id, spoken text, caption text
LINES = [
    ("U01", "Every civil services aspirant starts with a dream.", "Every civil services aspirant starts with a dream."),
    ("U02", "But the journey demands more than ambition.", "But the journey demands more than ambition."),
    ("U03", "It demands discipline.", "It demands discipline."),
    ("U04", "Consistency.", "Consistency."),
    ("U05", "Clarity.", "Clarity."),
    ("U06", "Introducing, Do or Die.", "Introducing DoOrDie."),
    ("U07", "Your U.P.S.C. preparation, brought together in one command center.", "Your UPSC preparation, brought together in one command center."),
    ("U08", "See the bigger picture.", "See the bigger picture."),
    ("U09", "Know where you stand.", "Know where you stand."),
    ("U10", "Track your study.", "Track your study."),
    ("U11", "Monitor your syllabus.", "Monitor your syllabus."),
    ("U12", "Stay ahead of revision.", "Stay ahead of revision."),
    ("U13", "Understand your habits.", "Understand your habits."),
    ("U14", "Measure your performance.", "Measure your performance."),
    ("U15", "And make every day count.", "And make every day count."),
    ("U16", "Because preparation is not just about how much you study.", "Because preparation is not just about how much you study."),
    ("U17", "It's about how consistently you move forward.", "It's about how consistently you move forward."),
    ("U18", "Do or Die.", "DoOrDie."),
    ("U19", "Your preparation.", "Your preparation."),
    ("U20", "One command center.", "One command center."),
]


def biquad(kind, f0, q=0.707, gain_db=0.0, sr=SR):
    """RBJ cookbook biquad coefficients."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    cw, sw = np.cos(w), np.sin(w)
    alpha = sw / (2 * q)
    if kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        aa = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * a, -2 * cw, 1 - alpha * a]
        aa = [1 + alpha / a, -2 * cw, 1 - alpha / a]
    elif kind == "lowshelf":
        sq = 2 * np.sqrt(a) * alpha
        b = [a * ((a + 1) - (a - 1) * cw + sq), 2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) - (a - 1) * cw - sq)]
        aa = [(a + 1) + (a - 1) * cw + sq, -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2 * np.sqrt(a) * alpha
        b = [a * ((a + 1) + (a - 1) * cw + sq), -2 * a * ((a - 1) + (a + 1) * cw), a * ((a + 1) + (a - 1) * cw - sq)]
        aa = [(a + 1) - (a - 1) * cw + sq, 2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - sq]
    else:
        raise ValueError(kind)
    return np.array(b) / aa[0], np.array(aa) / aa[0]


def eq(x, *bands):
    for band in bands:
        b, a = biquad(*band)
        x = signal.lfilter(b, a, x)
    return x


def envelope(x, attack_ms, release_ms, sr=SR):
    """Peak envelope follower."""
    a = np.exp(-1 / (sr * attack_ms / 1000))
    r = np.exp(-1 / (sr * release_ms / 1000))
    env = np.zeros_like(x)
    level = 0.0
    ax = np.abs(x)
    for i, v in enumerate(ax):
        level = a * level + (1 - a) * v if v > level else r * level + (1 - r) * v
        env[i] = level
    return env


def compress(x, threshold_db=-20, ratio=3.0, attack_ms=5, release_ms=90, makeup_db=0):
    env = envelope(x, attack_ms, release_ms)
    lvl = 20 * np.log10(np.maximum(env, 1e-6))
    over = np.maximum(0, lvl - threshold_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    return x * 10 ** (gain_db / 20)


def deess(x, f=6500, threshold_db=-30, ratio=4):
    b, a = signal.butter(2, f / (SR / 2), "high")
    side = signal.lfilter(b, a, x)
    env = envelope(side, 1, 40)
    lvl = 20 * np.log10(np.maximum(env, 1e-6))
    over = np.maximum(0, lvl - threshold_db)
    g = 10 ** (-over * (1 - 1 / ratio) / 20)
    return x - side + side * g


def trim(x, thresh_db=-48, pad_ms=25):
    frame = int(SR * 0.005)
    e = np.array([np.sqrt(np.mean(x[i : i + frame] ** 2) + 1e-12) for i in range(0, len(x), frame)])
    db = 20 * np.log10(e)
    on = np.where(db > thresh_db)[0]
    if len(on) == 0:
        return x
    s = max(0, on[0] * frame - int(SR * pad_ms / 1000))
    t = min(len(x), (on[-1] + 1) * frame + int(SR * pad_ms * 2 / 1000))
    y = x[s:t].copy()
    fade = int(SR * 0.006)
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade * 3 :] *= np.linspace(1, 0, fade * 3)
    return y


def main():
    from kokoro import KPipeline

    os.makedirs(OUT, exist_ok=True)
    pipe = KPipeline(lang_code="a" if VOICE.startswith("a") else "b", repo_id="hexgrad/Kokoro-82M")
    meta = {"voice": VOICE, "speed": SPEED, "sr": SR, "lines": []}
    for lid, spoken, caption in LINES:
        chunks = [np.asarray(r.audio) for r in pipe(spoken, voice=VOICE, speed=SPEED)]
        a = np.concatenate(chunks).astype(np.float64)
        a = signal.resample_poly(a, 2, 1)  # 24 kHz -> 48 kHz
        a = trim(a)
        a = eq(a, ("hp", 75, 0.707), ("lowshelf", 170, 0.7, 1.5), ("peak", 420, 1.0, -1.5), ("peak", 3400, 0.9, 2.0), ("highshelf", 11000, 0.7, 1.0))
        a = deess(a)
        a = compress(a, threshold_db=-22, ratio=2.6, attack_ms=6, release_ms=110)
        a = a / (np.max(np.abs(a)) + 1e-9) * 10 ** (-3 / 20)
        path = os.path.join(OUT, f"{lid}.wav")
        sf.write(path, a.astype(np.float32), SR, subtype="FLOAT")
        meta["lines"].append({"id": lid, "spoken": spoken, "caption": caption, "duration": round(len(a) / SR, 3)})
        print(lid, round(len(a) / SR, 2), spoken)

    # Word timings and an intelligibility check from Whisper.
    from faster_whisper import WhisperModel

    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    def words(s):
        s = s.lower().replace("u.p.s.c.", "upsc").replace("doordie", "do or die")
        return re.sub(r"[^a-z' ]", " ", s).split()

    total_err = total_ref = 0
    for line in meta["lines"]:
        y, _ = sf.read(os.path.join(OUT, f"{line['id']}.wav"))
        y16 = signal.resample_poly(y, 1, 3).astype(np.float32)
        segs, _ = model.transcribe(y16, language="en", word_timestamps=True, beam_size=5)
        segs = list(segs)
        heard = " ".join(s.text.strip() for s in segs)
        line["heard"] = heard
        line["words"] = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)} for s in segs for w in s.words]
        ref, hyp = words(line["spoken"]), words(heard.replace("Do or Die", "do or die"))
        d = np.zeros((len(ref) + 1, len(hyp) + 1), int)
        d[:, 0] = range(len(ref) + 1)
        d[0, :] = range(len(hyp) + 1)
        for i in range(1, len(ref) + 1):
            for j in range(1, len(hyp) + 1):
                d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]))
        line["wer"] = round(d[-1, -1] / max(1, len(ref)), 3)
        total_err += d[-1, -1]
        total_ref += len(ref)
        print(f"{line['id']} wer={line['wer']:.2f} heard: {heard}")
    meta["wer"] = round(total_err / total_ref, 4)
    with open(os.path.join(OUT, "vo.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("overall WER", meta["wer"])


if __name__ == "__main__":
    main()
