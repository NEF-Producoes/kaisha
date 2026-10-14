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
    sprite([...HEADS[look.style], ...(look.long ? LONGO_COSTAS(BODY[frame]) : BODY[frame])], { H: look.hair, S: look.skin, C: look.shirt[0], c: look.shirt[1], K: '#3a3f4b', k: '#2a2e37' }));
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
    if (facing !== 'left') return c;
    const f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    const fg = f.getContext('2d'); fg.translate(c.width, 0); fg.scale(-1, 1); fg.drawImage(c, 0, 0);
    return f;
  });
}

// celular tocando (notificação de tarefa) e envelope (tarefa saindo da recepção)
export const phoneSprite = () => cached('phone', () => sprite(['KKKKKK', 'KwwwwK', 'KwggwK', 'KwggwK', 'KwwwwK', 'KwwwwK', 'KKyyKK', 'KKKKKK'], { K: '#22252b', w: '#7fd1ff', g: '#4fa66a', y: '#5a6069' }));
export const mailSprite = () => cached('mail', () => sprite(['WWWWWWW', 'WbWWWbW', 'WWbWbWW', 'WWWbWWW', 'WWWWWWW'], { W: '#f7f3ea', b: '#c0504d' }));

export function emptyChair() {
  return cached('chair', () => sprite(['................', '................', '................', '................', '................', '................', '................', '................', '....KKKKKKKK....', '...KKKKKKKKKK...', '...KkkkkkkkkK...', '...KKKKKKKKKK...', '...KKKKKKKKKK...', '..KKKKKKKKKKKK..', '..KKKKKKKKKKKK..', '..KkkkkkkkkkkK..', '..KKKKKKKKKKKK..', '.....KK..KK.....'], { K: '#3a3f4b', k: '#2a2e37' }));
}

// ---------- pisos e paredes (desenho procedural) ----------
export const FLOORS = {
  madeira: (g, x, y, i) => { g.fillStyle = '#b07a4f'; g.fillRect(x, y, T, T); g.fillStyle = '#9a6842'; for (let k = 0; k < T; k += 4) g.fillRect(x, y + k + 3, T, 1); g.fillStyle = '#c28b5c'; g.fillRect(x + ((i * 7) % 12), y + ((i * 3) % 4) * 4, 3, 1); g.fillStyle = '#8c5d3a'; g.fillRect(x + (i % 2 ? 5 : 11), y, 1, 3); },
  carpete_azul: (g, x, y, i) => { g.fillStyle = '#5a6f8f'; g.fillRect(x, y, T, T); g.fillStyle = '#52668a'; for (let k = 0; k < 6; k++) g.fillRect(x + ((i * 5 + k * 7) % 15), y + ((i * 3 + k * 5) % 15), 1, 1); },
  carpete_verde: (g, x, y, i) => { g.fillStyle = '#5f8a6a'; g.fillRect(x, y, T, T); g.fillStyle = '#557f60'; for (let k = 0; k < 6; k++) g.fillRect(x + ((i * 5 + k * 7) % 15), y + ((i * 3 + k * 5) % 15), 1, 1); },
  ladrilho: (g, x, y) => { g.fillStyle = '#c9ccd1'; g.fillRect(x, y, T, T); g.fillStyle = '#b3b7bd'; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T); g.fillStyle = '#d6d9dd'; g.fillRect(x + 1, y + 1, 3, 1); },
  xadrez: (g, x, y, i, cx, cy) => { const a = (cx + cy) % 2 === 0; g.fillStyle = a ? '#d3d6db' : '#aeb7c4'; g.fillRect(x, y, T, T); },
  madeira_escura: (g, x, y, i) => { g.fillStyle = '#6d4a33'; g.fillRect(x, y, T, T); g.fillStyle = '#5c3e2a'; for (let k = 0; k < T; k += 4) g.fillRect(x, y + k + 3, T, 1); },
};
FLOORS.wood = FLOORS.madeira; FLOORS.carpet = FLOORS.carpete_azul; FLOORS.tile = FLOORS.ladrilho; FLOORS.checker = FLOORS.xadrez;

export const WALLS = { clara: ['#e8e2d4', '#d4ccba', '#9b917c'], azul: ['#b9c9de', '#9fb3cc', '#6d7f99'], verde: ['#c4d8c2', '#a9c2a6', '#768f73'], escura: ['#5d6470', '#4b515c', '#30343b'] };
WALLS.light = WALLS.clara; WALLS.blue = WALLS.azul; WALLS.green = WALLS.verde; WALLS.dark = WALLS.escura;

// ---------- móveis ----------
// cada móvel: largura e altura em pixels e uma função que desenha
// móveis de parede e tapetes não bloqueiam a passagem dos agentes
export const WALL_FURNITURE = new Set(['relogio', 'janela', 'quadro', 'grafico']);
export const FLAT_FURNITURE = new Set(['tapete']);
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
export const FURNITURE = {
  mesa: { w: 32, h: 16, draw: (g, x, y) => { R(g, '#8a5a36', x, y + 2, 32, 5); R(g, '#a5703f', x, y + 2, 32, 1); R(g, '#6e472b', x + 1, y + 7, 30, 7); R(g, '#5b3b24', x + 1, y + 13, 30, 1); R(g, '#4a301d', x + 2, y + 14, 2, 2); R(g, '#4a301d', x + 28, y + 14, 2, 2); R(g, '#7d522f', x + 4, y + 9, 10, 3); R(g, '#c9a46a', x + 8, y + 10, 2, 1); } },
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
  cafe: { w: 16, h: 24, draw: (g, x, y) => { R(g, '#3a3f4b', x + 2, y + 2, 12, 20); R(g, '#5a6069', x + 3, y + 3, 10, 6); R(g, '#e6e6e6', x + 6, y + 13, 4, 4); R(g, '#d9534f', x + 11, y + 4, 1, 1); } },
};
const FURN_ALIAS = { bookshelf: 'estante', plant: 'planta', clock: 'relogio', window: 'janela', kanban: 'quadro', board: 'quadro', chart: 'grafico', water: 'bebedouro', cooler: 'bebedouro', cabinet: 'arquivo', couch: 'sofa', meeting_table: 'mesa_reuniao', printer: 'impressora', rug: 'tapete', coffee: 'cafe', relógio: 'relogio', gráfico: 'grafico', café: 'cafe', desk: 'mesa' };
export const furniture = (type) => FURNITURE[type] || FURNITURE[FURN_ALIAS[type]] || null;

// ---------- monitor ----------
// estado: working (tela com código rolando), waiting, idle, error, offline
export function drawMonitor(g, x, y, status, tick) {
  R(g, '#2a2e37', x, y, 16, 11); R(g, '#3a3f4b', x + 6, y + 11, 4, 2); R(g, '#2a2e37', x + 4, y + 13, 8, 1);
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
