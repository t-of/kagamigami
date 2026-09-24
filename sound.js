// 短く控えめな効果音。音声ファイルは持たず Web Audio で作る（外から何も読まない）。
let ctx = null;
let master = null;
let noise = null;
let on = true;

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}

export function setEnabled(v) {
  on = v;
  setAudioSession(v);
}

// 触ったときに作る・再開する（ブラウザは触る前の音を止める）
function audio() {
  if (!on) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    setAudioSession(true);
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') { setAudioSession(true); ctx.resume(); }
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.12, to = null } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

// はさみで紙を切るような短いシャッ
function snipNoise(gain, at = 0) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(6000, t);
  f.frequency.exponentialRampToValueAtTime(2500, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.07);
}

// 短冊の数を変えた（スライダーを動かすあいだは間引く）
let lastSnip = 0;
export function snip() {
  const now = performance.now();
  if (now - lastSnip < 45) return;
  lastSnip = now;
  snipNoise(0.22);
}
// 切り替えを押した
export const tap = () => tone(660, { dur: 0.06, type: 'triangle', gain: 0.08, to: 880 });
// 写真を読み込んだ
export const open = () => { snipNoise(0.18); snipNoise(0.18, 0.07); tone(784, { at: 0.12, dur: 0.22, gain: 0.08 }); };
// 保存できた
export const saved = () => [659.25, 987.77, 1318.5].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.28, gain: 0.07 }));
// 開けなかった・保存できなかった
export const fail = () => tone(330, { dur: 0.18, type: 'triangle', gain: 0.08, to: 220 });
