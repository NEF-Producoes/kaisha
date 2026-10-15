// Área externa em volta do prédio, para a tela ficar no formato pedido (16:9 por padrão):
// grama, calçada em volta do prédio, árvores, arbustos, flores e postes (que acendem à noite).
import { T, tons } from './sprites.js?v=__V__';

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const sorte = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

// formato "16:9", "4:3", "21:9"… ou "livre" (só o prédio). Sem nada no YAML vale 16:9.
export function calcularVista(W, H, formato) {
  const bw = W * T, bh = H * T;
  const a = String(formato ?? '16:9').trim().toLowerCase();
  const m = /^(\d+(?:[.,]\d+)?)\s*[:x/]\s*(\d+(?:[.,]\d+)?)$/.exec(a);
  if (!m) return { VW: bw, VH: bh, OX: 0, OY: 0, fora: false };
  const r = parseFloat(m[1].replace(',', '.')) / parseFloat(m[2].replace(',', '.'));
  if (!(r > 0.2 && r < 5)) return { VW: bw, VH: bh, OX: 0, OY: 0, fora: false };
  const mw = bw + 2 * T, mh = bh + 2 * T; // pelo menos um bloco de terreno em volta
  let VW, VH;
  if (mw / mh > r) { VW = mw; VH = Math.round(mw / r); } else { VH = mh; VW = Math.round(mh * r); }
  return { VW, VH, OX: Math.round((VW - bw) / 2), OY: Math.round((VH - bh) / 2), fora: true };
}

const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

function arvore(g, x, y, sem) {
  // x, y = pé do tronco. Copa redonda com luz de cima à esquerda, em 4 tons pontilhados.
  const verdes = [['#1f4a3a', '#2f6e44', '#4a9a52', '#7cc463'], ['#22463e', '#2e6a4e', '#438f5c', '#6fb873'], ['#2a4a2e', '#3f7038', '#5c9a43', '#8fc45a']][Math.floor(sem * 3)];
  const r = 9 + Math.floor(sem * 4);
  g.fillStyle = 'rgba(30,20,40,0.28)';
  for (let dy = -2; dy <= 2; dy++) { const m = Math.round((r - 1) * Math.sqrt(1 - (dy / 2.5) ** 2)); g.fillRect(x - m + 2, y + dy, m * 2, 1); }
  px(g, '#4a2c22', x - 1, y - 9, 3, 9); px(g, '#6e4430', x - 1, y - 9, 1, 9);
  const cy = y - 9 - r + 3;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = (dx * dx) / (r * r) + (dy * dy) / (r * r * 0.85);
    if (d > 1) continue;
    const xx = x + dx, yy = cy + dy;
    if (d > 0.86) { px(g, '#16302a', xx, yy); continue; }
    const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let t = 0.15 + 0.85 * Math.max(0, -0.55 * nx - 0.55 * ny + 0.63 * nz);
    t += (sorte(xx * 31 + yy * 17) - 0.5) * 0.25; // folhagem
    const v = t * 3 + (BAYER[yy & 3][xx & 3] / 16 - 0.47) * 0.8;
    px(g, verdes[Math.max(0, Math.min(3, Math.round(v)))], xx, yy);
  }
}
function arbusto(g, x, y, sem) {
  const v = ['#2a5a3a', '#3f8048', '#5ea85a'];
  g.fillStyle = 'rgba(30,20,40,0.25)'; g.fillRect(x - 6, y, 13, 2);
  for (let dy = -6; dy <= 0; dy++) for (let dx = -6; dx <= 6; dx++) {
    const d = (dx * dx) / 36 + ((dy + 3) * (dy + 3)) / 12;
    if (d > 1) continue;
    px(g, d > 0.8 ? '#1f3f30' : v[dy < -3 && dx < 2 ? 2 : dx > 3 ? 0 : 1], x + dx, y + dy);
  }
  if (sem > 0.5) for (const [dx, dy] of [[-3, -4], [2, -5], [4, -2]]) px(g, sem > 0.75 ? '#f2c14e' : '#e26fa6', x + dx, y + dy);
}
function poste(g, x, y) {
  g.fillStyle = 'rgba(30,20,40,0.28)'; g.fillRect(x - 3, y, 7, 2);
  px(g, '#2f2c45', x - 2, y - 2, 5, 2); px(g, '#2f2c45', x, y - 22, 1, 20); px(g, '#4b4a6b', x - 1, y - 22, 1, 20);
  px(g, '#2f2c45', x - 3, y - 25, 7, 3); px(g, '#ffe7a8', x - 2, y - 23, 5, 1);
}

