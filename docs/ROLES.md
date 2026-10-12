# 担当割り振り

| 担当 | 範囲 | ファイル | 状態 |
|---|---|---|---|
| ゲームデザイン | ルール・パラメータ調整 | `src/config.js` | ベース完了 |
| ゲームロジック | 陣取り・軌跡・撃破・囲い込み | `src/game.js` | ベース完了 |
| CPU AI | BFS経路探索で遠征・攻撃・帰還・千両箱・危険回避・ダッシュ、難易度3段階。倒されたら復活しない | `src/cpu.js` | 完了 |
| 描画・画像 | Canvas描画、方向別スプライト | `src/render.js`, `assets/` | 画像組み込み済み |
| ツール | 切り出し・透明化・壁データ生成 | `tools/build_assets.py`, `tools/build_map.py` | 完了 |
| UI・入力 | キー/スワイプ/ダッシュボタン、HUD、難易度、カウントダウン、一時停止、結果・称号 | `src/main.js`, `index.html` | 完了 |
| 演出 | パーティクル・画面の揺れ・ポップアップ・実況・バナー | `src/fx.js` | 完了 |
| サウンド | BGM(オリジナル曲、`tools/compose_bgm.py`)、Kenney効果音、合成音フォールバック | `src/sound.js`, `assets/audio/` | 完了 |
| QA | CPU同士の長時間シミュ(難易度別) | `tests/sim.js` (`node tests/sim.js`) | あり |
| ランキング | 自分の記録(ブラウザ保存)・世界ランキング(Supabase、設定で有効化) | `src/ranking.js`, `docs/RANKING.md` | 完了(世界は設定待ち) |
| オンライン | P2P(PeerJS/WebRTC)でホストが計算・参加者へ差分同期、ロビー、切断時はCPU代行 | `src/net.js`, `src/main.js`, `docs/ONLINE.md` | 完了 |

## オンライン化に向けた設計メモ
- `Game` は描画・入力に依存しない。サーバ(Node)でそのまま動かせる。
- 入力は `game.setDir(id, dir)` だけ。人間プレイヤーはネットワーク入力、CPUは `cpuThink` で同じ口を使う。
- 次段階: WebSocketサーバで `step()` を権威実行し、状態(owner/trail/warriors)を配信。
