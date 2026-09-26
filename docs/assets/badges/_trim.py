"""Cuts the baked-in background out of the badge art.

Every badge shipped as a 128x128 fully opaque PNG whose corners are the dark
theme colour (#151618). The tile that renders them is round, so the corners
stuck out as a dark square on every surface, and on the light theme the square
was plainly visible. object-fit:contain cannot fix that: the pixels are there.

So the background is removed here, in the asset, once:
  - flood fill from the border over pixels close to the corner colour, which
    only ever reaches the surround and never the art (the art is enclosed by
    its own dark outline, and the fill stops at it);
  - feather the resulting edge by alpha-blending one ring, so the cut is smooth
    rather than a jagged 1px stair;
  - crop to the remaining content and re-centre it in a square canvas with a
    small uniform margin, so badges of different art sizes line up in the grid.

Pure stdlib: zlib + struct. No Pillow on this machine.
"""
import struct, zlib, os, glob, sys
from collections import deque

def read_png(path):
    d = open(path, 'rb').read()
    pos, idat, w, h, bd, ct = 8, b'', None, None, None, None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]
        data = d[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT':
            idat += data
        pos += 12 + ln
    if bd != 8 or ct not in (2, 6):
        raise ValueError(f'unsupported png {path}: bitdepth={bd} colortype={ct}')
    raw = zlib.decompress(idat)
    src_bpp = 3 if ct == 2 else 4
    stride = w * src_bpp
    out = bytearray()
    prev = bytearray(stride)
    i = 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        if f:
            for x in range(stride):
                a = line[x-src_bpp] if x >= src_bpp else 0
                b = prev[x]
                c = prev[x-src_bpp] if x >= src_bpp else 0
                if f == 1:   line[x] = (line[x] + a) & 255
                elif f == 2: line[x] = (line[x] + b) & 255
                elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
                elif f == 4:
                    p = a + b - c
                    pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    # normalise to RGBA
    if src_bpp == 3:
        rgba = bytearray(w*h*4)
        for j in range(w*h):
            rgba[j*4:j*4+3] = out[j*3:j*3+3]
            rgba[j*4+3] = 255
        out = rgba
    return w, h, bytearray(out)

def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y*w*4:(y+1)*w*4]
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    body = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
    open(path, 'wb').write(body)

def near(px, o, ref, tol):
    return (abs(px[o]-ref[0]) <= tol and abs(px[o+1]-ref[1]) <= tol
            and abs(px[o+2]-ref[2]) <= tol)

def cut_background(w, h, px, tol=3):
    """Flood fill from the border, marking background pixels transparent.

    The tolerance is deliberately tight. The background is a flat #151618 with
    only a point or two of dithering, so 3 clears it completely out to every
    edge — measured, not guessed. A wider tolerance looks harmless until it
    meets art that is also near-black: at 26 the fill walked straight through
    the black guitar in dj_boykisser and hollowed the middle of the badge out.
    Anything that raises this needs to be re-checked against that file.
    """
    ref = (px[0], px[1], px[2])
    seen = bytearray(w*h)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y*w + x
        if seen[i]:
            continue
        if not near(px, i*4, ref, tol):
            continue
        seen[i] = 1
        q.append((x+1, y)); q.append((x-1, y))
        q.append((x, y+1)); q.append((x, y-1))
    for i in range(w*h):
        if seen[i]:
            px[i*4+3] = 0
    return seen

def feather(w, h, px, seen):
    """One ring of half-alpha where cut meets kept, so the edge is not a stair."""
    edits = []
    for y in range(h):
        for x in range(w):
            i = y*w + x
            if seen[i]:
                continue
            n = 0
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and seen[ny*w+nx]:
                    n += 1
            if n:
                edits.append((i, 255 - n*46))
    for i, a in edits:
        px[i*4+3] = min(px[i*4+3], max(0, a))

