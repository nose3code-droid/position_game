// [担当: ゲームデザイン] 調整用パラメータ・ルールはここに集約
(function (G) {
  G.CONFIG = {
    COLS: 60,
    ROWS: 40,
    CELL: 16,
    STEP_MS: 110,        // 1マス進む間隔(小さいほど速い)
    MATCH_SEC: 120,      // 1試合の長さ
    CPU_COUNT: 3,
    RESPAWN_MS: 3000,    // CPUの復活待ち
    SPAWN_SIZE: 3,       // 初期陣地の一辺
    // 画像は assets/ に置くと自動で使われる。無ければ仮描画。
    IMAGES: {
      map: 'assets/map.png',
      warrior0: 'assets/warrior_player.png',
      warrior1: 'assets/warrior_cpu1.png',
      warrior2: 'assets/warrior_cpu2.png',
      warrior3: 'assets/warrior_cpu3.png',
    },
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
