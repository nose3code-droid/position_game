// [担当: ゲームデザイン] 調整用パラメータ・ルールはここに集約
(function (G) {
  G.CONFIG = {
    COLS: 120,      // マップ全体のセル数 (tools/build_map.py のタイル数*3 と一致させる)
    ROWS: 78,
    VIEW_COLS: 69,  // 画面に映る範囲(カメラはプレイヤーを追う)
    VIEW_ROWS: 46,
    CELL: 16,
    STEP_MS: 110,        // 1マス進む間隔(小さいほど速い)
    MATCH_SEC: 180,      // 1試合の長さ
    CPU_COUNT: 3,
    RESPAWN_MS: 3000,    // CPUの復活待ち
    SCORE_CELL: 10,      // 陣地1マスあたりの点数
    SCORE_KILL: 500,     // 撃破1人あたりの点数
    ITEM_COUNT: 14,      // マップ上に同時に存在するアイテム数
    ITEM_RADIUS: 5,      // 取得時に陣地になる範囲(半径マス数)
    ITEM_RESPAWN_MS: 6000, // 取得されたアイテムが再出現するまでの時間
    DASH_STEPS: 14,      // ダッシュで追加で進むマス数(倍速の持続)
    DASH_COOLDOWN_MS: 7000,
    COUNTDOWN_MS: 3000,  // 開始前のカウントダウン
    // 難易度(CPUの強さ)
    //  think: 考える確率 / prey: 敵の軌跡を狙う確率 / preyRange: 狙う距離 / chase: 相手の帰還より何歩遅くても追うか
    //  item: 千両箱を探す距離 / trail: 遠征の長さ[最小,最大] / greed: 敵との距離に対する遠征の大きさ
    //  margin: 危険判断の余裕(大きいほど慎重) / attackMaxTrail: 自分の軌跡がこれ未満なら攻撃する
    //  dash: ダッシュを使う / huntPlayer: プレイヤーを優先して狙う
    DIFFICULTY: {
      easy:   { label: 'かんたん', think: 0.85, prey: 0.5, preyRange: 10, chase: 0, item: 12, trail: [5, 14], greed: 0.5,
                flee: true, margin: 0, attackMaxTrail: 6, dash: false, huntPlayer: false },
      normal: { label: 'ふつう', think: 1, prey: 0.9, preyRange: 22, chase: 5, item: 20, trail: [6, 24], greed: 0.6,
                flee: true, margin: 2, attackMaxTrail: 16, dash: true, huntPlayer: false },
      hard:   { label: 'むずかしい', think: 1, prey: 1, preyRange: 36, chase: 9, item: 28, trail: [8, 32], greed: 0.7,
                flee: true, margin: 3, attackMaxTrail: 28, dash: true, huntPlayer: true },
    },
    // 世界ランキング(Supabase)。準備手順は docs/RANKING.md。
    //  enabled を true にし、url(https://xxxx.supabase.co)と anonKey(公開用キー)を入れると表示される
    WORLD_RANKING: { enabled: false, url: '', anonKey: '', table: 'scores' },
    // オンライン対戦: 一旦無効化中。戻すときは true にして index.html のコメントアウトを外す
    ONLINE_ENABLED: false,
    CPU_RESPAWN: false,  // 倒されたCPUは復活しない
    SCORE_CLEAR_PER_SEC: 20, // CPUを全滅させたときの残り時間ボーナス(1秒あたり)
    SHIELD_STEPS: 20,    // 出現直後に倒されない歩数
    SPAWN_SIZE: 3,       // 初期陣地の一辺
    // 画像は assets/ に置くと自動で使われる。無ければ仮描画。
    MAP_IMAGE: 'assets/map.jpg',
    ITEM_IMAGE: 'assets/item_chest.png',
    // 戦士スプライト: assets/warrior_<名前>_<up|right|down|left>.png (tools/build_assets.py で生成)
    SPRITES: ['player', 'cpu1', 'cpu2', 'cpu3'],
    SPRITE_H: 3.4,
    ITEM_H: 2.4,         // アイテムの高さ(セル数)       // 戦士の身長(セル数)
    WARRIORS: [
      { name: 'あなた', color: '#3b82f6' },
      { name: '赤の戦士', color: '#ef4444' },
      { name: '緑の戦士', color: '#22c55e' },
      { name: '金の戦士', color: '#eab308' },
    ],
  };
  G.DIRS = [ // 0:上 1:右 2:下 3:左
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  ];
})(globalThis.PG = globalThis.PG || {});
