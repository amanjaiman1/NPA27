"""The soundtrack: an original score, sound design and the mix, for each cut.

    python score.py hero|promo30|vertical      # writes public/audio/mix-<cut>.wav (48 kHz, 24-bit)

Everything is synthesised here except the piano, which plays notes of the
Salamander Grand Piano (Alexander Holm, CC BY 3.0). 120 BPM, so a bar is
two seconds and every scene change in the edit falls on a bar line.

Layers: a low drone and sparse piano for the opening; a riser into the logo
and a sub impact on it; a pulse, chords and soft percussion that build
through the features; a lift for the analytics; a climax and a ringing
final chord for the end card. Whooshes, UI ticks and data blips follow the
picture. The narration is placed per line, the music ducks under it, and the
master is limited and normalised to -14 LUFS with peaks under -1 dBTP.
"""
import json
import os
import subprocess
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

SR = 48000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUD = os.path.join(ROOT, "public", "audio")
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(2027)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def m(name):
    """'D4' -> midi."""
    n, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[n]


class Track:
    def __init__(self, dur):
        self.n = int(dur * SR) + SR * 4
        self.buf = np.zeros((self.n, 2))

    def add(self, t, x, gain=1.0, pan=0.0):
        if x.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            x = np.stack([x * l * 1.414, x * r * 1.414], 1)
        i = int(t * SR)
        if i >= self.n:
            return
        j = min(self.n, i + len(x))
        if i < 0:
            x = x[-i:]
            i = 0
        self.buf[i:j] += x[: j - i] * gain


def env_adsr(n, a, d, s, r, sustain_len=None):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a - d - r) if sustain_len is None else int(sustain_len * SR)
    e = np.concatenate([np.linspace(0, 1, max(1, a)), np.linspace(1, s, max(1, d)), np.full(sus, s), np.linspace(s, 0, max(1, r))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def lowpass(x, f, order=2):
    b, a = signal.butter(order, min(0.99, f / (SR / 2)), "low")
    return signal.lfilter(b, a, x, axis=0)


def highpass(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(0.99, hi / (SR / 2))], "band")
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, f0, f1, q=0.9, kind="low"):
    """Time-varying resonant filter (state-variable), cutoff swept exponentially."""
    n = len(x)
    fc = f0 * (f1 / f0) ** np.linspace(0, 1, n)
    g = np.tan(np.pi * np.minimum(fc, SR * 0.45) / SR)
    k = 1 / q
    ic1 = ic2 = 0.0
    out = np.zeros(n)
    for i in range(n):
        v3 = x[i] - ic2
        v1 = (g[i] * v3 + ic1) / (1 + g[i] * (g[i] + k))
        v2 = ic2 + g[i] * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if kind == "low" else (v1 * k if kind == "band" else x[i] - k * v1 - v2)
    return out


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    # Band-limited-ish saw from 18 harmonics, enough for pads under a low-pass.
    y = np.zeros(n)
    for h in range(1, 19):
        if f * h > SR / 2.2:
            break
        y += np.sin(2 * np.pi * f * h * t + phase * h) / h
    return y * 0.6


# ── instruments ──────────────────────────────────────────────────

_piano = {}


def piano_sample(midi):
    names = {33: "A1", 36: "C2", 39: "Ds2", 42: "Fs2", 45: "A2", 48: "C3", 51: "Ds3", 54: "Fs3", 57: "A3", 60: "C4", 63: "Ds4", 66: "Fs4", 69: "A4", 72: "C5", 75: "Ds5", 78: "Fs5", 81: "A5", 84: "C6", 87: "Ds6"}
    root = min(names, key=lambda k: abs(k - midi))
    if root not in _piano:
        path = os.path.join(AUD, "samples", "piano", f"{names[root]}.mp3")
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        _piano[root] = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    x = _piano[root]
    ratio = 2 ** ((midi - root) / 12)
    if abs(ratio - 1) > 1e-6:
        n_out = int(len(x) / ratio)
        x = signal.resample(x, n_out, axis=0) if n_out < 400000 else np.stack([np.interp(np.arange(n_out) * ratio, np.arange(len(x)), x[:, c]) for c in (0, 1)], 1)
    return x


def piano(note, vel=0.6, length=4.0):
    x = piano_sample(m(note) if isinstance(note, str) else note)[: int(length * SR)].copy()
    fade = int(0.3 * SR)
    if len(x) > fade:
        x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    # Softer notes are darker.
    x = lowpass(x, 1800 + 7000 * vel)
    return x * vel


