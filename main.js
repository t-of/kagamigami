// 画面と操作。加工の中身（順番・境目・タイル・切って並べる・設定）は strips.js、音は sound.js にある。
//
// 写真は <input type="file"> / ドロップ / 貼り付けからだけ受け取り、objectURL → <img> → canvas で扱う。
// fetch・XMLHttpRequest・sendBeacon・フォーム送信は使わない（仕様 §8。index.html の CSP でも止めてある）。
// 写真もできあがりも保存しない（localStorage は同じサイトの他のアプリから読めるため）。
import {
  SAVE_SIDE, VIEW_SIDE, fit, tileSize, rowsFor, colsCap, paint, drawTile, cut, readSettings,
} from './strips.js';
import { drawSample } from './sample.js';
import * as sfx from './sound.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'kagamigami.' で始める。
const STORE = 'kagamigami.';

function loadRaw(key) {
  try { return localStorage.getItem(STORE + key); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても使える */ }
}

WebAppKit.init({ title: 'かがみがみ', text: '写真を短冊に切って並べ直すと、万華鏡みたいになる' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- ここからアプリ本体 ----

const $ = (id) => document.getElementById(id);
const settings = readSettings(loadRaw('settings'));
const store = () => save('settings', settings);
sfx.setEnabled(settings.sound);

const outCanvas = $('out');
const viewMid = document.createElement('canvas');   // 縦に切ったあと（画面用）
let saveSrc = null;    // 保存用の元（長辺 2000 以下）
let viewSrc = null;    // 画面用の元（長辺 600 以下）。押しているあいだはこれを見せる
let viewTile = null;   // 画面用のタイル（鏡の数を変えたときだけ作り直す）
let viewTileOf = '';
let busy = false;

const release = (c) => { if (c) { c.width = 0; c.height = 0; } };   // iPhone は canvas の合計のメモリにも上限がある

// 保存用のタイルの大きさで、縦の本数（上限で抑えたもの）と横の本数を決める。画面も保存も同じ本数にする
function counts() {
  const [W, H] = tileSize(saveSrc.width, saveSrc.height, settings.tile);
  const cap = colsCap(W);
  const cols = Math.min(settings.cols, cap);
  return { cap, cols, rows: rowsFor(W, H, cols) };
}

// ---- 描く（1 フレーム 1 回にまとめる） ----

let queued = false;
function redraw() {
  if (queued || !viewSrc) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function render() {
  if (!viewSrc) return;
  if (viewTileOf !== settings.tile) {
    viewTile = drawTile(viewTile || document.createElement('canvas'), viewSrc, settings.tile);
    viewTileOf = settings.tile;
  }
  const { cols, rows } = counts();
  const fromEnd = settings.start === 'br';
  cut(viewMid, viewTile, cols, fromEnd, settings.gaps, 'x');
  cut(outCanvas, viewMid, rows, fromEnd, settings.gaps, 'y');
}

function syncControls() {
  const range = $('cols');
  if (saveSrc) {
    const { cap, cols, rows } = counts();
    range.max = cap;
    range.value = cols;
    $('colsNum').textContent = cols;
    $('gridSub').textContent = `縦 ${cols} × 横 ${rows}`;
    $('minusBtn').disabled = cols <= 2;
    $('plusBtn').disabled = cols >= cap;
  }
  for (const seg of document.querySelectorAll('.seg')) {
    const v = String(settings[seg.dataset.key]);
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  }
  $('soundBtn').setAttribute('aria-pressed', String(settings.sound));
  $('soundBtn').setAttribute('aria-label', settings.sound ? '音: あり' : '音: なし');
}

function setCols(n) {
  if (!saveSrc) return;
  const { cap, cols } = counts();
  const next = Math.max(2, Math.min(cap, Math.round(n)));
  if (next === cols) return;
  settings.cols = next;
  store();
  syncControls();
  redraw();
  sfx.snip();
}

// ---- 読み込み ----

function setState(s) { $('app').dataset.state = s; }

// 読み込んだ画像（<img> か canvas）から、保存用と画面用の元を作る
function useImage(el, w, h) {
  if (!w || !h) throw new Error('大きさがない');
  const [sw, sh] = fit(w, h, SAVE_SIDE);
  const [vw, vh] = fit(w, h, VIEW_SIDE);
  const nextSave = paint(document.createElement('canvas'), el, sw, sh);
  const nextView = paint(document.createElement('canvas'), nextSave, vw, vh);
  // 前の写真の canvas を手放す
  release(saveSrc);
  release(viewTile);
  viewSrc?.remove();
  release(viewSrc);
  saveSrc = nextSave;
  viewSrc = nextView;
  viewSrc.className = 'view__orig';
  viewSrc.hidden = true;
  viewSrc.setAttribute('aria-hidden', 'true');
  $('view').append(viewSrc);
  viewTile = null;
  viewTileOf = '';
  setState('photo');
  syncControls();
  render();
  sfx.open();
}

const CANT_OPEN = 'この画像は開けませんでした。JPEG か PNG の写真を選んでください。';

async function openFile(file) {
  if (!file || busy) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    useImage(img, img.naturalWidth, img.naturalHeight);
  } catch {
    sfx.fail();
    toast(CANT_OPEN);   // 前の状態のまま
  } finally {
    URL.revokeObjectURL(url);
    img.removeAttribute('src');
  }
}

$('file').addEventListener('change', (e) => {
  openFile(e.target.files[0]);
  e.target.value = '';   // 同じ写真をもう一度えらんでも読み込む
});
$('pickBtn').addEventListener('click', () => $('file').click());
$('changeBtn').addEventListener('click', () => $('file').click());
$('sampleBtn').addEventListener('click', () => {
  const c = drawSample(document.createElement('canvas'));
  try { useImage(c, c.width, c.height); } catch { toast(CANT_OPEN); }
  release(c);
});

// PC: ドラッグ＆ドロップと貼り付け
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) openFile(f);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.kind === 'file' && x.type.startsWith('image/'));
  if (item) { e.preventDefault(); openFile(item.getAsFile()); }
});

