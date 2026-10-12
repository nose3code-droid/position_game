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
