// [担当: サウンド] WebAudio で効果音を合成(音声ファイル不要)。M キーで消音
(function (G) {
  let ac = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem('position_game_mute') === '1'; } catch (e) { /* 無視 */ }

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.35; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  // 単音: 周波数を f0→f1 に変化させながら減衰
  function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, delay = 0) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(master); s.start(t);
  }

  G.sfx = {
    unlock: () => ctx(),
    capture(size) { // 大きいほど高く・長く
      const k = Math.min(1, size / 300);
      [0, 4, 7, 12].slice(0, 2 + Math.round(k * 2)).forEach((st, i) =>
        tone(440 * Math.pow(2, st / 12), 440 * Math.pow(2, st / 12) * 1.01, 0.12 + k * 0.1, 'triangle', 0.25, i * 0.06));
    },
    item() { [0, 7, 12, 19].forEach((st, i) => tone(660 * Math.pow(2, st / 12), 700 * Math.pow(2, st / 12), 0.1, 'square', 0.15, i * 0.05)); },
    kill() { tone(900, 200, 0.18, 'sawtooth', 0.25); noise(0.15, 0.2); },
    death() { tone(400, 60, 0.6, 'sawtooth', 0.3); noise(0.4, 0.3); },
    dash() { tone(200, 900, 0.15, 'square', 0.12); },
    tick() { tone(1200, 1200, 0.05, 'square', 0.12); },
    go() { tone(880, 880, 0.25, 'square', 0.2); },
    count() { tone(440, 440, 0.15, 'square', 0.18); },
    win() { [0, 4, 7, 12, 7, 12].forEach((st, i) => tone(523 * Math.pow(2, st / 12), 523 * Math.pow(2, st / 12), 0.18, 'triangle', 0.25, i * 0.12)); },
    lose() { [7, 4, 0, -5].forEach((st, i) => tone(392 * Math.pow(2, st / 12), 392 * Math.pow(2, st / 12), 0.25, 'triangle', 0.22, i * 0.18)); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('position_game_mute', muted ? '1' : '0'); } catch (e) { /* 無視 */ }
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
  };
})(globalThis.PG);
