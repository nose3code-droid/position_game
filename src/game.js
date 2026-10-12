// [担当: ゲームロジック] 陣取りルール本体(描画・入力に依存しない)
(function (G) {
  const { CONFIG: C, DIRS } = G;
  const N = C.COLS * C.ROWS;
  const idx = (x, y) => y * C.COLS + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < C.COLS && y < C.ROWS;

  class Game {
    constructor(rng = Math.random) {
      this.rng = rng;
      this.owner = new Int8Array(N).fill(-1); // 陣地の持ち主
      this.trail = new Int8Array(N).fill(-1); // 通った道(軌跡)の持ち主
      this.wall = new Uint8Array(N);          // 壁(mapdata.js)。進入すると倒れる
      (G.MAP_WALLS || []).forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') this.wall[idx(x, y)] = 1; }));
      this.free = N - this.wall.reduce((a, b) => a + b, 0);
      this.items = [];        // 落ちているアイテム {x, y}
      this.itemTimers = [];   // 再出現待ち(ms)
      this.timeLeft = C.MATCH_SEC * 1000;
      this.over = false;
      this.events = []; // 'kill' 等をUIが拾う
      this.warriors = C.WARRIORS.slice(0, 1 + C.CPU_COUNT).map((w, id) => ({
        id, name: w.name, color: w.color, isCpu: id > 0,
        alive: false, x: 0, y: 0, dir: 1, nextDir: 1, trailLen: 0,
        respawnIn: 0, kills: 0, ai: null, shield: 0,
        dash: 0, dashCd: 0, trailCells: [], maxPct: 0, items: 0, bestCapture: 0,
      }));
      this.warriors.forEach((w) => this.spawn(w));
      for (let i = 0; i < C.ITEM_COUNT; i++) this.spawnItem();
    }

    spawnItem() {
      for (let tries = 0; tries < 300; tries++) {
        const x = 1 + Math.floor(this.rng() * (C.COLS - 2)), y = 1 + Math.floor(this.rng() * (C.ROWS - 2));
        const i = idx(x, y);
        if (this.wall[i] || this.trail[i] !== -1 || this.items.some((t) => t.x === x && t.y === y)) continue;
        if (this.warriors.some((w) => w.alive && Math.abs(w.x - x) + Math.abs(w.y - y) < 4)) continue;
        this.items.push({ x, y });
        return true;
      }
      return false;
    }

    // アイテム取得: 周囲(円形)の陣地を奪う。範囲内の他者の軌跡は断たれる
    pickItem(w, k) {
      const [item] = this.items.splice(k, 1);
      this.itemTimers.push(C.ITEM_RESPAWN_MS);
      const R = C.ITEM_RADIUS;
      let gained = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + 1) continue;
        const x = item.x + dx, y = item.y + dy;
        if (!inside(x, y)) continue;
        const i = idx(x, y);
        if (this.wall[i]) continue;
        const t = this.trail[i];
        if (t !== -1 && t !== w.id) { this.kill(this.warriors[t], w, false, 'item'); if (this.trail[i] === t) continue; }
        if (this.owner[i] !== w.id) gained++;
        this.owner[i] = w.id;
      }
      w.items++;
      this.events.push({ type: 'item', who: w.id, x: item.x, y: item.y, gained });
      if (w.trailLen > 0) this.capture(w); // 取得地点は自陣になるので、軌跡があれば閉じて囲い込む
    }


    spawn(w) {
      const s = C.SPAWN_SIZE;
      for (let tries = 0; tries < 500; tries++) {
        const x = 2 + Math.floor(this.rng() * (C.COLS - s - 4));
        const y = 2 + Math.floor(this.rng() * (C.ROWS - s - 4));
        let ok = true;
        for (let j = -1; j <= s && ok; j++)
          for (let i = -1; i <= s; i++)
            if (!inside(x + i, y + j) || this.wall[idx(x + i, y + j)] || this.owner[idx(x + i, y + j)] !== -1 || this.trail[idx(x + i, y + j)] !== -1) { ok = false; break; }
        if (!ok) continue;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.owner[idx(x + i, y + j)] = w.id;
        w.x = x + 1; w.y = y + 1;
        w.dir = w.nextDir = this.openDir(w.x, w.y);
        w.alive = true; w.trailLen = 0; w.trailCells = []; w.ai = null; w.shield = C.SHIELD_STEPS;
        w.dash = 0; w.dashCd = 0;
        return;
      }
      w.respawnIn = 1000; // 空きが無ければ後で再試行
    }

    // 壁までの距離が最も長い向き(出現直後に壁へ突っ込まないように)
    openDir(x, y) {
      let best = 0, bd = -1;
      for (let d = 0; d < 4; d++) {
        let n = 0, cx = x, cy = y;
        while (n < 30) {
          cx += DIRS[d].x; cy += DIRS[d].y;
          if (!inside(cx, cy) || this.wall[idx(cx, cy)]) break;
          n++;
        }
        n += this.rng() * 3; // 同程度なら少しばらつかせる
        if (n > bd) { bd = n; best = d; }
      }
      return best;
    }

    setDir(id, d) {
      const w = this.warriors[id];
      if (!w.alive) return;
      if ((d + 2) % 4 === w.dir) return; // 真後ろ(Uターン)は不可
      w.nextDir = d;
    }

    // ダッシュ: しばらく2倍速。使用後はクールダウン
    dash(id) {
      const w = this.warriors[id];
      if (!w.alive || w.dashCd > 0 || w.dash > 0) return false;
      w.dash = C.DASH_STEPS; w.dashCd = C.DASH_COOLDOWN_MS;
      this.events.push({ type: 'dash', who: id });
      return true;
    }

    // 自分の軌跡に一番近い敵の頭までの距離(軌跡が無ければ Infinity)
    threat(w) {
      let best = Infinity;
      for (const e of this.warriors) {
        if (e === w || !e.alive) continue;
        for (const i of w.trailCells) {
          if (this.trail[i] !== w.id) continue;
          const d = Math.abs((i % C.COLS) - e.x) + Math.abs(((i / C.COLS) | 0) - e.y);
          if (d < best) best = d;
        }
      }
      return best;
    }

    kill(w, killer, force = false, reason = 'cut') {
      if (!w.alive) return;
      if (w.shield > 0 && !force) return; // 保護中は倒されない
      w.alive = false;
      for (let i = 0; i < N; i++) {
        if (this.owner[i] === w.id) this.owner[i] = -1;
        if (this.trail[i] === w.id) this.trail[i] = -1;
      }
      w.trailLen = 0; w.trailCells = []; w.dash = 0;
      w.respawnIn = C.RESPAWN_MS;
      if (killer && killer !== w) killer.kills++;
      this.events.push({ type: 'kill', victim: w.id, killer: killer && killer !== w ? killer.id : -1, x: w.x, y: w.y, reason });
    }

    // 1マス進める。dashOnly=true のときはダッシュ中の戦士だけが追加で1マス進む(半拍)
    step(dashOnly = false) {
      if (this.over) return;
      const moves = [];
      for (const w of this.warriors) {
        if (!w.alive) continue;
        if (dashOnly) { if (w.dash <= 0) continue; w.dash--; }
        w.dir = w.nextDir;
        const nx = w.x + DIRS[w.dir].x, ny = w.y + DIRS[w.dir].y;
        moves.push({ w, nx, ny });
      }
      const dead = [];
      if (!dashOnly) for (const m of moves) if (m.w.shield > 0) m.w.shield--;
      for (const m of moves) {
        const { w, nx, ny } = m;
        if (!inside(nx, ny) || this.wall[idx(nx, ny)]) { dead.push([w, null, true, 'wall']); continue; }
        const t = this.trail[idx(nx, ny)];
        if (t !== -1) dead.push([this.warriors[t], w, false, t === w.id ? 'self' : 'cut']); // 軌跡を断たれた側が倒れる
      }
      for (const a of moves) for (const b of moves) // 正面衝突は相打ち(自陣内で軌跡の無い戦士は対象外)
        if (a.w.id < b.w.id && a.nx === b.nx && a.ny === b.ny && a.w.trailLen > 0 && b.w.trailLen > 0) { dead.push([a.w, b.w, false, 'headon']); dead.push([b.w, a.w, false, 'headon']); }
      for (const [v, k, force, why] of dead) this.kill(v, k, force, why);

      for (const { w, nx, ny } of moves) {
        if (!w.alive) continue;
        w.x = nx; w.y = ny;
        const i = idx(nx, ny);
        const k = this.items.findIndex((t) => t.x === nx && t.y === ny);
        if (k >= 0) this.pickItem(w, k);
        if (!w.alive) continue; // アイテム取得の影響で倒れた場合
        if (this.owner[i] === w.id) {
          if (w.trailLen > 0) this.capture(w);
        } else {
          this.trail[i] = w.id; w.trailLen++; w.trailCells.push(i);
        }
      }
    }

    // 軌跡を陣地化し、囲んだ内側を塗る。
    // 自陣と壁で区切られた空き地のうち、最大の領域(外側)以外を囲い込んだ領域として塗る
    capture(w) {
      let gained = 0;
      for (let i = 0; i < N; i++) if (this.trail[i] === w.id) {
        this.trail[i] = -1;
        if (this.owner[i] !== w.id) gained++;
        this.owner[i] = w.id;
      }
      w.trailLen = 0; w.trailCells = [];
      const done = () => {
        if (gained > w.bestCapture) w.bestCapture = gained;
        this.events.push({ type: 'capture', who: w.id, x: w.x, y: w.y, gained });
      };
      const comp = new Int32Array(N).fill(-1), sizes = [];
      for (let s0 = 0; s0 < N; s0++) {
        if (comp[s0] !== -1 || this.wall[s0] || this.owner[s0] === w.id) continue;
        const c = sizes.length, stack = [s0]; comp[s0] = c; let n = 0;
        while (stack.length) {
          const i = stack.pop(); n++;
          const x = i % C.COLS, y = (i / C.COLS) | 0;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (!inside(nx, ny)) continue;
            const j = idx(nx, ny);
            if (comp[j] !== -1 || this.wall[j] || this.owner[j] === w.id) continue;
            comp[j] = c; stack.push(j);
          }
        }
        sizes.push(n);
      }
      if (sizes.length < 2) return done();
      const outer = sizes.indexOf(Math.max(...sizes));
      for (let i = 0; i < N; i++) {
        if (comp[i] === -1 || comp[i] === outer) continue;
        const t = this.trail[i];
        if (t !== -1 && t !== w.id) this.kill(this.warriors[t], w, false, 'enclose'); // 囲い込まれた他者の軌跡 → その戦士を倒す
        if (this.owner[i] !== w.id) gained++;
        this.owner[i] = w.id;
      }
      done();
    }

    // 時間経過(ms)。CPU復活・タイマー管理
    tick(dt) {
      if (this.over) return;
      this.timeLeft -= dt;
      for (const w of this.warriors) if (w.dashCd > 0) w.dashCd -= dt;
      const pct = this.scores();
      for (const w of this.warriors) if (pct[w.id] > w.maxPct) w.maxPct = pct[w.id];
      for (const w of this.warriors) {
        if (w.alive || w.respawnIn <= 0) continue;
        if (w.isCpu && C.CPU_RESPAWN) {
          w.respawnIn -= dt;
          if (w.respawnIn <= 0) this.spawn(w);
        }
      }
      for (let k = this.itemTimers.length - 1; k >= 0; k--) {
        this.itemTimers[k] -= dt;
        if (this.itemTimers[k] <= 0 && this.spawnItem()) this.itemTimers.splice(k, 1);
        else if (this.itemTimers[k] <= 0) this.itemTimers[k] = 1000;
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.over = true; }
      if (!this.warriors[0].alive) this.over = true; // プレイヤーが倒れたら終了
      // CPUを全滅させたら勝利で終了(残り時間はボーナス)
      if (!C.CPU_RESPAWN && this.warriors[0].alive && !this.warriors[0].isCpu &&
          this.warriors.every((w) => w.id === 0 || !w.alive)) {
        this.over = true; this.cleared = true;
        this.clearBonus = Math.ceil(this.timeLeft / 1000) * C.SCORE_CLEAR_PER_SEC;
      }
    }

    // 点数 = 陣地マス数 x SCORE_CELL + 撃破数 x SCORE_KILL
    points() {
      const cnt = new Array(this.warriors.length).fill(0);
      for (let i = 0; i < N; i++) if (this.owner[i] >= 0) cnt[this.owner[i]]++;
      return cnt.map((c, id) => c * C.SCORE_CELL + this.warriors[id].kills * C.SCORE_KILL + (id === 0 ? this.clearBonus || 0 : 0));
    }

    scores() {
      const cnt = new Array(this.warriors.length).fill(0);
      for (let i = 0; i < N; i++) if (this.owner[i] >= 0) cnt[this.owner[i]]++;
      return cnt.map((c) => (c / this.free) * 100);
    }
  }

  G.Game = Game;
  G.idx = idx; G.inside = inside;
})(globalThis.PG);
