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
    const D = C.DIFFICULTY[game.difficulty] || C.DIFFICULTY.normal;
    const newMax = () => D.trail[0] + Math.floor(rng() * (D.trail[1] - D.trail[0] + 1));
    const ai = w.ai || (w.ai = { legLen: 0, maxTrail: newMax() });
    const here = game.owner[idx(w.x, w.y)] === w.id;
    let want = w.dir;

    // かんたん: ときどき考えずに直進する(壁・自分の軌跡だけは避ける)
    if (rng() > D.think) { avoid(game, w, [w.dir]); return; }

    // 1) 危険: 敵が自分の軌跡に近い → 自陣へ逃げ帰る(ダッシュも使う)
    const danger = D.flee && w.trailLen > 0 && game.threat(w) <= 3 + w.trailLen / 4;
    // 2) 軌跡が長すぎたら自陣へ帰る
    const home = (danger || w.trailLen > ai.maxTrail)
      ? nearest(game, (i) => game.owner[i] === w.id, w, 40) : null;
    // 3) 他者の軌跡が近ければ狙う(攻撃)
    const prey = !home && w.trailLen < 8 &&
      nearest(game, (i) => game.trail[i] !== -1 && game.trail[i] !== w.id, w, 8);
    // 4) 近くのアイテム(周囲の陣地が取れる)を狙う
    let item = null;
    if (!home) {
      let bd = D.item;
      for (const t of game.items) {
        const d = Math.abs(t.x - w.x) + Math.abs(t.y - w.y);
        if (d < bd) { bd = d; item = t; }
      }
    }

    let cands = [];
    if (home) {
      cands = towards(w, home.x, home.y);
      if (D.dash && (danger || w.trailLen > ai.maxTrail + 8)) game.dash(w.id);
    } else if (prey && rng() < D.prey) {
      cands = towards(w, prey.x, prey.y);
      if (D.dash && prey.d <= 6) game.dash(w.id);
    } else if (item && rng() < 0.92) cands = towards(w, item.x, item.y);
    else {
      // 5) 通常: 矩形を描くように遠征して戻る
      if (here) { ai.legLen = 0; ai.maxTrail = newMax(); }
      if (ai.legLen <= 0) {
        ai.legLen = 2 + Math.floor(rng() * 6);
        const turn = rng() < 0.5 ? 1 : 3;
        want = (w.dir + (here ? Math.floor(rng() * 4) : turn)) % 4;
      }
      ai.legLen--;
      cands = [want, (want + 1) % 4, (want + 3) % 4];
    }
    avoid(game, w, cands);
  }

  // 候補の向きを順に試し、安全なものを選ぶ
  function avoid(game, w, cands) {
    cands = cands.concat([w.dir, (w.dir + 1) % 4, (w.dir + 3) % 4]);
    for (const d of cands) {
      if ((d + 2) % 4 === w.dir) continue;
      if (safe(game, w, d)) { game.setDir(w.id, d); return; }
    }
  }

  // dashOnly=true: ダッシュ中のCPUだけ考える(半拍の追加移動用)
  G.cpuThink = function (game, dashOnly = false) {
    for (const w of game.warriors) if (w.isCpu && w.alive && (!dashOnly || w.dash > 0)) think(game, w);
  };
})(globalThis.PG);
