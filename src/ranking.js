// [担当: ランキング] 自分の記録(ブラウザ内に保存)と世界ランキング(Supabase。設定で有効化)
// 世界ランキングの準備手順は docs/RANKING.md
(function (G) {
  const { CONFIG: C } = G;
  const KEY = 'position_game_ranking_v1';
  const MAX_LOCAL = 50;
  const DIFFS = ['easy', 'normal', 'hard'];

  function loadLocal() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((e) => e && Number.isFinite(e.score) && DIFFS.includes(e.difficulty)) : [];
    } catch (e) { return []; }
  }
  function saveLocal(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 保存できなくても続行 */ } }

  // 世界ランキングの設定(config.js の WORLD_RANKING)
  const cfg = () => C.WORLD_RANKING || {};
  const worldEnabled = () => !!(cfg().enabled && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg().url || '') && cfg().anonKey);
  function headers() {
    const k = cfg().anonKey;
    return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
  }
  function withTimeout(p, ms = 8000) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }
  const cleanName = (n) => (typeof n === 'string' ? n : '').replace(/[\u0000-\u001f\u007f<>\[\]|]/g, '').trim().slice(0, 10);

  G.ranking = {
    DIFFS,
    worldEnabled,
    // 自分の記録: 追加して、その難易度での順位(1始まり。圏外なら 0)を返す
    addLocal(entry) {
      const list = loadLocal();
      const e = { ...entry, at: Date.now() };
      list.push(e);
      const out = [];
      for (const d of DIFFS) out.push(...list.filter((x) => x.difficulty === d).sort((a, b) => b.score - a.score).slice(0, MAX_LOCAL));
      saveLocal(out);
      const ranked = out.filter((x) => x.difficulty === e.difficulty).sort((a, b) => b.score - a.score);
      return ranked.indexOf(ranked.find((x) => x.at === e.at && x.score === e.score)) + 1;
    },
    local(difficulty, limit = 20) {
      return loadLocal().filter((e) => e.difficulty === difficulty).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    // 世界ランキングの上位を取得
    async world(difficulty, limit = 50) {
      if (!worldEnabled()) throw new Error('disabled');
      if (!DIFFS.includes(difficulty)) throw new Error('bad difficulty');
      const q = `select=name,score,territory,kills,cleared,created_at&difficulty=eq.${difficulty}&order=score.desc,created_at.asc&limit=${limit | 0}`;
      const r = await withTimeout(fetch(`${cfg().url}/rest/v1/${cfg().table || 'scores'}?${q}`, { headers: headers() }));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('bad data');
      // 届いた値はそのまま信用せず整形する(表示は textContent で行う)
      return rows.map((x) => ({
        name: cleanName(x && x.name) || '名無し', score: Math.max(0, Math.floor(Number(x && x.score) || 0)),
        territory: Number(x && x.territory) || 0, kills: Math.floor(Number(x && x.kills) || 0), cleared: !!(x && x.cleared),
        at: Date.parse(x && x.created_at) || 0,
      }));
    },
    // 世界ランキングへ登録(本人がボタンを押したときだけ送る)
    async submit(entry) {
      if (!worldEnabled()) throw new Error('disabled');
      const name = cleanName(entry.name);
      if (!name) throw new Error('name');
      const body = {
        name, score: Math.floor(entry.score), difficulty: entry.difficulty,
        territory: Math.round(entry.territory * 10) / 10, kills: entry.kills | 0, cleared: !!entry.cleared,
      };
      const r = await withTimeout(fetch(`${cfg().url}/rest/v1/${cfg().table || 'scores'}`, {
        method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' }, body: JSON.stringify(body),
      }));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return true;
    },
    cleanName,
  };
})(globalThis.PG);
