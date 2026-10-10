// [担当: CPU AI] 敵戦士の思考。将来のオンライン対戦では人間の入力に置き換える
(function (G) {
  const { CONFIG: C, DIRS, idx, inside } = G;

  // 安全に進めるか(壁・自分の軌跡を避ける)
  function safe(game, w, d) {
    const x = w.x + DIRS[d].x, y = w.y + DIRS[d].y;
    if (!inside(x, y)) return false;
    return !game.wall[idx(x, y)] && game.trail[idx(x, y)] !== w.id;
  }

  function nearest(game, pred, w, maxDist) {
    let best = null, bd = maxDist + 1;
    const r = maxDist;
    for (let y = Math.max(0, w.y - r); y <= Math.min(C.ROWS - 1, w.y + r); y++)
      for (let x = Math.max(0, w.x - r); x <= Math.min(C.COLS - 1, w.x + r); x++) {
        if (!pred(idx(x, y))) continue;
        const d = Math.abs(x - w.x) + Math.abs(y - w.y);
        if (d < bd) { bd = d; best = { x, y, d }; }
      }
    return best;
  }

  // 目標へ近づく向きの候補(良い順)
  function towards(w, tx, ty) {
    const dx = tx - w.x, dy = ty - w.y, c = [];
    const h = dx > 0 ? 1 : 3, v = dy > 0 ? 2 : 0;
    if (Math.abs(dx) >= Math.abs(dy)) { if (dx) c.push(h); if (dy) c.push(v); }
    else { if (dy) c.push(v); if (dx) c.push(h); }
    return c;
  }

  function think(game, w) {
    const rng = game.rng;
    const ai = w.ai || (w.ai = { leg: 0, legLen: 0, loopLeg: 0, maxTrail: 6 + Math.floor(rng() * 10) });
    const here = game.owner[idx(w.x, w.y)] === w.id;
    let want = w.dir;

    // 1) 他者の軌跡が近ければ狙う(攻撃)
    const prey = w.trailLen < 8 &&
      nearest(game, (i) => game.trail[i] !== -1 && game.trail[i] !== w.id, w, 8);
    // 2) 軌跡が長すぎたら自陣へ帰る
    const home = w.trailLen > ai.maxTrail
      ? nearest(game, (i) => game.owner[i] === w.id, w, 40) : null;

    let cands = [];
    if (home) cands = towards(w, home.x, home.y);
    else if (prey && rng() < 0.7) cands = towards(w, prey.x, prey.y);
    else {
      // 3) 通常: 矩形を描くように遠征して戻る
      if (here) { ai.legLen = 0; ai.loopLeg = 0; ai.maxTrail = 6 + Math.floor(rng() * 14); }
      if (ai.legLen <= 0) {
        ai.loopLeg++;
        ai.legLen = 2 + Math.floor(rng() * 6);
        const turn = rng() < 0.5 ? 1 : 3;
        want = (w.dir + (here ? Math.floor(rng() * 4) : turn)) % 4;
      }
      ai.legLen--;
      cands = [want, (want + 1) % 4, (want + 3) % 4];
    }
    cands.push(w.dir, (w.dir + 1) % 4, (w.dir + 3) % 4);
    for (const d of cands) {
      if ((d + 2) % 4 === w.dir) continue;
      if (safe(game, w, d)) { game.setDir(w.id, d); return; }
    }
  }

  G.cpuThink = function (game) {
    for (const w of game.warriors) if (w.isCpu && w.alive) think(game, w);
  };
})(globalThis.PG);
