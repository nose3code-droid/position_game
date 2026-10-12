// CPUだけで長時間シミュレーションし、例外やルール破綻が無いか確認する(難易度別)
require('../src/config.js'); require('../src/mapdata.js'); require('../src/game.js'); require('../src/cpu.js');
const G = globalThis.PG;
let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const diff of Object.keys(G.CONFIG.DIFFICULTY)) {
  let kills = 0, deaths = 0, maxPct = 0, items = 0, captures = 0, dashes = 0;
  for (let m = 0; m < 15; m++) {
    const g = new G.Game(rng);
    g.difficulty = diff;
    g.warriors[0].isCpu = true; // プレイヤー枠もCPUに
    for (let t = 0; t < 1700 && !g.over; t++) {
      G.cpuThink(g); g.step(); g.tick(G.CONFIG.STEP_MS);
      G.cpuThink(g, true); g.step(true);
      for (const e of g.events.splice(0)) {
        if (e.type === 'kill') { deaths++; if (e.killer >= 0) kills++; }
        if (e.type === 'item') items++;
        if (e.type === 'capture') captures++;
        if (e.type === 'dash') dashes++;
      }
      // 整合性: 軌跡と陣地が壁に乗っていない
      if (t % 200 === 0) for (let i = 0; i < g.wall.length; i++)
        if (g.wall[i] && (g.owner[i] !== -1 || g.trail[i] !== -1)) throw new Error('壁の上に陣地/軌跡');
    }
    maxPct = Math.max(maxPct, ...g.scores());
  }
  console.log(`OK ${diff}: deaths=${deaths} kills=${kills} captures=${captures} items=${items} dashes=${dashes} maxTerritory=${maxPct.toFixed(1)}%`);
}

// CPUは復活しない / 全滅させたら勝利で終了し、残り時間ボーナスが入る
{
  const g = new G.Game(rng);
  const before = g.points()[0];
  for (const w of g.warriors) if (w.isCpu) g.kill(w, g.warriors[0], true);
  for (let t = 0; t < 100; t++) g.tick(G.CONFIG.STEP_MS); // 復活待ち時間を過ぎても…
  if (g.warriors.some((w) => w.isCpu && w.alive)) throw new Error('CPUが復活した');
  if (!g.over || !g.cleared) throw new Error('全滅で終了していない');
  if (g.points()[0] !== before + 3 * G.CONFIG.SCORE_KILL + g.clearBonus || g.clearBonus <= 0) throw new Error('ボーナス計算');
  console.log(`OK no-respawn & clear: bonus=${g.clearBonus}`);
}

// 囲い込み: 外周に沿って大きく囲むと内側が全部取れ、内側の敵は消える
{
  const { COLS, ROWS } = G.CONFIG;
  const g = new G.Game(rng);
  const me = g.warriors[0], foe = g.warriors[1];
  g.owner.fill(-1); g.trail.fill(-1);
  const x0 = 3, y0 = 3, x1 = COLS - 4, y1 = ROWS - 4;   // 外周の壁のすぐ内側
  for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) g.owner[G.idx(x, y)] = 0;
  me.trailCells = [];
  const ring = [];
  for (let x = x0; x <= x1; x++) ring.push([x, y0], [x, y1]);
  for (let y = y0; y <= y1; y++) ring.push([x0, y], [x1, y]);
  for (const [x, y] of ring) { const i = G.idx(x, y); if (g.wall[i]) throw new Error('リングが壁に重なる'); if (g.owner[i] !== 0) { g.trail[i] = 0; me.trailCells.push(i); } }
  me.trailLen = me.trailCells.length;
  // 内側の中央付近に敵(自陣つき・保護中でも消える)
  let fx = (COLS / 2) | 0, fy = (ROWS / 2) | 0;
  while (g.wall[G.idx(fx, fy)]) fx++;
  foe.x = fx; foe.y = fy; foe.shield = 10; g.owner[G.idx(fx, fy)] = 1;
  me.x = x0; me.y = y0;
  g.capture(me);
  let free = 0, mineCnt = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = G.idx(x, y); if (!g.wall[i]) { free++; if (g.owner[i] === 0) mineCnt++; } }
  if (mineCnt !== free) throw new Error(`内側が取れていない ${mineCnt}/${free}`);
  if (foe.alive) throw new Error('囲われた敵が消えていない');
  console.log(`OK 外周囲い: ${mineCnt}マス獲得 / 囲われた敵は撃破`);
}
// 囲い込み: 小さな輪は内側だけ取り、外側は取らない
{
  const g = new G.Game(rng);
  const me = g.warriors[0];
  g.owner.fill(-1); g.trail.fill(-1);
  let bx = 20, by = 20;
  const ok = (x, y) => !g.wall[G.idx(x, y)];
  outer: for (by = 6; by < 60; by++) for (bx = 6; bx < 100; bx++) {
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) if (!ok(x, y)) continue outer;
    break outer;
  }
  for (let y = by; y < by + 2; y++) for (let x = bx; x < bx + 2; x++) g.owner[G.idx(x, y)] = 0;
  me.trailCells = [];
  for (let x = bx; x < bx + 7; x++) for (const y of [by, by + 6]) { const i = G.idx(x, y); if (g.owner[i] !== 0) { g.trail[i] = 0; me.trailCells.push(i); } }
  for (let y = by; y < by + 7; y++) for (const x of [bx, bx + 6]) { const i = G.idx(x, y); if (g.owner[i] !== 0) { g.trail[i] = 0; me.trailCells.push(i); } }
  me.trailLen = me.trailCells.length;
  g.capture(me);
  const cnt = g.owner.reduce((a, o) => a + (o === 0 ? 1 : 0), 0);
  if (cnt !== 49) throw new Error(`小さな輪の獲得数が不正 ${cnt}`);
  console.log('OK 小さな輪: 7x7=49マス');
}

