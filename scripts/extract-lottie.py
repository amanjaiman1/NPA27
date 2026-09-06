#!/usr/bin/env python3
"""Turn the uploaded dotLottie bundles into plain Lottie JSON.

A `.lottie` file is a zip: a `manifest.json` plus one or more animation JSONs.
`lottie-web` cannot read the zip, so the animation is unpacked once, here, and
the plain JSON is what ships and what the player fetches.

The `.lottie` originals stay in `public/` as the source of truth. Re-run this
after replacing one of them:

    python3 scripts/extract-lottie.py
"""

import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "animations")

# source .lottie  ->  emitted .json
SOURCES = {
    "loading (1).lottie": "boot.json",
    "loading (2).lottie": "page-transition.json",
}


def extract(src_name, out_name):
    src = os.path.join(ROOT, "public", src_name)
    if not os.path.exists(src):
        raise SystemExit("missing source: " + src)
    if not zipfile.is_zipfile(src):
        raise SystemExit("not a dotLottie (zip): " + src)

    with zipfile.ZipFile(src) as z:
        names = [n for n in z.namelist() if n.endswith(".json") and n != "manifest.json"]
        if len(names) != 1:
            raise SystemExit(
                "expected exactly one animation in %s, found %r" % (src_name, names)
            )
        raw = z.read(names[0])

    # Parse to validate, then re-serialise compactly — the shipped file is
    # fetched at runtime, so trailing whitespace is dead weight.
    data = json.loads(raw)
    for key in ("v", "w", "h", "fr", "op"):
        if key not in data:
            raise SystemExit("%s is missing the %r field" % (src_name, key))

    os.makedirs(OUT_DIR, exist_ok=True)
    dest = os.path.join(OUT_DIR, out_name)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    frames = data["op"] - data.get("ip", 0)
    print(
        "%-22s -> animations/%-22s %4dx%-4d %5.2fs @%dfps  %5.1f kB"
        % (
            src_name,
            out_name,
            data["w"],
            data["h"],
            frames / data["fr"],
            data["fr"],
            os.path.getsize(dest) / 1024,
        )
    )


if __name__ == "__main__":
    for src_name, out_name in SOURCES.items():
        extract(src_name, out_name)
