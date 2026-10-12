// [担当: UI・入力] 入力(キー/スワイプ/ボタン)、ゲームループ、HUD、演出・効果音、オンラインのロビー
(function (G) {
  const { CONFIG: C } = G;
  // オンライン機能を無効化中(CONFIG.ONLINE_ENABLED=false)は index.html から該当要素をコメントアウトしている。
  // 要素が無いときは画面に出ない空の要素を返し、オンライン用の処理には到達しないようにする
  const stubs = {};
  const $ = (id) => document.getElementById(id) ||
    stubs[id] || (stubs[id] = document.createElement(id === 'pname' || id === 'roomIn' || id === 'cpuFill' ? 'input' : 'div'));
  const ONLINE = !!C.ONLINE_ENABLED && !!G.net && !!document.getElementById('titleBox');
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  canvas.width = C.VIEW_COLS * C.CELL; canvas.height = C.VIEW_ROWS * C.CELL;
  const hud = $('hud'), overlay = $('overlay'), msg = $('msg'), startBtn = $('start');
  const muteBtn = $('mute'), bgmBtn = $('bgmBtn'), dashBtn = $('dashBtn');
  const titleHtml = msg.innerHTML;
  const titleBox = $('titleBox'), lobbyBox = $('lobbyBox'), lobbyInfo = $('lobbyInfo'), netStatus = $('netStatus');
  // state: title / lobby / countdown / play / paused / dying / over
  // mode: single(一人) / host(部屋を作った人) / guest(参加者)
  let game = null, acc = 0, last = 0, state = 'title', mode = 'single', half = 0, countdownLeft = 0, dyingLeft = 0;
  let lastSec = -1, combo = 0, lastKillAt = -1e9, wasFirst = false, hudAt = 0;
  // オンライン
  let hostSeen = 0;
  let roomCode = '', players = [], hostConn = null, mySlot = 0, cpuFill = true, syncPrev = {}, snapCount = 0;

  // ---- 設定の保存(失敗しても動く) ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 保存できなくても続行 */ } },
  };
  let difficulty = store.get('position_game_diff', 'normal');
  if (!C.DIFFICULTY[difficulty]) difficulty = 'normal';
  const bestKey = () => `position_game_best_${difficulty}`;
  const getBest = () => Number(store.get(bestKey(), 0)) || 0;
  const nameIn = $('pname');
  nameIn.value = store.get('position_game_name', '') || `武将${Math.floor(Math.random() * 900 + 100)}`;
  const myName = () => cleanName(nameIn.value.trim() || '名無しの武将');
  const roomParam = (location.search.match(/[?&]room=([A-Za-z0-9]{5})/) || [])[1];
  if (roomParam) $('roomIn').value = roomParam.toUpperCase();

  // ---- 入力 ----
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  addEventListener('keydown', (e) => {
    if (typing()) { if (e.code === 'Enter' && document.activeElement.id === 'roomIn') joinRoom(); return; }
    if (e.code in KEYS) { e.preventDefault(); steer(KEYS[e.code]); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyJ') doDash();
    else if (e.code === 'Space') { e.preventDefault(); if (mode === 'single' && (state === 'title' || state === 'over')) start(); else doDash(); }
    else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'KeyB') toggleBgm();
    else if (mode === 'single' && (state === 'title' || state === 'over')) {
      if (e.code === 'Digit1') setDifficulty('easy');
      if (e.code === 'Digit2') setDifficulty('normal');
      if (e.code === 'Digit3') setDifficulty('hard');
    }
  });
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.hypot(dx, dy) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  startBtn.addEventListener('click', () => { if (mode === 'host' && state === 'over') backToLobby(); else if (mode === 'single') start(); });
  muteBtn.addEventListener('click', toggleMute);
  bgmBtn.addEventListener('click', toggleBgm);
  const firstTouch = () => { G.sfx.unlock(); if (state === 'title') G.bgm.play('title'); removeEventListener('pointerdown', firstTouch); removeEventListener('keydown', firstTouch); };
  addEventListener('pointerdown', firstTouch); addEventListener('keydown', firstTouch);
  dashBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doDash(); });
  dashBtn.addEventListener('click', doDash);
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    if (mode === 'guest') return;
    G.sfx.ui(); setDifficulty(b.dataset.diff); if (mode === 'host') broadcastLobby();
  }));
  $('hostBtn').addEventListener('click', hostRoom);
  $('joinBtn').addEventListener('click', joinRoom);
  $('lobbyStart').addEventListener('click', hostStartMatch);
  $('lobbyLeave').addEventListener('click', leaveOnline);
  $('cpuFill').addEventListener('change', (e) => { cpuFill = e.target.checked; broadcastLobby(); });
  $('copyLink').addEventListener('click', () => {
    const url = shareUrl();
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      () => { netStatus.textContent = '招待リンクをコピーしました'; }, () => { netStatus.textContent = url; });
  });
  nameIn.addEventListener('change', () => store.set('position_game_name', myName()));

  function steer(d) {
    if (!game || state !== 'play') return;
    if (mode === 'guest') hostConn && hostConn.send({ t: 'in', d });
    else game.setDir(game.meId, d);
  }
  function doDash() {
    if (!game || state !== 'play') return;
    if (mode === 'guest') hostConn && hostConn.send({ t: 'dash' });
    else game.dash(game.meId);
  }
  function togglePause() {
    if (mode !== 'single') return; // オンラインでは一時停止しない
    if (state === 'play') {
      state = 'paused'; G.bgm.duck(true);
      // 一時停止画面(ここで音量も変えられる)
      msg.innerHTML = '<div style="font-size:40px;font-weight:900">一時停止</div><div>P / Esc で再開</div>';
      $('diffs').style.display = 'none'; $('best').textContent = ''; startBtn.style.display = 'none'; titleBox.style.display = 'none';
      overlay.style.display = 'flex';
    } else if (state === 'paused') {
      state = 'play'; overlay.style.display = 'none'; last = performance.now(); G.bgm.duck(false);
    }
  }
  // 音量スライダー
  const volUi = [['bgmVol', 'bgmVolume', 'setBgmVolume'], ['sfxVol', 'sfxVolume', 'setSfxVolume']];
  for (const [id, get, set] of volUi) {
    const el = $(id), label = $(id + 'V');
    const show = () => { label.textContent = `${Math.round(G.sfx[get] * 100)}%`; };
    el.value = Math.round(G.sfx[get] * 100); show();
    el.addEventListener('input', () => { G.sfx.unlock(); G.sfx[set](el.value / 100); show(); });
    if (id === 'sfxVol') el.addEventListener('change', () => G.sfx.ui()); // 離したときに試し音
  }
  function toggleMute() { const m = G.sfx.toggleMute(); muteBtn.textContent = m ? '🔇 音OFF (M)' : '🔊 音ON (M)'; }
  function toggleBgm() { G.sfx.unlock(); const on = G.sfx.toggleBgm(); bgmBtn.textContent = on ? '🎵 BGM ON (B)' : '🎵 BGM OFF (B)'; }
  function setDifficulty(d) {
    difficulty = d; store.set('position_game_diff', d);
    document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === d));
    $('best').textContent = mode === 'single' ? `${C.DIFFICULTY[d].label}のベスト: ${getBest().toLocaleString()}点` : '';
  }

  // ---- 画面の切り替え ----
  function showTitle() {
    state = 'title'; mode = 'single';
    msg.innerHTML = titleHtml;
    titleBox.style.display = ''; lobbyBox.style.display = 'none'; startBtn.style.display = '';
    startBtn.textContent = '出陣する (Space)';
    $('diffs').style.display = '';
    setDifficulty(difficulty);
    overlay.style.display = 'flex';
  }
  function shareUrl() { return `${location.origin}${location.pathname}?room=${roomCode}${G.net.useLocal ? '&net=local' : ''}`; }
  function showLobby(list) {
    state = 'lobby';
    msg.innerHTML = '<h1 style="font-size:34px">オンライン対戦</h1>';
    titleBox.style.display = 'none'; lobbyBox.style.display = ''; startBtn.style.display = 'none';
    $('diffs').style.display = mode === 'host' ? '' : 'none';
    const host = mode === 'host';
    $('lobbyStart').style.display = host ? '' : 'none';
    $('cpuFillRow').style.display = host ? '' : 'none';
    const names = list || players.map((p) => p.name);
    const rows = names.map((n, i) => `<li><span style="color:${C.WARRIORS[i].color}">■</span> ${escapeHtml(n)}${i === 0 ? ' (ホスト)' : ''}${i === mySlot ? ' ← あなた' : ''}</li>`);
    const cpus = cpuFill ? C.WARRIORS.length - names.length : 0;
    for (let i = 0; i < cpus; i++) rows.push(`<li style="opacity:.6"><span style="color:${C.WARRIORS[names.length + i].color}">■</span> CPU (${C.DIFFICULTY[difficulty].label})</li>`);
    lobbyInfo.innerHTML = `<div style="font-size:15px">部屋コード <b style="font-size:30px;letter-spacing:6px;color:#fde047">${escapeHtml(roomCode)}</b></div>` +
      `<ol style="text-align:left;margin:6px auto;display:inline-block">${rows.join('')}</ol>` +
      `<div style="font-size:13px">${host ? (names.length + cpus >= 2 ? '準備ができたら「対戦開始」' : '参加者を待っています…(CPUで埋めると1人でも開始できます)') : 'ホストが開始するのを待っています…'}</div>`;
    setDifficulty(difficulty);
    overlay.style.display = 'flex';
  }
  // ネットワークから届く値の検証
  function cleanName(n) { return (typeof n === 'string' ? n : '武将').replace(/[\u0000-\u001f\u007f\[\]|<>]/g, '').trim().slice(0, 10) || '武将'; }
  function validSlot(v, n) { return Number.isInteger(v) && v >= 0 && v < n; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---- オンライン: ホスト ----
  function hostRoom() {
    if (!ONLINE) return;
    G.sfx.unlock(); G.sfx.ui(); store.set('position_game_name', myName());
    netStatus.textContent = '部屋を準備しています…';
    mode = 'host'; mySlot = 0; players = [{ name: myName(), conn: null }];
    G.net.host({
      onReady: (code) => { roomCode = code; netStatus.textContent = '友達に部屋コードか招待リンクを送ってください'; showLobby(); },
      onConn: (conn) => {
        conn.onData((m) => onGuestMessage(conn, m));
        conn.onClose(() => onGuestLeft(conn));
      },
      onError: (e) => { netStatus.textContent = e; if (state !== 'lobby') { G.net.close(); showTitle(); } },
    });
  }
  function onGuestMessage(conn, m) {
    const seen = players.find((q) => q.conn === conn); if (seen) seen.seen = performance.now();
    if (m.t === 'ping') return;
    if (m.t === 'hello') {
      if (state !== 'lobby' || players.length >= G.net.MAX_PLAYERS) { conn.send({ t: 'bye', reason: state !== 'lobby' ? '試合中のため入れません' : '部屋が満員です' }); setTimeout(() => conn.close(), 300); return; }
      players.push({ name: cleanName(m.name), conn, seen: performance.now() });
      G.sfx.ui(); broadcastLobby(); return;
    }
    const p = players.find((q) => q.conn === conn);
    if (!p || !game || state !== 'play') return;
    if (m.t === 'in') { if (Number.isInteger(m.d) && m.d >= 0 && m.d <= 3) game.setDir(p.slot, m.d); } // 不正な値は無視
    else if (m.t === 'dash') game.dash(p.slot);
  }
  function onGuestLeft(conn) {
    const p = players.find((q) => q.conn === conn);
    if (!p) return;
    if (state === 'lobby') { players = players.filter((q) => q !== p); broadcastLobby(); return; }
    p.conn = null; p.left = true;
    if (game && game.warriors[p.slot]) {
      game.warriors[p.slot].isCpu = true; // 切断した人の戦士はCPUが引き継ぐ
      G.fx.log(`[${game.warriors[p.slot].color}|${game.warriors[p.slot].name}] が切断(CPUが代行)`);
    }
  }
  function broadcastLobby() {
    if (mode !== 'host' || state !== 'lobby') return;
    players.forEach((p, i) => { p.slot = i; });
    const names = players.map((p) => p.name);
    players.forEach((p, i) => p.conn && p.conn.send({ t: 'lobby', names, you: i, code: roomCode, cpuFill, difficulty }));
    showLobby(names);
  }
  function hostStartMatch() {
    players = players.filter((p) => p.conn || p === players[0]);
    players.forEach((p, i) => { p.slot = i; });
    const slots = players.map((p) => ({ name: p.name, cpu: false }));
    if (cpuFill) for (let i = slots.length; i < C.WARRIORS.length; i++) slots.push({ name: C.WARRIORS[i].name, cpu: true });
    if (slots.length < 2) { netStatus.textContent = '2人以上(CPU含む)で開始できます'; return; }
    G.sfx.ui();
    beginMatch(new G.Game(Math.random, { slots, online: true }), 0);
    syncPrev = {}; snapCount = 0;
    players.forEach((p, i) => {
      if (!p.conn) return;
      p.conn.send({ t: 'start', slots, you: i, difficulty });
      p.conn.send(G.netSync.makeSnapshot(game, {}, true)); // 最初の盤面
    });
  }
  function broadcastSnapshot(events) {
    const keyframe = snapCount++ % 180 === 0; // 約10秒ごとに念のため全体を送り直す(普段は差分)
    const s = G.netSync.makeSnapshot(game, syncPrev, keyframe, events);
    for (const p of players) if (p.conn) p.conn.send(s);
  }
  function backToLobby() {
    players = players.filter((p) => p.conn || p === players[0]);
    for (const p of players) if (p.conn) p.conn.send({ t: 'tolobby' });
    G.bgm.play('title');
    state = 'lobby';
    broadcastLobby();
  }

  // ---- オンライン: 参加者 ----
  function joinRoom() {
    if (!ONLINE) return;
    G.sfx.unlock(); G.sfx.ui(); store.set('position_game_name', myName());
    const code = $('roomIn').value;
    netStatus.textContent = '接続しています…';
    mode = 'guest';
    G.net.join(code, {
      onOpen: (conn) => {
        hostConn = conn; hostSeen = performance.now();
        conn.onData(onHostMessage);
        conn.onClose(() => { if (mode === 'guest') { netStatus.textContent = 'ホストとの接続が切れました'; endOnline(); } });
        conn.send({ t: 'hello', name: myName() });
        netStatus.textContent = '接続しました';
      },
      onError: (e) => { netStatus.textContent = e; mode = 'single'; G.net.close(); },
    });
  }
  function onHostMessage(m) {
    hostSeen = performance.now();
    if (m.t === 'ping') return;
    if (m.t === 'lobby') {
      if (!Array.isArray(m.names) || !validSlot(m.you, m.names.length)) return;
      roomCode = /^[A-Z0-9]{5}$/.test(m.code) ? m.code : '?????'; mySlot = m.you; cpuFill = !!m.cpuFill;
      if (Object.prototype.hasOwnProperty.call(C.DIFFICULTY, m.difficulty)) difficulty = m.difficulty;
      if (state !== 'countdown' && state !== 'play' && state !== 'dying') showLobby(m.names.slice(0, G.net.MAX_PLAYERS).map(cleanName));
    } else if (m.t === 'tolobby') {
      G.bgm.play('title');
    } else if (m.t === 'start') {
      if (!Array.isArray(m.slots) || m.slots.length < 2 || m.slots.length > G.net.MAX_PLAYERS || !validSlot(m.you, m.slots.length)) return;
      const slots = m.slots.map((sl) => ({ name: cleanName(sl && sl.name), cpu: !!(sl && sl.cpu) }));
      mySlot = m.you;
      if (Object.prototype.hasOwnProperty.call(C.DIFFICULTY, m.difficulty)) difficulty = m.difficulty;
      beginMatch(new G.Game(Math.random, { slots, online: true }), m.you);
    } else if (m.t === 's') {
      if (!game || !game.online) return;
      G.netSync.applySnapshot(game, m);
      if (state === 'play' || state === 'countdown') handleEvents(performance.now());
      if (game.over && state === 'play') toDying();
    } else if (m.t === 'bye') {
      netStatus.textContent = typeof m.reason === 'string' ? m.reason.slice(0, 60) : '部屋から退出しました';
      endOnline();
    }
  }
  function leaveOnline() {
    G.sfx.ui();
    if (mode === 'host') for (const p of players) if (p.conn) p.conn.send({ t: 'bye', reason: 'ホストが部屋を閉じました' });
    netStatus.textContent = '';
    endOnline();
  }
  function endOnline() {
    G.net.close(); hostConn = null; players = []; roomCode = '';
    if (state === 'play' || state === 'countdown' || state === 'dying') { state = 'over'; }
    showTitle();
  }

  // ---- 生存確認(1秒ごと)。5〜6秒応答が無ければ切断とみなす ----
  setInterval(() => {
    const now = performance.now();
    if (mode === 'host') {
      for (const p of players) {
        if (!p.conn) continue;
        p.conn.send({ t: 'ping' });
        if (now - (p.seen || now) > 5000) { const c = p.conn; c.close(); onGuestLeft(c); }
      }
    } else if (mode === 'guest' && hostConn) {
      hostConn.send({ t: 'ping' });
      if (now - hostSeen > 6000) { netStatus.textContent = 'ホストとの接続が切れました'; endOnline(); }
    }
  }, 1000);
  addEventListener('pagehide', () => { if (mode !== 'single') G.net.close(); });

  // ---- HUD ----
  function updateHud() {
    const sc = game.scores(), pts = game.points(), me = game.meId;
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    const sec = Math.ceil(game.timeLeft / 1000);
    const t = sec <= 10 ? `<b style="color:#ff5555;font-size:18px">残り ${sec}秒</b>` : `<b>残り ${sec}秒</b>`;
    const head = game.online
      ? ` &nbsp; <b>生存 ${game.warriors.filter((w) => w.alive).length}/${game.warriors.length}</b> <small>(オンライン ${escapeHtml(roomCode)})</small>${game.warriors[me].alive ? '' : ' <b style="color:#ff6b6b">観戦中</b>'}`
      : ` &nbsp; <b>残りの敵 ${game.warriors.filter((w) => w.isCpu && w.alive).length}/${C.CPU_COUNT}</b>` +
        ` <small>(ベスト ${Math.max(getBest(), pts[me]).toLocaleString()} / ${C.DIFFICULTY[difficulty].label})</small>`;
    hud.innerHTML = `${t} &nbsp; <b>スコア ${pts[me].toLocaleString()}</b>${head}<br>` +
      order.map((id, n) => { const w = game.warriors[id];
        const style = id === me ? 'font-weight:bold;text-decoration:underline' : '';
        const cpu = game.online && w.isCpu ? '(CPU)' : '';
        return `<span style="${style}"><span style="color:${w.color}">■</span> ${n + 1}位 ${escapeHtml(w.name)}${cpu} ${pts[id].toLocaleString()}点` +
          ` (${sc[id].toFixed(1)}% / 撃破${w.kills})${w.alive ? '' : ' 💀'}</span>`;
      }).join(' &nbsp; ');
  }

  // ---- ゲーム内イベント → 演出・効果音・実況 ----
  const tag = (w) => `[${w.color}|${w.name}]`;
  const nearPlayer = (x, y) => { const p = game.warriors[game.meId]; return Math.abs(p.x - x) < C.VIEW_COLS / 2 + 4 && Math.abs(p.y - y) < C.VIEW_ROWS / 2 + 4; };

  function handleEvents(now) {
    const me = game.meId;
    for (const e of game.events.splice(0)) {
      if (e.type === 'capture' && e.gained > 0) {
        const w = game.warriors[e.who], mine = e.who === me;
        G.fx.burst(e.x, e.y, w.color, Math.min(50, 8 + e.gained / 4), mine ? 4 : 3);
        G.fx.pop(e.x, e.y, `+${(e.gained * C.SCORE_CELL).toLocaleString()}`, mine ? '#fff' : w.color, Math.min(40, 16 + e.gained / 15));
        if (mine) {
          G.sfx.capture(e.gained);
          if (e.gained >= 400) { G.fx.shake(9); G.fx.banner('天下統一級!', '#fbbf24', 1400, `${e.gained}マス占領`); }
          else if (e.gained >= 200) { G.fx.shake(6); G.fx.banner('大占領!', '#fde047', 1200, `${e.gained}マス占領`); }
          else if (e.gained >= 80) G.fx.shake(3);
        }
      } else if (e.type === 'item') {
        const w = game.warriors[e.who], mine = e.who === me;
        G.addEffect(e.x, e.y, w.color);
        G.fx.burst(e.x, e.y, '#fbbf24', 30, 4);
        G.fx.pop(e.x, e.y, `+${(e.gained * C.SCORE_CELL).toLocaleString()}`, '#fbbf24', 26);
        if (mine) { G.sfx.item(); G.fx.shake(4); G.fx.log('[#fbbf24|千両箱]を手に入れた!'); }
        else if (nearPlayer(e.x, e.y)) G.sfx.item();
      } else if (e.type === 'kill') {
        const v = game.warriors[e.victim], k = e.killer >= 0 ? game.warriors[e.killer] : null;
        G.fx.burst(e.x, e.y, v.color, 40, 5);
        G.fx.burst(e.x, e.y, '#ffffff', 12, 3);
        const why = { wall: 'が壁に激突', self: 'が自分の軌跡で自滅', headon: 'と相打ち' }[e.reason];
        if (k) G.fx.log(`${tag(k)} が ${tag(v)} を${e.reason === 'enclose' ? '包囲して' : e.reason === 'item' ? '千両箱で' : ''}撃破!`);
        else G.fx.log(`${tag(v)} ${why || 'が倒れた'}`);
        if (!C.CPU_RESPAWN && e.victim !== me) {
          const left = game.online ? game.warriors.filter((w) => w.alive).length : game.warriors.filter((w) => w.isCpu && w.alive).length;
          G.fx.log(`${tag(v)} 脱落! 残り${left}人`);
        }
        if (e.victim === me) { G.sfx.death(); G.fx.shake(12); if (game.online && !game.over) G.fx.banner('討ち死に…', '#ff6b6b', 1600, '観戦モード'); }
        else if (e.killer === me) {
          G.sfx.kill(); G.fx.shake(6);
          combo = now - lastKillAt < 6000 ? combo + 1 : 1; lastKillAt = now;
          const names = ['', '撃破!', 'ダブルキル!!', 'トリプルキル!!!', '無双!!!!'];
          G.fx.banner(names[Math.min(combo, 4)], '#ff6b6b', 1200, `+${C.SCORE_KILL}点`);
        } else if (nearPlayer(e.x, e.y)) G.sfx.kill();
      } else if (e.type === 'dash' && e.who === me) G.sfx.dash();
    }
    // 順位の変化
    const pts = game.points();
    const first = pts[me] > 0 && pts.every((p, i) => i === me || pts[me] > p);
    if (first && !wasFirst) G.fx.log('[#fbbf24|1位]に浮上!');
    wasFirst = first;
    // 残り時間の警告
    const sec = Math.ceil(game.timeLeft / 1000);
    if (sec !== lastSec) {
      if (sec === 30) { G.fx.banner('残り30秒!', '#fde047', 1200); G.bgm.rate(1.08); }
      if (sec === 10) G.fx.banner('残り10秒!', '#ff5555', 1200);
      if (sec <= 10 && sec > 0) G.sfx.tick();
      lastSec = sec;
    }
  }

  // ---- 結果 ----
  const RANKS = [[0, '足軽'], [1500, '足軽大将'], [3500, '侍大将'], [6000, '城主'], [10000, '大名'], [16000, '天下人']];
  function finish() {
    state = 'over';
    const sc = game.scores(), pts = game.points(), my = game.meId;
    const order = game.warriors.map((w) => w.id).sort((a, b) => pts[b] - pts[a]);
    const me = game.warriors[my];
    const rankNo = order.indexOf(my) + 1;
    const online = game.online;
    const best = getBest(), isBest = !online && pts[my] > best;
    if (isBest) store.set(bestKey(), pts[my]);
    const title = game.cleared ? '天下統一! 敵を全滅させた' : rankNo === 1 ? '勝利!' : !me.alive ? `討ち死に… (${rankNo}位)` : `${rankNo}位`;
    const rank = RANKS.filter((r) => pts[my] >= r[0]).pop()[1];
    (rankNo === 1 || game.cleared ? G.sfx.win : G.sfx.lose)();
    G.bgm.stop(0.3);
    setTimeout(() => { if (state === 'over' || state === 'lobby') G.bgm.play('title'); }, 1800);
    const cells = Math.round(sc[my] * game.free / 100);
    msg.innerHTML = `<div style="font-size:30px">${title}</div>` +
      `<div style="font-size:40px;font-weight:900">${pts[my].toLocaleString()}点` +
      (isBest ? ' <span style="color:#fbbf24;font-size:22px">NEW BEST!</span>' : '') + '</div>' +
      `<div>称号: <b style="color:#fde047">${rank}</b> <small>(${online ? 'オンライン' : C.DIFFICULTY[difficulty].label})</small></div>` +
      `<small>陣地 ${cells}マス×${C.SCORE_CELL} + 撃破 ${me.kills}人×${C.SCORE_KILL}` +
      (game.cleared ? ` + 全滅ボーナス ${game.clearBonus.toLocaleString()}点(残り${Math.ceil(game.timeLeft / 1000)}秒×${C.SCORE_CLEAR_PER_SEC})` : '') + ' / ' +
      `最大占領率 ${me.maxPct.toFixed(1)}% / 最大囲い込み ${me.bestCapture}マス / 千両箱 ${me.items}個<br>` +
      (online ? '' : `ベスト ${Math.max(best, pts[my]).toLocaleString()}点`) + '</small><br>' +
      '<small>' + order.map((id, n) => `${n + 1}位 ${escapeHtml(game.warriors[id].name)} ${pts[id].toLocaleString()}点`).join(' / ') + '</small>';
    titleBox.style.display = 'none';
    if (mode === 'single') { startBtn.style.display = ''; startBtn.textContent = 'もう一度 (Space)'; lobbyBox.style.display = 'none'; }
    else if (mode === 'host') { startBtn.style.display = ''; startBtn.textContent = 'ロビーに戻る'; lobbyBox.style.display = 'none'; }
    else { startBtn.style.display = 'none'; lobbyBox.style.display = ''; lobbyInfo.innerHTML = '<div style="font-size:13px">ホストがロビーに戻るのを待っています…</div>'; $('lobbyStart').style.display = 'none'; $('cpuFillRow').style.display = 'none'; }
    $('diffs').style.display = mode === 'single' ? '' : 'none';
    setDifficulty(difficulty);
    overlay.style.display = 'flex';
  }

  // ---- ループ ----
  function toDying() {
    G.bgm.rate(1); state = 'dying';
    dyingLeft = game.warriors[game.meId].alive ? 600 : 1200;
    if (game.cleared) { G.fx.banner('天下統一!', '#fbbf24', 1400, '敵を全滅させた'); dyingLeft = 1400; }
    else if (game.online || game.timeLeft <= 0) { G.fx.banner('終了!', '#fff', 1000); dyingLeft = 1200; }
  }
  function loop(t) {
    const dt = Math.min(100, t - last); last = t;
    if (state === 'countdown') {
      const before = Math.ceil(countdownLeft / 1000);
      countdownLeft -= dt;
      const after = Math.ceil(countdownLeft / 1000);
      if (countdownLeft <= 0) { state = 'play'; G.fx.banner('出陣!', '#fde047', 900); G.sfx.go(); acc = 0; }
      else if (after !== before) { G.fx.banner(String(after), '#fff', 900); G.sfx.count(); }
    } else if (state === 'play') {
      if (mode !== 'guest') { // 参加者は計算しない(ホストから盤面を受け取る)
        acc += dt;
        const HALF = C.STEP_MS / 2;
        while (acc >= HALF && !game.over) {
          acc -= HALF;
          if (half++ % 2 === 0) { G.cpuThink(game); game.step(); game.tick(C.STEP_MS); }
          else { G.cpuThink(game, true); game.step(true); } // ダッシュ中の戦士だけ追加で進む
          if (mode === 'host') broadcastSnapshot(game.events.slice());
          handleEvents(t);
        }
        if (game.over) toDying();
      }
    } else if (state === 'dying') {
      dyingLeft -= dt;
      if (dyingLeft <= 0) { G.fx.clear(); G.render(ctx, game); updateHud(); return finish(); }
    }
    if (state === 'title' || state === 'lobby' || state === 'over') return;
    G.render(ctx, game);
    if (t - hudAt > 150) { updateHud(); hudAt = t; }
    requestAnimationFrame(loop);
  }

  function beginMatch(g, meId) {
    G.sfx.unlock();
    G.bgm.play('battle'); G.bgm.rate(1);
    game = G.game = g; // G.game はデバッグ・テスト用
    game.meId = meId;
    game.difficulty = difficulty;
    G.resetCamera(); G.clearEffects(); G.fx.clear();
    overlay.style.display = 'none';
    state = 'countdown'; countdownLeft = C.COUNTDOWN_MS; acc = 0; half = 0;
    lastSec = -1; combo = 0; lastKillAt = -1e9; wasFirst = false;
    G.fx.banner(String(Math.ceil(C.COUNTDOWN_MS / 1000)), '#fff', 900); G.sfx.count();
    last = performance.now();
    requestAnimationFrame(loop);
  }
  function start() { G.sfx.ui(); mode = 'single'; beginMatch(new G.Game(), 0); }

  setDifficulty(difficulty);
  muteBtn.textContent = G.sfx.muted ? '🔇 音OFF (M)' : '🔊 音ON (M)';
  bgmBtn.textContent = G.sfx.bgmOn ? '🎵 BGM ON (B)' : '🎵 BGM OFF (B)';
  G.loadImages().then(() => { if (!game) { game = new G.Game(); G.resetCamera(); G.render(ctx, game); updateHud(); } });
  if (ONLINE && roomParam) netStatus.textContent = `部屋 ${roomParam.toUpperCase()} に招待されています。名前を入れて「参加」を押してください`;
})(globalThis.PG);
