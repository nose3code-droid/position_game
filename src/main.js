// [担当: UI・入力] 入力(キー/スワイプ)、ゲームループ、HUD
(function (G) {
  const { CONFIG: C } = G;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  canvas.width = C.COLS * C.CELL; canvas.height = C.ROWS * C.CELL;
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  const msg = document.getElementById('msg');
  let game = null, acc = 0, last = 0, running = false;

  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  addEventListener('keydown', (e) => {
    if (e.code in KEYS) { e.preventDefault(); if (game) game.setDir(0, KEYS[e.code]); }
    else if (e.code === 'Space' && !running) start();
  });
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.hypot(dx, dy) < 24 || !game) return;
    game.setDir(0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  document.getElementById('start').addEventListener('click', start);

  function updateHud() {
    const sc = game.scores();
    hud.innerHTML = `<b>残り ${Math.ceil(game.timeLeft / 1000)}秒</b> ` + game.warriors.map((w) =>
      `<span style="color:${w.color}">■</span> ${w.name} ${sc[w.id].toFixed(1)}%${w.alive ? '' : '(倒)'}`).join(' &nbsp; ');
  }

  function finish() {
    running = false;
    const sc = game.scores();
    const rank = sc.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const win = rank[0][1] === 0 && game.warriors[0].alive;
    msg.innerHTML = (game.warriors[0].alive ? (win ? '勝利!' : '時間切れ') : '倒された…') +
      `<br>陣地 ${sc[0].toFixed(1)}% / 順位 ${rank.findIndex((r) => r[1] === 0) + 1}位 / 撃破 ${game.warriors[0].kills}`;
    overlay.style.display = 'flex';
  }

  function loop(t) {
    if (!running) return;
    acc += t - last; last = t;
    while (acc >= C.STEP_MS && !game.over) {
      acc -= C.STEP_MS;
      G.cpuThink(game);
      game.step();
      game.tick(C.STEP_MS);
    }
    G.render(ctx, game); updateHud();
    if (game.over) return finish();
    requestAnimationFrame(loop);
  }

  function start() {
    game = new G.Game();
    overlay.style.display = 'none';
    running = true; acc = 0; last = performance.now();
    requestAnimationFrame(loop);
  }

  G.loadImages().then(() => { game = new G.Game(); G.render(ctx, game); updateHud(); });
})(globalThis.PG);
