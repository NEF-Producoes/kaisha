// Retrato do agente em pixel art (72×88), feito em código a partir do visual dele:
// cabelo, pele, roupa e estilo de cabelo. Atrás, a inicial do nome em neon; embaixo, o nome.
import { tons } from './sprites.js?v=__V__';

const W = 72, H = 88;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const LUZ = [-0.55, -0.55, 0.63];
const OUT = '#1c1424';
const FUNDO = ['#120e1c', '#1d1630', '#2a1f44'];

const rgb = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mistura = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// rampa de 6 tons a partir de uma cor base (sombra roxa, luz quente)
const rampa = (base) => { const t = tons(base); return [t.out, t.dk, t.sh, base, t.hi, tons(t.hi).hi]; };
function tom(r, t, x, y, espalha = 0.5) {
  t = Math.max(0, Math.min(1, t));
  const v = t * (r.length - 1) + (BAYER[y & 3][x & 3] / 16 - 0.47) * espalha;
  return r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
}
const lambert = (nx, ny) => { const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]; };

// fonte 5×7 para a inicial em neon e para o nome
const F = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000', G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '11111001000010000100001000010011111', J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111', 3: '11110000010000101110000010000111110',
  4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110', 6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000',
  8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100',
  '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000', ' ': '00000000000000000000000000000000000',
};
const limpa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 .-]/g, '');

