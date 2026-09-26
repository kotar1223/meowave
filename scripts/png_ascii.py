#!/usr/bin/env python3
"""Throwaway helper: render a PNG as ASCII art (8-bit RGB/RGBA, non-interlaced)."""
import struct, sys, zlib

def decode(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h, bd, ct = 8, b'', 0, 0, 0, 0
    while pos < len(d):
        ln, typ = struct.unpack('>I4s', d[pos:pos+8]); pos += 8
        chunk = d[pos:pos+ln]; pos += ln + 4
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', chunk[:10])
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * ch
    out, prev = [], bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + (a + prev[i]) // 2) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]
                c = prev[i-ch] if i >= ch else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out.append(bytes(line)); prev = line
    return w, h, ch, out

def render(path, cols=110, region=None):
    w, h, ch, rows = decode(path)
    # optional crop region: x0,y0,x1,y1 in pixels
    x0, y0, x1, y1 = region or (0, 0, w, h)
    sx = max(1, (x1 - x0) // cols)
    sy = sx * 2
    # normalise against the crop's own min/max so flat-ish shots still show detail
    lums = []
    for y in range(y0, y1, max(1, sy // 2)):
        row = rows[y]
        for x in range(x0, x1, max(1, sx // 2)):
            px = row[x*ch:x*ch+3]
            lums.append((px[0] + px[1] + px[2]) / 3)
    lo, hi = min(lums), max(lums)
    span = (hi - lo) or 1
    ramp = ' .:+#@'
    print(f'=== {path} ({w}x{h}) crop=({x0},{y0},{x1},{y1}) lo={lo:.0f} hi={hi:.0f} ===')
    for y in range(y0, y1, sy):
        line = ''
        for x in range(x0, x1, sx):
            px = rows[y][x*ch:x*ch+3]
            lum = (px[0] + px[1] + px[2]) / 3
            idx = int((lum - lo) / span * 5.999)
            line += ramp[max(0, min(5, idx))]
        print(line)

def parse_region(s):
    # "x0,y0,x1,y1" in source pixels
    return tuple(int(v) for v in s.split(','))

args = sys.argv[1:]
region = None
cols = 110
while args and args[0].startswith('--'):
    flag, _, val = args[0][2:].partition('=')
    if flag == 'crop': region = tuple(int(v) for v in val.split(','))
    elif flag == 'cols': cols = int(val)
    args = args[1:]
for p in args:
    render(p, cols, region)
