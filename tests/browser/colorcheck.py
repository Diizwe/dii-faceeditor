"""Compares two images (raw RGB values interpreted in the given colour space) with CIEDE2000.
usage: colorcheck.py a b [--space srgb|p3] [--dims] -> JSON {mean, p999, w, h}. Needs numpy + Pillow."""
import sys, json
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
M = {'srgb': np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]]),
     'p3': np.array([[0.4865709, 0.2656677, 0.1982173], [0.2289746, 0.6917385, 0.0792869], [0.0000000, 0.0451134, 1.0439444]])}
def lab(a, space):
    xyz = lin(a.astype(np.float64)) @ M[space].T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
def de2000(l1, l2):
    L1, a1, b1 = l1[..., 0], l1[..., 1], l1[..., 2]; L2, a2, b2 = l2[..., 0], l2[..., 1], l2[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2); Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1 = np.degrees(np.arctan2(b1, a1p)) % 360; h2 = np.degrees(np.arctan2(b2, a2p)) % 360
    dL = L2 - L1; dC = C2p - C1p
    dh = h2 - h1; dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh)); dh = np.where(C1p * C2p == 0, 0, dh)
    dH = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh) / 2)
    Lb = (L1 + L2) / 2; Cbp = (C1p + C2p) / 2
    hs = h1 + h2; hb = np.where(np.abs(h1 - h2) > 180, (hs + 360) / 2, hs / 2); hb = np.where(C1p * C2p == 0, hs, hb)
    T = 1 - 0.17 * np.cos(np.radians(hb - 30)) + 0.24 * np.cos(np.radians(2 * hb)) + 0.32 * np.cos(np.radians(3 * hb + 6)) - 0.20 * np.cos(np.radians(4 * hb - 63))
    Sl = 1 + 0.015 * (Lb - 50) ** 2 / np.sqrt(20 + (Lb - 50) ** 2); Sc = 1 + 0.045 * Cbp; Sh = 1 + 0.015 * Cbp * T
    dth = 30 * np.exp(-(((hb - 275) / 25) ** 2)); Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)); Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
if __name__ == '__main__':
    a = np.asarray(Image.open(sys.argv[1]).convert('RGB')); b = np.asarray(Image.open(sys.argv[2]).convert('RGB'))
    space = sys.argv[sys.argv.index('--space') + 1] if '--space' in sys.argv else 'srgb'
    if a.shape != b.shape: print(json.dumps({'error': 'shape', 'a': a.shape, 'b': b.shape})); sys.exit(0)
    sub = slice(None, None, 4)  # every 4th row/col keeps 48 MP tractable
    d = de2000(lab(a[sub, sub], space), lab(b[sub, sub], space)).ravel()
    print(json.dumps({'mean': float(d.mean()), 'p999': float(np.percentile(d, 99.9)), 'h': a.shape[0], 'w': a.shape[1]}))