// 外周の壁も囲いになる: 壁沿いの小さなポケット / 壁から壁への仕切りは狭い側を取る
{
  const { COLS } = G.CONFIG;
  const setup = () => { const g = new G.Game(rng); g.owner.fill(-1); g.trail.fill(-1); g.warriors[0].trailCells = []; return g; };
  const addTrail = (g, x, y) => { const i = G.idx(x, y); if (g.wall[i]) throw new Error('壁'); g.trail[i] = 0; g.warriors[0].trailCells.push(i); g.warriors[0].trailLen++; };
  // ポケット: 上の外周の壁・自陣・線で囲まれた (12..15, 3) の4マス
  let g = setup();
  for (const [x, y] of [[10, 3], [11, 3], [10, 4], [11, 4]]) g.owner[G.idx(x, y)] = 0;
  for (let x = 12; x <= 16; x++) addTrail(g, x, 4);
  addTrail(g, 16, 3);
  g.capture(g.warriors[0]);
  const pocket = [12, 13, 14, 15].every((x) => g.owner[G.idx(x, 3)] === 0);
  const total = g.owner.reduce((a, o) => a + (o === 0 ? 1 : 0), 0);
  if (!pocket || total !== 14) throw new Error(`壁沿いポケット ${pocket} ${total}`);
  console.log('OK 壁沿いポケット: 14マス');
  // 仕切り: 左の壁沿いの自陣から右の壁まで y=8 に線 → 上側(y=3..7)だけ取る
  g = setup();
  for (const [x, y] of [[3, 8], [4, 8]]) g.owner[G.idx(x, y)] = 0;
  for (let x = 5; x <= COLS - 4; x++) addTrail(g, x, 8);
  const foe = g.warriors[1]; foe.x = 40; foe.y = 5; foe.shield = 0; // 上側にいる敵は消える
  const foe2 = g.warriors[2]; foe2.x = 40; foe2.y = 40; // 下側の敵は無事
  g.capture(g.warriors[0]);
  let up = 0, upFree = 0, down = 0;
  for (let i = 0; i < g.owner.length; i++) {
    const y = (i / COLS) | 0; if (g.wall[i]) continue;
    if (y >= 3 && y <= 7) { upFree++; if (g.owner[i] === 0) up++; }
    if (y >= 9 && g.owner[i] === 0) down++;
  }
  if (up !== upFree || down !== 0 || foe.alive || !foe2.alive) throw new Error(`仕切り up=${up}/${upFree} down=${down} foe=${foe.alive} foe2=${foe2.alive}`);
  console.log(`OK 壁から壁の仕切り: 狭い側 ${up}マス獲得・その中の敵は撃破・反対側は無事`);
}
