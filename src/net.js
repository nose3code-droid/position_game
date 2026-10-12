// [担当: オンライン] P2P 通信(WebRTC / PeerJS)と盤面の同期
// 方式: 部屋を作った人(ホスト)のブラウザで試合を計算し、参加者は操作を送って盤面を受け取る。
//  - 接続の仲介には PeerJS の公開サーバーを使う(vendor/peerjs.min.js, MIT)
//  - URL に ?net=local を付けると、同じブラウザのタブ同士で通信するテスト用モード(BroadcastChannel)
(function (G) {
  const { CONFIG: C } = G;
  const PREFIX = 'senshi-jintori-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const useLocal = typeof location !== 'undefined' && /[?&]net=local\b/.test(location.search);

  function newCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

  // ---- 接続の共通形: conn = { id, send(obj), onData(fn), onClose(fn), close() } ----
  function wrapPeerConn(c) {
    const conn = { id: c.peer, _d: [], _c: [] };
    conn.send = (o) => { try { if (c.open) c.send(o); } catch (e) { /* 切断済み */ } };
    conn.onData = (f) => conn._d.push(f);
    conn.onClose = (f) => conn._c.push(f);
    conn.close = () => { try { c.close(); } catch (e) { /* 無視 */ } };
    c.on('data', (o) => conn._d.forEach((f) => f(o)));
    const closed = () => { if (conn.dead) return; conn.dead = true; conn._c.forEach((f) => f()); };
    c.on('close', closed); c.on('error', closed);
    return conn;
  }

  // テスト用: BroadcastChannel で擬似的に接続する
  function localBus(code) {
    const ch = new BroadcastChannel(PREFIX + code);
    const me = Math.random().toString(36).slice(2);
    return { ch, me };
  }
  function wrapLocalConn(bus, peerId) {
    const conn = { id: peerId, _d: [], _c: [] };
    conn.send = (o) => { if (!conn.dead) bus.ch.postMessage({ from: bus.me, to: peerId, data: JSON.parse(JSON.stringify(o)) }); };
    conn.onData = (f) => conn._d.push(f);
    conn.onClose = (f) => conn._c.push(f);
    conn.close = () => { bus.ch.postMessage({ from: bus.me, to: peerId, bye: true }); conn._closed(); };
    conn._closed = () => { if (conn.dead) return; conn.dead = true; conn._c.forEach((f) => f()); };
    return conn;
  }

  G.net = {
    useLocal,
    // 部屋を作る。onReady(code) / onConn(conn) / onError(msg)
    host({ onReady, onConn, onError }, tries = 0) {
      const code = newCode();
      if (useLocal) {
        const bus = localBus(code), conns = {};
        bus.ch.onmessage = (ev) => {
          const m = ev.data;
          if (m.to && m.to !== bus.me) return;
          if (m.hello) { const c = conns[m.from] = wrapLocalConn(bus, m.from); bus.ch.postMessage({ from: bus.me, to: m.from, welcome: true }); onConn(c); return; }
          const c = conns[m.from]; if (!c) return;
          if (m.bye) c._closed(); else c._d.forEach((f) => f(m.data));
        };
        this._close = () => { Object.values(conns).forEach((c) => c.close()); bus.ch.close(); };
        setTimeout(() => onReady(code), 0);
        return;
      }
      if (!window.Peer) { onError('通信ライブラリを読み込めませんでした'); return; }
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => onReady(code));
      peer.on('connection', (c) => c.on('open', () => onConn(wrapPeerConn(c))));
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); this.host({ onReady, onConn, onError }, tries + 1); return; }
        onError(errText(e));
      });
      this._close = () => peer.destroy();
    },
    // 部屋に入る。onOpen(conn) / onError(msg)
    join(code, { onOpen, onError }) {
      code = String(code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(code)) { onError('部屋コードは英数字5文字です'); return; }
      if (useLocal) {
        const bus = localBus(code);
        let conn = null;
        const timer = setTimeout(() => { if (!conn) onError('部屋が見つかりません'); }, 2500);
        bus.ch.onmessage = (ev) => {
          const m = ev.data;
          if (m.to !== bus.me) return;
          if (m.welcome) { clearTimeout(timer); conn = wrapLocalConn(bus, m.from); onOpen(conn); return; }
          if (!conn) return;
          if (m.bye) conn._closed(); else conn._d.forEach((f) => f(m.data));
        };
        bus.ch.postMessage({ from: bus.me, hello: true });
        this._close = () => { if (conn) conn.close(); bus.ch.close(); };
        return;
      }
      if (!window.Peer) { onError('通信ライブラリを読み込めませんでした'); return; }
      const peer = new window.Peer({ debug: 0 });
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { onError('接続できませんでした(部屋コードを確認してください)'); peer.destroy(); } }, 15000);
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => { opened = true; clearTimeout(timer); onOpen(wrapPeerConn(c)); });
      });
      peer.on('error', (e) => { if (!opened) { clearTimeout(timer); onError(errText(e)); } });
      this._close = () => peer.destroy();
    },
    close() { if (this._close) { this._close(); this._close = null; } },
  };

  function errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '部屋が見つかりません(部屋コードを確認してください)';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return '接続サーバーにつながりません。時間をおいて試してください';
    if (t === 'browser-incompatible') return 'このブラウザはオンライン対戦に対応していません';
    return '通信エラー: ' + (t || e);
  }

  // ---- 盤面の同期 ----
  // 同じ値の連続を [値, 個数, 値, 個数, ...] にまとめる(盤面全体を送るとき用)
  function rle(arr) {
    const out = [];
    for (let i = 0; i < arr.length;) { let j = i; while (j < arr.length && arr[j] === arr[i]) j++; out.push(arr[i], j - i); i = j; }
    return out;
  }
  function unrle(src, dst) { let p = 0; for (let k = 0; k < src.length; k += 2) { dst.fill(src[k], p, p + src[k + 1]); p += src[k + 1]; } }

  // ホスト: 前回送った盤面との差分だけを送る。keyframe=true なら全体を送る
  G.netSync = {
    makeSnapshot(game, prev, keyframe, events) {
      const N = game.owner.length;
      const s = { t: 's' };
      if (keyframe || !prev.owner) {
        s.k = 1; s.o = rle(game.owner); s.tr = rle(game.trail);
        prev.owner = Int8Array.from(game.owner); prev.trail = Int8Array.from(game.trail);
      } else {
        const d = [];
        for (let i = 0; i < N; i++) {
          if (game.owner[i] !== prev.owner[i] || game.trail[i] !== prev.trail[i]) {
            d.push(i, game.owner[i], game.trail[i]);
            prev.owner[i] = game.owner[i]; prev.trail[i] = game.trail[i];
          }
        }
        s.d = d;
      }
      s.w = game.warriors.map((w) => [w.x, w.y, w.dir, w.alive ? 1 : 0, w.trailLen, w.dash, Math.round(w.dashCd), w.shield,
        w.kills, w.items, Math.round(w.maxPct * 100) / 100, w.bestCapture, w.isCpu ? 1 : 0]);
      s.it = game.items.flatMap((t) => [t.x, t.y]);
      s.tl = Math.round(game.timeLeft);
      if (game.over) s.ov = 1;
      if (events && events.length) s.e = events;
      return s;
    },
    // 参加者: 受け取った盤面を自分の Game に反映
    applySnapshot(game, s) {
      if (s.k) { unrle(s.o, game.owner); unrle(s.tr, game.trail); }
      else if (s.d) for (let k = 0; k < s.d.length; k += 3) { game.owner[s.d[k]] = s.d[k + 1]; game.trail[s.d[k] ] = s.d[k + 2]; }
      s.w.forEach((a, id) => {
        const w = game.warriors[id]; if (!w) return;
        [w.x, w.y, w.dir] = a; w.alive = !!a[3]; w.trailLen = a[4]; w.dash = a[5]; w.dashCd = a[6]; w.shield = a[7];
        w.kills = a[8]; w.items = a[9]; w.maxPct = a[10]; w.bestCapture = a[11]; w.isCpu = !!a[12];
        w.trailCells = [];
      });
      for (let i = 0; i < game.trail.length; i++) { const t = game.trail[i]; if (t >= 0 && game.warriors[t]) game.warriors[t].trailCells.push(i); }
      game.items = [];
      for (let k = 0; k < s.it.length; k += 2) game.items.push({ x: s.it[k], y: s.it[k + 1] });
      game.timeLeft = s.tl;
      if (s.ov) game.over = true;
      if (s.e) game.events.push(...s.e);
    },
  };
  G.net.MAX_PLAYERS = C.WARRIORS.length;
})(globalThis.PG);
