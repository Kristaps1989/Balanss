"""ZestWell logo renderer: a lime citrus slice with a leaf, on forest green.

Usage: python make_logo.py <out_dir> [--preview]
Draws at 4x and downsamples (LANCZOS) for smooth edges.
"""
import math
import os
import sys

from PIL import Image, ImageDraw

BG = (47, 107, 79, 255)        # #2F6B4F forest green
RIND = (169, 204, 74, 255)     # #A9CC4A deep lime rind
PITH = (246, 249, 228, 255)    # #F6F9E4 pale pith
FLESH = (214, 238, 138, 255)   # #D6EE8A lime flesh
LEAF = (142, 214, 165, 255)    # #8ED6A5 mint leaf
VEIN = (47, 107, 79, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

SS = 4  # supersampling


def leaf_points(base, tip, width, n=60):
    bx, by = base
    tx, ty = tip
    dx, dy = tx - bx, ty - by
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        w = width / 2 * math.sin(math.pi * t) ** 0.85
        cx, cy = bx + dx * t, by + dy * t
        left.append((cx + px * w, cy + py * w))
        right.append((cx - px * w, cy - py * w))
    return left + right[::-1]


def draw_centered(d, S, R, mono=False):
    """Places the mark so its bounding shape is centred: furthest point is 1.32R from centre."""
    draw_mark(d, S, S * 0.5 - R * 0.12, S * 0.5 + R * 0.2, R, mono)


def draw_mark(d, S, cx, cy, R, mono=False):
    """Slice centred at (cx, cy) with rind radius R; leaf to the upper right."""
    rind = WHITE if mono else RIND
    pith = CLEAR if mono else PITH
    flesh = WHITE if mono else FLESH
    leaf = WHITE if mono else LEAF

    # Leaf first, so the slice overlaps its base.
    base = (cx + R * 0.48, cy - R * 0.61)
    tip = (cx + R * 0.85, cy - R * 1.30)
    d.polygon(leaf_points(base, tip, R * 0.5), fill=leaf)
    if not mono:
        vx = base[0] + (tip[0] - base[0]) * 0.78
        vy = base[1] + (tip[1] - base[1]) * 0.78
        d.line([base, (vx, vy)], fill=VEIN, width=max(1, int(R * 0.045)))

    def circle(r, fill):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

    circle(R, rind)
    circle(R * 0.85, pith)
    circle(R * 0.77, flesh)
    # Segment dividers: pale spokes, 7 segments, rotated so none points at the leaf.
    spoke_w = R * 0.085
    for k in range(7):
        a = math.radians(-90 + k * 360 / 7 + 12)
        x2, y2 = cx + math.cos(a) * R * 0.80, cy + math.sin(a) * R * 0.80
        d.line([(cx, cy), (x2, y2)], fill=pith, width=int(spoke_w))
    circle(R * 0.13, pith)


def render(size, kind):
    S = size * SS
    img = Image.new('RGBA', (S, S), CLEAR)
    d = ImageDraw.Draw(img)
    mono = kind == 'mono'
    if kind == 'full':           # square app icon, full bleed
        d.rectangle([0, 0, S, S], fill=BG)
        draw_centered(d, S, S * 0.30)
    elif kind in ('rounded', 'round'):  # legacy launcher icons
        if kind == 'round':
            d.ellipse([0, 0, S - 1, S - 1], fill=BG)
        else:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG)
        draw_centered(d, S, S * 0.26)
    elif kind in ('fg', 'mono'):  # adaptive foreground: keep inside the 66/108 safe zone
        draw_centered(d, S, S * 0.225, mono=mono)
    elif kind == 'bg':
        d.rectangle([0, 0, S, S], fill=BG)
    elif kind == 'splash':        # mark alone on the dark splash background
        draw_centered(d, S, S * 0.30)
    return img.resize((size, size), Image.LANCZOS)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    if '--preview' in sys.argv:
        masked = render(512, 'bg'); masked.alpha_composite(render(512, 'fg'))
        m = Image.new('L', (512, 512), 0); ImageDraw.Draw(m).ellipse([512*21/108, 512*21/108, 512*87/108, 512*87/108], fill=255)
        crop = Image.new('RGBA', (512, 512), (18, 21, 19, 255)); crop.paste(masked, (0, 0), m)
        tiles = [render(512, 'full'), render(512, 'round'), crop, render(512, 'mono')]
        sheet = Image.new('RGBA', (512 * 4 + 60, 700), (18, 21, 19, 255))
        for i, t in enumerate(tiles):
            sheet.alpha_composite(t, (i * 524, 0))
        for i, s in enumerate([48, 72, 96, 144]):
            sheet.alpha_composite(render(s, 'rounded'), (40 + i * 200, 540))
        sheet.save(os.path.join(out, 'preview.png'))
        return

    a = os.path.join(out, 'assets')
    os.makedirs(a, exist_ok=True)
    render(1024, 'full').convert('RGB').save(os.path.join(a, 'icon.png'))
    render(1024, 'fg').save(os.path.join(a, 'android-icon-foreground.png'))
    render(1024, 'bg').convert('RGB').save(os.path.join(a, 'android-icon-background.png'))
    render(1024, 'mono').save(os.path.join(a, 'android-icon-monochrome.png'))
    render(1024, 'splash').save(os.path.join(a, 'splash-icon.png'))
    render(48, 'rounded').save(os.path.join(a, 'favicon.png'))

    res = os.path.join(out, 'res')
    for dpi, legacy, adaptive, splash in [('mdpi', 48, 108, 288), ('hdpi', 72, 162, 432),
                                          ('xhdpi', 96, 216, 576), ('xxhdpi', 144, 324, 864),
                                          ('xxxhdpi', 192, 432, 1152)]:
        m = os.path.join(res, f'mipmap-{dpi}')
        os.makedirs(m, exist_ok=True)
        render(legacy, 'rounded').save(os.path.join(m, 'ic_launcher.png'))
        render(legacy, 'round').save(os.path.join(m, 'ic_launcher_round.png'))
        render(adaptive, 'fg').save(os.path.join(m, 'ic_launcher_foreground.png'))
        render(adaptive, 'bg').save(os.path.join(m, 'ic_launcher_background.png'))
        render(adaptive, 'mono').save(os.path.join(m, 'ic_launcher_monochrome.png'))
        dr = os.path.join(res, f'drawable-{dpi}')
        os.makedirs(dr, exist_ok=True)
        render(splash, 'splash').save(os.path.join(dr, 'splashscreen_logo.png'))


if __name__ == '__main__':
    main()