def pad(notes, dur, bright=1200, attack=0.9, release=1.6, detune=0.12, voices=5):
    n = int((dur + release) * SR)
    out = np.zeros((n, 2))
    for nn in notes:
        f = midi_hz(m(nn) if isinstance(nn, str) else nn)
        for v in range(voices):
            cents = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100 if voices > 1 else 0
            y = saw(f * 2 ** (cents / 1200), n, phase=rng.uniform(0, 6.28))
            pan = (v / (voices - 1) - 0.5) * 1.4 if voices > 1 else 0
            out[:, 0] += y * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += y * np.sin((pan + 1) * np.pi / 4)
    out /= len(notes) * voices ** 0.5
    e = env_adsr(n, attack, 0.6, 0.85, release, sustain_len=max(0, dur - attack - 0.6))
    out *= e[:, None]
    # Slow filter movement for life.
    out = lowpass(out, bright, order=2)
    return out


def sub(note, dur, drive=1.2):
    f = midi_hz(m(note))
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.tanh(np.sin(2 * np.pi * f * t) * drive) * 0.9 + 0.12 * np.sin(4 * np.pi * f * t)
    return y * env_adsr(n, 0.004, 0.08, 0.7, 0.06)


def kick(power=1.0):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 42 + 100 * np.exp(-t * 38)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 6.5)
    click = highpass(rng.normal(size=n) * np.exp(-t * 300), 1500) * 0.25
    return np.tanh((y + click) * 1.6 * power) * 0.8


def tom(f0=90):
    n = int(0.8 * SR)
    t = np.arange(n) / SR
    f = f0 + f0 * 0.8 * np.exp(-t * 18)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    y += lowpass(rng.normal(size=n) * np.exp(-t * 40), 1500) * 0.3
    return np.tanh(y * 1.4) * 0.7


def hat(open_=False):
    n = int((0.25 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    y = highpass(rng.normal(size=n), 7500, 4) * np.exp(-t * (14 if open_ else 90))
    return y * 0.35


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    burst = sum(np.exp(-np.maximum(0, t - d) * 140) * (t >= d) for d in (0, 0.011, 0.023))
    y = bandpass(rng.normal(size=n), 900, 5000) * (burst + 0.35 * np.exp(-t * 18))
    return y * 0.5


def impact(size=1.0):
    """A cinematic hit: sub drop, body thump, and a long dark noise tail."""
    n = int(4.5 * SR)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    thump = lowpass(rng.normal(size=n), 220) * np.exp(-t * 7) * 2.2
    tail = lowpass(rng.normal(size=n), 2600) * np.exp(-t * 1.6) * 0.18
    crack = highpass(rng.normal(size=n), 2000) * np.exp(-t * 30) * 0.5
    y = np.tanh((boom * 1.4 + thump + tail + crack) * 1.2 * size)
    st = np.stack([y, np.roll(y, 37)], 1)
    return st * 0.9


def riser(dur, top=6000):
    n = int(dur * SR)
    noise = rng.normal(size=n)
    y = sweep_filter(noise, 300, top, q=2.2, kind="band") * 0.9
    t = np.arange(n) / SR
    f = 110 * 2 ** (np.linspace(0, 2.0, n))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.18
    e = np.linspace(0, 1, n) ** 2.4
    y = (y + tone) * e
    return np.stack([y, np.roll(y, 120)], 1) * 0.6


def reverse_swell(dur):
    n = int(dur * SR)
    x = impact(0.6)[: n][::-1]
    return x * (np.linspace(0, 1, len(x)) ** 2)[:, None]


def whoosh(dur=0.9, lo=200, hi=5000, pan_from=-0.8, pan_to=0.8):
    n = int(dur * SR)
    noise = rng.normal(size=n)
    up = sweep_filter(noise, lo, hi, q=1.6, kind="band")
    t = np.linspace(0, 1, n)
    e = np.sin(np.pi * t) ** 1.6
    y = up * e * 0.8
    pans = np.linspace(pan_from, pan_to, n)
    return np.stack([y * np.cos((pans + 1) * np.pi / 4), y * np.sin((pans + 1) * np.pi / 4)], 1) * 1.414


def tick(freq=3200, length=0.04):
    n = int(length * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 120) * 0.35 + highpass(rng.normal(size=n), 6000) * np.exp(-t * 400) * 0.08


def blip(note):
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = midi_hz(note)
    mod = np.sin(2 * np.pi * f * 2 * t) * 2.0 * np.exp(-t * 30)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 26) * 0.3


def clock_tick():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return bandpass(rng.normal(size=n), 2000, 7000) * np.exp(-t * 260) * 0.5


def shimmer(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in (1760, 2217, 2637, 3520):
        y += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 7) * t))
    e = env_adsr(n, 0.6, 0.4, 0.7, dur * 0.5)
    return np.stack([y * e, np.roll(y * e, 300)], 1) * 0.04