export function desenharRetrato(canvas, look, nome, opts = {}) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const buf = new Array(W * H);
  const p = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c; };
  const le = (x, y) => buf[y * W + x];
  const NEON = opts.erro ? ['#6a1a24', '#b8343e', '#ff5c5c', '#ffb0a8'] : ['#7a2a20', '#c8502a', '#f0883e', '#ffd08a'];
  const PELE = rampa(look.skin), CAB = rampa(look.hair), ROUPA = rampa(look.shirt[0]);

  // fundo escuro com um brilho no meio
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p(x, y, tom(FUNDO, 1 - Math.hypot(x - 36, y - 40) / 50, x, y, 0.9));

  // inicial do nome em neon (contorno da letra 5×7 ampliada), com brilho pontilhado em volta
  const ini = (limpa(nome).replace(/[^A-Z0-9]/g, '')[0]) || 'K';
  // a letra vira um tubo de neon que passa pelo centro dos blocos da fonte 5×7
  const s = 9, lx = 36 - Math.round(2.5 * s), ly = 5;
  const on = (cx, cy) => cx >= 0 && cy >= 0 && cx < 5 && cy < 7 && F[ini][cy * 5 + cx] === '1';
  const tubo = new Set();
  const linha = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let k = 0; k <= n; k++) tubo.add(Math.round(x0 + (x1 - x0) * k / n) + ',' + Math.round(y0 + (y1 - y0) * k / n)); };
  const ctr = (cx, cy) => [lx + cx * s + 4, ly + cy * s + 4];
  for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 5; cx++) {
    if (!on(cx, cy)) continue;
    const [x, y] = ctr(cx, cy); tubo.add(x + ',' + y);
    if (on(cx + 1, cy)) linha(x, y, ...ctr(cx + 1, cy));
    if (on(cx, cy + 1)) linha(x, y, ...ctr(cx, cy + 1));
    if (on(cx + 1, cy + 1) && !on(cx + 1, cy) && !on(cx, cy + 1)) linha(x, y, ...ctr(cx + 1, cy + 1));
    if (on(cx - 1, cy + 1) && !on(cx - 1, cy) && !on(cx, cy + 1)) linha(x, y, ...ctr(cx - 1, cy + 1));
  }
  const nucleo = [...tubo].map((k) => k.split(',').map(Number));
  for (const [x, y] of nucleo) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || tubo.has(xx + ',' + yy)) continue;
    const dd = Math.hypot(dx, dy);
    if (dd <= 1.01) p(xx, yy, NEON[1]);
    else if (dd <= 3.2 && BAYER[yy & 3][xx & 3] < (dd <= 2.2 ? 8 : 3)) p(xx, yy, mistura(le(xx, yy), NEON[1], 0.5));
  }
  for (const [x, y] of nucleo) p(x, y, NEON[3]);

  const longo = look.long, curto = look.style === 2;
  // cabelo comprido cai atrás dos ombros
  if (longo) for (let y = 30; y < 76; y++) for (let x = 0; x < W; x++) {
    const hw = 19 - Math.max(0, y - 66) * 0.6;
    if (Math.abs(x - 36) <= hw) p(x, y, tom(CAB, 0.18 + 0.4 * lambert((x - 36) / 22, 0) + 0.12 * Math.sin(x * 1.1 + y * 0.3), x, y, 0.7));
  }
  // ombros e blusa
  for (let y = 62; y < H; y++) {
    const k = (y - 62) / 26, hw = 12 + 22 * Math.min(1, Math.sqrt(k * 1.6));
    for (let x = 0; x < W; x++) {
      if (Math.abs(x - 36) > hw) continue;
      if (Math.abs(x - 36) > hw - 1.2) { p(x, y, OUT); continue; }
      const nx = (x - 36) / (hw + 3), t = 0.2 + 0.8 * lambert(nx, -0.5 + 0.6 * k);
      let c = tom(ROUPA, t, x, y);
      if (nx > 0.7) c = mistura(c, NEON[2], 0.3);
      p(x, y, c);
    }
  }
  for (let y = 74; y < H; y++) { p(22 + ((y - 74) / 3 | 0), y, ROUPA[1]); p(50 - ((y - 74) / 3 | 0), y, ROUPA[1]); }
  // pescoço
  for (let y = 50; y < 66; y++) for (let x = 30; x < 43; x++) {
    if (y >= 62 && Math.abs(x - 36) > 4 + (y - 62) * 0.2 && y < 66) continue;
    p(x, y, tom(PELE, 0.38 + 0.2 * (1 - (x - 30) / 13) - (y < 58 ? 0.12 : 0), x, y, 0.3));
  }
  for (let x = 27; x < 46; x++) { const y = 62 + Math.floor(((x - 36) / 9) ** 2 * 2); p(x, y, OUT); p(x, y + 1, ROUPA[1]); }
  // cabeça
  const cx = 36, cy = 37, rx = 15, ry = 19;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let nx = (x - cx) / rx; const ny = (y - cy) / ry;
    if (y > cy) nx = (x - cx) / (rx * (1 - 0.35 * ((y - cy) / ry) ** 2));
    const r2 = nx * nx + ny * ny;
    if (r2 <= 1) {
      let c = tom(PELE, 0.38 + 0.55 * lambert(nx, ny), x, y);
      if (nx > 0.85 && ny > -0.4 && ny < 0.6) c = mistura(c, NEON[2], 0.3); // luz de borda do neon
      p(x, y, c);
    } else if (r2 <= 1.12 && y < cy + ry * 0.55) p(x, y, OUT);
  }
  // orelhas
  for (const [ex, lado] of [[20, -1], [52, 1]]) {
    for (let y = 36; y < 44; y++) for (let x = ex - 1; x < ex + 2; x++) p(x, y, lado < 0 ? PELE[3] : PELE[2]);
    p(ex + lado, 37, OUT); p(ex + lado, 42, OUT);
  }
  // cabelo: topo, franja e laterais, com mechas
  const raioY = curto ? 15 : 18, centroY = curto ? 30 : 31;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x - 36) / (curto ? 16.5 : 18), ny = (y - centroY) / raioY;
    const franja = (curto ? 24 : 27) + 3 * Math.sin(x * 0.9) + (!curto && x > 24 && x < 34 ? 4 : 0) - Math.abs(x - 36) * 0.05;
    const lateral = Math.abs(x - 36) >= 13 && y < (longo ? 60 : curto ? 36 : 48);
    const r2 = nx * nx + ny * ny;
    if ((r2 <= 1 || (longo && lateral && y >= centroY && Math.abs(x - 36) <= 18)) && (y < franja || lateral)) {
      let c = tom(CAB, 0.15 + 0.85 * lambert(Math.max(-1, Math.min(1, nx * 0.9)), Math.max(-1, Math.min(1, ny * 0.9))) + 0.18 * Math.sin(x * 1.1 + y * 0.35), x, y, 0.7);
      if (r2 > 0.88 && r2 <= 1) c = OUT;
      if (r2 <= 1 && nx > 0.8 && ny > 0.2) c = mistura(c, NEON[1], 0.3);
      p(x, y, c);
    }
  }
  // sobrancelhas, olhos, nariz, boca, bochechas
  for (let x = 26; x < 33; x++) p(x, 33 - (x > 28 && x < 31 ? 1 : 0), CAB[1]);
  for (let x = 39; x < 46; x++) p(x, 33 - (x > 41 && x < 44 ? 1 : 0), CAB[1]);
  for (const x0 of [27, 39]) {
    for (let x = x0 + 1; x < x0 + 5; x++) { p(x, 36, OUT); p(x, 37, '#ece4e4'); p(x, 38, '#d8cccc'); p(x, 39, PELE[4]); }
    p(x0, 37, OUT); p(x0 + 5, 37, OUT);
    for (const [x, y] of [[x0 + 2, 37], [x0 + 3, 37], [x0 + 2, 38], [x0 + 3, 38]]) p(x, y, '#3d2f63');
    p(x0 + 3, 38, '#6a58a8'); p(x0 + 2, 37, '#ffffff');
  }
  for (let y = 39; y < 45; y++) p(37, y, PELE[2]);
  p(36, 45, PELE[1]); p(37, 45, PELE[1]); p(38, 45, PELE[2]); p(35, 44, PELE[2]);
  const boca = tons(mistura(look.skin, '#c0505a', 0.6));
  for (let x = 33; x < 40; x++) p(x, 50, boca.dk);
  for (let x = 34; x < 39; x++) p(x, 51, boca.base);
  p(35, 51, boca.hi); p(32, 49, PELE[2]); p(40, 49, PELE[2]);
  for (const x0 of [26, 43]) for (let x = x0; x < x0 + 4; x++) p(x, 44, mistura(le(x, 44), '#e07a7a', 0.35));
  for (let x = 31; x < 42; x++) p(x, 57, mistura(le(x, 57), PELE[1], 0.5));

  // placa com o nome
  let texto = limpa(nome).trim();
  if (texto.length > 10) texto = texto.slice(0, 10);
  const larg = texto.length * 6 + 7;
  for (let y = 74; y < 86; y++) for (let x = 3; x < 3 + larg; x++) p(x, y, (y === 74 || y === 85 || x === 3 || x === 2 + larg) ? OUT : mistura(le(x, y), FUNDO[0], 0.7));
  let tx = 7;
  for (const ch of texto) {
    const gl = F[ch] || F[' '];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (gl[j * 5 + i] === '1') { p(tx + i + 1, 77 + j, OUT); }
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (gl[j * 5 + i] === '1') p(tx + i, 76 + j, '#f6efe0');
    tx += 6;
  }
  // moldura
  for (let x = 0; x < W; x++) { p(x, 0, NEON[2]); p(x, H - 1, NEON[1]); }
  for (let y = 0; y < H; y++) { p(0, y, NEON[2]); p(W - 1, y, NEON[1]); }

  for (let i = 0; i < W * H; i++) { const [r, gg, b] = rgb(buf[i]); d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return canvas;
}
