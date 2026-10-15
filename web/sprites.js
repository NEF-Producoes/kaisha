// Desenhos do Kaisha, todos feitos em código (licença MIT junto com o projeto).
// Um sprite em texto: cada letra é uma cor da paleta, "." é transparente.

export const T = 16; // tamanho do bloco em pixels

export function sprite(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== ' ' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

const cache = new Map();
export const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// ---------- cor: rampas com "hue shift" ----------
// a sombra puxa para o roxo e a luz puxa para o amarelo (luz quente vinda de cima, à esquerda)
const rgbDe = (hex) => { let h = String(hex).replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function hexDe(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const gira = (h, alvo, graus) => { const d = ((alvo - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), graus); };
const TONS = new Map();
// hi (luz), base, sh (sombra), dk (sombra forte), out (contorno colorido)
export function tons(hex) {
  if (TONS.has(hex)) return TONS.get(hex);
  const [h, s, l] = hsl(rgbDe(hex));
  const cinza = s < 0.08; // cinzas ganham um toque de cor na sombra, mas sem virar outra cor
  const t = {
    hi: hexDe(cinza ? h : gira(h, 50, 10), s * 0.95, Math.min(0.96, l + 0.09 + (1 - l) * 0.05)),
    base: hex,
    sh: hexDe(gira(h, 265, cinza ? 0 : 12), cinza ? 0.1 : Math.min(1, s * 1.05), l * 0.8),
    dk: hexDe(gira(h, 265, cinza ? 0 : 22), cinza ? 0.14 : Math.min(1, s * 1.1), l * 0.62),
    out: hexDe(gira(h, 270, cinza ? 0 : 30), cinza ? 0.2 : Math.min(0.75, s * 0.9 + 0.1), Math.max(0.09, l * 0.38)),
  };
  if (cinza) { const [hh] = [265]; t.sh = hexDe(hh, 0.08, l * 0.8); t.dk = hexDe(hh, 0.12, l * 0.62); t.out = hexDe(hh, 0.18, Math.max(0.1, l * 0.38)); }
  TONS.set(hex, t);
  return t;
}

// sombreamento automático de um sprite já pintado com as cores base:
// - borda do desenho vira contorno colorido (mais claro em cima/à esquerda, onde bate a luz)
// - o pixel logo depois da borda de cima/da esquerda ganha brilho
// - as últimas colunas da direita e a última linha de baixo ganham sombra
export function sombrear(src, { contorno = true } = {}) {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const cor = (x, y) => { const i = (y * w + x) * 4; return '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const borda = (x, y) => op(x, y) && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1));
  const novo = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!op(x, y)) continue;
    const t = tons(cor(x, y));
    let n = null;
    if (borda(x, y)) {
      if (contorno) n = (!op(x + 1, y) || !op(x, y + 1)) ? t.out : t.dk;
    } else if (!op(x + 2, y) || (borda(x + 1, y) && !op(x + 2, y))) n = t.sh;
    else if (borda(x, y + 1) && !op(x, y + 2)) n = t.sh;
    else if (borda(x - 1, y) || borda(x, y - 1)) n = t.hi;
    if (n) novo.push([x, y, n]);
  }
  for (const [x, y, n] of novo) { g.fillStyle = n; g.fillRect(x, y, 1, 1); }
  return c;
}
const espelhar = (c) => { const f = document.createElement('canvas'); f.width = c.width; f.height = c.height; const fg = f.getContext('2d'); fg.translate(c.width, 0); fg.scale(-1, 1); fg.drawImage(c, 0, 0); return f; };

// ---------- cores ----------
export const SHIRTS = {
  vermelho: ['#d9534f', '#a83a37'], red: ['#d9534f', '#a83a37'],
  laranja: ['#f0883e', '#c0652a'], orange: ['#f0883e', '#c0652a'],
  amarelo: ['#e9c046', '#b8932e'], yellow: ['#e9c046', '#b8932e'],
  verde: ['#4fa66a', '#367a4c'], green: ['#4fa66a', '#367a4c'],
  azul: ['#4a7fd4', '#335ca1'], blue: ['#4a7fd4', '#335ca1'],
  roxo: ['#8a63d2', '#6446a3'], purple: ['#8a63d2', '#6446a3'],
  rosa: ['#e26fa6', '#b4507f'], pink: ['#e26fa6', '#b4507f'],
  cinza: ['#7d8590', '#5a6069'], gray: ['#7d8590', '#5a6069'],
  preto: ['#3b3f46', '#25282d'], black: ['#3b3f46', '#25282d'],
  branco: ['#e6e6e6', '#bdbdbd'], white: ['#e6e6e6', '#bdbdbd'],
};
const HAIRS = ['#2b1d14', '#4a2f1d', '#7a4b26', '#c9a15a', '#1c1c1c', '#8b3a2a', '#5a5a5a', '#d6c08a'];
const SKINS = ['#f2c9a0', '#e0ac7e', '#c68b59', '#9c6b43', '#70482c', '#f6d7b8'];

export function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function agentLook(a) {
  const h = hashStr(a.id);
  const AUTO = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'cinza'];
  const shirt = SHIRTS[String(a.color || a.shirt || '').toLowerCase()] || SHIRTS[AUTO[h % AUTO.length]];
  const hair = a.hair && /^#/.test(a.hair) ? a.hair : HAIRS[(h >>> 4) % HAIRS.length];
  const skin = a.skin && /^#/.test(a.skin) ? a.skin : SKINS[(h >>> 8) % SKINS.length];
  const long = a.hairstyle === 'long';
  // cabelo longo usa a cabeça com laterais cheias e o cabelo cai sobre os ombros e as costas
  const style = long ? 1 : a.hairstyle === 'short' ? ((h >>> 12) % 2 ? 0 : 2) : (h >>> 12) % 3;
  return { shirt, hair, skin, style, long };
}

// ---------- personagem sentado, visto de costas ----------
// frames: 0 = parado, 1 e 2 = digitando (braços alternados)
const HEADS = [
  ['.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHHHHHH...', '...HHHHHHHHHH...', '...SHHHHHHHHS...', '....HHHHHHHH....', '.....SSSSSS.....'],
  ['....HHHHHHHH....', '...HHHHHHHHHH...', '..HHHHHHHHHHHH..', '..HHHHHHHHHHHH..', '..HHHHHHHHHHHH..', '..HHHHHHHHHHHH..', '..HHHHHHHHHHHH..', '..HH.SSSSSS.HH..'],
  ['......HHHH......', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHHHHHH...', '...SHHHHHHHHS...', '...SSHHHHHHSS...', '....SSSSSSSS....', '.....SSSSSS.....'],
];
const BODY = {
  0: ['...CCCCCCCCCC...', '..CCCCCCCCCCCC..', '.cCCCCCCCCCCCCc.', '.cCCCCCCCCCCCCc.', '.cCCCCCCCCCCCCc.', '.ccKKKKKKKKKKcc.', '..KKKKKKKKKKKK..', '..KkkkkkkkkkkK..', '..KKKKKKKKKKKK..', '.....KK..KK.....'],
  1: ['.S.CCCCCCCCCC...', '.cCCCCCCCCCCCC..', '.cCCCCCCCCCCCCc.', '..CCCCCCCCCCCCc.', '..CCCCCCCCCCCCc.', '..cKKKKKKKKKKcc.', '..KKKKKKKKKKKK..', '..KkkkkkkkkkkK..', '..KKKKKKKKKKKK..', '.....KK..KK.....'],
  2: ['...CCCCCCCCCC.S.', '..CCCCCCCCCCCCc.', '.cCCCCCCCCCCCCc.', '.cCCCCCCCCCCCC..', '.cCCCCCCCCCCCC..', '.ccKKKKKKKKKKc..', '..KKKKKKKKKKKK..', '..KkkkkkkkkkkK..', '..KKKKKKKKKKKK..', '.....KK..KK.....'],
};
// pinta cabelo (H) nas colunas indicadas das primeiras linhas do corpo (cabelo longo)
const comCabelo = (rows, linhas, de, ate) => rows.map((r, y) => (y < linhas ? [...r].map((ch, x) => (x >= de && x <= ate && ch !== '.' ? 'H' : ch)).join('') : r));
const LONGO_COSTAS = (rows) => comCabelo(rows, 4, 4, 11);
const LONGO_FRENTE = (rows) => rows.map((r, y) => (y < 4 ? [...r].map((ch, x) => ((x === 2 || x === 3 || x === 12 || x === 13) ? 'H' : ch)).join('') : r));
const LONGO_LADO = (rows) => rows.map((r, y) => (y < 4 ? [...r].map((ch, x) => (x >= 3 && x <= 5 ? 'H' : ch)).join('') : r));
export function agentSprite(look, frame) {
  return cached(`ag:${look.hair}:${look.skin}:${look.shirt[0]}:${look.style}:${look.long ? 'L' : ''}:${frame}`, () =>
    sombrear(sprite([...HEADS[look.style], ...(look.long ? LONGO_COSTAS(BODY[frame]) : BODY[frame])], { H: look.hair, S: look.skin, C: look.shirt[0], c: look.shirt[1], K: '#3a3f4b', k: '#2a2e37' })));
}
// ---------- personagem em pé (andando) ----------
// de frente (descendo), de costas (subindo) e de lado (direita; a esquerda é espelhada)
const FRONT_HEADS = [
  ['.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HSSSSSSSSH...', '...SSeSSSSeSS...', '...SSSSSSSSSS...', '....SSSmmSSS....', '.....SSSSSS.....'],
  ['....HHHHHHHH....', '...HHHHHHHHHH...', '..HHHHHHHHHHHH..', '..HHSSSSSSSSHH..', '..HHSeSSSSeSHH..', '..HHSSSSSSSSHH..', '..HH.SSmmSS.HH..', '..HH.SSSSSS.HH..'],
  ['......HHHH......', '....HHHHHHHH....', '...HHSSSSSSHH...', '...SSSSSSSSSS...', '...SSeSSSSeSS...', '...SSSSSSSSSS...', '....SSSmmSSS....', '.....SSSSSS.....'],
];
const SIDE_HEADS = [
  ['.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHSSSSS...', '...HHHHSSSeSS...', '...HHHSSSSSSS...', '....HSSSSSmS....', '.....SSSSSS.....'],
  ['....HHHHHHHH....', '...HHHHHHHHHH...', '..HHHHHHHHHHHH..', '..HHHHHHSSSSS...', '..HHHHHSSSeSS...', '..HHHHHSSSSSS...', '..HHHH.SSSSmS...', '..HHH..SSSSS....'],
  ['......HHHH......', '....HHHHHHHH....', '...HHHHHHSSSS...', '...HHHHSSSSSS...', '...HHHSSSSeSS...', '...SSSSSSSSSS...', '....SSSSSSmS....', '.....SSSSSS.....'],
];
const TORSO = {
  front: ['....CCCCCCCC....', '...CCCCCCCCCC...', '..cCCCCCCCCCCc..', '..cCCCCCCCCCCc..', '..SCCCCCCCCCCS..', '...CCCCCCCCCC...', '...PPPPPPPPPP...'],
  side: ['.....CCCCCCC....', '....CCCCCCCCC...', '....CCCCCCCCC...', '....CcCCCCCCC...', '....CSCCCCCCC...', '....CCCCCCCCC...', '....PPPPPPPPP...'],
};
const LEGS = {
  front: [
    ['...PPPP..PPPP...', '...PPPP..PPPP...', '...PPPP..PPPP...', '...PPP....PPP...', '...BBB....BBB...'],
    ['...PPPP..PPPP...', '...PPPP..PPPP...', '...BBBB..PPPP...', '..........PPP...', '..........BBB...'],
    ['...PPPP..PPPP...', '...PPPP..PPPP...', '...PPPP..BBBB...', '...PPP..........', '...BBB..........'],
  ],
  side: [
    ['.....PPPPPP.....', '.....PPPPPP.....', '.....PPP.PPP....', '.....PPP.PPP....', '.....BBB.BBBB...'],
    ['.....PPPPPP.....', '....PPP..PPP....', '...PPP....PPP...', '..PPP......PPP..', '..BBB......BBBB.'],
    ['.....PPPPPP.....', '.....PPPPPP.....', '......PPPPP.....', '......PPPP......', '......BBBBB.....'],
  ],
};
export function walkerSprite(look, facing, frame) {
  return cached(`wk:${look.hair}:${look.skin}:${look.shirt[0]}:${look.style}:${look.long ? 'L' : ''}:${facing}:${frame}`, () => {
    const lado = facing === 'left' || facing === 'right';
    const head = facing === 'up' ? HEADS[look.style] : lado ? SIDE_HEADS[look.style] : FRONT_HEADS[look.style];
    let torso = lado ? TORSO.side : TORSO.front;
    if (look.long) torso = facing === 'up' ? LONGO_COSTAS(torso) : lado ? LONGO_LADO(torso) : LONGO_FRENTE(torso);
    const legs = (lado ? LEGS.side : LEGS.front)[frame % 3];
    const pal = { H: look.hair, S: look.skin, C: look.shirt[0], c: look.shirt[1], P: '#3a3f4b', B: '#1f2228', e: '#1f2228', m: '#b5655a' };
    const c = sprite([...head, ...torso, ...legs], pal);
    return sombrear(facing === 'left' ? espelhar(c) : c);
  });
}

// sentado de frente (sofá): cabeça e tronco iguais aos de pé, pernas dobradas para a frente
export function sittingSprite(look) {
  return cached(`st:${look.hair}:${look.skin}:${look.shirt[0]}:${look.style}:${look.long ? 'L' : ''}`, () => {
    const torso = look.long ? LONGO_FRENTE(TORSO.front) : TORSO.front;
    const pernas = ['...PPPPPPPPPP...', '...PPPP..PPPP...', '...BBB....BBB...'];
    return sombrear(sprite([...FRONT_HEADS[look.style], ...torso, ...pernas], { H: look.hair, S: look.skin, C: look.shirt[0], c: look.shirt[1], P: '#3a3f4b', B: '#1f2228', e: '#1f2228', m: '#b5655a' }));
  });
}

// celular tocando (notificação de tarefa) e envelope (tarefa saindo da recepção)
export const phoneSprite = () => cached('phone', () => sombrear(sprite(['KKKKKK', 'KwwwwK', 'KwggwK', 'KwggwK', 'KwwwwK', 'KwwwwK', 'KKyyKK', 'KKKKKK'], { K: '#22252b', w: '#7fd1ff', g: '#4fa66a', y: '#5a6069' })));
export const mailSprite = () => cached('mail', () => sprite(['WWWWWWW', 'WbWWWbW', 'WWbWbWW', 'WWWbWWW', 'WWWWWWW'], { W: '#f7f3ea', b: '#c0504d' }));

export function emptyChair() {
  return cached('chair', () => sombrear(sprite(['................', '................', '................', '................', '................', '................', '................', '................', '....KKKKKKKK....', '...KKKKKKKKKK...', '...KkkkkkkkkK...', '...KKKKKKKKKK...', '...KKKKKKKKKK...', '..KKKKKKKKKKKK..', '..KKKKKKKKKKKK..', '..KkkkkkkkkkkK..', '..KKKKKKKKKKKK..', '.....KK..KK.....'], { K: '#3a3f4b', k: '#2a2e37' })));
}

// ---------- pisos e paredes (desenho procedural) ----------
// cada piso recebe (g, x, y, i, cx, cy): posição em pixels, um número pseudoaleatório do bloco e o bloco
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const sorte = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
// tábuas corridas: cada fileira de 4 px tem tábuas de comprimentos diferentes, que atravessam os blocos
function tabuas(cores) {
  const [junta, a, b, c2, veio] = cores;
  return (g, x, y, i, cx, cy) => {
    for (let k = 0; k < 4; k++) {
      const fil = cy * 4 + k;
      const comp = 24 + Math.floor(sorte(fil * 31 + 7) * 3) * 8;
      const desl = Math.floor(sorte(fil * 17 + 3) * comp);
      for (let dx = 0; dx < T; dx++) {
        const gx = cx * T + dx + desl, n = Math.floor(gx / comp);
        const tom = [a, b, c2][Math.floor(sorte(fil * 131 + n * 7) * 3)];
        const yy = y + k * 4;
        if (gx % comp === 0) { px(g, junta, x + dx, yy, 1, 4); continue; }
        px(g, junta, x + dx, yy); px(g, tom, x + dx, yy + 1, 1, 3);
        if (sorte(gx * 13 + fil * 7) < 0.06) px(g, veio, x + dx, yy + 1 + Math.floor(sorte(gx + fil) * 3));
      }
    }
  };
}
// carpete: base com fiapos de duas cores, espalhados
const carpete = (base, esc, cla) => (g, x, y, i, cx, cy) => {
  px(g, base, x, y, T, T);
  for (let k = 0; k < 14; k++) { const r = sorte(cx * 977 + cy * 131 + k * 17); px(g, r < 0.5 ? esc : cla, x + Math.floor(sorte(r * 1e6 + 1) * T), y + Math.floor(sorte(r * 1e6 + 2) * T)); }
};
export const FLOORS = {
  madeira: tabuas(['#8c5540', '#b57a4f', '#c08658', '#ab704a', '#9c6444']),
  madeira_escura: tabuas(['#4a2c2e', '#6d4a35', '#76503a', '#644332', '#583a2e']),
  carpete_azul: carpete('#56698c', '#4b5b80', '#62779a'),
  carpete_verde: carpete('#5c8768', '#4f7660', '#689473'),
  ladrilho: (g, x, y, i, cx, cy) => {
    const v = sorte(cx * 7 + cy * 13) < 0.5;
    px(g, v ? '#cdd0d6' : '#c7cad1', x, y, T, T);
    px(g, '#e0e2e6', x, y, T - 1, 1); px(g, '#e0e2e6', x, y, 1, T - 1);
    px(g, '#a6a3b4', x, y + T - 1, T, 1); px(g, '#a6a3b4', x + T - 1, y, 1, T);
    px(g, '#b9b9c6', x + 1, y + T - 2, T - 2, 1); px(g, '#b9b9c6', x + T - 2, y + 1, 1, T - 2);
  },
  xadrez: (g, x, y, i, cx, cy) => {
    const a = (cx + cy) % 2 === 0;
    px(g, a ? '#d6d8de' : '#a9b2c3', x, y, T, T);
    px(g, a ? '#e6e7eb' : '#b9c2d1', x, y, T, 1); px(g, a ? '#bfc0cc' : '#939bb2', x, y + T - 1, T, 1);
  },
};
FLOORS.wood = FLOORS.madeira; FLOORS.carpet = FLOORS.carpete_azul; FLOORS.tile = FLOORS.ladrilho; FLOORS.checker = FLOORS.xadrez;

export const WALLS = { clara: ['#e8e2d4', '#d4ccba', '#9b917c'], azul: ['#b9c9de', '#9fb3cc', '#6d7f99'], verde: ['#c4d8c2', '#a9c2a6', '#768f73'], escura: ['#5d6470', '#4b515c', '#30343b'] };
WALLS.light = WALLS.clara; WALLS.blue = WALLS.azul; WALLS.green = WALLS.verde; WALLS.dark = WALLS.escura;

// parede de 2 blocos: sanca no topo, textura leve, faixa de lambri, rodapé de madeira
// e uma sombrinha no chão logo abaixo (oclusão)
export function drawWall(g, x, y, w, cores) {
  const [parede, faixa] = cores;
  const tp = tons(parede), tf = tons(faixa);
  const H2 = 2 * T;
  px(g, parede, x, y, w, H2);
  px(g, tp.dk, x, y, w, 2); px(g, tp.sh, x, y + 2, w, 1);
  for (let dx = 0; dx < w; dx++) for (let dy = 4; dy < H2 - 7; dy++) if (sorte((x + dx) * 7919 + (y + dy) * 104729) < 0.012) px(g, tp.sh, x + dx, y + dy);
  px(g, tf.hi, x, y + H2 - 7, w, 1); px(g, faixa, x, y + H2 - 6, w, 2); px(g, tf.sh, x, y + H2 - 4, w, 1);
  px(g, '#a96a4c', x, y + H2 - 3, w, 1); px(g, '#844c3e', x, y + H2 - 2, w, 1); px(g, '#5c3438', x, y + H2 - 1, w, 1);
  g.fillStyle = 'rgba(46,20,56,0.22)'; g.fillRect(x, y + H2, w, 2);
  g.fillStyle = 'rgba(46,20,56,0.10)'; g.fillRect(x, y + H2 + 2, w, 2);
}

// sombra oval no chão (móveis e pessoas), em pixels inteiros para não borrar
export function sombraChao(g, cx, cy, rx, ry = 2, alfa = 0.3) {
  g.fillStyle = `rgba(46,20,56,${alfa})`;
  for (let dy = -ry; dy <= ry; dy++) {
    const meia = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    if (meia > 0) g.fillRect(Math.round(cx - meia), Math.round(cy + dy), meia * 2, 1);
  }
}

// ---------- móveis ----------
// cada móvel: largura e altura em pixels e uma função que desenha
// móveis de parede e tapetes não bloqueiam a passagem dos agentes
export const WALL_FURNITURE = new Set(['relogio', 'janela', 'quadro', 'grafico']);
export const FLAT_FURNITURE = new Set(['tapete']);
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
export const FURNITURE = {
  mesa: { w: 32, h: 16, draw: (g, x, y) => { R(g, '#8a5a36', x, y + 2, 32, 5); R(g, '#a5703f', x, y + 2, 32, 1); R(g, '#6e472b', x + 1, y + 7, 30, 7); R(g, '#5b3b24', x + 1, y + 13, 30, 1); R(g, '#4a301d', x + 2, y + 14, 2, 2); R(g, '#4a301d', x + 28, y + 14, 2, 2); R(g, '#7d522f', x + 4, y + 9, 10, 3); R(g, '#c9a46a', x + 8, y + 10, 2, 1); } },
  // mesa de comando (2 ou 3 monitores): 3 blocos de largura, com gaveteiro dos dois lados
  mesa_comando: { w: 48, h: 16, draw: (g, x, y) => { R(g, '#8a5a36', x, y + 2, 48, 5); R(g, '#a5703f', x, y + 2, 48, 1); R(g, '#6e472b', x + 1, y + 7, 46, 7); R(g, '#5b3b24', x + 1, y + 13, 46, 1); R(g, '#4a301d', x + 2, y + 14, 2, 2); R(g, '#4a301d', x + 44, y + 14, 2, 2); R(g, '#7d522f', x + 4, y + 9, 10, 3); R(g, '#c9a46a', x + 8, y + 10, 2, 1); R(g, '#7d522f', x + 34, y + 9, 10, 3); R(g, '#c9a46a', x + 38, y + 10, 2, 1); } },
  estante: { w: 16, h: 32, draw: (g, x, y) => { R(g, '#6e472b', x, y, 16, 32); R(g, '#8a5a36', x + 1, y + 1, 14, 30); const cores = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e', '#8064a2', '#4bacc6']; for (let s = 0; s < 3; s++) { R(g, '#5b3b24', x + 1, y + 9 + s * 10, 14, 1); for (let b = 0; b < 5; b++) R(g, cores[(s * 5 + b) % 6], x + 2 + b * 2.6 | 0, y + 3 + s * 10, 2, 6 - (b % 2)); } } },
  planta: { w: 16, h: 24, draw: (g, x, y) => { R(g, '#3f8f4f', x + 4, y + 2, 8, 9); R(g, '#57b067', x + 2, y + 5, 5, 6); R(g, '#57b067', x + 9, y + 4, 5, 7); R(g, '#2f6e3c', x + 7, y + 8, 2, 7); R(g, '#57b067', x + 6, y, 4, 4); R(g, '#b5653a', x + 4, y + 14, 8, 8); R(g, '#96512d', x + 4, y + 20, 8, 2); R(g, '#c97a4a', x + 3, y + 14, 10, 2); } },
  relogio: { w: 16, h: 16, draw: (g, x, y) => { R(g, '#3a3f4b', x + 3, y + 3, 10, 10); R(g, '#f2efe6', x + 4, y + 4, 8, 8); R(g, '#3a3f4b', x + 7, y + 5, 1, 4); R(g, '#3a3f4b', x + 7, y + 8, 3, 1); } },
  janela: { w: 32, h: 24, draw: (g, x, y) => { R(g, '#d4ccba', x, y + 2, 32, 20); R(g, '#8fc6e8', x + 2, y + 4, 28, 16); R(g, '#b7dcf2', x + 2, y + 4, 28, 5); R(g, '#e8e2d4', x + 15, y + 4, 2, 16); R(g, '#e8e2d4', x + 2, y + 11, 28, 1); R(g, '#9b917c', x, y + 21, 32, 1); } },
  quadro: { w: 32, h: 24, draw: (g, x, y) => { R(g, '#6e472b', x, y + 2, 32, 20); R(g, '#f7f3ea', x + 1, y + 3, 30, 18); const c = ['#f2c14e', '#8fd18c', '#f28b82', '#9ec5fe']; for (let col = 0; col < 3; col++) { R(g, '#d7d1c4', x + 10 + col * 10, y + 4, 1, 16); for (let k = 0; k < 3 - col % 2; k++) R(g, c[(col + k) % 4], x + 3 + col * 10, y + 5 + k * 5, 5, 4); } } },
  grafico: { w: 32, h: 24, draw: (g, x, y) => { R(g, '#9aa3ad', x, y + 2, 32, 20); R(g, '#ffffff', x + 1, y + 3, 30, 18); const hs = [4, 7, 6, 10, 13]; hs.forEach((h, i) => R(g, i === 4 ? '#3fae5a' : '#6fbf73', x + 4 + i * 5, y + 18 - h, 3, h)); R(g, '#c7ccd2', x + 3, y + 18, 26, 1); } },
  bebedouro: { w: 16, h: 32, draw: (g, x, y) => { R(g, '#8fc6e8', x + 4, y + 2, 8, 9); R(g, '#b7dcf2', x + 5, y + 3, 3, 6); R(g, '#e6e8eb', x + 3, y + 11, 10, 19); R(g, '#c9cdd2', x + 3, y + 28, 10, 2); R(g, '#4a7fd4', x + 5, y + 14, 2, 2); R(g, '#d9534f', x + 9, y + 14, 2, 2); } },
  arquivo: { w: 16, h: 32, draw: (g, x, y) => { R(g, '#7d8590', x + 1, y + 4, 14, 27); for (let k = 0; k < 3; k++) { R(g, '#959ca6', x + 2, y + 5 + k * 9, 12, 8); R(g, '#5a6069', x + 6, y + 8 + k * 9, 4, 1); } } },
  sofa: { w: 32, h: 16, draw: (g, x, y) => { R(g, '#4a6fa5', x, y + 2, 32, 7); R(g, '#3b5a87', x, y + 8, 32, 6); R(g, '#5a82bd', x + 3, y + 4, 12, 4); R(g, '#5a82bd', x + 17, y + 4, 12, 4); R(g, '#2f4a70', x + 1, y + 14, 2, 2); R(g, '#2f4a70', x + 29, y + 14, 2, 2); } },
  mesa_reuniao: { w: 48, h: 32, draw: (g, x, y) => { R(g, '#8a5a36', x + 2, y + 6, 44, 18); R(g, '#a5703f', x + 2, y + 6, 44, 2); R(g, '#6e472b', x + 2, y + 24, 44, 3); for (const cx of [8, 20, 32]) { R(g, '#3a3f4b', x + cx, y, 8, 5); R(g, '#3a3f4b', x + cx, y + 28, 8, 4); } } },
  impressora: { w: 16, h: 16, draw: (g, x, y) => { R(g, '#d6d9dd', x + 1, y + 5, 14, 8); R(g, '#f7f7f7', x + 4, y + 2, 8, 4); R(g, '#9aa3ad', x + 1, y + 11, 14, 2); R(g, '#3fae5a', x + 12, y + 7, 1, 1); } },
  tapete: { w: 48, h: 32, draw: (g, x, y) => { R(g, '#b2564b', x, y, 48, 32); R(g, '#c96a5e', x + 3, y + 3, 42, 26); R(g, '#d98f6f', x + 8, y + 8, 32, 16); } },
  // porta do banheiro: placa com os bonequinhos; a luz de livre/ocupado é pintada por cima, ao vivo
  banheiro: { w: 16, h: 32, draw: (g, x, y) => { R(g, '#5b3b24', x + 1, y + 2, 14, 30); R(g, '#8a5a36', x + 2, y + 3, 12, 29); R(g, '#a5703f', x + 2, y + 3, 12, 1); R(g, '#7a4e2e', x + 4, y + 13, 8, 7); R(g, '#7a4e2e', x + 4, y + 23, 8, 7); R(g, '#e8eef5', x + 3, y + 5, 8, 6); R(g, '#4a7fd4', x + 4, y + 6, 1, 1); R(g, '#4a7fd4', x + 4, y + 7, 2, 3); R(g, '#d9534f', x + 8, y + 6, 1, 1); R(g, '#d9534f', x + 7, y + 7, 3, 3); R(g, '#9aa3ad', x + 6, y + 6, 1, 4); R(g, '#f2c14e', x + 12, y + 19, 1, 2); } },
  // jogos: a mesa/tela é desenhada aqui; bolas, bonecos e a tela do videogame se mexem por cima, ao vivo
  sinuca: { w: 48, h: 32, draw: (g, x, y) => { R(g, '#4a301d', x + 3, y + 26, 4, 5); R(g, '#4a301d', x + 41, y + 26, 4, 5); R(g, '#5b3b24', x, y + 4, 48, 23); R(g, '#7a4e2e', x + 1, y + 5, 46, 21); R(g, '#8a5a36', x + 1, y + 5, 46, 1); R(g, '#2f8f4f', x + 4, y + 8, 40, 15); R(g, '#277a43', x + 4, y + 8, 40, 1); R(g, '#277a43', x + 4, y + 8, 1, 15); for (const [px, py] of [[3, 7], [22, 6], [41, 7], [3, 21], [22, 22], [41, 21]]) R(g, '#15181d', x + px, y + py, 4, 3); R(g, '#3a7d55', x + 14, y + 8, 1, 15); } },
  pebolim: { w: 32, h: 16, draw: (g, x, y) => { R(g, '#4a301d', x + 2, y + 13, 3, 3); R(g, '#4a301d', x + 27, y + 13, 3, 3); R(g, '#6e472b', x, y + 1, 32, 13); R(g, '#8a5a36', x, y + 1, 32, 1); R(g, '#3f9a55', x + 2, y + 3, 28, 9); R(g, '#e8f1ea', x + 15, y + 3, 1, 9); R(g, '#e8f1ea', x + 2, y + 6, 1, 3); R(g, '#e8f1ea', x + 29, y + 6, 1, 3); for (const rx of [6, 11, 20, 25]) R(g, '#c9cdd2', x + rx, y, 1, 15); } },
  videogame: { w: 32, h: 24, draw: (g, x, y) => { R(g, '#3a2f28', x + 1, y + 16, 30, 7); R(g, '#4d3e33', x + 1, y + 16, 30, 1); R(g, '#2a221d', x + 3, y + 22, 3, 2); R(g, '#2a221d', x + 26, y + 22, 3, 2); R(g, '#15181d', x + 2, y + 1, 28, 15); R(g, '#22262e', x + 3, y + 2, 26, 13); R(g, '#15181d', x + 14, y + 15, 4, 2); R(g, '#e6e6e6', x + 5, y + 18, 7, 3); R(g, '#4fa66a', x + 10, y + 19, 1, 1); R(g, '#3b3f46', x + 20, y + 19, 4, 2); R(g, '#3b3f46', x + 25, y + 19, 4, 2); } },
  cafe: { w: 16, h: 24, draw: (g, x, y) => { R(g, '#3a3f4b', x + 2, y + 2, 12, 20); R(g, '#5a6069', x + 3, y + 3, 10, 6); R(g, '#e6e6e6', x + 6, y + 13, 4, 4); R(g, '#d9534f', x + 11, y + 4, 1, 1); } },
};
const FURN_ALIAS = { bookshelf: 'estante', plant: 'planta', clock: 'relogio', window: 'janela', kanban: 'quadro', board: 'quadro', chart: 'grafico', water: 'bebedouro', cooler: 'bebedouro', cabinet: 'arquivo', couch: 'sofa', meeting_table: 'mesa_reuniao', printer: 'impressora', rug: 'tapete', coffee: 'cafe', wc: 'banheiro', pool: 'sinuca', bilhar: 'sinuca', snooker: 'sinuca', foosball: 'pebolim', totó: 'pebolim', toto: 'pebolim', game: 'videogame', tv: 'videogame', console: 'videogame', bathroom: 'banheiro', toilet: 'banheiro', restroom: 'banheiro', relógio: 'relogio', gráfico: 'grafico', café: 'cafe', desk: 'mesa' };
// cada móvel é pintado uma vez num canvas próprio e passa pelo sombreamento automático
const SEM_CONTORNO = new Set(['tapete']);
function sombreado(key) {
  return cached('mv:' + key, () => {
    const def = FURNITURE[key];
    const c = document.createElement('canvas'); c.width = def.w; c.height = def.h;
    def.draw(c.getContext('2d'), 0, 0);
    const pronto = sombrear(c, { contorno: !SEM_CONTORNO.has(key) });
    return { w: def.w, h: def.h, draw: (g, x, y) => g.drawImage(pronto, x, y) };
  });
}
export const furniture = (type) => { const k = FURNITURE[type] ? type : FURN_ALIAS[type]; return k && FURNITURE[k] ? sombreado(k) : null; };

// ---------- monitor ----------
// estado: working (tela com código rolando), waiting, idle, error, offline
export function drawMonitor(g, x, y, status, tick) {
  R(g, '#1e1a2a', x, y, 16, 11); R(g, '#2f2c45', x + 1, y, 14, 1); R(g, '#4b4a6b', x + 1, y, 13, 1); R(g, '#1e1a2a', x, y + 10, 16, 1);
  R(g, '#4b4a6b', x + 6, y + 11, 4, 2); R(g, '#6f7396', x + 6, y + 11, 1, 2); R(g, '#2f2c45', x + 4, y + 13, 8, 1); R(g, '#6f7396', x + 4, y + 13, 5, 1);
  const tela = { working: '#1d3b5c', waiting: '#2b3445', idle: '#1b1f27', error: '#5c1d1d', offline: '#111317' }[status] || '#1b1f27';
  R(g, tela, x + 1, y + 1, 14, 9);
  if (status === 'working') {
    const cores = ['#7fd1ff', '#9be89b', '#f2c14e', '#c9a0ff'];
    for (let l = 0; l < 4; l++) { const w = 3 + ((l * 5 + tick) % 9); R(g, cores[(l + tick) % 4], x + 2, y + 2 + l * 2, Math.min(w, 12), 1); }
  } else if (status === 'waiting') {
    R(g, '#7d8590', x + 3, y + 4, 10, 1); R(g, '#7d8590', x + 3, y + 6, 6, 1);
  } else if (status === 'error') {
    if (tick % 2 === 0) { R(g, '#ff6b6b', x + 7, y + 2, 2, 4); R(g, '#ff6b6b', x + 7, y + 7, 2, 2); }
  } else if (status === 'idle') {
    R(g, '#2b3a55', x + 2 + (tick % 10), y + 3 + (tick % 5), 2, 2);
  }
}
export const furnitureKey = (type) => (FURNITURE[type] ? type : FURN_ALIAS[type] || null);
