"""Textures for the opening desk scene: the notebook, a printed timetable,
sticky notes, the laptop's scattered tools, book spines and the clock face.

    python textures.py      # writes public/renders/tex/*.png

Handwriting uses Kalam (an Indian handwriting face, OFL) with small random
rotations, baseline drift and ink variation per word so it reads as written
by hand rather than typed. Everything is generic: no real brand, app or
book cover appears.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONTS = os.path.join(ROOT, "public", "fonts")
OUT = os.path.join(ROOT, "public", "renders", "tex")
os.makedirs(OUT, exist_ok=True)
rng = random.Random(1857)


def font(name, size, weight=None):
    f = ImageFont.truetype(os.path.join(FONTS, name), size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


KALAM = lambda s: font("Kalam-Regular.ttf", s)
KALAM_B = lambda s: font("Kalam-Bold.ttf", s)
CAVEAT = lambda s: font("Caveat[wght].ttf", s, 600)
POP = lambda s, w="Medium": font(f"Poppins-{w}.ttf", s)
SERIF = lambda s, w=700: font("PlayfairDisplay[wght].ttf", s, w)

INK = [(28, 40, 92), (22, 32, 78), (34, 46, 104)]
PENCIL = (92, 92, 98)
RED = (176, 38, 44)


def paper(w, h, base=(243, 238, 226), noise=6, seed=0):
    r = random.Random(seed)
    im = Image.new("RGB", (w, h), base)
    px = im.load()
    # Fibres: sparse speckle, then blur, keeps it cheap at 4K.
    sp = Image.new("L", (w // 4, h // 4), 128)
    spx = sp.load()
    for y in range(h // 4):
        for x in range(w // 4):
            spx[x, y] = 128 + r.randint(-noise, noise)
    sp = sp.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))
    tone = Image.new("RGB", (w, h), (0, 0, 0))
    im = Image.composite(im, Image.blend(im, Image.new("RGB", (w, h), (225, 218, 202)), 0.5), sp.point(lambda v: 255 if v > 128 else 200))
    return im


def hand(draw_img, xy, text, f, ink=None, jitter=1.0, slant=0.0):
    """Write a line word by word with a hand's small irregularities."""
    x, y = xy
    ink = ink or rng.choice(INK)
    for word in text.split(" "):
        if not word:
            x += f.size * 0.3
            continue
        size = f.size
        bbox = f.getbbox(word)
        w, h = bbox[2] + 10, int(size * 1.6)
        tile = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0))
        d = ImageDraw.Draw(tile)
        c = tuple(max(0, min(255, v + rng.randint(-10, 10))) for v in ink)
        d.text((10, 10), word, font=f, fill=c + (rng.randint(215, 245),))
        tile = tile.rotate(rng.uniform(-2.2, 2.2) * jitter + slant, resample=Image.BICUBIC, expand=True)
        dy = rng.uniform(-size * 0.06, size * 0.06) * jitter
        draw_img.alpha_composite(tile, (int(x - 10), int(y - 10 + dy)))
        x += bbox[2] + f.size * rng.uniform(0.26, 0.36)
    return x


def wobbly_line(d, p0, p1, color, width, amp=2.0, seed=None):
    r = random.Random(seed)
    (x0, y0), (x1, y1) = p0, p1
    n = max(8, int(math.hypot(x1 - x0, y1 - y0) / 18))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((x0 + (x1 - x0) * t + r.uniform(-amp, amp) * 0.3, y0 + (y1 - y0) * t + r.uniform(-amp, amp)))
    d.line(pts, fill=color, width=width, joint="curve")


def box(d, x, y, s, color, ticked=False):
    wobbly_line(d, (x, y), (x + s, y + 1), color, 4, 1.2)
    wobbly_line(d, (x + s, y), (x + s - 1, y + s), color, 4, 1.2)
    wobbly_line(d, (x + s, y + s), (x, y + s - 1), color, 4, 1.2)
    wobbly_line(d, (x, y + s), (x + 1, y), color, 4, 1.2)
    if ticked:
        d.line([(x + s * 0.15, y + s * 0.5), (x + s * 0.42, y + s * 0.85), (x + s * 1.15, y - s * 0.35)], fill=color, width=6, joint="curve")


