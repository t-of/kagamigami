// 「見本で試す」の画像。アプリの中で描く（他人の写真・素材は使わない）。
// 鏡に映すと形が分かるよう、左右・上下で違う絵にしてある。
export function drawSample(canvas) {
  const W = 900, H = 1200;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');

  // 空: 左上が明るい
  const sky = c.createLinearGradient(0, 0, W * 0.6, H);
  sky.addColorStop(0, '#fbe3b8');
  sky.addColorStop(0.55, '#f29e7c');
  sky.addColorStop(1, '#5b4b8a');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  // 太陽（右寄り）
  c.fillStyle = '#fff4d6';
  c.beginPath(); c.arc(640, 330, 150, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd36b';
  c.beginPath(); c.arc(640, 330, 110, 0, Math.PI * 2); c.fill();

  // 重なる山（左から右へ下がる）
  const hills = [['#3f7d6e', 720, 0.9], ['#2f5f68', 820, 1.3], ['#233a55', 930, 0.7]];
  for (const [color, base, k] of hills) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, base - Math.sin(x / 140 * k + base) * 70 - (W - x) * 0.12);
    c.lineTo(W, H);
    c.closePath(); c.fill();
  }

  // 手前の木（左）
  c.fillStyle = '#1b2436';
  c.fillRect(150, 780, 26, 300);
  c.fillStyle = '#e2574c';
  for (const [x, y, r] of [[163, 760, 90], [110, 820, 60], [220, 830, 64]]) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  // 空の鳥と点
  c.strokeStyle = '#2b2440';
  c.lineWidth = 8; c.lineCap = 'round';
  for (const [x, y, s] of [[230, 260, 1], [320, 200, 0.7], [390, 300, 0.8]]) {
    c.beginPath();
    c.moveTo(x - 30 * s, y); c.quadraticCurveTo(x - 15 * s, y - 20 * s, x, y);
    c.quadraticCurveTo(x + 15 * s, y - 20 * s, x + 30 * s, y);
    c.stroke();
  }

  // 下の道（右下へ）
  c.fillStyle = '#f6d9a8';
  c.beginPath();
  c.moveTo(420, H); c.quadraticCurveTo(520, 1020, 760, 960); c.lineTo(800, 975);
  c.quadraticCurveTo(620, 1060, 600, H); c.closePath(); c.fill();
  return canvas;
}