// ---- 押しているあいだは元の写真 ----

const view = $('view');
const showOrig = (v) => { if (viewSrc) viewSrc.hidden = !v; };
view.addEventListener('pointerdown', (e) => {
  showOrig(true);
  try { view.setPointerCapture(e.pointerId); } catch { /* 使えなくても離せば戻る */ }
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) view.addEventListener(t, () => showOrig(false));
view.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- つまみ ----

$('cols').addEventListener('input', (e) => setCols(Number(e.target.value)));
$('minusBtn').addEventListener('click', () => setCols(counts().cols - 1));
$('plusBtn').addEventListener('click', () => setCols(counts().cols + 1));

for (const seg of document.querySelectorAll('.seg')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const key = seg.dataset.key;
    const v = key === 'gaps' ? b.dataset.v === 'true' : b.dataset.v;
    if (settings[key] === v) return;
    settings[key] = v;
    store();
    syncControls();
    redraw();
    sfx.tap();
  });
}

// PC: ← → で短冊の数を 1 ずつ
document.addEventListener('keydown', (e) => {
  if (!saveSrc || !$('help').hidden || e.target.matches?.('input, textarea')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); setCols(counts().cols - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); setCols(counts().cols + 1); }
});

$('soundBtn').addEventListener('click', () => {
  settings.sound = !settings.sound;
  sfx.setEnabled(settings.sound);
  store();
  syncControls();
  sfx.tap();
});

// ---- 使い方 ----

function showHelp(v) {
  $('help').hidden = !v;
  if (v) $('helpClose').focus();
}
$('helpBtn').addEventListener('click', () => { showHelp(true); sfx.tap(); });
$('helpClose').addEventListener('click', () => {
  showHelp(false);
  if (!settings.seenHelp) { settings.seenHelp = true; store(); }
  sfx.tap();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('help').hidden) $('helpClose').click(); });

// ---- 知らせ ----

let toastTimer = 0;
function toast(text, ms = 3200) {
  const el = $('toast');
  clearTimeout(toastTimer);
  el.textContent = text;
  el.hidden = false;
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const hideToast = () => { clearTimeout(toastTimer); $('toast').hidden = true; };

// ---- 画像を保存 ----

const toBlob = (c) => new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// 保存用の元から、scale 倍の大きさでできあがりを作り、JPEG にする。
// canvas から作り直すので、写真の撮影場所などの情報（EXIF）は残らない
async function makeJpeg(scale, cols, rows) {
  const w = Math.max(1, Math.round(saveSrc.width * scale));
  const h = Math.max(1, Math.round(saveSrc.height * scale));
  const fromEnd = settings.start === 'br';
  let tile = null, mid = null, out = null;
  try {
    tile = drawTile(document.createElement('canvas'), saveSrc, settings.tile, w, h);
    mid = cut(document.createElement('canvas'), tile, cols, fromEnd, settings.gaps, 'x');
    release(tile);
    out = cut(document.createElement('canvas'), mid, rows, fromEnd, settings.gaps, 'y');
    release(mid);
    return await toBlob(out);
  } catch {
    return null;
  } finally {
    release(tile); release(mid); release(out);
  }
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function saved(file) {
  download(file);
  sfx.saved();
  toast('保存しました', 1800);
}

$('saveBtn').addEventListener('click', async () => {
  if (!saveSrc || busy) return;
  busy = true;
  const btns = [$('saveBtn'), $('changeBtn')];
  btns.forEach((b) => { b.disabled = true; });
  toast('作っています…', 0);
  await nextFrame();   // 「作っています…」を先に出す
  const { cols, rows } = counts();
  let blob = await makeJpeg(1, cols, rows);
  if (!blob) blob = await makeJpeg(0.75, cols, rows);   // 大きすぎたら長辺を 0.75 倍にして 1 回だけやり直す
  btns.forEach((b) => { b.disabled = false; });
  busy = false;
  if (!blob) { sfx.fail(); toast('大きすぎて保存できませんでした'); return; }

  const file = new File([blob], `kagamigami-${cols}x${rows}.jpg`, { type: 'image/jpeg' });
  let canShare = false;
  try { canShare = matchMedia('(pointer: coarse)').matches && !!navigator.canShare?.({ files: [file] }); } catch { /* 使えない */ }
  if (!canShare) { saved(file); return; }
  hideToast();
  try {
    await navigator.share({ files: [file] });   // 保存したか分からないので「保存しました」は出さない
  } catch (err) {
    if (err?.name !== 'AbortError') saved(file);   // 共有シートを出せなかった（作るのに時間がかかったなど）
  }
});

// ---- はじめ ----

syncControls();
if (!settings.seenHelp) showHelp(true);
