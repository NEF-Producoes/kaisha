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

// desenha o terreno inteiro (VW × VH) com o espaço do prédio em (OX, OY, bw, bh)
export function desenharTerreno(v, bw, bh, semente = 1) {
  const { VW, VH, OX, OY } = v;
  const c = document.createElement('canvas'); c.width = VW; c.height = VH;
  const g = c.getContext('2d');
  // grama
  const gr = ['#4f7d43', '#5a8a4a', '#679852', '#78a85c'];
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const n = sorte(x * 73856093 ^ y * 19349663 ^ semente) ;
    px(g, gr[n < 0.12 ? 0 : n < 0.62 ? 1 : n < 0.93 ? 2 : 3], x, y);
  }
  // tufos
  for (let k = 0; k < (VW * VH) / 180; k++) {
    const x = Math.floor(sorte(k * 7 + semente) * VW), y = Math.floor(sorte(k * 13 + 5 + semente) * VH);
    px(g, '#3f6a3a', x, y + 1, 3, 1); px(g, '#86b866', x + 1, y, 1, 1);
  }
  // calçada em volta do prédio (meio bloco), com juntas
  const cal = 8, cx0 = OX - cal, cy0 = OY - cal, cw = bw + cal * 2, ch = bh + cal * 2;
  const tc = tons('#bdb7ae');
  px(g, '#bdb7ae', cx0, cy0, cw, ch);
  for (let x = cx0; x < cx0 + cw; x += 16) { px(g, tc.sh, x, cy0, 1, ch); }
  for (let y = cy0; y < cy0 + ch; y += 16) { px(g, tc.sh, cx0, y, cw, 1); }
  px(g, tc.hi, cx0, cy0, cw, 1); px(g, tc.hi, cx0, cy0, 1, ch);
  px(g, tc.dk, cx0, cy0 + ch - 1, cw, 1); px(g, tc.dk, cx0 + cw - 1, cy0, 1, ch);
  // sombra do prédio na calçada (luz de cima à esquerda)
  g.fillStyle = 'rgba(30,20,40,0.35)'; g.fillRect(OX + 4, OY + bh, bw, 4); g.fillRect(OX + bw, OY + 4, 4, bh - 4);
  // postes nos cantos da calçada
  const postes = [[cx0 - 4, cy0 + ch + 2], [cx0 + cw + 4, cy0 + ch + 2], [cx0 - 4, cy0 + 26], [cx0 + cw + 4, cy0 + 26]]
    .filter(([x, y]) => x > 4 && x < VW - 4 && y > 26 && y < VH - 2);
  // árvores, arbustos e flores fora da calçada, sem encostar umas nas outras
  const livre = (x, y, m) => (x < cx0 - m || x > cx0 + cw + m || y < cy0 - m || y > cy0 + ch + m) && x > 6 && x < VW - 6 && y > 4 && y < VH - 2;
  const coisas = [];
  const longe = (x, y, d) => coisas.every(([a, b]) => Math.hypot(a - x, b - y) > d) && postes.every(([a, b]) => Math.hypot(a - x, b - y) > 14);
  const nArv = Math.round((VW * VH - cw * ch) / 2600);
  for (let k = 0, tent = 0; k < nArv && tent < 400; tent++) {
    const x = Math.floor(sorte(tent * 101 + semente * 7) * VW), y = Math.floor(sorte(tent * 211 + 3 + semente) * VH);
    if (!livre(x, y, 14) || y < 30 || !longe(x, y, 26)) continue;
    coisas.push([x, y, 'arvore', sorte(tent * 17)]); k++;
  }
  const nArb = Math.round(nArv * 0.5) + 1;
  for (let k = 0, tent = 0; k < nArb && tent < 400; tent++) {
    const x = Math.floor(sorte(tent * 307 + 11 + semente) * VW), y = Math.floor(sorte(tent * 401 + 13 + semente) * VH);
    if (!livre(x, y, 8) || y < 8 || !longe(x, y, 16)) continue;
    coisas.push([x, y, 'arbusto', sorte(tent * 19 + 1)]); k++;
  }
  for (let k = 0; k < (VW * VH - cw * ch) / 400; k++) {
    const x = Math.floor(sorte(k * 53 + 7 + semente) * VW), y = Math.floor(sorte(k * 59 + 9 + semente) * VH);
    if (livre(x, y, 2)) { px(g, ['#f2c14e', '#e26fa6', '#ffffff', '#c9a0ff'][k % 4], x, y); px(g, '#3f6a3a', x, y + 1); }
  }
  // de cima para baixo, para as copas de baixo cobrirem os troncos de cima
  const tudo = [...coisas, ...postes.map(([x, y]) => [x, y, 'poste'])].sort((a, b) => a[1] - b[1]);
  for (const [x, y, tipo, s] of tudo) (tipo === 'arvore' ? arvore : tipo === 'arbusto' ? arbusto : poste)(g, x, y, s);
  return { canvas: c, postes: postes.map(([x, y]) => [x, y - 23]) };
}
