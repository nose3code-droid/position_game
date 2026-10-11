// [担当: UI・入力] 入力(キー/スワイプ/ボタン)、ゲームループ、HUD、演出・効果音のつなぎ込み
(function (G) {
  const { CONFIG: C } = G;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  canvas.width = C.VIEW_COLS * C.CELL; canvas.height = C.VIEW_ROWS * C.CELL;
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  const msg = document.getElementById('msg');
  const startBtn = document.getElementById('start');
  const muteBtn = document.getElementById('mute');
  const dashBtn = document.getElementById('dashBtn');
  // state: title / countdown / play / paused / dying / over
  let game = null, acc = 0, last = 0, state = 'title', half = 0, countdownLeft = 0, dyingLeft = 0;
  let lastSec = -1, combo = 0, lastKillAt = -1e9, wasFirst = false, hudAt = 0;

  // ---- 設定の保存(失敗しても動く) ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 保存できなくても続行 */ } },
  };
  let difficulty = store.get('position_game_diff', 'normal');
  if (!C.DIFFICULTY[difficulty]) difficulty = 'normal';
  const bestKey = () => `position_game_best_${difficulty}`;
  const getBest = () => Number(store.get(bestKey(), 0)) || 0;

  // ---- 入力 ----
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  addEventListener('keydown', (e) => {
    if (e.code in KEYS) { e.preventDefault(); if (game && state === 'play') game.setDir(0, KEYS[e.code]); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyJ') doDash();
    else if (e.code === 'Space') { e.preventDefault(); if (state === 'title' || state === 'over') start(); else doDash(); }
    else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') toggleMute();
    else if (state === 'title' || state === 'over') {
      if (e.code === 'Digit1') setDifficulty('easy');
      if (e.code === 'Digit2') setDifficulty('normal');
      if (e.code === 'Digit3') setDifficulty('hard');
    }
  });
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.hypot(dx, dy) < 24 || !game || state !== 'play') return;
    game.setDir(0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  startBtn.addEventListener('click', start);
  muteBtn.addEventListener('click', toggleMute);
  dashBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doDash(); });
  dashBtn.addEventListener('click', doDash);
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));

  function doDash() { if (game && state === 'play') game.dash(0); }
  function togglePause() {
    if (state === 'play') { state = 'paused'; G.fx.banner('一時停止', '#fff', 1e9, 'P / Esc で再開'); }
    else if (state === 'paused') { state = 'play'; G.fx.banner('', '#fff', 1); last = performance.now(); }
  }
  function toggleMute() { const m = G.sfx.toggleMute(); muteBtn.textContent = m ? '🔇 音OFF (M)' : '🔊 音ON (M)'; }
  function setDifficulty(d) {
    difficulty = d; store.set('position_game_diff', d);
    document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === d));
    const bestEl = document.getElementById('best');
    if (bestEl) bestEl.textContent = `${C.DIFFICULTY[d].label}のベスト: ${getBest().toLocaleString()}点`;
  }

  // ---- HUD ----
  function updateHud() {
    const sc = game.scores(), pts = game.points();
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    const sec = Math.ceil(game.timeLeft / 1000);
    const t = sec <= 10 ? `<b style="color:#ff5555;font-size:18px">残り ${sec}秒</b>` : `<b>残り ${sec}秒</b>`;
    hud.innerHTML = `${t} &nbsp; <b>スコア ${pts[0].toLocaleString()}</b>` +
      ` <small>(ベスト ${Math.max(getBest(), pts[0]).toLocaleString()} / ${C.DIFFICULTY[difficulty].label})</small><br>` +
      order.map((id, n) => { const w = game.warriors[id];
        const me = id === 0 ? 'font-weight:bold;text-decoration:underline' : '';
        return `<span style="${me}"><span style="color:${w.color}">■</span> ${n + 1}位 ${w.name} ${pts[id].toLocaleString()}点` +
          ` (${sc[id].toFixed(1)}% / 撃破${w.kills})${w.alive ? '' : ' 💀'}</span>`;
      }).join(' &nbsp; ');
  }

  // ---- ゲーム内イベント → 演出・効果音・実況 ----
  const tag = (w) => `[${w.color}|${w.name}]`;
  const nearPlayer = (x, y) => { const p = game.warriors[0]; return Math.abs(p.x - x) < C.VIEW_COLS / 2 + 4 && Math.abs(p.y - y) < C.VIEW_ROWS / 2 + 4; };

  function handleEvents(now) {
    for (const e of game.events.splice(0)) {
      if (e.type === 'capture' && e.gained > 0) {
        const w = game.warriors[e.who], mine = e.who === 0;
        G.fx.burst(e.x, e.y, w.color, Math.min(50, 8 + e.gained / 4), mine ? 4 : 3);
        G.fx.pop(e.x, e.y, `+${(e.gained * C.SCORE_CELL).toLocaleString()}`, mine ? '#fff' : w.color, Math.min(40, 16 + e.gained / 15));
        if (mine) {
          G.sfx.capture(e.gained);
          if (e.gained >= 400) { G.fx.shake(9); G.fx.banner('天下統一級!', '#fbbf24', 1400, `${e.gained}マス占領`); }
          else if (e.gained >= 200) { G.fx.shake(6); G.fx.banner('大占領!', '#fde047', 1200, `${e.gained}マス占領`); }
          else if (e.gained >= 80) G.fx.shake(3);
        }
      } else if (e.type === 'item') {
        const w = game.warriors[e.who], mine = e.who === 0;
        G.addEffect(e.x, e.y, w.color);
        G.fx.burst(e.x, e.y, '#fbbf24', 30, 4);
        G.fx.pop(e.x, e.y, `+${(e.gained * C.SCORE_CELL).toLocaleString()}`, '#fbbf24', 26);
        if (mine) { G.sfx.item(); G.fx.shake(4); G.fx.log('[#fbbf24|千両箱]を手に入れた!'); }
        else if (nearPlayer(e.x, e.y)) G.sfx.item();
      } else if (e.type === 'kill') {
        const v = game.warriors[e.victim], k = e.killer >= 0 ? game.warriors[e.killer] : null;
        G.fx.burst(e.x, e.y, v.color, 40, 5);
        G.fx.burst(e.x, e.y, '#ffffff', 12, 3);
        const why = { wall: 'が壁に激突', self: 'が自分の軌跡で自滅', headon: 'と相打ち' }[e.reason];
        if (k) G.fx.log(`${tag(k)} が ${tag(v)} を${e.reason === 'enclose' ? '包囲して' : e.reason === 'item' ? '千両箱で' : ''}撃破!`);
        else G.fx.log(`${tag(v)} ${why || 'が倒れた'}`);
        if (e.victim === 0) { G.sfx.death(); G.fx.shake(12); }
        else if (e.killer === 0) {
          G.sfx.kill(); G.fx.shake(6);
          combo = now - lastKillAt < 6000 ? combo + 1 : 1; lastKillAt = now;
          const names = ['', '撃破!', 'ダブルキル!!', 'トリプルキル!!!', '無双!!!!'];
          G.fx.banner(names[Math.min(combo, 4)], '#ff6b6b', 1200, `+${C.SCORE_KILL}点`);
        } else if (nearPlayer(e.x, e.y)) G.sfx.kill();
      } else if (e.type === 'dash' && e.who === 0) G.sfx.dash();
    }
    // 順位の変化
    const pts = game.points();
    const first = pts[0] > 0 && pts.every((p, i) => i === 0 || pts[0] > p);
    if (first && !wasFirst) G.fx.log('[#fbbf24|1位]に浮上!');
    wasFirst = first;
    // 残り時間の警告
    const sec = Math.ceil(game.timeLeft / 1000);
    if (sec !== lastSec) {
      if (sec === 30) G.fx.banner('残り30秒!', '#fde047', 1200);
      if (sec === 10) G.fx.banner('残り10秒!', '#ff5555', 1200);
      if (sec <= 10 && sec > 0) G.sfx.tick();
      lastSec = sec;
    }
  }

  // ---- 結果 ----
  const RANKS = [[0, '足軽'], [1500, '足軽大将'], [3500, '侍大将'], [6000, '城主'], [10000, '大名'], [16000, '天下人']];
  function finish() {
    state = 'over';
    const sc = game.scores(), pts = game.points();
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    const me = game.warriors[0];
    const best = getBest(), isBest = pts[0] > best;
    if (isBest) store.set(bestKey(), pts[0]);
    const rankNo = order.indexOf(0) + 1;
    const title = !me.alive ? '討ち死に…' : rankNo === 1 ? '勝利!' : `${rankNo}位`;
    const rank = RANKS.filter((r) => pts[0] >= r[0]).pop()[1];
    (me.alive && rankNo === 1 ? G.sfx.win : G.sfx.lose)();
    const cells = Math.round(sc[0] * game.free / 100);
    msg.innerHTML = `<div style="font-size:30px">${title}</div>` +
      `<div style="font-size:40px;font-weight:900">${pts[0].toLocaleString()}点` +
      (isBest ? ' <span style="color:#fbbf24;font-size:22px">NEW BEST!</span>' : '') + '</div>' +
      `<div>称号: <b style="color:#fde047">${rank}</b> <small>(${C.DIFFICULTY[difficulty].label})</small></div>` +
      `<small>陣地 ${cells}マス×${C.SCORE_CELL} + 撃破 ${me.kills}人×${C.SCORE_KILL} / ` +
      `最大占領率 ${me.maxPct.toFixed(1)}% / 最大囲い込み ${me.bestCapture}マス / 千両箱 ${me.items}個<br>` +
      `ベスト ${Math.max(best, pts[0]).toLocaleString()}点</small><br>` +
      '<small>' + order.map((id, n) => `${n + 1}位 ${game.warriors[id].name} ${pts[id].toLocaleString()}点`).join(' / ') + '</small>';
    startBtn.textContent = 'もう一度 (Space)';
    setDifficulty(difficulty);
    overlay.style.display = 'flex';
  }

  // ---- ループ ----
  function loop(t) {
    let dt = Math.min(100, t - last); last = t;
    if (state === 'countdown') {
      const before = Math.ceil(countdownLeft / 1000);
      countdownLeft -= dt;
      const after = Math.ceil(countdownLeft / 1000);
      if (countdownLeft <= 0) { state = 'play'; G.fx.banner('出陣!', '#fde047', 900); G.sfx.go(); acc = 0; }
      else if (after !== before) { G.fx.banner(String(after), '#fff', 900); G.sfx.count(); }
    } else if (state === 'play') {
      acc += dt;
      const HALF = C.STEP_MS / 2;
      while (acc >= HALF && !game.over) {
        acc -= HALF;
        if (half++ % 2 === 0) { G.cpuThink(game); game.step(); game.tick(C.STEP_MS); }
        else { G.cpuThink(game, true); game.step(true); } // ダッシュ中の戦士だけ追加で進む
        handleEvents(t);
      }
      if (game.over) { state = 'dying'; dyingLeft = game.warriors[0].alive ? 600 : 1200; if (game.timeLeft <= 0) G.fx.banner('終了!', '#fff', 1000); }
    } else if (state === 'dying') {
      dyingLeft -= dt;
      if (dyingLeft <= 0) { G.fx.clear(); G.render(ctx, game); updateHud(); return finish(); }
    }
    G.render(ctx, game);
    if (t - hudAt > 150) { updateHud(); hudAt = t; }
    if (state !== 'over') requestAnimationFrame(loop);
  }

  function start() {
    G.sfx.unlock();
    game = G.game = new G.Game(); // G.game はデバッグ・テスト用
    game.difficulty = difficulty;
    G.resetCamera(); G.clearEffects(); G.fx.clear();
    overlay.style.display = 'none';
    state = 'countdown'; countdownLeft = C.COUNTDOWN_MS; acc = 0; half = 0;
    lastSec = -1; combo = 0; lastKillAt = -1e9; wasFirst = false;
    G.fx.banner(String(Math.ceil(C.COUNTDOWN_MS / 1000)), '#fff', 900); G.sfx.count();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  setDifficulty(difficulty);
  muteBtn.textContent = G.sfx.muted ? '🔇 音OFF (M)' : '🔊 音ON (M)';
  G.loadImages().then(() => { game = new G.Game(); G.resetCamera(); G.render(ctx, game); updateHud(); });
})(globalThis.PG);
