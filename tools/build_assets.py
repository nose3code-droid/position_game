"""四面図(jpg)から戦士スプライトを切り出し、背景を透明化する。
使い方: python3 tools/build_assets.py   (要 numpy, scipy, Pillow)
入力: assets/source/warrior_*.jpg  出力: assets/warrior_<名前>_<up|right|down|left>.png
向きの対応: up=背面 / right=右側面 / down=正面 / left=左側面
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
SHEETS = {'player': 'warrior_player', 'cpu1': 'warrior_cpu1', 'cpu2': 'warrior_cpu2', 'cpu3': 'warrior_cpu3'}
ORDER = ['left', 'down', 'right', 'up']          # 左→右の並び(左側面,正面,右側面,背面)
CROP_Y = {'cpu1': (122, 628)}                    # それ以外は既定
DEFAULT_Y = (150, 640)
OUT_H = 200                                      # 出力スプライトの身長(px)

def load(name):
    return np.array(Image.open(os.path.join(ROOT, 'source', name + '.jpg')).convert('RGB')).astype(int)

def extract(rgb, y0, y1):
    sub = rgb[y0:y1, 40:1370]
    nonwhite = (255 - sub).max(axis=2) > 40
    lab, n = ndi.label(nonwhite, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    areas = ndi.sum(nonwhite, lab, range(1, n + 1))
    big = sorted([i + 1 for i, a in enumerate(areas) if a > 5000], key=lambda i: objs[i - 1][1].start)
    assert len(big) == 4, f'4体を検出できません: {[(i, areas[i-1]) for i in big]}'
    groups = {i: [i] for i in big}
    cx = {i: (objs[i - 1][1].start + objs[i - 1][1].stop) / 2 for i in big}
    for i, a in enumerate(areas, 1):          # 小さな破片(武器の一部など)は最寄りの体へ。ゴミは捨てる
        if i in big or a <= 150: continue
        x = (objs[i - 1][1].start + objs[i - 1][1].stop) / 2
        groups[min(big, key=lambda j: abs(cx[j] - x))].append(i)
    views = []
    for i in big:
        keep = np.isin(lab, groups[i])
        xs = np.where(keep.any(axis=0))[0]
        x0, x1 = xs.min(), xs.max() + 1
        px = sub[:, x0:x1]
        keep = keep[:, x0:x1]
        holes = ndi.binary_fill_holes(keep) & ~keep   # 目の白など小さな内部の穴だけ残す(弓と体の隙間などは透明のまま)
        hl, hn = ndi.label(holes)
        if hn:
            ha = ndi.sum(holes, hl, range(1, hn + 1))
            keep = keep | np.isin(hl, [i + 1 for i, a in enumerate(ha) if a < 600])
        near_white = (px.min(axis=2) >= 215)   # 背景 = 端から連結した白(内部の白は残す)
        l2, _ = ndi.label(near_white)
        edge = set(np.unique(np.concatenate([l2[0], l2[-1], l2[:, 0], l2[:, -1]]))) - {0}
        bg = np.isin(l2, list(edge))
        fg = ~bg & keep
        border = fg & ndi.binary_dilation(~fg, iterations=1)   # 縁のJPEGにじみを除去
        fg &= ~(border & (px.min(axis=2) > 170))
        views.append(np.dstack([px, fg * 255]).astype(np.uint8))
    return views

def main():
    for key, fname in SHEETS.items():
        y0, y1 = CROP_Y.get(key, DEFAULT_Y)
        views = extract(load(fname), y0, y1)
        # 全方向で同じ縮尺・足元基準にそろえる
        info = []
        for v in views:
            a = v[:, :, 3] > 0
            ys, xs = np.where(a)
            info.append((ys.min(), ys.max(), xs.min(), xs.max(), xs.mean()))
        height = max(i[1] - i[0] + 1 for i in info)
        scale = OUT_H / height
        half = max(max(i[4] - i[2], i[3] - i[4]) for i in info)
        W = int(np.ceil(2 * half * scale)) + 4
        for d, v, i in zip(ORDER, views, info):
            img = Image.fromarray(v[i[0]:i[1] + 1, i[2]:i[3] + 1], 'RGBA')
            nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
            img = img.resize((nw, nh), Image.LANCZOS)
            canvas = Image.new('RGBA', (W, OUT_H + 4))
            cx = round((i[4] - i[2]) * scale)             # 重心(胴体)を中央に
            canvas.paste(img, (W // 2 - cx, OUT_H + 2 - nh), img)
            out = os.path.join(ROOT, f'{fname}_{d}.png')
            canvas.save(out)
            print(out, canvas.size)

if __name__ == '__main__':
    main()
