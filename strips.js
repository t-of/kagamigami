// かがみがみの中身（仕様 §3「加工の手順と数値の決まり」）。画面（DOM）に触らない。
// main.js（ブラウザ）と test.mjs（node）の両方から読む。canvas は引数でもらう。
//
// 元 → タイル（鏡の数）→ 縦に切って並べ直す → 横に切って並べ直す → できあがり

export const SAVE_SIDE = 2000;          // 保存用の元の長辺。鏡 4 枚でタイルは 4000 × 4000 = 1600 万画素以下
export const VIEW_SIDE = 600;           // 画面用の元の長辺
export const CANVAS_AREA = 16777216;    // iPhone の Safari が 1 枚の canvas に描ける面積
export const MIN_COLS = 2;
export const MAX_COLS = 128;
export const TILES = ['mirror4', 'mirror2', 'none'];
export const STARTS = ['tl', 'br'];

// 長辺を max 以下に縮めた大きさ（整数）。大きくはしない
export function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// タイルの大きさ。元の幅 w、高さ h
export function tileSize(w, h, tile) {
  if (tile === 'mirror4') return [2 * w, 2 * h];
  if (tile === 'mirror2') return [2 * w, h];
  return [w, h];
}

// 並べる順番: 0, n−1, 1, n−2, …（fromEnd なら n−1, 0, n−2, 1, …）
export function order(n, fromEnd = false) {
  const out = [];
  let lo = 0, hi = n - 1, takeLo = !fromEnd;
  while (lo <= hi) {
    out.push(takeLo ? lo++ : hi--);
    takeLo = !takeLo;
  }
  return out;
}

// 長さ total を n 本に分ける境目。必ず整数（小数だと境目にすき間の線が出る）
export function edges(total, n) {
  return Array.from({ length: n + 1 }, (_, k) => Math.round((k * total) / n));
}

// 切れ目ありのとき、短冊を細らせる量
export const gapOf = (total, n) => Math.max(1, Math.round((total / n) * 0.04));

// 横の短冊の数（縦と同じ太さになる本数）
export const rowsFor = (W, H, cols) => Math.max(MIN_COLS, Math.round(H / (W / cols)));

// 縦の短冊の数の上限（保存用のタイルで 1 本が 2px より細くならない）
export const colsCap = (W) => Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(W / 2)));

// 1 方向の並べ直し。置く場所 i ごとに { s: 元の短冊の始まり, sl: その長さ, d: 置く位置, dl: 置く長さ }
export function lanes(total, n, fromEnd, gaps) {
  const e = edges(total, n);
  const g = gaps ? gapOf(total, n) : 0;
  return order(n, fromEnd).map((k, i) => ({
    s: e[k], sl: e[k + 1] - e[k],
    d: e[i] + Math.floor(g / 2), dl: e[i + 1] - e[i] - g,
  }));
}

function context(canvas) {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas を作れない');
  return c;
}

// 大きさを合わせて白で塗る（同じ大きさなら作り直さない）
function reset(canvas, W, H) {
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const c = context(canvas);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  return c;
}

// 元 src を w × h に縮めて描く。透明なところは白（JPEG で黒にならないように）
export function paint(dst, src, w, h) {
  const c = reset(dst, w, h);
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, w, h);
  return dst;
}

// タイル: 左上 = 元、右上 = 左右反転、左下 = 上下反転、右下 = 上下左右反転
export function drawTile(dst, src, tile, w = src.width, h = src.height) {
  const [W, H] = tileSize(w, h, tile);
  const c = reset(dst, W, H);
  c.imageSmoothingQuality = 'high';
  const put = (fx, fy) => {
    c.setTransform(fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? 2 * w : 0, fy ? 2 * h : 0);
    c.drawImage(src, 0, 0, w, h);
  };
  put(false, false);
  if (tile !== 'none') put(true, false);
  if (tile === 'mirror4') { put(false, true); put(true, true); }
  c.setTransform(1, 0, 0, 1, 0, 0);
  return dst;
}

// src を n 本に切って並べ直し、dst に描く。axis 'x' = 縦の短冊、'y' = 横の短冊
export function cut(dst, src, n, fromEnd, gaps, axis) {
  const W = src.width, H = src.height, x = axis === 'x';
  const c = reset(dst, W, H);
  for (const l of lanes(x ? W : H, n, fromEnd, gaps)) {
    if (l.dl <= 0 || l.sl <= 0) continue;
    if (x) c.drawImage(src, l.s, 0, l.sl, H, l.d, 0, l.dl, H);
    else c.drawImage(src, 0, l.s, W, l.sl, 0, l.d, W, l.dl);
  }
  return dst;
}

// ---- 設定（localStorage の kagamigami.settings） ----

export const DEFAULTS = Object.freeze({ v: 1, cols: 12, tile: 'mirror4', start: 'tl', gaps: false, seenHelp: false, sound: true });

// 読めない・形がおかしい値ははじめの値にする
export function readSettings(raw) {
  let o = null;
  try { o = JSON.parse(raw); } catch { /* はじめの値 */ }
  const s = { ...DEFAULTS };
  if (!o || typeof o !== 'object' || o.v !== 1) return s;
  if (Number.isInteger(o.cols) && o.cols >= MIN_COLS && o.cols <= MAX_COLS) s.cols = o.cols;
  if (TILES.includes(o.tile)) s.tile = o.tile;
  if (STARTS.includes(o.start)) s.start = o.start;
  for (const k of ['gaps', 'seenHelp', 'sound']) if (typeof o[k] === 'boolean') s[k] = o[k];
  return s;
}
