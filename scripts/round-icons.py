#!/usr/bin/env python3
"""Rounded Meowave app icon.

Takes the square artwork (scripts/assets/icon-square.png), cuts it into a
squircle (superellipse, n=5, like Windows 11 / iOS app tiles) with a small
transparent margin, and regenerates every icon Tauri ships:
src-tauri/icons/*.png, icon.ico (16..256), icon.icns, plus src/icons/icon.png
used by the window title bar, splash and side rail.

    pip install pillow numpy
    python scripts/round-icons.py

Always run it from the square source: running it on an already rounded icon
would shrink the artwork again.
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "assets", "icon-square.png")
OUT = os.path.join(ROOT, "src-tauri", "icons")
MASTER = 1024   # working size
INSET = 0.035   # transparent margin on each side, fraction of the canvas
N = 5.0         # superellipse exponent
SS = 4          # supersampling of the mask edge


def squircle_mask(size):
    big = size * SS
    half = big * (1 - 2 * INSET) / 2
    c = (big - 1) / 2
    y, x = np.mgrid[0:big, 0:big].astype(np.float64)
    inside = (np.abs((x - c) / half) ** N + np.abs((y - c) / half) ** N) <= 1.0
    m = Image.fromarray((inside * 255).astype(np.uint8), "L")
    return m.resize((size, size), Image.Resampling.LANCZOS)


def build_master():
    src = Image.open(SRC).convert("RGBA").resize((MASTER, MASTER), Image.Resampling.LANCZOS)
    box = int(round(MASTER * (1 - 2 * INSET)))
    art = src.resize((box, box), Image.Resampling.LANCZOS)
    flat = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 255))
    off = (MASTER - box) // 2
    flat.alpha_composite(art, (off, off))
    flat.putalpha(squircle_mask(MASTER))
    return flat


def render(master, size, small=None):
    if size == MASTER:
        return master.copy()
    if small is not None and size <= 48:  # a bolder drawing for taskbar sizes
        master = small
    im = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 48:  # small sizes get a light sharpen so the cat stays readable
        a = im.split()[3]
        im = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0)).convert("RGBA")
        im.putalpha(a)
    return im


def main():
    write_all(build_master())


def write_all(master, small=None):
    """Every icon Tauri ships, from one 1024 px master (and optionally a
    bolder one for the ≤48 px frames)."""
    pngs = {
        "icon.png": 512, "32x32.png": 32, "64x64.png": 64, "128x128.png": 128, "128x128@2x.png": 256,
        "Square30x30Logo.png": 30, "Square44x44Logo.png": 44, "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89, "Square107x107Logo.png": 107, "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150, "Square284x284Logo.png": 284, "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }
    for name, size in pngs.items():
        render(master, size, small).save(os.path.join(OUT, name), optimize=True)
    ico = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [render(master, s, small) for s in ico]
    frames[-1].save(os.path.join(OUT, "icon.ico"), format="ICO", sizes=[(s, s) for s in ico], append_images=frames[:-1])
    master.save(os.path.join(OUT, "icon.icns"), format="ICNS",
                append_images=[render(master, s, small) for s in (16, 32, 64, 128, 256, 512)])
    render(master, 512).save(os.path.join(ROOT, "src", "icons", "icon.png"), optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
