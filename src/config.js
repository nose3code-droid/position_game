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
    // 難易度: think=考える確率, prey=敵の軌跡を狙う確率, item=アイテムを探す距離, trail=遠征の長さ, flee=危険時に帰る, dash=ダッシュを使う
    DIFFICULTY: {
      easy:   { label: 'かんたん', think: 0.75, prey: 0.25, item: 9,  trail: [4, 9],  flee: false, dash: false },
      normal: { label: 'ふつう',   think: 1.0,  prey: 0.7,  item: 16, trail: [6, 16], flee: true,  dash: true },
      hard:   { label: 'むずかしい', think: 1.0, prey: 0.95, item: 24, trail: [8, 22], flee: true,  dash: true },
    },
    SHIELD_STEPS: 20,    // 出現直後に倒されない歩数
    SPAWN_SIZE: 3,       // 初期陣地の一辺
    // 画像は assets/ に置くと自動で使われる。無ければ仮描画。
    MAP_IMAGE: 'assets/map.png',
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
