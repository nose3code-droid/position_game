"""assets/map.png から壁マスクを読み取り src/mapdata.js を生成する。
使い方: python3 tools/build_map.py   (src/config.js の COLS/ROWS と合わせること)
壁 = 青灰色の石ブロック(緑の床ではない画素)。セル内の過半が壁なら壁セル。
"""
import numpy as np, os
from PIL import Image
COLS, ROWS = 69, 46
root = os.path.join(os.path.dirname(__file__), '..')
im = np.array(Image.open(os.path.join(root, 'assets', 'map.png')).convert('RGB')).astype(int)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
wall = ~((g > r + 25) & (g > b + 25))     # 緑が支配的でない = 壁
rows = []
for y in range(ROWS):
    line = ''
    for x in range(COLS):
        cell = wall[y * H // ROWS:(y + 1) * H // ROWS, x * W // COLS:(x + 1) * W // COLS]
        line += '#' if cell.mean() > 0.5 else '.'
    rows.append(line)
open(os.path.join(root, 'src', 'mapdata.js'), 'w').write(
    '// 自動生成: python3 tools/build_map.py  (# = 壁)\n(function (G) {\n  G.MAP_WALLS = [\n' +
    ''.join(f"    '{l}',\n" for l in rows) + '  ];\n})(globalThis.PG = globalThis.PG || {});\n')
print('\n'.join(rows))
