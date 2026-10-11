// [担当: 描画・画像] Canvas描画。assets/ の画像があれば使い、無ければ仮描画にフォールバック
(function (G) {
  const { CONFIG: C } = G;
  const images = {};

  const DIR_NAMES = ['up', 'right', 'down', 'left'];

  function load(key, src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { images[key] = im; res(); };
      im.onerror = () => res(); // 無ければ仮描画
      im.src = src;
    });
  }

  G.loadImages = function () {
    const jobs = [load('map', C.MAP_IMAGE), load('item', C.ITEM_IMAGE)];
    C.SPRITES.forEach((name, id) => DIR_NAMES.forEach((d, di) => jobs.push(load(`w${id}_${di}`, `assets/warrior_${name}_${d}.png`))));
    return Promise.all(jobs);
  };

  function drawWarrior(ctx, w, px, py, S) {
    const im = images[`w${w.id}_${w.dir}`];
    if (im) { // 足元をマスの中心付近に置き、進行方向に応じた向きの絵を使う
      const h = S * C.SPRITE_H, ww = h * im.width / im.height;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, px + S / 2 - ww / 2, py + S * 0.8 - h, ww, h);
      ctx.restore(); return;
    }
    // 仮描画: 兜と剣を持った戦士
    const cx = px + S / 2, cy = py + S / 2;
    ctx.fillStyle = '#222'; ctx.fillRect(cx - S * 0.5, cy - S * 0.5, S, S);
    ctx.fillStyle = w.color; ctx.fillRect(cx - S * 0.42, cy - S * 0.42, S * 0.84, S * 0.84);
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(cx - S * 0.42, cy - S * 0.42, S * 0.84, S * 0.35); // 兜
    ctx.fillStyle = '#111'; ctx.fillRect(cx - S * 0.2, cy - S * 0.1, S * 0.4, S * 0.1);
    const d = G.DIRS[w.dir];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; // 剣は進行方向
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + d.x * S * 0.9, cy + d.y * S * 0.9); ctx.stroke();
  }

  const cam = { x: 0, y: 0, init: false };
  const mini = document.createElement('canvas');
  mini.width = C.COLS; mini.height = C.ROWS;
  const mctx = mini.getContext('2d');
  const MINI = 2; // ミニマップの1セルあたりのpx

  // なめらかな移動: 盤面上はマス単位で進むが、表示は前のマスから補間する
  const vis = {};
  function visPos(w, now) {
    let v = vis[w.id];
    if (!v || Math.abs(w.x - v.tx) + Math.abs(w.y - v.ty) > 2) {
      v = vis[w.id] = { x: w.x, y: w.y, fx: w.x, fy: w.y, tx: w.x, ty: w.y, t0: now, dur: 1, trail: [] };
    } else if (w.x !== v.tx || w.y !== v.ty) {
      v.fx = v.x; v.fy = v.y; v.tx = w.x; v.ty = w.y; v.t0 = now;
      v.dur = w.dash > 0 ? C.STEP_MS / 2 : C.STEP_MS;
    }
    const k = Math.min(1, (now - v.t0) / v.dur);
    v.x = v.fx + (v.tx - v.fx) * k; v.y = v.fy + (v.ty - v.fy) * k;
    if (w.dash > 0) { v.trail.push([v.x, v.y]); if (v.trail.length > 6) v.trail.shift(); } else v.trail.length = 0;
    return v;
  }

  function updateCamera(game, now) {
    const S = C.CELL, VW = C.VIEW_COLS * S, VH = C.VIEW_ROWS * S;
    const p = game.warriors[0], v = visPos(p, now);
    const tx = Math.min(Math.max((v.x + 0.5) * S - VW / 2, 0), C.COLS * S - VW);
    const ty = Math.min(Math.max((v.y + 0.5) * S - VH / 2, 0), C.ROWS * S - VH);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x += (tx - cam.x) * 0.25; cam.y += (ty - cam.y) * 0.25;
  }
  G.resetCamera = () => { cam.init = false; for (const k in vis) delete vis[k]; };

  // 取得演出(広がる輪と獲得マス数)
  const effects = [];
  G.addEffect = (x, y, color, r = C.ITEM_RADIUS) => effects.push({ x, y, color, r, t0: performance.now() });
  G.clearEffects = () => { effects.length = 0; };

  function drawItems(ctx, game, cx, cy, S) {
    const now = performance.now();
    for (const t of game.items) {
      const px = t.x * S - cx, py = t.y * S - cy;
      if (px < -S * 3 || py < -S * 4 || px > C.VIEW_COLS * S + S * 3 || py > C.VIEW_ROWS * S + S * 3) continue;
      const bob = Math.sin(now / 250 + t.x * 1.7 + t.y) * 2;
      const im = images.item;
      if (im) {
        const h = S * C.ITEM_H, w = h * im.width / im.height;
        ctx.save(); ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; // 影
        ctx.beginPath(); ctx.ellipse(px + S / 2, py + S * 0.85, w * 0.4, S * 0.25, 0, 0, 7); ctx.fill();
        ctx.drawImage(im, px + S / 2 - w / 2, py + S * 0.85 - h + bob, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f5c542'; ctx.fillRect(px + 2, py + 2 + bob, S - 4, S - 4);
      }
    }
  }

  function drawEffects(ctx, cx, cy, S) {
    const now = performance.now();
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i], k = (now - e.t0) / 900;
      if (k >= 1) { effects.splice(i, 1); continue; }
      const x = (e.x + 0.5) * S - cx, y = (e.y + 0.5) * S - cy;
      ctx.save();
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, (e.r + 0.5) * S * Math.min(1, k * 2.5), 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  function drawMinimap(ctx, game) {
    const img = mctx.createImageData(C.COLS, C.ROWS);
    const rgb = game.warriors.map((w) => [1, 3, 5].map((k) => parseInt(w.color.substr(k, 2), 16)));
    for (let i = 0; i < game.owner.length; i++) {
      let c = [96, 150, 70];
      if (game.wall[i]) c = [50, 58, 74];
      else if (game.owner[i] >= 0) c = rgb[game.owner[i]];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    mctx.putImageData(img, 0, 0);
    const w = C.COLS * MINI, h = C.ROWS * MINI, x0 = C.VIEW_COLS * C.CELL - w - 8, y0 = 8;
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x0, y0, w, h);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    ctx.strokeRect(x0 + (cam.x / C.CELL) * MINI, y0 + (cam.y / C.CELL) * MINI, C.VIEW_COLS * MINI, C.VIEW_ROWS * MINI);
    ctx.fillStyle = '#fbbf24';
    for (const t of game.items) ctx.fillRect(x0 + t.x * MINI, y0 + t.y * MINI, 3, 3);
    for (const wr of game.warriors) if (wr.alive) {
      ctx.fillStyle = wr.color; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(x0 + (wr.x + 0.5) * MINI, y0 + (wr.y + 0.5) * MINI, wr.id === 0 ? 3 : 2, 0, 7);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawOffscreen(ctx, game, cx, cy, S, VW, VH) {
    // 画面外の近くの敵を、画面の縁の矢印で知らせる
    const p = game.warriors[0];
    for (const w of game.warriors) {
      if (w === p || !w.alive) continue;
      const x = (w.x + 0.5) * S - cx, y = (w.y + 0.5) * S - cy;
      if (x > 0 && y > 0 && x < VW && y < VH) continue;
      const d = Math.abs(w.x - p.x) + Math.abs(w.y - p.y);
      if (d > 45) continue;
      const ax = Math.min(Math.max(x, 18), VW - 18), ay = Math.min(Math.max(y, 18), VH - 18);
      const ang = Math.atan2(y - ay, x - ax);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.globalAlpha = 0.5 + 0.5 * (1 - d / 45);
      ctx.fillStyle = w.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawDashGauge(ctx, game, VH) {
    const w = game.warriors[0];
    const x = 12, y = VH - 26, W = 150, H = 14;
    const ready = w.dashCd <= 0;
    const k = w.dash > 0 ? w.dash / C.DASH_STEPS : ready ? 1 : 1 - w.dashCd / C.DASH_COOLDOWN_MS;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 4, y - 20, W + 8, H + 26);
    ctx.fillStyle = '#333'; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = w.dash > 0 ? '#f97316' : ready ? '#22d3ee' : '#64748b'; ctx.fillRect(x, y, W * k, H);
    ctx.fillStyle = '#fff'; ctx.font = "bold 13px 'DotGothic16', sans-serif"; ctx.textAlign = 'left';
    ctx.fillText(w.dash > 0 ? 'ダッシュ中!' : ready ? 'ダッシュOK [Shift]' : 'ダッシュ充電中…', x, y - 6);
    ctx.restore();
  }

  G.render = function (ctx, game) {
    const S = C.CELL, VW = C.VIEW_COLS * S, VH = C.VIEW_ROWS * S;
    const now = performance.now();
    updateCamera(game, now);
    const [ox, oy] = G.fx ? G.fx.offset() : [0, 0];
    const cx = Math.round(cam.x + ox), cy = Math.round(cam.y + oy);
    ctx.clearRect(0, 0, VW, VH);
    if (images.map) {
      const k = images.map.width / (C.COLS * S);
      ctx.drawImage(images.map, cx * k, cy * k, VW * k, VH * k, 0, 0, VW, VH);
    } else {
      ctx.fillStyle = '#d8c9a3'; ctx.fillRect(0, 0, VW, VH);
    }
    const me = game.warriors[0];
    const danger = me.alive && me.trailLen > 0 && game.threat(me) <= 6;  // 敵が自分の軌跡に迫っている
    const blink = Math.floor(now / 120) % 2 === 0;
    const c0 = Math.max(0, Math.floor(cx / S)), c1 = Math.min(C.COLS - 1, Math.ceil((cx + VW) / S));
    const r0 = Math.max(0, Math.floor(cy / S)), r1 = Math.min(C.ROWS - 1, Math.ceil((cy + VH) / S));
    const own = (x, y) => (x < 0 || y < 0 || x >= C.COLS || y >= C.ROWS) ? -2 : game.owner[y * C.COLS + x];
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
      const i = y * C.COLS + x, o = game.owner[i], t = game.trail[i];
      const px = x * S - cx, py = y * S - cy;
      if (!images.map && game.wall[i]) { ctx.globalAlpha = 1; ctx.fillStyle = '#3a4252'; ctx.fillRect(px, py, S, S); }
      if (o >= 0) {
        ctx.globalAlpha = 0.5; ctx.fillStyle = game.warriors[o].color; ctx.fillRect(px, py, S, S);
        // 陣地の縁取り
        ctx.globalAlpha = 0.95; ctx.fillStyle = game.warriors[o].color;
        if (own(x, y - 1) !== o) ctx.fillRect(px, py, S, 2);
        if (own(x, y + 1) !== o) ctx.fillRect(px, py + S - 2, S, 2);
        if (own(x - 1, y) !== o) ctx.fillRect(px, py, 2, S);
        if (own(x + 1, y) !== o) ctx.fillRect(px + S - 2, py, 2, S);
      }
      if (t >= 0) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = t === 0 && danger && blink ? '#ff2d2d' : game.warriors[t].color;
        ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
      }
    }
    ctx.globalAlpha = 1;
    drawItems(ctx, game, cx, cy, S);
    const order = game.warriors.filter((w) => w.alive).sort((a, b) => a.y - b.y); // 奥(上)から描く
    for (const w of order) {
      const v = visPos(w, now);
      ctx.globalAlpha = 0.25; // ダッシュの残像
      for (const [tx, ty] of v.trail) drawWarrior(ctx, w, tx * S - cx, ty * S - cy, S);
      ctx.globalAlpha = w.shield > 0 && (w.shield % 4 < 2) ? 0.5 : 1; // 保護中は点滅
      drawWarrior(ctx, w, v.x * S - cx, v.y * S - cy, S);
      if (w.id === 0) { // 自分の目印
        const mx = (v.x + 0.5) * S - cx, my = v.y * S - cy - S * C.SPRITE_H + S * 0.4 + Math.sin(now / 200) * 2;
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mx - 6, my - 8); ctx.lineTo(mx + 6, my - 8); ctx.lineTo(mx, my); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    drawEffects(ctx, cx, cy, S);
    if (G.fx) G.fx.drawWorld(ctx, cx, cy);
    drawOffscreen(ctx, game, cx, cy, S, VW, VH);
    if (danger) { // 画面の縁を赤く
      ctx.save(); ctx.globalAlpha = blink ? 0.35 : 0.15; ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, VW, VH); ctx.restore();
    }
    drawMinimap(ctx, game);
    drawDashGauge(ctx, game, VH);
    if (G.fx) G.fx.drawScreen(ctx, VW, VH);
  };
})(globalThis.PG);
