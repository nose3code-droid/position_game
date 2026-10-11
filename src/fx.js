// [担当: 演出] パーティクル・画面の揺れ・ポップアップ文字・実況(キルフィード)・中央バナー
(function (G) {
  const { CONFIG: C } = G;
  const parts = [], pops = [], feed = [];
  let shake = 0, banner = null;

  G.fx = {
    clear() { parts.length = pops.length = feed.length = 0; shake = 0; banner = null; },
    // 画面の揺れ(強さ px)。小・中・大で使い分ける
    shake(power) { shake = Math.max(shake, power); },
    // パーティクル(セル座標)
    burst(cx, cy, color, n = 16, speed = 3) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
        parts.push({ x: (cx + 0.5) * C.CELL, y: (cy + 0.5) * C.CELL, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1,
          life: 1, decay: 0.02 + Math.random() * 0.03, size: 2 + Math.random() * 4, color });
      }
    },
    // 浮かび上がる文字(セル座標)
    pop(cx, cy, text, color = '#fff', size = 20) {
      pops.push({ x: (cx + 0.5) * C.CELL, y: cy * C.CELL, text, color, size, t0: performance.now() });
    },
    // 画面右下の実況
    log(html) { feed.push({ html, t0: performance.now() }); if (feed.length > 5) feed.shift(); },
    // 画面中央の大きな文字
    banner(text, color = '#fff', ms = 1200, sub = '') { banner = { text, color, sub, t0: performance.now(), ms }; },

    offset() {
      if (shake < 0.3) return [0, 0];
      const o = [(Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake];
      return o;
    },

    // ワールド座標で描くもの(cx, cy はカメラ位置)
    drawWorld(ctx, cx, cy) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97; p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x - cx - p.size / 2, p.y - cy - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      const now = performance.now();
      ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], k = (now - p.t0) / 1100;
        if (k >= 1) { pops.splice(i, 1); continue; }
        const scale = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15)); // ポンと出る
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.font = `bold ${Math.round(p.size * scale)}px 'DotGothic16', sans-serif`;
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.fillStyle = p.color;
        const y = p.y - cy - 20 - k * 30;
        ctx.strokeText(p.text, p.x - cx, y); ctx.fillText(p.text, p.x - cx, y);
      }
      ctx.globalAlpha = 1;
    },

    // 画面座標で描くもの
    drawScreen(ctx, W, H) {
      shake *= 0.85;
      const now = performance.now();
      ctx.save();
      ctx.textAlign = 'right'; ctx.font = "bold 15px 'DotGothic16', sans-serif";
      let y = H - 12;
      for (let i = feed.length - 1; i >= 0; i--) {
        const f = feed[i], k = (now - f.t0) / 4500;
        if (k >= 1) { feed.splice(i, 1); continue; }
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        // html 風の簡易記法: [色|文字]
        const segs = f.html.split(/(\[[^\]]+\])/).filter(Boolean);
        let x = W - 12;
        for (let s = segs.length - 1; s >= 0; s--) {
          const m = segs[s].match(/^\[(#[0-9a-f]{6})\|(.*)\]$/i);
          const text = m ? m[2] : segs[s];
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const w = ctx.measureText(text).width;
          ctx.fillRect(x - w - 2, y - 15, w + 4, 20);
          ctx.fillStyle = m ? m[1] : '#fff';
          ctx.fillText(text, x, y);
          x -= w;
        }
        y -= 24;
      }
      if (banner) {
        const k = (now - banner.t0) / banner.ms;
        if (k >= 1) banner = null;
        else {
          const scale = k < 0.12 ? 0.5 + k / 0.12 * 0.7 : k < 0.25 ? 1.2 - (k - 0.12) / 0.13 * 0.2 : 1;
          ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
          ctx.textAlign = 'center'; ctx.lineJoin = 'round';
          ctx.font = `900 ${Math.round(64 * scale)}px 'DotGothic16', sans-serif`;
          ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.fillStyle = banner.color;
          ctx.strokeText(banner.text, W / 2, H / 2 - 20); ctx.fillText(banner.text, W / 2, H / 2 - 20);
          if (banner.sub) {
            ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.lineWidth = 5; ctx.fillStyle = '#fff';
            ctx.strokeText(banner.sub, W / 2, H / 2 + 24); ctx.fillText(banner.sub, W / 2, H / 2 + 24);
          }
        }
      }
      ctx.restore();
    },
  };
})(globalThis.PG);
