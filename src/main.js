// [担当: UI・入力] 入力(キー/スワイプ)、ゲームループ、HUD
(function (G) {
  const { CONFIG: C } = G;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  canvas.width = C.VIEW_COLS * C.CELL; canvas.height = C.VIEW_ROWS * C.CELL;
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

  const BEST_KEY = 'position_game_best';
  function getBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
  function setBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても続行 */ } }

  function updateHud() {
    const sc = game.scores(), pts = game.points();
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    hud.innerHTML = `<b>残り ${Math.ceil(game.timeLeft / 1000)}秒</b> &nbsp; <b>スコア ${pts[0].toLocaleString()}</b>` +
      ` <small>(ベスト ${Math.max(getBest(), pts[0]).toLocaleString()})</small><br>` +
      order.map((id, n) => { const w = game.warriors[id];
        return `<span style="color:${w.color}">■</span> ${n + 1}位 ${w.name} ${pts[id].toLocaleString()}点 (${sc[id].toFixed(1)}% / 撃破${w.kills})${w.alive ? '' : ' 倒'}`;
      }).join(' &nbsp; ');
  }

  function finish() {
    running = false;
    const sc = game.scores(), pts = game.points();
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    const me = game.warriors[0];
    const isBest = pts[0] > getBest();
    if (isBest) setBest(pts[0]);
    const cells = Math.round(sc[0] * game.free / 100);
    const title = !me.alive ? '倒された…' : order[0] === 0 ? '勝利!' : '時間切れ';
    msg.innerHTML = `${title}<br><span style="font-size:32px">スコア ${pts[0].toLocaleString()}点</span>` +
      (isBest ? ' <span style="color:#fbbf24">NEW BEST!</span>' : '') +
      `<br><small>内訳: 陣地 ${cells}マス × ${C.SCORE_CELL} + 撃破 ${me.kills}人 × ${C.SCORE_KILL}` +
      ` / ベスト ${getBest().toLocaleString()}点</small><br>` +
      '<small>' + order.map((id, n) => `${n + 1}位 ${game.warriors[id].name} ${pts[id].toLocaleString()}点`).join(' / ') + '</small>';
    document.getElementById('start').textContent = 'もう一度 (Space)';
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
    G.resetCamera();
    overlay.style.display = 'none';
    running = true; acc = 0; last = performance.now();
    requestAnimationFrame(loop);
  }

  G.loadImages().then(() => { game = new G.Game(); G.resetCamera(); G.render(ctx, game); updateHud(); });
})(globalThis.PG);
