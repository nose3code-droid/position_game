"""オリジナルBGMの作曲・合成(本プロジェクトのオリジナル曲。外部素材は使っていない)
都節音階(D Eb G A Bb)の箏・尺八・太鼓で和風に。継ぎ目なくループするように末尾の残響を先頭へ折り返す。
使い方: python3 tools/compose_bgm.py   (要 numpy, ffmpeg)
出力: assets/audio/bgm_battle.(ogg|mp3), assets/audio/bgm_title.(ogg|mp3)
"""
import numpy as np, os, subprocess, wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
SCALE = [0, 1, 5, 7, 8]          # 都節音階 (D, Eb, G, A, Bb)
BASE = 293.66                    # D4
rng = np.random.default_rng(7)


def freq(deg):
    o, i = divmod(deg, 5)
    return BASE * 2 ** ((SCALE[i] + 12 * o) / 12)


def koto(f, dur, vel=1.0, bright=0.5):
    """箏: カープラス・ストロング法の撥弦音(ブロック単位でベクトル化)"""
    n = int(SR * dur)
    N = max(2, int(SR / f))
    out = np.zeros(n + N)
    buf = rng.uniform(-1, 1, N)
    soft = np.convolve(buf, np.ones(4) / 4, 'same')
    buf = buf * bright + soft * (1 - bright)  # 爪の硬さ
    out[:N] = buf
    decay = 0.996 if f < 400 else 0.993
    prev_last = 0.0
    for s in range(N, n + N, N):
        blk = out[s - N:s]
        nxt = 0.5 * (blk + np.concatenate(([prev_last], blk[:-1]))) * decay
        prev_last = blk[-1]
        e = min(N, n + N - s)
        out[s:s + e] = nxt[:e]
    y = out[:n]
    env = np.minimum(1, np.arange(n) / (0.002 * SR))
    return y * env * vel * 1.25


