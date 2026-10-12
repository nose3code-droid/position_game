# 画像アセット

| ファイル | 内容 |
|---|---|
| `map.jpg` | マップ(外周+障害物の壁つき、2560x1664)。`tools/build_map.py` が下のタイル素材から自動生成。壁の位置は `src/mapdata.js` |
| `source/grass_tiles.png` | 草原タイル(4x4の市松。1枚ずつ切り出してランダムに並べる) |
| `source/stone_tile.png` | 壁の石ブロック(白背景から切り出す) |
| `source/map_source.png` | 以前のマップ(現在は未使用) |
| `source/warrior_*.jpg` | ChatGPT生成の四面図(元データ) |
| `warrior_<名前>_<up\|right\|down\|left>.png` | 四面図から切り出して背景透明化した戦士(自動生成) |
| `item_chest.png` | 千両箱アイテム(四面図の正面を切り出し・背景透明化。`tools/build_items.py`) |
| `source/item_chest.jpg` | ChatGPT生成のアイテム四面図(元データ) |

名前: `player`(青灰の弓兵) / `cpu1`(赤) / `cpu2`(緑) / `cpu3`(金)
向き: up=背面 / right=右側面 / down=正面 / left=左側面(進行方向で自動切り替え)

## 更新手順
- 戦士の絵を差し替えたら `assets/source/` のjpgを上書きして `python3 tools/build_assets.py`
  (要 numpy, scipy, Pillow。四面図が左側面・正面・右側面・背面の順に並んでいる前提)
- タイル素材を差し替えたら `python3 tools/build_map.py` で再生成。マップの大きさ・障害物を変えるなら `tools/build_map.py` の TILES_W/TILES_H・障害物数を変えて再実行
  (`src/config.js` の COLS/ROWS = タイル数×3 に合わせる。現在 120x78)

## 音声 (`audio/`)
- BGM: `bgm_battle` / `bgm_title` はオリジナル曲。`python3 tools/compose_bgm.py` で再生成(要 numpy, ffmpeg)
- 効果音: Kenney (CC0 / MIT)。出典とライセンスは `audio/LICENSES.md`
- フォント: DotGothic16 (Google Fonts, SIL Open Font License) をブラウザが読み込む