def reverb(x, seconds=3.2, mix=0.3, pre=0.02, damp=4500):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([rng.normal(size=n), rng.normal(size=n)], 1) * np.exp(-t * (6.9 / seconds))[:, None]
    ir = lowpass(ir, damp)
    ir = np.pad(ir, ((int(pre * SR), 0), (0, 0)))
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], 1)
    return x * (1 - mix) + wet * mix * 1.2


# ── arrangement ──────────────────────────────────────────────────

CHORDS = {  # D minor: i, VI, III, VII and friends
    "Dm": ["D3", "F3", "A3", "E4"],
    "Bb": ["Bb2", "D3", "F3", "C4"],
    "F": ["F2", "C3", "A3", "G4"],
    "C": ["C3", "E3", "G3", "D4"],
    "Gm": ["G2", "D3", "Bb3", "F4"],
    "Am": ["A2", "E3", "C4", "G4"],
}
ROOTS = {"Dm": "D1", "Bb": "Bb0", "F": "F1", "C": "C1", "Gm": "G1", "Am": "A1"}
ROOTS2 = {k: v[:-1] + str(int(v[-1]) + 1) for k, v in ROOTS.items()}


def compose(spec):
    D = spec["duration"]
    music = Track(D)
    drums = Track(D)
    sfx = Track(D)

    # Opening: drone, clock ticks and a few piano notes in the dark.
    for a, b in spec.get("intro", []):
        drone = pad(["D2", "A2", "D3"], b - a, bright=500, attack=2.0, release=2.0, voices=3, detune=0.06)
        music.add(a, drone, 0.55)
        for s in np.arange(a + 0.5, b - 0.4, 1.0):
            sfx.add(s, clock_tick(), 0.32, pan=0.35)
    for t, note, vel in spec.get("piano", []):
        music.add(t, piano(note, vel, 5.0), 0.9, pan=rng.uniform(-0.3, 0.3))

    # Chords, pulse and drums per section.
    for sec in spec.get("sections", []):
        a, b, prog, level = sec["from"], sec["to"], sec["chords"], sec["level"]
        bars = int(round((b - a) / BAR))
        for k in range(bars):
            ch = prog[k % len(prog)]
            t0 = a + k * BAR
            music.add(t0, pad(CHORDS[ch], BAR, bright=900 + 2200 * level, attack=0.35 if level > 0.4 else 0.8, release=1.4), 0.36 + 0.12 * level)
            if level >= 0.2:
                # Eighth-note sub pulse, ducked by the kick.
                for e in range(8):
                    tt = t0 + e * BEAT / 2
                    music.add(tt, sub(ROOTS2[ch] if e % 2 else ROOTS[ch], BEAT / 2 * 0.92), 0.14 + 0.1 * level)
            if level >= 0.35:
                for bt in range(4):
                    tt = t0 + bt * BEAT
                    if bt in (0, 2) or (level > 0.75 and bt == 3 and k % 2):
                        drums.add(tt, kick(0.9 + 0.2 * level), 0.55 + 0.25 * level)
                    if level > 0.6 and bt in (1, 3):
                        drums.add(tt, clap(), 0.3, pan=0.05)
                for e in range(16 if level > 0.5 else 8):
                    step = BEAT / 4 if level > 0.5 else BEAT / 2
                    drums.add(t0 + e * step, hat(open_=(e % 8 == 6)), 0.18 + 0.1 * level * (1 if e % 2 else 0.6), pan=0.35)
            if level >= 0.55:
                # A rising arpeggio of the chord, an octave up.
                notes = [m(nn) + 12 for nn in CHORDS[ch]]
                for e in range(8):
                    music.add(t0 + e * BEAT / 2, blip(notes[e % 4]), 0.22 * level, pan=-0.4 if e % 2 else 0.4)
            if sec.get("toms") and k % 2 == 1:
                for j, ff in enumerate((110, 90, 72)):
                    drums.add(t0 + BAR - BEAT + j * BEAT / 3, tom(ff), 0.5)

    for t, size in spec.get("impacts", []):
        sfx.add(t, impact(size), 0.9 * size)
    for a, b in spec.get("risers", []):
        sfx.add(a, riser(b - a), 0.55)
    for t, dur in spec.get("swells", []):
        sfx.add(t - dur, reverse_swell(dur), 0.5)
    for t, dur, p0, p1 in spec.get("whooshes", []):
        sfx.add(t - dur * 0.55, whoosh(dur, pan_from=p0, pan_to=p1), 0.42)
    for t in spec.get("ticks", []):
        sfx.add(t, tick(rng.choice([2800, 3200, 3600])), 0.5, pan=rng.uniform(-0.3, 0.3))
    for t in spec.get("blips", []):
        sfx.add(t, blip(int(rng.choice([86, 88, 91, 93, 96]))), 0.35, pan=rng.uniform(-0.5, 0.5))
    for t, dur in spec.get("shimmers", []):
        sfx.add(t, shimmer(dur), 1.0)
    # The final chord: piano and pad ringing out.
    if "final" in spec:
        t = spec["final"]
        for k, nn in enumerate(["F2", "C3", "A3", "C4", "F4", "A4", "C5"]):
            music.add(t + k * 0.03, piano(nn, 0.75, 7.0), 0.8, pan=(k - 3) * 0.12)
        music.add(t, pad(["F2", "C3", "A3", "E4", "G4"], 3.5, bright=2600, attack=0.4, release=3.0), 0.5)
        sfx.add(t, shimmer(4.0), 1.4)

    # Sidechain: duck music under each kick.
    kick_env = np.abs(drums.buf).max(1)
    kick_env = signal.lfilter([1], [1, -np.exp(-1 / (0.08 * SR))], kick_env) * (1 - np.exp(-1 / (0.08 * SR)))
    duck = 1 - np.clip(kick_env * 3.0, 0, 0.45)
    music.buf *= duck[:, None]

    music_mix = reverb(music.buf, 3.4, 0.32)
    drum_mix = reverb(drums.buf, 1.2, 0.12)
    sfx_mix = reverb(sfx.buf, 2.6, 0.22)
    return music_mix + drum_mix, sfx_mix