// desenha o terreno inteiro (VW × VH) com o prédio em (OX, OY); ocupado(tx, ty) diz se o bloco é de alguma sala,
// para a calçada e a grama seguirem o contorno real da planta (em L, em T…)
export function desenharTerreno(v, bw, bh, semente = 1, ocupado = () => true, portas = []) {
  const { VW, VH, OX, OY } = v;
  const c = document.createElement('canvas'); c.width = VW; c.height = VH;
  const g = c.getContext('2d');
  // grama, calçada e sombra são pintadas direto num buffer (rápido mesmo em telas ultrawide)
  const img = g.createImageData(VW, VH), buf = new Uint32Array(img.data.buffer);
  const cor32 = (hex) => { const n = parseInt(hex.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16); };
  const GR = ['#4f7d43', '#5a8a4a', '#679852', '#78a85c'].map(cor32);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const n = sorte(x * 73856093 ^ y * 19349663 ^ semente);
    buf[y * VW + x] = GR[n < 0.12 ? 0 : n < 0.62 ? 1 : n < 0.93 ? 2 : 3];
  }
  const TUFO = cor32('#3f6a3a'), TUFO2 = cor32('#86b866');
  const poe = (x, y, c) => { if (x >= 0 && y >= 0 && x < VW && y < VH) buf[y * VW + x] = c; };
  for (let k = 0; k < (VW * VH) / 180; k++) {
    const x = Math.floor(sorte(k * 7 + semente) * VW), y = Math.floor(sorte(k * 13 + 5 + semente) * VH);
    poe(x, y + 1, TUFO); poe(x + 1, y + 1, TUFO); poe(x + 2, y + 1, TUFO); poe(x + 1, y, TUFO2);
  }
  // máscara do prédio (pixel a pixel) e faixas em volta dele
  const dentro = new Uint8Array(VW * VH);
  for (let ty = 0; ty * T < bh; ty++) for (let tx = 0; tx * T < bw; tx++) {
    if (!ocupado(tx, ty)) continue;
    for (let y = OY + ty * T; y < OY + (ty + 1) * T; y++) if (y >= 0 && y < VH) dentro.fill(1, y * VW + Math.max(0, OX + tx * T), y * VW + Math.min(VW, OX + (tx + 1) * T));
  }
  const dilata = (m, r) => {
    const h = new Uint8Array(VW * VH), o = new Uint8Array(VW * VH);
    for (let y = 0; y < VH; y++) { let ult = -1e9; for (let x = 0; x < VW; x++) { if (m[y * VW + x]) ult = x; if (x - ult <= r) h[y * VW + x] = 1; } ult = 1e9; for (let x = VW - 1; x >= 0; x--) { if (m[y * VW + x]) ult = x; if (ult - x <= r) h[y * VW + x] = 1; } }
    for (let x = 0; x < VW; x++) { let ult = -1e9; for (let y = 0; y < VH; y++) { if (h[y * VW + x]) ult = y; if (y - ult <= r) o[y * VW + x] = 1; } ult = 1e9; for (let y = VH - 1; y >= 0; y--) { if (h[y * VW + x]) ult = y; if (ult - y <= r) o[y * VW + x] = 1; } }
    return o;
  };
  const cal = 8;
  const calcada = dilata(dentro, cal);
  const tc = tons('#bdb7ae');
  const C0 = cor32('#bdb7ae'), CSH = cor32(tc.sh), CHI = cor32(tc.hi), CDK = cor32(tc.dk);
  const ehCal = (x, y) => x >= 0 && y >= 0 && x < VW && y < VH && calcada[y * VW + x] && !dentro[y * VW + x];
  const ehPredio = (x, y) => x >= 0 && y >= 0 && x < VW && y < VH && dentro[y * VW + x];
  const grama = (a, b) => !ehCal(a, b) && !ehPredio(a, b);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    if (!ehCal(x, y)) continue;
    let c = C0;
    if ((x - OX + cal) % 16 === 0 || (y - OY + cal) % 16 === 0) c = CSH;
    if (grama(x - 1, y) || grama(x, y - 1)) c = CHI;
    if (grama(x + 1, y) || grama(x, y + 1)) c = CDK;
    buf[y * VW + x] = c;
  }
  // caminho de calçada saindo de cada porta até a borda da tela (as árvores desviam dele)
  const caminho = new Uint8Array(VW * VH);
  for (const pt of portas) {
    const px0 = OX + pt.x * T, py0 = OY + pt.y * T;
    let x0, x1, y0, y1;
    if (pt.side === 'left') { x0 = 0; x1 = px0; y0 = py0 + 2; y1 = py0 + T - 2; }
    else if (pt.side === 'right') { x0 = px0 + T; x1 = VW; y0 = py0 + 2; y1 = py0 + T - 2; }
    else if (pt.side === 'bottom') { x0 = px0 + 2; x1 = px0 + T - 2; y0 = py0 + T; y1 = VH; }
    else { x0 = px0 + 2; x1 = px0 + T - 2; y0 = 0; y1 = py0; }
    for (let y = Math.max(0, y0); y < Math.min(VH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(VW, x1); x++) {
      if (dentro[y * VW + x]) continue;
      caminho[y * VW + x] = 1;
      const borda = x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1;
      buf[y * VW + x] = borda ? CDK : (((x - x0) >> 3) + ((y - y0) >> 3)) % 2 ? C0 : CHI;
    }
  }
  // sombra do prédio no chão (luz de cima à esquerda): mistura 35% com roxo escuro
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    if (ehPredio(x, y) || !(ehPredio(x - 4, y - 4) || ehPredio(x - 2, y - 2))) continue;
    const v = buf[y * VW + x], r = v & 255, gg = (v >> 8) & 255, bb = (v >> 16) & 255;
    buf[y * VW + x] = (255 << 24) | (Math.round(bb * 0.65 + 40 * 0.35) << 16) | (Math.round(gg * 0.65 + 20 * 0.35) << 8) | Math.round(r * 0.65 + 30 * 0.35);
  }
  g.putImageData(img, 0, 0);
  // postes nos cantos de fora da calçada
  const cx0 = OX - cal, cy0 = OY - cal, cw = bw + cal * 2, ch = bh + cal * 2;
  const postes = [[cx0 - 4, cy0 + ch + 2], [cx0 + cw + 4, cy0 + ch + 2], [cx0 - 4, cy0 + 26], [cx0 + cw + 4, cy0 + 26]]
    .filter(([x, y]) => x > 4 && x < VW - 4 && y > 26 && y < VH - 2);
  // árvores, arbustos e flores fora da calçada (inclusive nos cantos vazios da planta), sem encostar umas nas outras
  const zonas = { 14: dilata(dentro, cal + 14), 8: dilata(dentro, cal + 8), 2: dilata(dentro, cal + 2) };
  const perto = portas.length ? dilata(caminho, 12) : null;
  const livre = (x, y, m) => x > 6 && x < VW - 6 && y > 4 && y < VH - 2 && !zonas[m][y * VW + x] && !(perto && perto[y * VW + x]);
  let areaLivre = 0; for (let i = 0; i < VW * VH; i++) if (!zonas[14][i]) areaLivre++;
  const coisas = [];
  const longe = (x, y, d) => coisas.every(([a, b]) => Math.hypot(a - x, b - y) > d) && postes.every(([a, b]) => Math.hypot(a - x, b - y) > 14);
  const nArv = Math.round(areaLivre / 1400);
  for (let k = 0, tent = 0; k < nArv && tent < 600; tent++) {
    const x = Math.floor(sorte(tent * 101 + semente * 7) * VW), y = Math.floor(sorte(tent * 211 + 3 + semente) * VH);
    if (!livre(x, y, 14) || y < 30 || !longe(x, y, 26)) continue;
    coisas.push([x, y, 'arvore', sorte(tent * 17)]); k++;
  }
  const nArb = Math.round(nArv * 0.5) + 1;
  for (let k = 0, tent = 0; k < nArb && tent < 600; tent++) {
    const x = Math.floor(sorte(tent * 307 + 11 + semente) * VW), y = Math.floor(sorte(tent * 401 + 13 + semente) * VH);
    if (!livre(x, y, 8) || y < 8 || !longe(x, y, 16)) continue;
    coisas.push([x, y, 'arbusto', sorte(tent * 19 + 1)]); k++;
  }
  for (let k = 0; k < areaLivre / 300; k++) {
    const x = Math.floor(sorte(k * 53 + 7 + semente) * VW), y = Math.floor(sorte(k * 59 + 9 + semente) * VH);
    if (livre(x, y, 2)) { px(g, ['#f2c14e', '#e26fa6', '#ffffff', '#c9a0ff'][k % 4], x, y); px(g, '#3f6a3a', x, y + 1); }
  }
  // de cima para baixo, para as copas de baixo cobrirem os troncos de cima
  const tudo = [...coisas, ...postes.map(([x, y]) => [x, y, 'poste'])].sort((a, b) => a[1] - b[1]);
  for (const [x, y, tipo, s] of tudo) (tipo === 'arvore' ? arvore : tipo === 'arbusto' ? arbusto : poste)(g, x, y, s);
  return { canvas: c, postes: postes.map(([x, y]) => [x, y - 23]) };
}
