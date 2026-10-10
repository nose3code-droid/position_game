# 画像アセット

| ファイル | 内容 |
|---|---|
| `map.png` | マップ(外周+障害物の壁つき、1536x1024)。壁の位置は `src/mapdata.js` に反映済み |
| `source/warrior_*.jpg` | ChatGPT生成の四面図(元データ) |
| `warrior_<名前>_<up\|right\|down\|left>.png` | 四面図から切り出して背景透明化した戦士(自動生成) |

名前: `player`(青灰の弓兵) / `cpu1`(赤) / `cpu2`(緑) / `cpu3`(金)
向き: up=背面 / right=右側面 / down=正面 / left=左側面(進行方向で自動切り替え)

## 更新手順
- 戦士の絵を差し替えたら `assets/source/` のjpgを上書きして `python3 tools/build_assets.py`
  (要 numpy, scipy, Pillow。四面図が左側面・正面・右側面・背面の順に並んでいる前提)
- マップを差し替えたら `python3 tools/build_map.py` で壁データを再生成
  (緑の床以外を壁として読み取る。グリッドは `src/config.js` の COLS/ROWS=69x46)
