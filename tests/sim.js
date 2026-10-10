// CPUだけで長時間シミュレーションし、例外やルール破綻が無いか確認する
require('../src/config.js'); require('../src/game.js'); require('../src/cpu.js');
const G = globalThis.PG;
let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let kills = 0, maxPct = 0;
for (let m = 0; m < 20; m++) {
  const g = new G.Game(rng);
  g.warriors[0].isCpu = true; // プレイヤー枠もCPUに
  for (let t = 0; t < 1100 && !g.over; t++) {
    G.cpuThink(g); g.step(); g.tick(G.CONFIG.STEP_MS);
    for (const e of g.events.splice(0)) if (e.killer >= 0) kills++;
  }
  maxPct = Math.max(maxPct, ...g.scores());
}
console.log('OK kills=%d maxTerritory=%s%', kills, maxPct.toFixed(1));
