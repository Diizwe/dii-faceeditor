"""Builds browser-test fixtures into the directory given as argv[1]. Needs Pillow + numpy.
f12_p3.jpg   4032x3024 portrait-derived photo with saturated colour bars, Display P3 profile
f12_o6.jpg   same size, EXIF orientation 6 (needs a 90-degree turn on load)
f48_p3.jpg   8000x6000 synthetic stress photo (stand-in until the real 54 MP original is fetched)
"""
import struct, sys, os, glob
import numpy as np
from PIL import Image

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
root = os.path.join(os.path.dirname(__file__), '..', '..')

def p3_icc():
    def s15(v): return struct.pack('>i', int(round(v * 65536)))
    def xyz(x, y, z): return b'XYZ ' + b'\0' * 4 + s15(x) + s15(y) + s15(z)
    g, a, b, c, d = 2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045
    para = b'para' + b'\0' * 4 + struct.pack('>HH', 3, 0) + b''.join(s15(v) for v in (g, a, b, c, d))
    text = b'Display P3'
    desc = b'desc' + b'\0' * 4 + struct.pack('>I', len(text) + 1) + text + b'\0' + b'\0' * (4 + 4 + 2 + 1 + 67)
    cprt = b'text' + b'\0' * 4 + b'Public Domain\0'
    tags = [(b'desc', desc), (b'wtpt', xyz(0.9642, 1.0, 0.8249)), (b'rXYZ', xyz(0.5151, 0.2412, -0.0011)),
            (b'gXYZ', xyz(0.2920, 0.6922, 0.0419)), (b'bXYZ', xyz(0.1571, 0.0666, 0.7841)),
            (b'rTRC', para), (b'gTRC', para), (b'bTRC', para), (b'cprt', cprt)]
    def pad(x): return x + b'\0' * (-len(x) % 4)
    table = b''; body = b''; off = 128 + 4 + 12 * len(tags)
    # share the TRC data for r/g/b
    seen = {}
    for sig, data in tags:
        data = pad(data)
        if data in seen: o = seen[data]
        else: o = off + len(body); seen[data] = o; body += data
        table += sig + struct.pack('>II', o, len(data))
    size = 128 + 4 + len(table) + len(body)
    hdr = struct.pack('>I4sI4s4s4s', size, b'', 0x02400000, b'mntr', b'RGB ', b'XYZ ')
    hdr += struct.pack('>12s', b'\0' * 12) + b'acsp' + b'\0' * 4 + b'\0' * 4 + b'\0' * 4 + b'\0' * 4 + b'\0' * 8 + struct.pack('>I', 0) + struct.pack('>iii', 63190, 65536, 54061) + b'\0' * 4 + b'\0' * 16 + b'\0' * 28
    hdr = hdr[:128].ljust(128, b'\0')
    return hdr + struct.pack('>I', len(tags)) + table + body

icc = p3_icc()
src = Image.open(sorted(glob.glob(os.path.join(root, 'testdata/photos/p*.jpg')))[0]).convert('RGB')

def make(w, h):
    base = src.resize((w, h), Image.LANCZOS)
    a = np.asarray(base).copy()
    # saturated bars along the bottom so wide-gamut values exist
    bars = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (0, 255, 255), (255, 0, 255), (128, 128, 128), (255, 255, 255)]
    bh = h // 12; bw = w // len(bars)
    for i, c in enumerate(bars): a[h - bh:, i * bw:(i + 1) * bw] = c
    # fine texture so tile seams show
    yy, xx = np.mgrid[0:min(h, 400), 0:min(w, 400)]
    a[:min(h, 400), :min(w, 400)] = ((xx // 8 + yy // 8) % 2 * 255)[..., None]
    return Image.fromarray(a)

make(4032, 3024).save(os.path.join(out, 'f12_p3.jpg'), quality=92, icc_profile=icc)
ex = Image.Exif(); ex[0x0112] = 6
make(4032, 3024).save(os.path.join(out, 'f12_o6.jpg'), quality=92, exif=ex)
make(8000, 6000).save(os.path.join(out, 'f48_p3.jpg'), quality=90, icc_profile=icc)
print('fixtures ok', os.listdir(out))
