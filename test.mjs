// node test.mjs — 画面を使わない部分のテスト（並べる順番・境目が整数・並べ直し・大きさの上限・設定）
import assert from 'node:assert/strict';
import * as S from './strips.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

// ---- 画素を持つだけのにせの canvas（setTransform は反転と平行移動だけ、描き方は最近傍） ----
class Fake {
  constructor(w = 0, h = 0, fill = null) { this._w = w; this._h = h; this.px = Array(w * h).fill(fill); }
  get width() { return this._w; }
  set width(v) { this._w = v; this.px = Array(v * this._h).fill(null); }
  get height() { return this._h; }
  set height(v) { this._h = v; this.px = Array(this._w * v).fill(null); }
  at(x, y) { return this.px[y * this._w + x]; }
  getContext() {
    const cv = this;
    let t = [1, 0, 0, 1, 0, 0];
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < cv._w && y < cv._h) cv.px[y * cv._w + x] = v; };
    return {
      setTransform(a, b, c, d, e, f) { t = [a, b, c, d, e, f]; },
      fillRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, this.fillStyle); },
      drawImage(src, ...a) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = a.length === 4 ? [0, 0, src.width, src.height, ...a] : a;
        for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
          const v = src.at(sx + Math.floor(((i + 0.5) * sw) / dw), sy + Math.floor(((j + 0.5) * sh) / dh));
          set(Math.floor(t[0] * (dx + i + 0.5) + t[4]), Math.floor(t[3] * (dy + j + 0.5) + t[5]), v);
        }
      },
    };
  }
}
// 画素の値が「元の x, y」になっている w × h の元
function grid(w, h) {
  const c = new Fake(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.px[y * w + x] = `${x},${y}`;
  return c;
}

test('並べる順番（仕様の例）', () => {
  assert.deepEqual(S.order(6), [0, 5, 1, 4, 2, 3]);
  assert.deepEqual(S.order(5), [0, 4, 1, 3, 2]);
  assert.deepEqual(S.order(6, true), [5, 0, 4, 1, 3, 2]);
  assert.deepEqual(S.order(2), [0, 1]);
  assert.deepEqual(S.order(2, true), [1, 0]);
});

test('並べる順番は 0〜n−1 を 1 回ずつ使い、両端から交互に取る', () => {
  for (let k = 2; k <= 300; k++) for (const fromEnd of [false, true]) {
    const o = S.order(k, fromEnd);
    assert.deepEqual([...o].sort((a, b) => a - b), [...Array(k).keys()]);
    assert.equal(o[0], fromEnd ? k - 1 : 0);
    // 取った残りの両端のどちらかを、交互に取っている
    let lo = 0, hi = k - 1;
    o.forEach((v, i) => {
      const lowSide = (i % 2 === 0) !== fromEnd;
      assert.equal(v, lowSide ? lo++ : hi--);
    });
  }
});

test('境目は整数で、0 から全体まですき間なくつながる', () => {
  for (const total of [3, 7, 100, 599, 1200, 3999, 4000]) {
    for (let k = 2; k <= 128; k++) {
      const e = S.edges(total, k);
      assert.equal(e.length, k + 1);
      assert.equal(e[0], 0);
      assert.equal(e[k], total);
      e.forEach((v) => assert.ok(Number.isInteger(v)));
      for (let i = 0; i < k; i++) {
        const w = e[i + 1] - e[i];
        assert.ok(Math.abs(w - total / k) <= 1, `${total}/${k}: 幅 ${w}`);
      }
      for (const fromEnd of [false, true]) for (const gaps of [false, true]) {
        for (const l of S.lanes(total, k, fromEnd, gaps)) {
          for (const v of [l.s, l.sl, l.d, l.dl]) assert.ok(Number.isInteger(v));
          assert.ok(l.d >= 0 && l.d + Math.max(0, l.dl) <= total);
        }
      }
    }
  }
});

test('並べ直した i 番目の場所に、順番の i 番目の短冊が入る', () => {
  const L = S.lanes(1200, 12, false, false);
  const e = S.edges(1200, 12);
  const o = S.order(12);
  L.forEach((l, i) => {
    assert.equal(l.s, e[o[i]]);
    assert.equal(l.sl, e[o[i] + 1] - e[o[i]]);
    assert.equal(l.d, e[i]);
    assert.equal(l.dl, e[i + 1] - e[i]);
  });
});

test('切れ目: 細らせる量と置く位置', () => {
  assert.equal(S.gapOf(1200, 12), 4);          // 100 × 0.04
  assert.equal(S.gapOf(1200, 128), 1);         // 小さくても 1
  const [l] = S.lanes(1200, 12, false, true);
  assert.deepEqual(l, { s: 0, sl: 100, d: 2, dl: 96 });
  const L = S.lanes(1000, 3, false, true);     // 境目 0, 333, 667, 1000 / g = 13
  assert.deepEqual(L.map((x) => [x.d, x.dl]), [[6, 320], [339, 321], [673, 320]]);
});

test('横の短冊の数と、縦の本数の上限', () => {
  assert.equal(S.rowsFor(1200, 1600, 12), 16);
  assert.equal(S.rowsFor(4000, 100, 2), 2);    // 少なくとも 2
  assert.equal(S.colsCap(4000), 128);
  assert.equal(S.colsCap(100), 50);
  assert.equal(S.colsCap(3), 2);
});

test('タイル: 4 枚・2 枚・なし の並べ方', () => {
  const src = grid(3, 2);
  const t4 = S.drawTile(new Fake(), src, 'mirror4');
  assert.deepEqual([t4.width, t4.height], [6, 4]);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    const sx = x < 3 ? x : 5 - x, sy = y < 2 ? y : 3 - y;
    assert.equal(t4.at(x, y), `${sx},${sy}`, `(${x}, ${y})`);
  }
  const t2 = S.drawTile(new Fake(), src, 'mirror2');
  assert.deepEqual([t2.width, t2.height], [6, 2]);
  assert.deepEqual([t2.at(0, 1), t2.at(3, 1), t2.at(5, 0)], ['0,1', '2,1', '0,0']);
  const t1 = S.drawTile(new Fake(), src, 'none');
  assert.deepEqual(t1.px, src.px);
});