def flute(f0, dur, vel=1.0, slide_from=None):
    """尺八風: 正弦波+倍音、ビブラート、息の雑音、入りのしゃくり(ポルタメント)"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.full(n, f0)
    if slide_from:
        k = np.minimum(1, t / 0.08)
        f = slide_from + (f0 - slide_from) * k
    vib = 1 + 0.012 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.35)  # 後半からかかるビブラート
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = np.convolve(rng.normal(0, 1, n), np.ones(24) / 24, 'same') * 0.12
    att, rel = 0.06, min(0.15, dur * 0.3)
    env = np.minimum(1, t / att) * np.minimum(1, (dur - t) / rel)
    env *= 1 + 0.2 * np.exp(-t / 0.05)  # 吹き始めの強さ
    return (tone * (1 - 0.15) + breath * (0.6 + 0.4 * np.exp(-t / 0.1))) * env * vel * 0.18


def taiko(vel=1.0, big=True):
    """和太鼓: ピッチが下がる低音+打撃の雑音"""
    dur = 0.9 if big else 0.25
    n = int(SR * dur)
    t = np.arange(n) / SR
    if big:
        f = 48 + 70 * np.exp(-t / 0.03)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
        hit = rng.normal(0, 1, n) * np.exp(-t / 0.008) * 0.3
        y = body + np.convolve(hit, np.ones(6) / 6, 'same')
    else:  # ふち打ち(カッ)
        f = 900
        y = (np.sin(2 * np.pi * f * t) * 0.4 + rng.normal(0, 1, n)) * np.exp(-t / 0.018)
        y = np.convolve(y, [1, -0.6], 'same')
    return y * vel * 0.3


def shime(vel=1.0):
    """締太鼓: 高く短い音"""
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * (420 + 200 * np.exp(-t / 0.01)) * t) * 0.8 + rng.normal(0, 1, n) * 0.2) * np.exp(-t / 0.025)
    return y * vel * 0.16


def reverb(x, seconds=1.6, mix=0.22):
    n = int(SR * seconds)
    ir = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (SR * seconds / 6))
    ir = np.convolve(ir, np.ones(8) / 8, 'same')  # 高域を少し落とす
    ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    size = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:L]
    out = np.concatenate([x, np.zeros(n)]) * (1 - mix) + wet * mix * 1.2
    return out


def render(events, total_beats, bpm, name, rev=0.22):
    spb = 60 / bpm
    n = int(total_beats * spb * SR)
    mix = np.zeros(n + SR * 3)
    for beat, sig in events:
        s = int(beat * spb * SR)
        mix[s:s + len(sig)] += sig
    mix = reverb(mix, mix=rev)
    # ループ: 曲の長さを超えた残響を先頭に足し込む
    loop = mix[:n].copy()
    tail = mix[n:]
    loop[:len(tail)] += tail[:n]
    loop = np.tanh(1.3 * loop / np.max(np.abs(loop))) / np.tanh(1.3) * 0.9  # 穏やかなリミッター
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((loop * 32767).astype('<i2').tobytes())
    for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '4']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '128k'])):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, *args, os.path.join(OUT, f'{name}.{ext}')], check=True)
    os.remove(wav)
    print(name, f'{n / SR:.1f}s')


def battle():
    bpm, bars = 132, 16
    ev = []
    roots = [0, 0, -1, -2, 0, 0, -1, -2, -3, -3, -1, -2, 0, -1, -2, 0]
    pat = [0, 2, 3, 5, 3, 2, 5, 3]
    for b, r in enumerate(roots):
        B = b * 4
        # 箏の分散和音(8分)。山場では16分で装飾
        for k, p in enumerate(pat):
            ev.append((B + k * 0.5, koto(freq(r + p), 0.9, 0.55 if k % 2 else 0.8, 0.3)))
            if b >= 12 and k % 2 == 1:
                ev.append((B + k * 0.5 + 0.25, koto(freq(r + p + 1), 0.5, 0.35)))
        # 低音(4分)
        for q in range(4):
            ev.append((B + q, koto(freq(r - 5), 1.2, 0.5 if q == 0 else 0.32, 0.2)))
        # 太鼓
        ev.append((B, taiko(1.0)))
        ev.append((B + 2, taiko(0.8)))
        if b % 4 == 3:  # 4小節ごとのフィル
            for t, v in ((2.5, 0.6), (3, 0.8), (3.25, 0.6), (3.5, 0.9), (3.75, 1.0)):
                ev.append((B + t, taiko(v)))
        else:
            ev.append((B + 1.5, taiko(0.5, big=False)))
            ev.append((B + 3, taiko(0.6, big=False)))
            ev.append((B + 3.5, taiko(0.45)))
        for e in range(8):
            ev.append((B + e * 0.5, shime(0.9 if e % 2 else 0.5)))
    # 尺八の旋律(5小節目から)
    mel = {
        4: [(0, 1.5, 5), (1.5, .5, 6), (2, 2, 7)],
        5: [(0, 1, 8), (1, 1, 7), (2, 1, 6), (3, 1, 5)],
        6: [(0, 3, 4), (3, 1, 3)],
        7: [(0, 4, 5)],
        8: [(0, 1, 7), (1, 1, 8), (2, 2, 9)],
        9: [(0, 1.5, 10), (1.5, .5, 9), (2, 1, 8), (3, 1, 7)],
        10: [(0, 2, 8), (2, 1, 7), (3, 1, 6)],
        11: [(0, 4, 5)],
        12: [(0, .5, 5), (.5, .5, 6), (1, .5, 7), (1.5, .5, 8), (2, 2, 10)],
        13: [(0, 1, 9), (1, 1, 8), (2, 2, 7)],
        14: [(0, 1, 6), (1, 1, 5), (2, 1, 4), (3, 1, 3)],
        15: [(0, 3, 5)],
    }
    spb = 60 / bpm
    prev = None
    for b, notes in mel.items():
        for st, du, dg in notes:
            f = freq(dg)
            ev.append((b * 4 + st, flute(f, du * spb * 0.98, 0.9, slide_from=(f * 0.94 if du >= 2 else None))))
            prev = f
    render(ev, bars * 4, bpm, 'bgm_battle', rev=0.2)


def title():
    bpm, bars = 76, 8
    ev = []
    roots = [0, -1, -2, 0, -3, -1, -2, 0]
    for b, r in enumerate(roots):
        B = b * 4
        for k, p in enumerate([0, 3, 5, 7, 5, 3]):
            ev.append((B + k * (4 / 6), koto(freq(r + p - 5), 1.6, 0.6 if k else 0.85, 0.35)))
        ev.append((B, koto(freq(r - 10), 2.5, 0.8, 0.2)))
        if b % 2 == 0:
            ev.append((B, taiko(0.45)))
    spb = 60 / bpm
    for b, notes in {1: [(0, 3, 5), (3, 1, 4)], 2: [(0, 2, 3), (2, 2, 2)], 3: [(0, 4, 3)],
                     5: [(0, 2, 7), (2, 1, 6), (3, 1, 5)], 6: [(0, 3, 4), (3, 1, 3)], 7: [(0, 4, 5)]}.items():
        for st, du, dg in notes:
            f = freq(dg)
            ev.append((b * 4 + st, flute(f, du * spb * 0.98, 0.8, slide_from=f * 0.94)))
    render(ev, bars * 4, bpm, 'bgm_title', rev=0.3)


if __name__ == '__main__':
    battle()
    title()
