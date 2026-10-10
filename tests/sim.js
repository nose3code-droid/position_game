// CPUだけで長時間シミュレーションし、例外やルール破綻が無いか確認する
require('../src/config.js'); require('../src/mapdata.js'); require('../src/game.js'); require('../src/cpu.js');
const G = globalThis.PG;
let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let kills = 0, maxPct = 0, items = 0, itemCells = 0;
for (let m = 0; m < 20; m++) {
  const g = new G.Game(rng);
  g.warriors[0].isCpu = true; // プレイヤー枠もCPUに
  for (let t = 0; t < 1100 && !g.over; t++) {
    G.cpuThink(g); g.step(); g.tick(G.CONFIG.STEP_MS);
    for (const e of g.events.splice(0)) { if (e.type === 'kill' && e.killer >= 0) kills++; if (e.type === 'item') { items++; itemCells += e.gained; } }
  }
  maxPct = Math.max(maxPct, ...g.scores());
}
console.log('OK kills=%d items=%d avgGain=%s maxTerritory=%s%', kills, items, (itemCells / Math.max(1, items)).toFixed(1), maxPct.toFixed(1));