test('縦と横に切って並べ直す（画素で確かめる）', () => {
  const W = 30, H = 20, cols = 6, rows = 4;
  const src = grid(W, H);
  for (const fromEnd of [false, true]) {
    const mid = S.cut(new Fake(), src, cols, fromEnd, false, 'x');
    const out = S.cut(new Fake(), mid, rows, fromEnd, false, 'y');
    const ex = S.edges(W, cols), ey = S.edges(H, rows);
    const ox = S.order(cols, fromEnd), oy = S.order(rows, fromEnd);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ex.findIndex((v, k) => x >= v && x < ex[k + 1]);
      const j = ey.findIndex((v, k) => y >= v && y < ey[k + 1]);
      const sx = ex[ox[i]] + (x - ex[i]), sy = ey[oy[j]] + (y - ey[j]);
      assert.equal(out.at(x, y), `${sx},${sy}`, `fromEnd=${fromEnd} (${x}, ${y})`);
    }
  }
});

test('切れ目ありは、短冊の間が白になる', () => {
  const src = grid(100, 10);
  const out = S.cut(new Fake(), src, 2, false, true, 'x');   // g = 2 → 1 | 48 | 1 | 1 | 48 | 1
  assert.equal(out.at(0, 0), '#fff');
  assert.equal(out.at(1, 0), '0,0');
  assert.equal(out.at(49, 0), '#fff');
  assert.equal(out.at(50, 0), '#fff');
  assert.equal(out.at(51, 0), '50,0');
  assert.equal(out.at(99, 0), '#fff');
});

test('出力の大きさは iPhone の上限（16,777,216 画素）を越えない', () => {
  const sizes = [[4032, 3024], [3024, 4032], [8000, 6000], [12000, 9000], [2001, 2001], [100000, 50], [640, 480], [1, 1], [2000, 2000]];
  for (let k = 0; k < 500; k++) sizes.push([1 + Math.floor(Math.random() * 20000), 1 + Math.floor(Math.random() * 20000)]);
  for (const [w, h] of sizes) {
    const [sw, sh] = S.fit(w, h, S.SAVE_SIDE);
    assert.ok(Math.max(sw, sh) <= S.SAVE_SIDE && sw >= 1 && sh >= 1);
    assert.ok(Number.isInteger(sw) && Number.isInteger(sh));
    for (const tile of S.TILES) {
      const [W, H] = S.tileSize(sw, sh, tile);
      assert.ok(W * H <= S.CANVAS_AREA, `${w}×${h} ${tile}: ${W}×${H}`);
      assert.ok(W * H <= 16000000);
    }
    const [vw, vh] = S.fit(w, h, S.VIEW_SIDE);
    assert.ok(Math.max(vw, vh) <= S.VIEW_SIDE);
  }
  assert.deepEqual(S.fit(4032, 3024, 2000), [2000, 1500]);
  assert.deepEqual(S.fit(800, 600, 2000), [800, 600]);   // 大きくはしない
});

test('設定: 読めない・おかしい値ははじめの値', () => {
  assert.deepEqual(S.readSettings(null), S.DEFAULTS);
  assert.deepEqual(S.readSettings('{壊れた'), S.DEFAULTS);
  assert.deepEqual(S.readSettings('[1,2]'), S.DEFAULTS);
  assert.deepEqual(S.readSettings('{"v":2,"cols":40}'), S.DEFAULTS);
  const s = S.readSettings(JSON.stringify({ v: 1, cols: 40, tile: 'mirror2', start: 'br', gaps: true, seenHelp: true, sound: false }));
  assert.deepEqual(s, { v: 1, cols: 40, tile: 'mirror2', start: 'br', gaps: true, seenHelp: true, sound: false });
  for (const cols of [1, 129, 12.5, '20', null]) assert.equal(S.readSettings(JSON.stringify({ v: 1, cols })).cols, 12);
  assert.equal(S.readSettings('{"v":1,"tile":"hex"}').tile, 'mirror4');
  assert.equal(S.readSettings('{"v":1,"gaps":"yes"}').gaps, false);
  // sound が無い古い形でも読める
  assert.equal(S.readSettings('{"v":1,"cols":12,"tile":"mirror4","start":"tl","gaps":false,"seenHelp":true}').sound, true);
});

console.log(`\n${n} 件すべて合格`);