def place_vo(spec, n):
    vo = np.zeros((n, 2))
    meta = json.load(open(os.path.join(AUD, "vo", "vo.json")))
    by_id = {l["id"]: l for l in meta["lines"]}
    cues = []
    for lid, t in spec["vo"]:
        x, _ = sf.read(os.path.join(AUD, "vo", f"{lid}.wav"))
        x = x if x.ndim == 1 else x.mean(1)
        i = int(t * SR)
        vo[i : i + len(x)] += np.stack([x, x], 1)
        cues.append({"id": lid, "start": t, "end": t + len(x) / SR, "text": by_id[lid]["caption"], "words": by_id[lid].get("words", [])})
    return vo, cues


def limiter(x, ceiling_db=-1.2, look=0.005, release=0.08):
    ceil = 10 ** (ceiling_db / 20)
    peak = np.abs(x).max(1)
    la = int(look * SR)
    peak = np.maximum.accumulate(np.pad(peak, (0, la))[::-1].reshape(-1))[::-1] if False else peak
    # Gain computer with lookahead via a running max over the window.
    from scipy.ndimage import maximum_filter1d

    pk = maximum_filter1d(peak, size=la * 2 + 1)
    g = np.minimum(1, ceil / np.maximum(pk, 1e-9))
    a = np.exp(-1 / (release * SR))
    gs = signal.lfilter([1 - a], [1, -a], g)
    gs = np.minimum(gs, g)
    return x * gs[:, None]


