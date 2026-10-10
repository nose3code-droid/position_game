# 担当割り振り

| 担当 | 範囲 | ファイル | 状態 |
|---|---|---|---|
| ゲームデザイン | ルール・パラメータ調整 | `src/config.js` | ベース完了 |
| ゲームロジック | 陣取り・軌跡・撃破・囲い込み | `src/game.js` | ベース完了 |
| CPU AI | 敵戦士の思考(遠征/攻撃/帰還) | `src/cpu.js` | ベース完了(要チューニング) |
| 描画・画像 | Canvas描画、画像差し替え | `src/render.js`, `assets/` | 仮描画。画像待ち |
| UI・入力 | キー/スワイプ、HUD、開始/結果 | `src/main.js`, `index.html` | ベース完了 |
| QA | CPU同士の長時間シミュ | `tests/sim.js` (`node tests/sim.js`) | あり |
| オンライン化(次段階) | 下記 | - | 未着手 |

## オンライン化に向けた設計メモ
- `Game` は描画・入力に依存しない。サーバ(Node)でそのまま動かせる。
- 入力は `game.setDir(id, dir)` だけ。人間プレイヤーはネットワーク入力、CPUは `cpuThink` で同じ口を使う。
- 次段階: WebSocketサーバで `step()` を権威実行し、状態(owner/trail/warriors)を配信。
