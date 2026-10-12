// [担当: CPU AI] 敵戦士の思考。将来のオンライン対戦では人間の入力に置き換える
// 方針: 経路探索(BFS)で壁を回り込みながら目標へ向かい、
//   「敵が自分の軌跡に届く距離」と「自分が自陣に戻る距離」を比べて引き際を判断する。
(function (G) {
  const { CONFIG: C, DIRS, idx, inside } = G;
  const N = C.COLS * C.ROWS;
  const seen = new Int32Array(N);   // BFS の訪問印(世代番号で毎回クリア不要)
  const first = new Int8Array(N);   // 最初の一歩の向き
  const dist = new Int32Array(N);
  const queue = new Int32Array(N);
  let stamp = 0;

  // (sx,sy) から BFS。壁・自分の軌跡・block のマスは通らない。
  // fromDir を与えると、その真後ろ(Uターン)には最初の一歩で進まない。
  // goal(i) を満たす最も近いマスを {i, d, dir} で返す(maxD を超えたら null)
  function bfs(game, w, sx, sy, fromDir, goal, maxD, block = -1) {
    stamp++;
    let h = 0, t = 0;
    const s = idx(sx, sy);
    seen[s] = stamp; dist[s] = 0; first[s] = -1; queue[t++] = s;
    while (h < t) {
      const i = queue[h++], x = i % C.COLS, y = (i / C.COLS) | 0, d = dist[i];
      if (d > 0 && goal(i)) return { i, d, dir: first[i] };
      if (d >= maxD) continue;
      for (let k = 0; k < 4; k++) {
        if (d === 0 && fromDir >= 0 && (k + 2) % 4 === fromDir) continue;
        const nx = x + DIRS[k].x, ny = y + DIRS[k].y;
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen[j] === stamp || game.wall[j] || game.trail[j] === w.id || j === block) continue;
        seen[j] = stamp; dist[j] = d + 1; first[j] = d === 0 ? k : first[i]; queue[t++] = j;
      }
    }
    return null;
  }

  // 一番近い敵の頭までの距離
  function nearestEnemy(game, w) {
    let best = Infinity;
    for (const e of game.warriors) {
      if (e === w || !e.alive) continue;
      best = Math.min(best, Math.abs(e.x - w.x) + Math.abs(e.y - w.y));
    }
    return best;
  }

  // 向き d に進んでも安全か: 壁・自分の軌跡でなく、自陣の外なら進んだ先から自陣へ戻る道が残っている
  function safeDir(game, w, d, here) {
    const nx = w.x + DIRS[d].x, ny = w.y + DIRS[d].y;
    if (!inside(nx, ny)) return false;
    const j = idx(nx, ny);
    if (game.wall[j] || game.trail[j] === w.id) return false;
    if (game.owner[j] === w.id) return true;
    // 進むと今いるマスは軌跡になる(自陣外のとき)ので通れない扱いにする
    const block = here ? -1 : idx(w.x, w.y);
    return !!bfs(game, w, nx, ny, d, (i) => game.owner[i] === w.id, 60, block);
  }

  function steer(game, w, cands, here) {
    const all = cands.concat([w.dir, (w.dir + 1) % 4, (w.dir + 3) % 4]);
    for (const d of all) {
      if (d < 0 || (d + 2) % 4 === w.dir) continue;
      if (safeDir(game, w, d, here)) { game.setDir(w.id, d); return; }
    }
    // 安全な道が無ければ、せめて壁と自分の軌跡だけ避ける
    for (const d of all) {
      if (d < 0 || (d + 2) % 4 === w.dir) continue;
      const nx = w.x + DIRS[d].x, ny = w.y + DIRS[d].y;
      if (inside(nx, ny) && !game.wall[idx(nx, ny)] && game.trail[idx(nx, ny)] !== w.id) { game.setDir(w.id, d); return; }
    }
  }

  function think(game, w) {
    const rng = game.rng;
    const D = C.DIFFICULTY[game.difficulty] || C.DIFFICULTY.normal;
    const ai = w.ai || (w.ai = { legLen: 0, want: w.dir, limit: D.trail[0] });
    const here = game.owner[idx(w.x, w.y)] === w.id;

    // かんたん: ときどき考えずに直進する
    if (rng() > D.think) { steer(game, w, [w.dir], here); return; }

    // 自陣への帰り道
    const home = here ? null : bfs(game, w, w.x, w.y, w.dir, (i) => game.owner[i] === w.id, 120);
    const homeD = here ? 0 : (home ? home.d : 99);

    // 1) 危険判断: 敵が自分の軌跡に届くより先に帰れないなら即帰還
    const threat = w.trailLen > 0 ? game.threat(w) : Infinity;
    const danger = D.flee && w.trailLen > 0 && threat <= homeD + D.margin;
    // 遠征の長さ: 近くに敵がいるほど短く、いなければ大きく囲う
    if (here) {
      const enemy = nearestEnemy(game, w);
      ai.limit = Math.max(D.trail[0], Math.min(D.trail[1], Math.round(enemy * D.greed)));
    }
    if (home && (danger || w.trailLen + homeD > ai.limit)) {
      if (D.dash && (danger || w.trailLen > ai.limit + 6)) game.dash(w.id);
      steer(game, w, [home.dir], here);
      return;
    }

    // 2) 攻撃: 他者の軌跡に先に届くなら切りに行く(むずかしいはプレイヤー優先)
    if (w.trailLen < D.attackMaxTrail) {
      const isPrey = (i) => game.trail[i] !== -1 && game.trail[i] !== w.id;
      const prey = bfs(game, w, w.x, w.y, w.dir, D.huntPlayer
        ? (i) => game.trail[i] === 0 : isPrey, D.preyRange) ||
        (D.huntPlayer ? bfs(game, w, w.x, w.y, w.dir, isPrey, D.preyRange) : null);
      if (prey && rng() < D.prey) {
        const victim = game.warriors[game.trail[prey.i]];
        // 相手が自陣へ戻る(=軌跡が消える)より先に届きそうなときだけ切りに行く
        const vh = bfs(game, victim, victim.x, victim.y, victim.dir, (i) => game.owner[i] === victim.id, 80);
        const vHome = vh ? vh.d : 99;
        if (prey.d <= vHome + D.chase) {
          if (D.dash && prey.d <= 9) game.dash(w.id);
          steer(game, w, [prey.dir], here);
          return;
        }
      }
    }

    // 3) 千両箱: 経路で近いものを取りに行く
    const item = bfs(game, w, w.x, w.y, w.dir, (i) => game.items.some((t) => idx(t.x, t.y) === i), D.item);
    if (item && w.trailLen + item.d < ai.limit + 10) { steer(game, w, [item.dir], here); return; }

    // 4) 通常: 自陣から出て矩形を描いて戻る
    if (here) {
      // 自陣内: 一番近い自陣の外へ出る(ランダムに向きを変えて広がる)
      if (ai.legLen <= 0 || rng() < 0.15) {
        ai.want = Math.floor(rng() * 4); ai.legLen = 3 + Math.floor(rng() * 4);
      }
      const out = bfs(game, w, w.x, w.y, w.dir, (i) => game.owner[i] !== w.id && !game.wall[i], 40);
      steer(game, w, out && rng() < 0.6 ? [out.dir, ai.want] : [ai.want], here);
      ai.legLen--;
      return;
    }
    if (ai.legLen <= 0) {
      // 軌跡の長さに応じて曲がる: 外向き→横→戻る の順で四角く囲う
      ai.legLen = Math.max(2, Math.round(ai.limit / 4) + Math.floor(rng() * 3) - 1);
      ai.want = (w.dir + (rng() < 0.5 ? 1 : 3)) % 4;
    }
    ai.legLen--;
    steer(game, w, [ai.want, w.dir], here);
  }

  // dashOnly=true: ダッシュ中のCPUだけ考える(半拍の追加移動用)
  G.cpuThink = function (game, dashOnly = false) {
    for (const w of game.warriors) if (w.isCpu && w.alive && (!dashOnly || w.dash > 0)) think(game, w);
  };
})(globalThis.PG);
