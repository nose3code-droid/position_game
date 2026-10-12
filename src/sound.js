// [担当: サウンド] BGM と効果音。assets/audio の素材を WebAudio で再生し、
// 読めない環境(file:// で開いた場合など)では WebAudio 合成音に自動で切り替える。
// M: 全体の消音 / B: BGM の ON/OFF
(function (G) {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 無視 */ } },
  };
  let muted = store.get('position_game_mute', '0') === '1';
  let bgmOn = store.get('position_game_bgm', '1') === '1';
  // 音量(0〜1)。初期値は従来と同じ聞こえ方になる値
  const vol01 = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  let bgmVol = vol01(store.get('position_game_bgm_vol', 0.6), 0.6);
  let sfxVol = vol01(store.get('position_game_sfx_vol', 0.8), 0.8);
  let ducked = false;
  const bgmLevel = () => (bgmOn ? bgmVol * 0.75 * (ducked ? 0.27 : 1) : 0); // WebAudio の BGM 音量
  const elLevel = () => (muted || !bgmOn ? 0 : bgmVol * 0.58);               // <audio> 再生時の音量
  function applyVolumes() {
    if (master) master.gain.value = muted ? 0 : 0.8;
    if (sfxGain) sfxGain.gain.value = sfxVol * 0.9;
    if (bgmGain && ac) bgmGain.gain.setTargetAtTime(bgmLevel(), ac.currentTime, 0.05);
    if (bgm.el) bgm.el.volume = elLevel();
  }
  let ac = null, master = null, sfxGain = null, bgmGain = null;
  const buffers = {};
  const SFX = ['capture', 'capture_big', 'item', 'kill', 'death', 'tick', 'go', 'count', 'dash', 'ui'];
  const BGM = { battle: 'bgm_battle', title: 'bgm_title' };
  let ext = 'mp3';

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
      sfxGain = ac.createGain(); sfxGain.gain.value = sfxVol * 0.9; sfxGain.connect(master);
      bgmGain = ac.createGain(); bgmGain.gain.value = bgmLevel(); bgmGain.connect(master);
      const a = document.createElement('audio');
      ext = a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; // ogg は継ぎ目なくループできる
      loadAll();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function loadAll() {
    if (location.protocol === 'file:') return; // file:// では fetch 不可 → 合成音 / <audio> で代用
    const names = SFX.map((n) => 'sfx_' + n).concat(Object.values(BGM));
    for (const n of names) {
      fetch(`assets/audio/${n}.${ext}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)))
        .then((buf) => { buffers[n] = buf; if (bgm.want && BGM[bgm.want] === n) bgm.play(bgm.want, true); })
        .catch(() => { /* 素材なし → 合成音で代用 */ });
    }
  }

  function sample(name, { rate = 1, vol = 1 } = {}) {
    const a = ctx(), buf = buffers['sfx_' + name];
    if (!a || !buf) return false;
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(sfxGain); s.start();
    return true;
  }

  // ---- 合成音(素材が読めないときの代用、勝敗ジングル) ----
  function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, delay = 0) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(sfxGain); s.start(t);
  }
  const note = (st, base) => base * Math.pow(2, st / 12);

  // ---- BGM: 継ぎ目なしループ + クロスフェード ----
  const bgm = {
    want: null, cur: null, src: null, gain: null, el: null,
    play(name, force = false) {
      this.want = name;
      if (!force && this.cur === name) return;
      const a = ctx(); if (!a) return;
      const buf = buffers[BGM[name]];
      this.stop(0.6);
      this.cur = name;
      if (buf) {
        const s = a.createBufferSource(), g = a.createGain();
        s.buffer = buf; s.loop = true;
        g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(1, a.currentTime + 0.8);
        s.connect(g); g.connect(bgmGain); s.start();
        this.src = s; this.gain = g;
      } else if (location.protocol === 'file:') {
        // file:// では fetch できないので <audio> で再生(ループの継ぎ目に一瞬の間ができることがある)
        const el = new Audio(`assets/audio/${BGM[name]}.${ext}`);
        el.loop = true; el.volume = elLevel();
        el.play().catch(() => {});
        this.el = el;
      }
    },
    stop(fade = 0.4) {
      if (this.src && ac) {
        const s = this.src, g = this.gain, t = ac.currentTime;
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
        s.stop(t + fade + 0.05);
      }
      if (this.el) { this.el.pause(); this.el = null; }
      this.src = null; this.gain = null; this.cur = null;
    },
    // 終盤の盛り上げ用: 再生速度を上げる(1 = 通常)
    rate(r) {
      if (this.src && ac) this.src.playbackRate.setTargetAtTime(r, ac.currentTime, 0.3);
      if (this.el) this.el.playbackRate = r;
    },
    duck(on) { ducked = on; applyVolumes(); },
  };
  G.bgm = bgm;

  G.sfx = {
    unlock: () => ctx(),
    capture(size) { // 大きいほど高い音で気持ちよく
      const big = size >= 150;
      const rate = 1 + Math.min(0.5, size / 600);
      if (sample(big ? 'capture_big' : 'capture', { rate, vol: 0.9 })) return;
      const k = Math.min(1, size / 300);
      [0, 4, 7, 12].slice(0, 2 + Math.round(k * 2)).forEach((st, i) => tone(note(st, 440), note(st, 444), 0.12 + k * 0.1, 'triangle', 0.25, i * 0.06));
    },
    item() { if (!sample('item', { vol: 1 })) [0, 7, 12, 19].forEach((st, i) => tone(note(st, 660), note(st, 700), 0.1, 'square', 0.15, i * 0.05)); },
    kill() { if (!sample('kill', { vol: 0.9 })) { tone(900, 200, 0.18, 'sawtooth', 0.25); noise(0.15, 0.2); } },
    death() { if (!sample('death', { vol: 1, rate: 0.8 })) { tone(400, 60, 0.6, 'sawtooth', 0.3); noise(0.4, 0.3); } tone(300, 50, 0.7, 'sawtooth', 0.15); },
    dash() { if (!sample('dash', { vol: 0.6, rate: 1.2 })) tone(200, 900, 0.15, 'square', 0.12); },
    tick() { if (!sample('tick', { vol: 1 })) tone(1200, 1200, 0.05, 'square', 0.12); },
    go() { if (!sample('go', { vol: 1 })) tone(880, 880, 0.25, 'square', 0.2); },
    count() { if (!sample('count', { vol: 1 })) tone(440, 440, 0.15, 'square', 0.18); },
    ui() { if (!sample('ui', { vol: 1 })) tone(700, 700, 0.04, 'square', 0.1); },
    win() { [0, 4, 7, 12, 7, 12].forEach((st, i) => tone(note(st, 523), note(st, 523), 0.18, 'triangle', 0.25, i * 0.12)); },
    lose() { [7, 4, 0, -5].forEach((st, i) => tone(note(st, 392), note(st, 392), 0.25, 'triangle', 0.22, i * 0.18)); },
    get muted() { return muted; },
    get bgmOn() { return bgmOn; },
    toggleMute() {
      muted = !muted; store.set('position_game_mute', muted ? '1' : '0');
      applyVolumes();
      return muted;
    },
    toggleBgm() {
      bgmOn = !bgmOn; store.set('position_game_bgm', bgmOn ? '1' : '0');
      applyVolumes();
      return bgmOn;
    },
    get bgmVolume() { return bgmVol; },
    get sfxVolume() { return sfxVol; },
    setBgmVolume(v) { bgmVol = vol01(v, bgmVol); store.set('position_game_bgm_vol', bgmVol); applyVolumes(); },
    setSfxVolume(v) { sfxVol = vol01(v, sfxVol); store.set('position_game_sfx_vol', sfxVol); applyVolumes();
    },
  };
})(globalThis.PG);
