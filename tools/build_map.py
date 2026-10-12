"""タイル画像から大きなマップ画像と壁データを生成する。
素材: assets/source/grass_tiles.png(4x4 市松の草原タイル) / assets/source/stone_tile.png(石ブロック1枚)
出力: assets/map.jpg(マップ画像) と src/mapdata.js(壁マスク。# = 壁)
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

# --- 素材から部品を取り出す ---
# 草原: 4x4 に並んだ正方形を1枚ずつ切り出す。明るい/暗いに分け、市松の位置に応じて使い分ける。
#   境目の波打ちは隣(必ず反対の色)とつながるので、ランダムに並べても自然に見える。
grass = Image.open(os.path.join(root, 'assets', 'source', 'grass_tiles.png')).convert('RGB')
ga = np.array(grass).astype(int)
GP = grass.width / 4
SKIP = {(1, 1)}   # 大きな草が下の境目にはみ出しているマス(並べると切れて見えるので使わない)
floors = {0: [], 1: []}
for r in range(4):
    for c in range(4):
        if (r, c) in SKIP: continue
        box = (round(c * GP), round(r * GP), round((c + 1) * GP), round((r + 1) * GP))
        light = ga[box[1]:box[3], box[0]:box[2], 1].mean() > 188
        floors[0 if light else 1].append(grass.crop(box).resize((TILE_PX, TILE_PX), Image.LANCZOS))
# 壁: 白い背景から石ブロックだけを切り出す
stone = Image.open(os.path.join(root, 'assets', 'source', 'stone_tile.png')).convert('RGB')
sa = np.array(stone).astype(int)
ys, xs = np.where((255 - sa).max(axis=2) > 40)
wall = stone.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((TILE_PX, TILE_PX), Image.LANCZOS)
for k in (0, 1):
    assert floors[k], f'床タイルが不足: {k}'

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
        if grid[y][x] == '#': continue
        out.paste(rng.choice(floors[(x + y) % 2]), (x * TILE_PX, y * TILE_PX))  # (x+y)偶数=明るい床
# 壁の影: 光は左上から。壁の下・右の床に影を落として立体感を出す
arr = np.array(out).astype(float)
S = int(TILE_PX * 0.32)
fade = (1 - np.arange(S) / S) ** 1.6 * 0.42
for y in range(TILES_H):
    for x in range(TILES_W):
        if grid[y][x] == '#': continue
        X, Y = x * TILE_PX, y * TILE_PX
        k = np.zeros((TILE_PX, TILE_PX))
        if y > 0 and grid[y - 1][x] == '#': k = np.maximum(k, np.pad(np.repeat(fade[:, None], TILE_PX, 1), ((0, TILE_PX - S), (0, 0))))
        if x > 0 and grid[y][x - 1] == '#': k = np.maximum(k, np.pad(np.repeat(fade[None, :], TILE_PX, 0), ((0, 0), (0, TILE_PX - S))))
        if x > 0 and y > 0 and grid[y - 1][x - 1] == '#':  # 斜め上の壁の角の影
            yy, xx = np.mgrid[0:TILE_PX, 0:TILE_PX]
            d = np.maximum(yy, xx)
            k = np.maximum(k, np.clip(1 - d / S, 0, 1) ** 1.6 * 0.42)
        arr[Y:Y + TILE_PX, X:X + TILE_PX] *= (1 - k)[..., None]
out = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
for y in range(TILES_H):
    for x in range(TILES_W):
        if grid[y][x] == '#': out.paste(wall, (x * TILE_PX, y * TILE_PX))
out.save(os.path.join(root, 'assets', 'map.jpg'), quality=90, optimize=True)

# --- 壁データ(1タイル = 3x3セル) ---
rows = []
for y in range(TILES_H):
    line = ''.join(c * CELLS_PER_TILE for c in grid[y])
    rows += [line] * CELLS_PER_TILE
with open(os.path.join(root, 'src', 'mapdata.js'), 'w') as f:
    f.write('// 自動生成: python3 tools/build_map.py  (# = 壁)\n(function (G) {\n  G.MAP_WALLS = [\n' +
            ''.join(f"    '{l}',\n" for l in rows) + '  ];\n})(globalThis.PG = globalThis.PG || {});\n')
print(f'map {out.size}, cells {TILES_W*CELLS_PER_TILE}x{TILES_H*CELLS_PER_TILE}, obstacles {placed}, '
      f'floor tiles light={len(floors[0])} dark={len(floors[1])}')
