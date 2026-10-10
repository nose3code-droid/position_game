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

  function updateCamera(game) {
    const S = C.CELL, VW = C.VIEW_COLS * S, VH = C.VIEW_ROWS * S;
    const p = game.warriors[0];
    const tx = Math.min(Math.max((p.x + 0.5) * S - VW / 2, 0), C.COLS * S - VW);
    const ty = Math.min(Math.max((p.y + 0.5) * S - VH / 2, 0), C.ROWS * S - VH);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    cam.x += (tx - cam.x) * 0.2; cam.y += (ty - cam.y) * 0.2;
  }
  G.resetCamera = () => { cam.init = false; };

  // 取得演出(広がる輪と獲得マス数)
  const effects = [];
  G.addEffect = (x, y, color, gained) => effects.push({ x, y, color, gained, t0: performance.now() });
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
      ctx.beginPath(); ctx.arc(x, y, (C.ITEM_RADIUS + 0.5) * S * Math.min(1, k * 2.5), 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      const txt = `+${e.gained * C.SCORE_CELL}`;
      ctx.strokeText(txt, x, y - S * 2 - k * 24); ctx.fillText(txt, x, y - S * 2 - k * 24);
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

  G.render = function (ctx, game) {
    const S = C.CELL, VW = C.VIEW_COLS * S, VH = C.VIEW_ROWS * S;
    updateCamera(game);
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.clearRect(0, 0, VW, VH);
    if (images.map) {
      const k = images.map.width / (C.COLS * S);
      ctx.drawImage(images.map, cx * k, cy * k, VW * k, VH * k, 0, 0, VW, VH);
    } else {
      ctx.fillStyle = '#d8c9a3'; ctx.fillRect(0, 0, VW, VH);
    }
    const c0 = Math.max(0, Math.floor(cx / S)), c1 = Math.min(C.COLS - 1, Math.ceil((cx + VW) / S));
    const r0 = Math.max(0, Math.floor(cy / S)), r1 = Math.min(C.ROWS - 1, Math.ceil((cy + VH) / S));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
      const i = y * C.COLS + x, o = game.owner[i], t = game.trail[i];
      const px = x * S - cx, py = y * S - cy;
      if (!images.map && game.wall[i]) { ctx.globalAlpha = 1; ctx.fillStyle = '#3a4252'; ctx.fillRect(px, py, S, S); }
      if (o >= 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = game.warriors[o].color; ctx.fillRect(px, py, S, S); }
      if (t >= 0) { ctx.globalAlpha = 0.9; ctx.fillStyle = game.warriors[t].color; ctx.fillRect(px + 3, py + 3, S - 6, S - 6); }
    }
    ctx.globalAlpha = 1;
    drawItems(ctx, game, cx, cy, S);
    for (const w of game.warriors) if (w.alive) {
      ctx.globalAlpha = w.shield > 0 && (w.shield % 4 < 2) ? 0.5 : 1; // 保護中は点滅
      drawWarrior(ctx, w, w.x * S - cx, w.y * S - cy, S);
    }
    ctx.globalAlpha = 1;
    drawEffects(ctx, cx, cy, S);
    drawMinimap(ctx, game);
  };
})(globalThis.PG);