def strip_caption(w, h, px, probe=None):
    """Drops the clipped caption that was baked under the art.

    The source art has a label rendered below the emblem, and it was already cut
    off mid-height in the 128px square. While the dark background hid it as a
    smudge, removing that background left the sliced letter tops floating as
    debris under the badge.

    Everything disconnected from the emblem that begins below the emblem's
    lowest pixel is caption, whatever its size. An earlier version capped this
    by blob size and that was wrong: a two-line label like "Legendary
    Boykisser" lost only its second line, leaving a stray "Legendary" under the
    art, which reads as a bug rather than a design.

    Real art that hangs low — a tail, a paw, a shadow attached to the body — is
    connected to the emblem and so lives in the main component, which this never
    touches. Detached sparkles sit beside or above the emblem, not under it.

    `probe` is the separation mask to reason over, which is not the mask used
    for the cut. At the tight tolerance the real cut needs, the caption keeps a
    faint dark halo that bridges it to the emblem, so nothing looks detached and
    nothing is removed. A loose flood separates the text cleanly but eats
    near-black art. Using the loose mask only to locate the caption, and the
    tight one to render, gets both: the guitar survives and the label goes.
    """
    comps = components(w, h, px if probe is None else probe)
    if not comps:
        return 0
    main_bottom = max(i // w for i in comps[0])
    band_top = h
    for c in comps[1:]:
        top = min(i // w for i in c)
        if top > main_bottom:
            band_top = min(band_top, top)
    if band_top >= h:
        return 0
    # Clear the whole strip, not just the probe's pixels: the halo that the
    # tight flood left around each glyph belongs to the caption too, and leaving
    # it behind would print a grey smear where the text was.
    removed = 0
    for y in range(band_top, h):
        for x in range(w):
            i = y*w + x
            if px[i*4+3]:
                px[i*4+3] = 0
                removed += 1
    return removed

def components(w, h, px):
    """Connected runs of visible pixels, largest first."""
    seen = bytearray(w*h)
    out = []
    for s in range(w*h):
        if seen[s] or px[s*4+3] <= 8:
            continue
        q = deque([s]); seen[s] = 1; cells = []
        while q:
            i = q.popleft(); cells.append(i)
            x, y = i % w, i // w
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny*w + nx
                    if not seen[j] and px[j*4+3] > 8:
                        seen[j] = 1; q.append(j)
        out.append(cells)
    out.sort(key=len, reverse=True)
    return out

def bbox(w, h, px):
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[(y*w+x)*4+3] > 8:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return x0, y0, x1, y1

def recentre(w, h, px, size=128, margin=6):
    """Crop to content, then place it centred in a square with an even margin."""
    x0, y0, x1, y1 = bbox(w, h, px)
    if x1 < 0:
        return w, h, px
    cw, ch = x1-x0+1, y1-y0+1
    side = max(cw, ch)
    box = side + margin*2
    out = bytearray(box*box*4)
    ox, oy = margin + (side-cw)//2, margin + (side-ch)//2
    for y in range(ch):
        src = ((y0+y)*w + x0) * 4
        dst = ((oy+y)*box + ox) * 4
        out[dst:dst+cw*4] = px[src:src+cw*4]
    return box, box, out

def process(path, dry=False):
    w, h, px = read_png(path)
    seen = cut_background(w, h, px)
    cut = sum(seen)
    if cut == 0:
        return f'{os.path.basename(path)}: nothing to cut (already clean)'
    feather(w, h, px, seen)
    # A second, throwaway pass at a loose tolerance, used only to tell the
    # caption apart from the emblem. See strip_caption().
    _pw, _ph, probe = read_png(path)
    cut_background(_pw, _ph, probe, tol=26)
    # Order matters: the caption only becomes separable once the background that
    # visually joined it to the art is gone, and it must go before recentre() so
    # the crop measures the emblem alone rather than the emblem plus debris.
    dropped = strip_caption(w, h, px, probe)
    nw, nh, npx = recentre(w, h, px)
    if not dry:
        write_png(path, nw, nh, npx)
    pct = cut*100//(w*h)
    tail = f', dropped {dropped}px caption' if dropped else ''
    return f'{os.path.basename(path)}: cut {pct}% background{tail} -> {nw}x{nh}'

if __name__ == '__main__':
    dry = '--dry' in sys.argv
    root = os.path.dirname(os.path.abspath(__file__))
    files = sorted(glob.glob(os.path.join(root, '*', '*.png')))
    for f in files:
        try:
            print(process(f, dry))
        except Exception as e:
            print(f'{os.path.basename(f)}: SKIP ({e})')
