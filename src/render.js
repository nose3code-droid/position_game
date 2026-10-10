// [担当: 描画・画像] Canvas描画。assets/ の画像があれば使い、無ければ仮描画にフォールバック
(function (G) {
  const { CONFIG: C } = G;
  const images = {};

  G.loadImages = function () {
    return Promise.all(Object.entries(C.IMAGES).map(([k, src]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { images[k] = im; res(); };
      im.onerror = () => res(); // 無ければ仮描画
      im.src = src;
    })));
  };

  function drawWarrior(ctx, w, px, py, S) {
    const im = images['warrior' + w.id];
    if (im) { ctx.drawImage(im, px - S * 0.5, py - S * 0.9, S * 2, S * 2); return; }
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

  G.render = function (ctx, game) {
    const S = C.CELL, W = C.COLS * S, H = C.ROWS * S;
    if (images.map) ctx.drawImage(images.map, 0, 0, W, H);
    else {
      ctx.fillStyle = '#d8c9a3'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= C.COLS; x++) { ctx.moveTo(x * S + .5, 0); ctx.lineTo(x * S + .5, H); }
      for (let y = 0; y <= C.ROWS; y++) { ctx.moveTo(0, y * S + .5); ctx.lineTo(W, y * S + .5); }
      ctx.stroke();
    }
    for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
      const i = y * C.COLS + x, o = game.owner[i], t = game.trail[i];
      if (o >= 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = game.warriors[o].color; ctx.fillRect(x * S, y * S, S, S); }
      if (t >= 0) { ctx.globalAlpha = 0.9; ctx.fillStyle = game.warriors[t].color; ctx.fillRect(x * S + 3, y * S + 3, S - 6, S - 6); }
    }
    ctx.globalAlpha = 1;
    for (const w of game.warriors) if (w.alive) drawWarrior(ctx, w, w.x * S, w.y * S, S);
  };
})(globalThis.PG);