def master(music, sfx, vo, D):
    n = int(D * SR)
    music, sfx, vo = music[:n], sfx[:n], vo[:n]
    # Duck the music and effects under the narration (about -7 dB).
    v = np.abs(vo).max(1)
    a = np.exp(-1 / (0.12 * SR))
    venv = signal.lfilter([1 - a], [1, -a], v)
    venv = np.minimum(1, venv * 12)
    duck = 1 - 0.55 * venv
    bed = music * duck[:, None] + sfx * (1 - 0.3 * venv)[:, None]
    vo_bus = reverb(vo, 1.1, 0.07, damp=6000)
    mix = bed * 0.62 + vo_bus * 1.0
    mix = highpass(mix, 24)
    # Fade the very end.
    fade = int(1.2 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    meter = pyln.Meter(SR)
    for _ in range(3):
        lufs = meter.integrated_loudness(mix)
        mix *= 10 ** ((-14 - lufs) / 20)
        mix = limiter(mix, -2.3)
    return mix


SPECS = {}

# Hero: 58 s. Times in seconds, from the edit (compositions/films.tsx).
SPECS["hero"] = {
    "duration": 58.0,
    "intro": [(0.0, 6.0)],
    "piano": [(0.6, "D5", 0.42), (2.4, "A4", 0.36), (4.2, "F5", 0.4), (5.2, "E5", 0.32),
              (9.6, "D4", 0.5), (9.62, "A4", 0.45), (9.64, "F5", 0.5), (11.6, "E5", 0.4), (13.4, "C5", 0.36),
              (43.4, "A4", 0.4), (44.4, "C5", 0.38), (45.4, "D5", 0.4), (47.4, "F5", 0.42), (49.0, "E5", 0.4)],
    "sections": [
        {"from": 10.0, "to": 14.0, "chords": ["Dm", "Bb"], "level": 0.1},
        {"from": 14.0, "to": 20.0, "chords": ["Dm", "Bb", "F"], "level": 0.3},
        {"from": 20.0, "to": 30.0, "chords": ["Dm", "Bb", "F", "C", "Dm"], "level": 0.5, "toms": True},
        {"from": 30.0, "to": 38.0, "chords": ["F", "C", "Dm", "Bb"], "level": 0.8},
        {"from": 38.0, "to": 44.0, "chords": ["Bb", "F", "C"], "level": 0.6},
        {"from": 44.0, "to": 50.0, "chords": ["Bb", "F", "Gm"], "level": 0.3},
        {"from": 52.0, "to": 56.0, "chords": ["F", "C"], "level": 0.85},
    ],
    "impacts": [(3.3, 0.5), (9.6, 1.0), (13.8, 0.5), (29.8, 0.7), (51.63, 1.1), (55.7, 0.45)],
    "risers": [(7.4, 9.6), (18.2, 19.8), (28.2, 29.8), (49.4, 51.63)],
    "swells": [(13.8, 1.2), (36.8, 1.0)],
    "whooshes": [(6.0, 1.2, -0.6, 0.6), (13.8, 1.0, 0.7, -0.5), (19.8, 0.9, -0.7, 0.6), (22.4, 0.8, 0.8, -0.8), (24.9, 0.8, 0.0, 0.0),
                 (27.4, 0.9, -0.4, 0.6), (29.8, 1.0, 0.6, -0.6), (36.8, 1.0, -0.6, 0.6), (42.8, 1.0, 0.6, -0.6), (50.3, 1.2, -0.5, 0.5)],
    "ticks": [16.9, 17.1, 17.3, 17.5, 20.0, 22.4, 24.9, 27.4, 44.2, 45.7, 53.97, 54.37, 54.77, 55.17, 55.63],
    "blips": [14.4, 14.7, 15.0, 15.4, 15.8, 30.4, 30.7, 31.0, 31.4, 31.8, 37.2, 37.5, 37.8, 38.1, 38.4],
    "shimmers": [(9.7, 3.5), (35.2, 2.5)],
    "final": 55.7,
    "vo": [("U01", 0.5), ("U02", 3.9), ("U03", 6.7), ("U04", 8.4), ("U05", 9.75), ("U06", 10.6), ("U07", 12.3),
           ("U10", 20.4), ("U11", 22.9), ("U12", 25.4), ("U13", 27.9), ("U14", 30.4), ("U08", 32.5), ("U09", 34.6),
           ("U16", 37.4), ("U17", 43.6), ("U15", 47.3), ("U18", 52.4), ("U19", 53.7), ("U20", 55.1)],
}

# The 30-second cut is four pieces of the master (hero seconds), joined by
# half-second crossfades; scripts/render/finish.py uses the same list.
CUT30 = [(0.0, 3.5), (6.0, 17.0), (19.8, 29.8), (51.0, 57.5)]
XFADE = 0.5


def cut_map(segments=CUT30, xf=XFADE):
    starts, t = [], 0.0
    for a, b in segments:
        starts.append(t)
        t += (b - a) - xf
    total = t + xf

    def to_cut(h):
        for (a, b), s0 in zip(segments, starts):
            if a <= h < b:
                return s0 + (h - a)
        return None

    return to_cut, total, starts


def derive_cut(spec, segments=CUT30, xf=XFADE):
    to_cut, total, starts = cut_map(segments, xf)
    out = {"duration": round(total, 3)}
    out["intro"] = [(0.0, segments[0][1] - segments[0][0])]
    out["piano"] = [(to_cut(t), n, v) for t, n, v in spec["piano"] if to_cut(t) is not None]
    out["sections"] = []
    for sec in spec["sections"]:
        for (a, b), s0 in zip(segments, starts):
            lo, hi = max(a, sec["from"]), min(b, sec["to"])
            if hi - lo >= 1.9:
                out["sections"].append({**sec, "from": s0 + lo - a, "to": s0 + hi - a})
    for key in ("impacts", "ticks", "blips"):
        items = spec[key]
        out[key] = [((to_cut(x[0]),) + tuple(x[1:])) if isinstance(x, tuple) else to_cut(x) for x in items if to_cut(x[0] if isinstance(x, tuple) else x) is not None]
    out["risers"] = [(to_cut(b) - (b - a), to_cut(b)) for a, b in spec["risers"] if to_cut(b) is not None]
    out["swells"] = [(to_cut(t), d) for t, d in spec["swells"] if to_cut(t) is not None]
    out["shimmers"] = [(to_cut(t), d) for t, d in spec["shimmers"] if to_cut(t) is not None]
    out["whooshes"] = [(to_cut(t), d, p0, p1) for t, d, p0, p1 in spec["whooshes"] if to_cut(t) is not None]
    # Each join gets a whoosh and a soft hit of its own.
    for s0 in starts[1:]:
        out["whooshes"].append((s0 + xf / 2, 0.9, -0.6, 0.6))
    out["final"] = to_cut(spec["final"])
    out["vo"] = [(lid, round(to_cut(t), 3)) for lid, t in spec["vo"] if to_cut(t) is not None]
    return out


SPECS["promo30"] = derive_cut(SPECS["hero"])

# Vertical: 15 s. Reveal 0-3.7, phone 3.5-11.7, end 11.5-15.
SPECS["vertical"] = {
    "duration": 15.0,
    "intro": [(0.0, 2.0)],
    "piano": [(0.3, "D5", 0.4), (1.94, "D4", 0.5), (1.96, "A4", 0.45), (1.98, "F5", 0.5)],
    "sections": [
        {"from": 4.0, "to": 8.0, "chords": ["Dm", "Bb"], "level": 0.5},
        {"from": 8.0, "to": 12.0, "chords": ["F", "C"], "level": 0.8},
    ],
    "impacts": [(1.93, 1.0), (8.6, 0.55), (11.6, 0.9)],
    "risers": [(0.2, 1.9), (10.0, 11.6)],
    "whooshes": [(3.6, 1.0, -0.5, 0.5), (8.6, 0.9, 0.6, -0.6), (11.5, 1.0, -0.5, 0.5)],
    "ticks": [2.4, 4.1, 4.5, 4.9, 5.3, 8.9, 9.2, 13.0],
    "blips": [5.0, 5.3, 5.6, 9.4, 9.8],
    "final": 12.6,
    "vo": [("U06", 2.3), ("U07", 4.1), ("U10", 9.0), ("U12", 10.3), ("U20", 12.9)],
}


def main():
    cut = sys.argv[1] if len(sys.argv) > 1 else "hero"
    spec = SPECS[cut]
    music, sfx = compose(spec)
    vo, cues = place_vo(spec, music.shape[0])
    mix = master(music, sfx, vo, spec["duration"])
    # Inter-sample peaks: measured at 4x, trimmed so the true peak stays under -1 dBTP.
    tp = 20 * np.log10(np.abs(signal.resample_poly(mix, 4, 1, axis=0)).max())
    if tp > -1.1:
        mix = mix * 10 ** ((-1.2 - tp) / 20)
    out = os.path.join(AUD, f"mix-{cut}.wav")
    sf.write(out, mix.astype(np.float32), SR, subtype="PCM_24")
    json.dump(cues, open(os.path.join(AUD, f"cues-{cut}.json"), "w"), indent=1)
    meter = pyln.Meter(SR)
    up = signal.resample_poly(mix, 4, 1, axis=0)
    print(cut, "LUFS", round(meter.integrated_loudness(mix), 2), "sample peak dBFS", round(20 * np.log10(np.abs(mix).max()), 2),
          "true peak dBTP", round(20 * np.log10(np.abs(up).max()), 2), "->", out)


if __name__ == "__main__":
    main()
