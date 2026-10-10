"""アイテム画像(四面図jpg)から正面を切り出し、背景(方眼紙)を透明化する。
使い方: python3 tools/build_items.py   (要 numpy, scipy, Pillow)
入力: assets/source/item_chest.jpg  出力: assets/item_chest.png
"""
import numpy as np, os
from PIL import Image
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(__file__), '..', 'assets')
rgb = np.array(Image.open(os.path.join(root, 'source', 'item_chest.jpg')).convert('RGB')).astype(int)

# 正面図の範囲(四面図の左から2番目)
x0, x1, y0, y1 = 440, 760, 160, 640
px = rgb[y0:y1, x0:x1]
bg_color = np.median(np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]]), axis=0)
# 背景(方眼紙の紙色と薄い罫線)に近い色で、外側から連結した領域だけ透明にする
near_bg = (np.abs(px - bg_color).max(axis=2) < 38) & (px.min(axis=2) > 185)
lab, _ = ndi.label(near_bg)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
fg = ~bg
lab2, n = ndi.label(fg, structure=np.ones((3, 3)))   # 最大の塊(箱)だけ残す
sizes = ndi.sum(fg, lab2, range(1, n + 1))
fg = lab2 == (1 + int(np.argmax(sizes)))
fg = ndi.binary_fill_holes(fg)
border = fg & ndi.binary_dilation(~fg, iterations=1)    # 縁の紙色のにじみを除去
fg &= ~(border & (px.min(axis=2) > 190))
ys, xs = np.where(fg)
rgba = np.dstack([px, fg * 255]).astype(np.uint8)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
img = Image.fromarray(rgba, 'RGBA')
H = 160
img = img.resize((round(img.width * H / img.height), H), Image.LANCZOS)
img.save(os.path.join(root, 'item_chest.png'))
print('item_chest.png', img.size)
