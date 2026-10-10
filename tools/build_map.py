"""元マップ(assets/source/map_source.png)のタイルを材料に、大きなマップ画像と壁データを生成する。
出力: assets/map.png(大きなマップ) と src/mapdata.js(壁マスク。# = 壁)
使い方: python3 tools/build_map.py   (要 numpy, Pillow)
1タイル = 3x3セル。TILES_W/TILES_H を変えたら src/config.js の COLS/ROWS (= タイル数*3) も合わせる。
"""
import numpy as np, os, random
from PIL import Image

TILES_W, TILES_H = 40, 26      # 120x78 セル
TILE_PX = 64                    # 出力画像でのタイルの大きさ
CELLS_PER_TILE = 3
SEED = 20260710

root = os.path.join(os.path.dirname(__file__), '..')
src = Image.open(os.path.join(root, 'assets', 'source', 'map_source.png')).convert('RGB')
a = np.array(src).astype(int)

# --- 元画像から部品を取り出す(床は約65.9px間隔、左上の床タイルは(58,57)) ---
X0, Y0, PITCH = 58, 57, 65.86
def crop(c, r):
    x, y = round(X0 + PITCH * c) + 1, round(Y0 + PITCH * r) + 1
    return x, y

def is_green(x, y):
    p = a[y + 32, x + 32]
    return p[1] > p[0] + 25 and p[1] > p[2] + 25

floors = {0: [], 1: []}; tufts = {0: [], 1: []}
for r in range(0, 14):
    for c in range(0, 21):
        x, y = crop(c, r)
        if x + TILE_PX > 1478 or y + TILE_PX > 965 or not is_green(x, y): continue
        t = a[y + 3:y + 61, x + 3:x + 61]   # 縁のにじみ(隣の壁の線など)を避けて内側だけ使う
        light = t[..., 1].mean() > 177
        has_tuft = (t[..., 1] < 125).sum() > 15
        (tufts if has_tuft else floors)[0 if light else 1].append(
            src.crop((x + 3, y + 3, x + 61, y + 61)).resize((TILE_PX, TILE_PX), Image.LANCZOS))
wall = src.crop((194, 191, 194 + TILE_PX, 191 + TILE_PX))   # 障害物ブロック1枚分
for k in (0, 1):
    assert floors[k] and tufts[k], f'床タイルが不足: {k}'

# --- レイアウト: 外周+障害物 ---
rng = random.Random(SEED)
grid = [['.'] * TILES_W for _ in range(TILES_H)]
for x in range(TILES_W): grid[0][x] = grid[-1][x] = '#'
for y in range(TILES_H): grid[y][0] = grid[y][-1] = '#'
def free(x, y, w, h):   # 周囲1タイルの余白を含めて空いているか
    for yy in range(y - 1, y + h + 1):
        for xx in range(x - 1, x + w + 1):
            if grid[yy][xx] == '#': return False
    return True
placed, tries = 0, 0
while placed < 22 and tries < 5000:
    tries += 1
    w, h = (rng.randint(3, 5), 1) if rng.random() < 0.5 else (1, rng.randint(3, 5))
    x, y = rng.randint(3, TILES_W - 3 - w), rng.randint(3, TILES_H - 3 - h)
    if not free(x, y, w, h): continue
    for yy in range(y, y + h):
        for xx in range(x, x + w): grid[yy][xx] = '#'
    placed += 1

# --- 画像を組み立てる ---
out = Image.new('RGB', (TILES_W * TILE_PX, TILES_H * TILE_PX))
for y in range(TILES_H):
    for x in range(TILES_W):
        if grid[y][x] == '#': t = wall
        else:
            par = (x + y) % 2   # 市松模様 (0=明るい床, 1=暗い床)
            pool = tufts[par] if rng.random() < 0.06 else floors[par]
            t = rng.choice(pool)
        out.paste(t, (x * TILE_PX, y * TILE_PX))
out.save(os.path.join(root, 'assets', 'map.png'), optimize=True)

# --- 壁データ(1タイル = 3x3セル) ---
rows = []
for y in range(TILES_H):
    line = ''.join(c * CELLS_PER_TILE for c in grid[y])
    rows += [line] * CELLS_PER_TILE
with open(os.path.join(root, 'src', 'mapdata.js'), 'w') as f:
    f.write('// 自動生成: python3 tools/build_map.py  (# = 壁)\n(function (G) {\n  G.MAP_WALLS = [\n' +
            ''.join(f"    '{l}',\n" for l in rows) + '  ];\n})(globalThis.PG = globalThis.PG || {});\n')
print(f'map {out.size}, cells {TILES_W*CELLS_PER_TILE}x{TILES_H*CELLS_PER_TILE}, obstacles {placed}, '
      f'floor tiles {sum(map(len, floors.values()))}, tuft tiles {sum(map(len, tufts.values()))}')