def notebook():
    W, H = 4400, 3000
    im = paper(W, H, seed=3).convert("RGBA")
    d = ImageDraw.Draw(im)
    # Ruling, margin and the gutter shadow.
    for page in (0, 1):
        x0 = page * W // 2
        for i in range(25):
            y = 300 + i * 104
            d.line([(x0 + 60, y), (x0 + W // 2 - 60, y)], fill=(150, 176, 214), width=3)
        d.line([(x0 + 330, 150), (x0 + 330, H - 120)], fill=(222, 120, 128), width=4)
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for i in range(220):
        a = int(85 * (1 - i / 220) ** 2.2)
        sd.line([(W // 2 - i, 0), (W // 2 - i, H)], fill=(70, 55, 40, a))
        sd.line([(W // 2 + i, 0), (W // 2 + i, H)], fill=(70, 55, 40, a))
    im.alpha_composite(shade)
    d = ImageDraw.Draw(im)

    big, mid, small = KALAM(86), KALAM(74), KALAM(62)
    # Left page: today's list.
    hand(im, (380, 170), "Mon 18 Nov  ·  Day 150", KALAM_B(70), INK[1])
    hand(im, (380, 300), "TO DO  —  TODAY", KALAM_B(92), INK[0])
    d.line([(380, 410), (1180, 404)], fill=INK[0], width=6)
    tasks = [
        ("Polity — Parliament & committees (ch 22-24)", False, False),
        ("The Hindu + 2 editorials", True, False),
        ("Revise Modern History  (1857 -> 1885)", False, False),
        ("Economy: inflation, repo rate, WPI vs CPI", False, False),
        ("Mock 11 — analyse mistakes !!", False, False),
        ("Answer writing x 2  (GS2)", False, False),
        ("CSAT — 20 Qs comprehension", True, False),
        ("Revise Art & Culture", False, True),
        ("Environment — conventions", False, False),
    ]
    y = 500
    for text, done, struck in tasks:
        box(d, 392, y + 22, 52, INK[0], ticked=done)
        end = hand(im, (480, y), text, mid)
        if struck:
            wobbly_line(d, (470, y + 60), (end, y + 52), INK[0], 6, 3, seed=5)
            hand(im, (end + 30, y - 6), "-> tomorrow?", small, RED)
        if text.endswith("!!"):
            # Ring the urgent one, twice, the way a hurried hand does.
            for k in range(2):
                d.ellipse([(end - 150 - k * 8, y - 14 - k * 5), (end + 40 + k * 6, y + 112 + k * 4)], outline=RED, width=6)
        y += 208
    hand(im, (430, 2420), "how many hours yesterday? 6? 7?", KALAM(68), PENCIL, slant=3)
    hand(im, (430, 2560), "syllabus done ~30% ?? 40%??", KALAM(68), PENCIL, slant=2)
    wobbly_line(d, (1180, 2660), (1650, 2620), PENCIL, 4, 4)

    # Right page: a revision plan that keeps changing, and the countdown.
    x0 = W // 2 + 380
    hand(im, (x0, 300), "REVISION  PLAN ??", KALAM_B(92), INK[0])
    d.line([(x0, 410), (x0 + 900, 404)], fill=INK[0], width=6)
    rows = [
        "Day 1  ->  Day 3  ->  Day 7  ->  Day 16",
        "Polity  FR  —  last revised ???",
        "Geography  —  monsoon  (again)",
        "Ethics  —  not started",
        "Sociology  —  Durkheim / Weber",
    ]
    y = 520
    for r in rows:
        hand(im, (x0, y), r, mid)
        y += 208
    wobbly_line(d, (x0 + 640, 730), (x0 + 1300, 720), INK[0], 6, 3, seed=9)
    hand(im, (x0 + 1340, 680), "redo!", small, RED)
    # The countdown, boxed twice, heavily.
    bx, by = x0 + 80, 1700
    for k in range(3):
        d.rounded_rectangle([(bx - 20 - k * 6, by - 20 - k * 4), (bx + 1240 + k * 5, by + 300 + k * 6)], radius=40, outline=RED, width=5)
    hand(im, (bx + 40, by + 20), "PRELIMS:  186 days", KALAM_B(120), RED)
    hand(im, (bx + 60, by + 170), "mocks done: 10   target: 30 ?", KALAM(70), INK[2])
    hand(im, (x0, 2240), "weekly test Thursday  —  still behind", KALAM(70), PENCIL, slant=-2)
    hand(im, (x0, 2400), "what do I revise first??", KALAM(76), PENCIL, slant=-3)
    for k in range(7):
        cx, cy = x0 + 1450 + rng.randint(-20, 20), 2420 + rng.randint(-10, 10)
        d.arc([(cx - 80 - k * 4, cy - 50), (cx + 80 + k * 4, cy + 50)], start=rng.randint(0, 90), end=rng.randint(250, 360), fill=PENCIL, width=3)
    im.convert("RGB").save(os.path.join(OUT, "notebook.png"))


def timetable():
    W, H = 2100, 2970
    im = paper(W, H, base=(246, 246, 243), noise=3, seed=7).convert("RGBA")
    d = ImageDraw.Draw(im)
    d.text((140, 120), "STUDY TIMETABLE  —  WEEK 21", font=POP(64, "SemiBold"), fill=(40, 40, 46))
    d.text((140, 210), "Prelims 2027  ·  target 8 h / day", font=POP(40, "Regular"), fill=(90, 90, 96))
    days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    times = ["06:00", "08:00", "10:00", "13:00", "15:00", "17:00", "20:00", "22:00"]
    subjects = ["Polity", "Economy", "Geo", "History", "Ethics", "CSAT", "Optional", "Revision", "Mock", "CA"]
    gx, gy, cw, ch = 300, 360, 250, 300
    for i, day in enumerate(days):
        d.text((gx + i * cw + 70, gy - 70), day, font=POP(40, "SemiBold"), fill=(50, 50, 56))
    hl = [(255, 236, 120), (170, 230, 190), (160, 210, 255), (255, 182, 210)]
    for j, t in enumerate(times):
        d.text((120, gy + j * ch + 110), t, font=POP(38, "Regular"), fill=(80, 80, 86))
        for i in range(7):
            x, y = gx + i * cw, gy + j * ch
            d.rectangle([(x, y), (x + cw, y + ch)], outline=(160, 160, 166), width=3)
            s = subjects[(i * 3 + j * 7) % len(subjects)]
            if rng.random() < 0.28:
                c = rng.choice(hl)
                d.rectangle([(x + 10, y + 90), (x + cw - 10, y + 190)], fill=c + (150,))
            d.text((x + 24, y + 110), s, font=POP(42, "Medium"), fill=(44, 44, 52))
    # Pencil changes.
    for (i, j, note) in [(2, 3, "skip"), (4, 6, "-> Sat"), (6, 1, "mock?"), (1, 7, "late")]:
        x, y = gx + i * cw, gy + j * ch
        wobbly_line(d, (x + 20, y + 150), (x + cw - 20, y + 140), PENCIL, 5, 3)
        hand(im, (x + 30, y + 200), note, KALAM(56), PENCIL)
    im.convert("RGB").save(os.path.join(OUT, "timetable.png"))


def sticky(name, color, lines, rot=0):
    S = 1100
    im = Image.new("RGBA", (S, S), color + (255,))
    shade = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for i in range(140):
        sd.line([(0, i), (S, i)], fill=(0, 0, 0, int(30 * (1 - i / 140) ** 2)))  # the glued strip
        sd.line([(0, S - 140 + i), (S, S - 140 + i)], fill=(90, 70, 0, int(36 * (i / 140) ** 2)))
    im.alpha_composite(shade)
    d = ImageDraw.Draw(im)
    y = 170
    for ln in lines:
        hand(im, (110, y), ln, KALAM_B(120), (30, 30, 40), jitter=1.4, slant=rot)
        y += 190
    im.convert("RGB").save(os.path.join(OUT, f"{name}.png"))


def laptop_screen():
    W, H = 2880, 1800
    im = Image.new("RGB", (W, H), (22, 26, 34))
    d = ImageDraw.Draw(im)
    for y in range(H):
        c = int(30 + 22 * y / H)
        d.line([(0, y), (W, y)], fill=(c - 6, c, c + 14))
    d.rectangle([(0, 0), (W, 46)], fill=(14, 16, 22))
    d.text((40, 8), "Tue 23:41", font=POP(26, "Medium"), fill=(200, 205, 215))

    def window(x, y, w, h, title, body):
        d.rounded_rectangle([(x + 14, y + 20), (x + w + 14, y + h + 20)], radius=18, fill=(8, 10, 14))
        d.rounded_rectangle([(x, y), (x + w, y + h)], radius=18, fill=(246, 247, 250))
        d.rounded_rectangle([(x, y), (x + w, y + 64)], radius=18, fill=(226, 229, 236))
        d.rectangle([(x, y + 40), (x + w, y + 64)], fill=(226, 229, 236))
        for k, c in enumerate([(236, 96, 90), (240, 190, 70), (98, 196, 92)]):
            d.ellipse([(x + 26 + k * 34, y + 22), (x + 46 + k * 34, y + 42)], fill=c)
        d.text((x + 150, y + 16), title, font=POP(28, "Medium"), fill=(70, 74, 86))
        body(x, y + 64, w, h - 64)

    def sheet(x, y, w, h):
        cols = ["Date", "Subject", "Hours", "Topics", "Done?"]
        cw = w // len(cols)
        for r in range(17):
            for c in range(len(cols)):
                cx, cy = x + c * cw, y + r * 52
                fill = (232, 240, 255) if r == 0 else ((255, 244, 200) if (r * 3 + c) % 11 == 0 else (255, 255, 255))
                d.rectangle([(cx, cy), (cx + cw, cy + 52)], fill=fill, outline=(206, 210, 220))
                txt = cols[c] if r == 0 else ["11/" + str(r + 1), ["Polity", "Eco", "Geo", "Hist", "CSAT"][r % 5], str(round(3 + (r * 7 % 9) * 0.5, 1)), ["ch 12", "notes", "PYQ", "?", "rev"][r % 5], ["yes", "no", "?", "half", ""][r % 5]][c]
                d.text((cx + 12, cy + 10), txt, font=POP(24, "Regular"), fill=(60, 64, 74))

    def calendar(x, y, w, h):
        cw, chh = w // 7, (h - 60) // 5
        for i, dname in enumerate(["M", "T", "W", "T", "F", "S", "S"]):
            d.text((x + i * cw + cw // 2 - 8, y + 12), dname, font=POP(24, "SemiBold"), fill=(90, 94, 106))
        cols = [(255, 120, 120), (120, 170, 255), (130, 210, 150), (250, 190, 90), (190, 140, 250)]
        for r in range(5):
            for c in range(7):
                cx, cy = x + c * cw, y + 60 + r * chh
                d.rectangle([(cx, cy), (cx + cw, cy + chh)], outline=(220, 224, 232))
                d.text((cx + 8, cy + 6), str(r * 7 + c + 1), font=POP(20, "Regular"), fill=(140, 144, 156))
                for k in range((r + c) % 3):
                    col = cols[(r * 2 + c + k) % 5]
                    d.rounded_rectangle([(cx + 6, cy + 34 + k * 26), (cx + cw - 6, cy + 56 + k * 26)], radius=6, fill=col)

    def todo(x, y, w, h):
        items = ["Finish polity notes", "Mock analysis", "Make revision list", "Current affairs PDF", "Answer writing", "Rewrite timetable", "Sort bookmarks", "Plan next week"]
        for i, t in enumerate(items):
            cy = y + 30 + i * 70
            d.rounded_rectangle([(x + 30, cy), (x + 66, cy + 36)], radius=8, outline=(150, 156, 170), width=3)
            if i in (1, 4):
                d.line([(x + 36, cy + 18), (x + 48, cy + 30), (x + 62, cy + 6)], fill=(60, 140, 90), width=5)
            d.text((x + 90, cy), t, font=POP(28, "Regular"), fill=(60, 64, 74) if i not in (1, 4) else (150, 156, 170))

    def notes(x, y, w, h):
        lines = ["Revision ideas", "- spaced? 1/3/7?", "- which topics first", "- track hours somewhere", "Mock 10: 96/200", "- negative marking!", "- weak: S&T, CA"]
        for i, t in enumerate(lines):
            d.text((x + 30, y + 30 + i * 56), t, font=POP(30 if i == 0 else 26, "SemiBold" if i == 0 else "Regular"), fill=(50, 54, 64))

    window(80, 120, 1240, 980, "study-log  —  sheet", sheet)
    window(1400, 90, 1360, 760, "Calendar  —  November", calendar)
    window(1180, 940, 900, 700, "To-do", todo)
    window(2160, 900, 640, 640, "Notes", notes)
    # Timer widget.
    d.rounded_rectangle([(160, 1200), (980, 1640)], radius=28, fill=(30, 34, 44))
    d.text((220, 1240), "Focus timer", font=POP(32, "Medium"), fill=(170, 176, 190))
    d.text((220, 1300), "00:41:07", font=POP(150, "SemiBold"), fill=(240, 242, 248))
    d.text((220, 1500), "paused", font=POP(30, "Regular"), fill=(236, 120, 110))
    im.save(os.path.join(OUT, "laptop.png"))


def clock_face():
    S = 1400
    im = Image.new("RGB", (S, S), (240, 238, 232))
    d = ImageDraw.Draw(im)
    c = S / 2
    for i in range(60):
        a = math.radians(i * 6)
        r1 = c * 0.92
        r0 = c * (0.82 if i % 5 == 0 else 0.88)
        w = 12 if i % 5 == 0 else 4
        d.line([(c + r0 * math.sin(a), c - r0 * math.cos(a)), (c + r1 * math.sin(a), c - r1 * math.cos(a))], fill=(30, 30, 34), width=w)
    f = POP(120, "Medium")
    for h in range(1, 13):
        a = math.radians(h * 30)
        r = c * 0.66
        t = str(h)
        bb = f.getbbox(t)
        d.text((c + r * math.sin(a) - (bb[2] - bb[0]) / 2 - bb[0], c - r * math.cos(a) - (bb[3] - bb[1]) / 2 - bb[1]), t, font=f, fill=(28, 28, 32))
    im.save(os.path.join(OUT, "clock.png"))


def spines():
    titles = [
        ("INDIAN POLITY", (32, 58, 112), (232, 214, 160)),
        ("MODERN INDIA", (118, 30, 36), (236, 226, 206)),
        ("INDIAN ECONOMY", (26, 92, 78), (236, 236, 226)),
        ("GEOGRAPHY", (180, 128, 40), (30, 30, 30)),
        ("ENVIRONMENT", (52, 110, 54), (240, 240, 230)),
        ("ETHICS & INTEGRITY", (70, 60, 110), (236, 226, 206)),
        ("ART & CULTURE", (140, 70, 40), (240, 230, 210)),
    ]
    for i, (t, bg, fg) in enumerate(titles):
        W, H = 2400, 300
        im = Image.new("RGB", (W, H), bg)
        d = ImageDraw.Draw(im)
        for k in range(H):
            shade = int(26 * abs(k / H - 0.5))
            d.line([(0, k), (W, k)], fill=tuple(max(0, v - shade) for v in bg))
        d.rectangle([(70, 30), (80, H - 30)], fill=fg)
        d.rectangle([(W - 80, 30), (W - 70, H - 30)], fill=fg)
        f = SERIF(120, 700)
        bb = f.getbbox(t)
        d.text(((W - (bb[2] - bb[0])) / 2, (H - (bb[3] - bb[1])) / 2 - bb[1]), t, font=f, fill=fg)
        im.save(os.path.join(OUT, f"spine{i}.png"))


if __name__ == "__main__":
    notebook()
    timetable()
    sticky("sticky_yellow", (247, 226, 107), ["MOCK", "THURSDAY!"], rot=-2)
    sticky("sticky_pink", (244, 166, 193), ["Revise FR", "again ..."], rot=2)
    sticky("sticky_mint", (172, 226, 196), ["Sleep by", "11 !!"], rot=-1)
    laptop_screen()
    clock_face()
    spines()
    print("textures in", OUT, sorted(os.listdir(OUT)))


def printout(name, title, lines, seed):
    W, H = 2100, 2970
    r = random.Random(seed)
    im = paper(W, H, base=(244, 243, 238), noise=3, seed=seed).convert("RGBA")
    d = ImageDraw.Draw(im)
    d.text((150, 140), title, font=POP(66, "SemiBold"), fill=(36, 36, 42))
    d.line([(150, 250), (W - 150, 250)], fill=(60, 60, 66), width=4)
    y = 320
    body = POP(40, "Regular")
    for i, ln in enumerate(lines):
        d.text((150, y), ln, font=body if not ln.endswith(":") else POP(44, "SemiBold"), fill=(46, 46, 52))
        y += 74 if ln else 40
        if r.random() < 0.18 and ln:
            hl = r.choice([(255, 236, 120, 120), (170, 230, 190, 120), (255, 182, 210, 110)])
            ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
            ImageDraw.Draw(ov).rectangle([(140, y - 76), (150 + body.getbbox(ln)[2] + 10, y - 22)], fill=hl)
            im.alpha_composite(ov)
            d = ImageDraw.Draw(im)
    for k in range(4):
        x, yy = r.randint(1300, 1800), r.randint(500, 2600)
        hand(im, (x, yy), r.choice(["imp!", "revise", "?", "PYQ", "x"]), KALAM(70), r.choice([RED, PENCIL, INK[0]]))
    im.convert("RGB").save(os.path.join(OUT, f"{name}.png"))


printout("pyq", "PRELIMS PYQ  —  POLITY  (2013-2024)", [
    "Q1. Consider the following statements about the", "      Comptroller and Auditor General of India:", "      1. He is appointed by the President.", "      2. He holds office for six years.", "",
    "Q2. Which of the following rights cannot be", "      suspended during a national emergency?", "",
    "Q3. With reference to Parliamentary committees,", "      consider the following statements:", "      1. The Estimates Committee has no member", "          from the Rajya Sabha.", "",
    "Q4. The quorum of the Lok Sabha is:", "      (a) one-fifth   (b) one-tenth", "      (c) one-third   (d) one-half", "",
    "Q5. Consider the following about the", "      Finance Commission:", "      1. It is constituted under Article 280.", "",
    "Q6. Which of the following is/are", "      Constitutional bodies?",
], 11)
printout("notes", "CURRENT AFFAIRS  —  NOVEMBER NOTES", [
    "Economy:", "  - Monetary policy review: repo unchanged", "  - CPI vs WPI trend, food inflation", "",
    "Environment:", "  - New biodiversity report: key numbers", "  - Wetlands, Ramsar sites added", "",
    "International:", "  - Bilateral summit outcomes", "  - Trade pact: what changes", "",
    "Polity:", "  - SC judgment on federalism", "  - Committee report tabled", "",
    "Science & Tech:", "  - Space mission milestones", "  - Semiconductor scheme", "",
    "Schemes:", "  - Rural housing: features, coverage",
], 13)
