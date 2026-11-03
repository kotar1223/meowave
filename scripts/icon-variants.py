#!/usr/bin/env python3
"""Meowave icon variants for Settings → Вид → «Иконка приложения».

The cat-with-headphones glyph is lifted out of the square artwork
(scripts/assets/icon-square.png: white line art on black) by luminance, so it
can be recoloured and put on any background — or on none at all:

  clear-auto   no background; the app picks white or dark by the system theme
  clear-light  no background, white glyph (dark taskbars)
  clear-dark   no background, near-black glyph (light taskbars)
  classic …    squircle tiles with a gradient fill (classic is the default)

Writes src/icons/app/<id>.png (256 px, what the running window and the picker
use). With --bundle it also regenerates the installer/exe icons in
src-tauri/icons (and src/icons/icon.png) from the «classic» variant — the
white cat on the black tile, which reads on light and dark taskbars alike —
via round-icons.py's writer, with a bolder drawing for the ≤48 px frames.
Round 6 dropped the two neon variants: no neon anywhere in the app.

    pip install pillow numpy
    python scripts/icon-variants.py [--bundle]
"""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "assets", "icon-square.png")
OUT = os.path.join(ROOT, "src", "icons", "app")
M = 1024
INSET = 0.035
N = 5.0

# id: (kind, background stops, glyph colour or stops)
VARIANTS = {
    "clear-light": ("clear", None, "#ffffff"),
    "clear-dark":  ("clear", None, "#17161d"),
    "classic":     ("tile", ("#141418", "#050507"), "#ffffff"),
    "midnight":    ("tile", ("#3b3a8f", "#12112e"), "#ffffff"),
    "ocean":       ("tile", ("#38bdf8", "#1e3a8a"), "#ffffff"),
    "mint":        ("tile", ("#34d399", "#065f46"), "#ffffff"),
    "sunset":      ("tile", ("#fb923c", "#be123c"), "#ffffff"),
    "sakura":      ("tile", ("#f9a8d4", "#db2777"), "#ffffff"),
    "lavender":    ("tile", ("#ddd6fe", "#8b5cf6"), "#ffffff"),
    "gold":        ("tile", ("#fcd34d", "#b45309"), "#ffffff"),
    "paper":       ("tile", ("#fafaf9", "#e7e5e4"), "#1c1917"),
}


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def squircle(size):
    ss = 4
    big = size * ss
    half = big * (1 - 2 * INSET) / 2
    c = (big - 1) / 2
    y, x = np.mgrid[0:big, 0:big].astype(np.float64)
    inside = (np.abs((x - c) / half) ** N + np.abs((y - c) / half) ** N) <= 1.0
    return Image.fromarray((inside * 255).astype(np.uint8), "L").resize((size, size), Image.Resampling.LANCZOS)


def glyph_mask():
    """Alpha of the white line art, cropped to its bounding box."""
    src = Image.open(SRC).convert("L").resize((M, M), Image.Resampling.LANCZOS)
    a = np.asarray(src, dtype=np.float64)
    a = np.clip((a - 40) / (215 - 40), 0, 1)
    m = Image.fromarray((a * 255).astype(np.uint8), "L")
    box = m.point(lambda v: 255 if v > 60 else 0).getbbox()
    return m.crop(box)


def gradient(size, stops, angle_down=True):
    c1, c2 = (np.array(hex2rgb(s), dtype=np.float64) for s in stops)
    y, x = np.mgrid[0:size, 0:size].astype(np.float64) / (size - 1)
    t = np.clip((x * .35 + y * .65), 0, 1)[..., None] if angle_down else x[..., None]
    rgb = c1 * (1 - t) + c2 * t
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


def place(mask, size, frac, bold=0):
    """Glyph mask scaled to `frac` of the canvas (longest side), centred."""
    w, h = mask.size
    k = size * frac / max(w, h)
    g = mask.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.LANCZOS)
    if bold:
        g = g.filter(ImageFilter.MaxFilter(bold))
    canvas = Image.new("L", (size, size), 0)
    canvas.paste(g, ((size - g.size[0]) // 2, (size - g.size[1]) // 2 + round(size * .01)))
    return canvas


def colour_layer(size, fill):
    if isinstance(fill, tuple):
        return gradient(size, fill, angle_down=False)
    return Image.new("RGB", (size, size), hex2rgb(fill))


def build(vid, size=M, bold=None):
    kind, bg, fg = VARIANTS[vid]
    mask = glyph_mask()
    if kind == "clear":
        g = place(mask, size, .94, bold=bold or 11)
        out = colour_layer(size, fg).convert("RGBA")
        out.putalpha(g)
        return out
    tile = gradient(size, bg).convert("RGBA")
    # soft top light on the tile
    y = np.linspace(1, 0, size)[:, None] * np.ones((1, size))
    sheen = Image.fromarray((np.clip(y - .55, 0, 1) * 70).astype(np.uint8), "L")
    tile = Image.composite(Image.new("RGBA", (size, size), (255, 255, 255, 255)), tile, sheen)
    g = place(mask, size, .70, bold=bold or 7)
    glyph = colour_layer(size, fg).convert("RGBA")
    glyph.putalpha(g)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow.putalpha(g.filter(ImageFilter.GaussianBlur(size * .012)).point(lambda v: int(v * .35)))
    tile.alpha_composite(shadow, (0, round(size * .008)))
    tile.alpha_composite(glyph)
    tile.putalpha(ImageChops.multiply(tile.split()[3], squircle(size)))
    return tile


def main():
    os.makedirs(OUT, exist_ok=True)
    for vid in VARIANTS:
        im = build(vid)
        im.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(OUT, vid + ".png"), optimize=True)
    print("variants written to", OUT)
    if "--bundle" in sys.argv:
        sys.path.insert(0, os.path.join(ROOT, "scripts"))
        import importlib
        ri = importlib.import_module("round-icons")
        ri.write_all(build("classic", bold=5), small=build("classic", bold=13))


if __name__ == "__main__":
    main()
