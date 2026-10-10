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
      this.timeLeft = C.MATCH_SEC * 1000;
      this.over = false;
      this.events = []; // 'kill' 等をUIが拾う
      this.warriors = C.WARRIORS.slice(0, 1 + C.CPU_COUNT).map((w, id) => ({
        id, name: w.name, color: w.color, isCpu: id > 0,
        alive: false, x: 0, y: 0, dir: 1, nextDir: 1, trailLen: 0,
        respawnIn: 0, kills: 0, ai: null,
      }));
      this.warriors.forEach((w) => this.spawn(w));
    }

    spawn(w) {
      const s = C.SPAWN_SIZE;
      for (let tries = 0; tries < 500; tries++) {
        const x = 2 + Math.floor(this.rng() * (C.COLS - s - 4));
        const y = 2 + Math.floor(this.rng() * (C.ROWS - s - 4));
        let ok = true;
        for (let j = -1; j <= s && ok; j++)
          for (let i = -1; i <= s; i++)
            if (!inside(x + i, y + j) || this.owner[idx(x + i, y + j)] !== -1 || this.trail[idx(x + i, y + j)] !== -1) { ok = false; break; }
        if (!ok) continue;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.owner[idx(x + i, y + j)] = w.id;
        w.x = x + 1; w.y = y + 1; w.dir = w.nextDir = Math.floor(this.rng() * 4);
        w.alive = true; w.trailLen = 0; w.ai = null;
        return;
      }
      w.respawnIn = 1000; // 空きが無ければ後で再試行
    }

    setDir(id, d) {
      const w = this.warriors[id];
      if (!w.alive) return;
      if ((d + 2) % 4 === w.dir) return; // 真後ろ(Uターン)は不可
      w.nextDir = d;
    }

    kill(w, killer) {
      if (!w.alive) return;
      w.alive = false;
      for (let i = 0; i < N; i++) {
        if (this.owner[i] === w.id) this.owner[i] = -1;
        if (this.trail[i] === w.id) this.trail[i] = -1;
      }
      w.trailLen = 0;
      w.respawnIn = C.RESPAWN_MS;
      if (killer && killer !== w) killer.kills++;
      this.events.push({ type: 'kill', victim: w.id, killer: killer ? killer.id : -1 });
    }

    // 1マス進める
    step() {
      if (this.over) return;
      const moves = [];
      for (const w of this.warriors) {
        if (!w.alive) continue;
        w.dir = w.nextDir;
        const nx = w.x + DIRS[w.dir].x, ny = w.y + DIRS[w.dir].y;
        moves.push({ w, nx, ny });
      }
      const dead = [];
      for (const m of moves) {
        const { w, nx, ny } = m;
        if (!inside(nx, ny)) { dead.push([w, null]); continue; }
        const t = this.trail[idx(nx, ny)];
        if (t !== -1) dead.push([this.warriors[t], w]); // 軌跡を断たれた側が倒れる
      }
      for (const a of moves) for (const b of moves) // 正面衝突は相打ち
        if (a.w.id < b.w.id && a.nx === b.nx && a.ny === b.ny) { dead.push([a.w, b.w]); dead.push([b.w, a.w]); }
      for (const [v, k] of dead) this.kill(v, k);

      for (const { w, nx, ny } of moves) {
        if (!w.alive) continue;
        w.x = nx; w.y = ny;
        const i = idx(nx, ny);
        if (this.owner[i] === w.id) {
          if (w.trailLen > 0) this.capture(w);
        } else {
          this.trail[i] = w.id; w.trailLen++;
        }
      }
    }

    // 軌跡を陣地化し、囲んだ内側を塗る
    capture(w) {
      for (let i = 0; i < N; i++) if (this.trail[i] === w.id) { this.trail[i] = -1; this.owner[i] = w.id; }
      w.trailLen = 0;
      const outside = new Uint8Array(N);
      const stack = [];
      const push = (x, y) => {
        if (!inside(x, y)) return;
        const i = idx(x, y);
        if (outside[i] || this.owner[i] === w.id) return;
        outside[i] = 1; stack.push(i);
      };
      for (let x = 0; x < C.COLS; x++) { push(x, 0); push(x, C.ROWS - 1); }
      for (let y = 0; y < C.ROWS; y++) { push(0, y); push(C.COLS - 1, y); }
      while (stack.length) {
        const i = stack.pop(), x = i % C.COLS, y = (i / C.COLS) | 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
      }
      for (let i = 0; i < N; i++) {
        if (outside[i] || this.owner[i] === w.id) continue;
        const t = this.trail[i];
        if (t !== -1 && t !== w.id) { // 囲い込まれた他者の軌跡 → その戦士を倒す
          this.kill(this.warriors[t], w);
        }
        this.owner[i] = w.id;
      }
    }

    // 時間経過(ms)。CPU復活・タイマー管理
    tick(dt) {
      if (this.over) return;
      this.timeLeft -= dt;
      for (const w of this.warriors) {
        if (w.alive || w.respawnIn <= 0) continue;
        if (w.isCpu || false) {
          w.respawnIn -= dt;
          if (w.respawnIn <= 0) this.spawn(w);
        }
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.over = true; }
      if (!this.warriors[0].alive) this.over = true; // プレイヤーが倒れたら終了
    }

    scores() {
      const cnt = new Array(this.warriors.length).fill(0);
      for (let i = 0; i < N; i++) if (this.owner[i] >= 0) cnt[this.owner[i]]++;
      return cnt.map((c) => (c / N) * 100);
    }
  }

  G.Game = Game;
  G.idx = idx; G.inside = inside;
})(globalThis.PG);
