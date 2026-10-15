// Kaisha · escritório no navegador
import { initEditor } from './editor.js?v=__V__';
import { T, sprite, cached, agentLook, agentSprite, walkerSprite, sittingSprite, phoneSprite, mailSprite, emptyChair, FLOORS, WALLS, furniture, furnitureKey, WALL_FURNITURE, FLAT_FURNITURE, drawMonitor, hashStr, drawWall, sombraChao } from './sprites.js?v=__V__';
import { desenharRetrato } from './retrato.js?v=__V__';

const I18N = {
  'pt-BR': {
    working: 'Executando', waiting: 'Aguardando', idle: 'Livre', error: 'Erro', offline: 'Offline',
    queue: (n) => `${n} na fila`, noDesk: 'Sem mesa', history: 'Histórico', close: 'Fechar', updated: 'atualizado',
    connected: 'ao vivo', reconnecting: 'reconectando…', noHistory: 'Sem eventos ainda.', configError: 'Erro na configuração',
    ago: (s) => (s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`),
    theme: 'Tema', agents: 'agentes', today: 'HOJE', success: 'Sucesso', question: 'Pergunta', inWaiting: 'na espera',
    needs: { sede: 'Sede', banheiro: 'Banheiro', social: 'Papo', diversao: 'Diversão', cansaco: 'Cansaço' },
    doing: { beber: 'tomando um café ou água', banheiro: 'no banheiro', celular: 'no celular, no sofá', ler: 'lendo um livro', cochilar: 'cochilando no sofá', papo: 'batendo papo', jogo_sinuca: 'jogando sinuca', jogo_pebolim: 'jogando pebolim', jogo_videogame: 'jogando videogame', almocar: 'almoçando', happy: 'no happy hour', embora: 'indo embora', casa: 'em casa', almocoFora: 'almoçando fora', aplaudir: 'aplaudindo', disfarce: 'disfarçando (o chefe passou)', indo: 'indo', livre: 'à toa', mesa: 'trabalhando na mesa', fixo: 'não sai da mesa' }, now: 'Agora', wins: 'Vitórias hoje',
  },
  en: {
    working: 'Working', waiting: 'Waiting', idle: 'Idle', error: 'Error', offline: 'Offline',
    queue: (n) => `${n} queued`, noDesk: 'No desk', history: 'History', close: 'Close', updated: 'updated',
    connected: 'live', reconnecting: 'reconnecting…', noHistory: 'No events yet.', configError: 'Configuration error',
    ago: (s) => (s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`),
    theme: 'Theme', agents: 'agents', today: 'TODAY', success: 'Success', question: 'Question', inWaiting: 'waiting room',
    needs: { sede: 'Thirst', banheiro: 'Bathroom', social: 'Chat', diversao: 'Fun', cansaco: 'Tiredness' },
    doing: { beber: 'having coffee or water', banheiro: 'in the bathroom', celular: 'on the phone, on the couch', ler: 'reading a book', cochilar: 'napping on the couch', papo: 'chatting', jogo_sinuca: 'playing pool', jogo_pebolim: 'playing foosball', jogo_videogame: 'playing video games', almocar: 'having lunch', happy: 'at happy hour', embora: 'heading home', casa: 'at home', almocoFora: 'out for lunch', aplaudir: 'clapping', disfarce: 'pretending to work', indo: 'on the way', livre: 'idling', mesa: 'working at the desk', fixo: 'stays at the desk' }, now: 'Now', wins: 'Wins today',
  },
};
let L = I18N['pt-BR'];

const $ = (s) => document.querySelector(s);
// andar aberto no painel (?andar=nef); sem parâmetro, o principal
const ANDAR = (new URLSearchParams(location.search).get('andar') || '').trim().toLowerCase();
const api = (p) => (ANDAR ? p + (p.includes('?') ? '&' : '?') + 'andar=' + encodeURIComponent(ANDAR) : p);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const stage = $('#stage');
const canvas = $('#world');
const g = canvas.getContext('2d');
const overlay = $('#overlay');

const state = {
  snap: null,          // escritório + tema
  agents: new Map(),   // id -> estado vindo da API
  layout: null,        // salas, mesas e posições calculadas
  staticLayer: null,   // canvas com piso, paredes, móveis e enfeites fixos
  scale: 3,
  offlineAfterMs: 15 * 60000,
  clockSkew: 0,
  particles: [],
  mail: [],            // envelopes voando do agente central até quem recebeu a tarefa
  ents: null,          // posição e movimento de cada agente
  burst: [],           // confete das comemorações
  flash: new Map(),    // balão "✓ feito" que aparece por alguns segundos
  score: null,         // placar do dia
  visits: [],          // visitas do dia (pacientes, clientes) vindas do servidor
  visitas: new Map(),  // id -> boneco da visita andando pelo escritório
  buscas: new Map(),   // agente -> paciente que ele foi buscar na sala de espera
  chamadas: new Map(), // teleconsultas em andamento (janela de vídeo na mesa de quem atende)
  visitasProntas: false, // depois do primeiro quadro, quem chega entra pela porta (antes disso já aparece no lugar)
  selected: null,
};

// ---------- layout ----------
const temParede = (r) => state.layout_plan !== 'open' || r.y === 0 || r.virtual;
function buildLayout() {
  const office = state.snap.office;
  state.layout_plan = office.plan || 'rooms';
  const rooms = office.rooms.map((r) => ({ ...r, x: r.area[0], y: r.area[1], w: r.area[2], h: r.area[3] }));
  const desks = [];
  const configured = new Set();
  for (const a of office.agents) {
    if (!a.desk) continue;
    configured.add(a.id);
    desks.push({ agent: a, x: a.desk[0], y: a.desk[1] });
  }
  // agentes que mandam status sem mesa no office.yaml vão para a sala "Sem mesa"
  const extras = [...state.agents.keys()].filter((id) => !configured.has(id)).sort();
  let W = Math.max(...rooms.map((r) => r.x + r.w)), H = Math.max(...rooms.map((r) => r.y + r.h));
  if (extras.length) {
    const w = Math.max(W, 2 + extras.length * 5);
    rooms.push({ id: '_sem_mesa', name: L.noDesk, x: 0, y: H, w, h: 6, floor: 'ladrilho', wall: 'escura', virtual: true });
    extras.forEach((id, i) => {
      const cfg = office.agents.find((a) => a.id === id) || { id, name: id, role: '' };
      desks.push({ agent: cfg, x: 1 + i * 5, y: H + 3 });
    });
    W = Math.max(W, w); H += 6;
  }
  state.layout = { rooms, desks, W, H };
  buildNav();
}

// ---------- mapa de passagem (onde os agentes podem andar) ----------
// floor: sala de cada bloco de piso (-1 = fora); walk: 1 se dá para pisar; doors: passagens entre salas
function buildNav() {
  const { rooms, desks, W, H } = state.layout;
  const floor = new Int16Array(W * H).fill(-1);
  const wallRow = new Uint8Array(W * H);
  rooms.forEach((r, ri) => {
    const topo = temParede(r) ? 2 : 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (y < r.y + topo) wallRow[y * W + x] = 1; else floor[y * W + x] = ri;
    }
  });
  const walk = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) walk[i] = floor[i] >= 0 ? 1 : 0;
  const block = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) walk[y * W + x] = 0; };
  const pois = [], cafes = [];
  for (const f of state.snap.office.furniture || []) {
    const key = furnitureKey(f.type), def = key && furniture(key);
    if (!def || WALL_FURNITURE.has(key)) continue;
    const tw = Math.ceil(def.w / T), th = Math.ceil(def.h / T);
    if (!FLAT_FURNITURE.has(key)) for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) block(f.pos[0] + x, f.pos[1] + y);
    // lugares para onde os agentes gostam de ir quando estão livres
    if (['cafe', 'bebedouro', 'sofa', 'planta', 'estante', 'arquivo', 'impressora', 'mesa_reuniao'].includes(key))
      for (let x = 0; x < tw; x++) { pois.push([f.pos[0] + x, f.pos[1] + th]); if (key === 'cafe' || key === 'bebedouro') cafes.push([f.pos[0] + x, f.pos[1] + th]); }
  }
  for (const d of desks) for (const dx of [0, 1]) { block(d.x + dx, d.y); block(d.x + dx, d.y - 1); }
  // lugares das vontades: água/café, sofás (fora da sala de espera), banheiros e estantes
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x];
  const espera = rooms.findIndex((r) => r.kind === 'waiting');
  const lugares = { agua: [], sofas: [], banheiros: [], estantes: [], jogos: [], mesa: [] };
  (state.snap.office.furniture || []).forEach((f, fi) => {
    const key = furnitureKey(f.type), def = key && furniture(key);
    if (!def) return;
    const tw = Math.ceil(def.w / T), th = Math.ceil(def.h / T), fy = f.pos[1] + th;
    for (let x = f.pos[0]; x < f.pos[0] + tw; x++) {
      if (!ok(x, fy)) continue;
      const frente = fy * W + x;
      if (key === 'cafe' || key === 'bebedouro') lugares.agua.push({ tile: frente, tipo: key });
      else if (key === 'estante') lugares.estantes.push(frente);
      else if (key === 'sofa' && (espera < 0 || floor[f.pos[1] * W + x] !== espera)) lugares.sofas.push({ frente, px: x * T + 8, py: f.pos[1] * T + 13 });
    }
    if (key === 'banheiro') {
      const fx = [f.pos[0], f.pos[0] + tw - 1].find((x) => ok(x, fy));
      if (fx != null) lugares.banheiros.push({ id: fi, frente: fy * W + fx, x: f.pos[0], y: f.pos[1] });
    }
    // mesa de reunião: lugares em volta para almoço e happy hour
    if (key === 'mesa_reuniao') for (let x = f.pos[0]; x < f.pos[0] + tw; x++) {
      if (ok(x, f.pos[1] - 1)) lugares.mesa.push({ tile: (f.pos[1] - 1) * W + x, facing: 'down' });
      if (ok(x, f.pos[1] + th)) lugares.mesa.push({ tile: (f.pos[1] + th) * W + x, facing: 'up' });
    }
    // jogos: onde cada jogador fica (e para onde olha)
    if (key === 'sinuca' || key === 'pebolim' || key === 'videogame') {
      const X = f.pos[0], Y = f.pos[1];
      const cands = key === 'sinuca' ? [[[X - 1, Y + 1, 'right'], [X - 1, Y, 'right']], [[X + 3, Y + 1, 'left'], [X + 3, Y, 'left'], [X + 1, Y + 2, 'up']]]
        : key === 'pebolim' ? [[[X - 1, Y, 'right']], [[X + 2, Y, 'left']]]
        : [[[X, Y + 2, 'up']], [[X + 1, Y + 2, 'up']]];
      const spots = cands.map((l) => l.find(([x, y]) => ok(x, y))).filter(Boolean).map(([x, y, facing]) => ({ tile: y * W + x, facing }));
      if (spots.length >= (key === 'pebolim' ? 2 : 1)) lugares.jogos.push({ id: fi, tipo: key, x: X, y: Y, spots });
    }
  });
  // passagens: em planta aberta, cada divisa entre duas salas ganha uma abertura de 2 blocos no meio
  const doors = new Set();
  const edges = []; // divisórias para desenhar: { x, y, v (vertical?), door }
  const ek = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  if (state.layout_plan === 'open') {
    const segs = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = floor[y * W + x];
      if (a < 0) continue;
      if (x + 1 < W && floor[y * W + x + 1] >= 0 && floor[y * W + x + 1] !== a) {
        const k = `v:${x + 1}:${Math.min(a, floor[y * W + x + 1])}:${Math.max(a, floor[y * W + x + 1])}`;
        (segs.get(k) || segs.set(k, []).get(k)).push({ x: x + 1, y, v: true, a: y * W + x, b: y * W + x + 1 });
      }
      if (y + 1 < H && floor[(y + 1) * W + x] >= 0 && floor[(y + 1) * W + x] !== a) {
        const k = `h:${y + 1}:${Math.min(a, floor[(y + 1) * W + x])}:${Math.max(a, floor[(y + 1) * W + x])}`;
        (segs.get(k) || segs.set(k, []).get(k)).push({ x, y: y + 1, v: false, a: y * W + x, b: (y + 1) * W + x });
      }
    }
    for (const list of segs.values()) {
      // abertura no trecho do meio em que os dois lados estão livres
      const livres = list.map((e, i) => (walk[e.a] && walk[e.b] ? i : -1)).filter((i) => i >= 0);
      const meio = list.length / 2;
      livres.sort((i, j) => Math.abs(i + 0.5 - meio) - Math.abs(j + 0.5 - meio));
      const abre = new Set(list.length <= 2 ? list.map((_, i) => i) : livres.slice(0, 2));
      list.forEach((e, i) => { const door = abre.has(i); if (door) doors.add(ek(e.a, e.b)); edges.push({ ...e, door }); });
    }
  }
  const pass = (a, b) => walk[a] && walk[b] && (floor[a] === floor[b] || doors.has(ek(a, b)));
  // regiões conectadas (para sortear destinos alcançáveis)
  const comp = new Int32Array(W * H).fill(-1); const comps = [];
  for (let i = 0; i < W * H; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    const id = comps.length, lista = [i]; comp[i] = id;
    for (let q = 0; q < lista.length; q++) for (const n of vizinhos(lista[q], W, H)) if (comp[n] < 0 && pass(lista[q], n)) { comp[n] = id; lista.push(n); }
    comps.push(lista);
  }
  // saída do escritório: um bloco na borda de baixo da maior região (por onde se chega e se vai embora)
  const maior = comps.reduce((a, b) => (b.length > a.length ? b : a), []);
  let saida = -1, nota = -Infinity;
  for (const i of maior) {
    const x = i % W, y = (i / W) | 0;
    if (!(y === H - 1 || floor[i + W] < 0)) continue;
    const n = y * 1000 - Math.abs(x - W / 2);
    if (n > nota) { nota = n; saida = i; }
  }
  state.nav = { W, H, floor, wallRow, walk, doors, edges, pass, comp, comps, saida, pois: pois.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x]).map(([x, y]) => y * W + x),
    cafes: cafes.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x]).map(([x, y]) => y * W + x), lugares };
  state.jogos = new Map();
  state.slots = new Map(); // lugar reservado -> agente (um por cadeira de sofá, ponto do bebedouro, banheiro…)
}
function vizinhos(i, W, H) {
  const x = i % W, y = (i / W) | 0, out = [];
  if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1); if (y > 0) out.push(i - W); if (y < H - 1) out.push(i + W);
  return out;
}
function caminho(de, ate) {
  const { W, H, pass } = state.nav;
  if (de === ate) return [ate];
  const prev = new Int32Array(W * H).fill(-1); prev[de] = de;
  const fila = [de];
  for (let q = 0; q < fila.length; q++) {
    const c = fila[q];
    if (c === ate) break;
    for (const n of vizinhos(c, W, H)) if (prev[n] < 0 && pass(c, n)) { prev[n] = c; fila.push(n); }
  }
  if (prev[ate] < 0) return null;
  const out = []; for (let c = ate; c !== de; c = prev[c]) out.push(c);
  return out.reverse();
}

// ---------- camada fixa ----------
function themeSprite(name) {
  const th = state.snap.theme;
  const def = th && th.sprites && th.sprites[name];
  if (!def) return null;
  return cached(`th:${th.id}:${name}`, () => sprite(def.pixels || def.rows || [], def.palette || {}));
}
function decorations(at) {
  const th = state.snap.theme;
  if (!th) return [];
  return (th.decorations || []).map((d) => ({ ...d, at: ({ teto: 'ceiling', parede: 'wall', canto: 'corner', mesa: 'desk', cabeca: 'head', cabeça: 'head' })[d.at] || d.at }))
    .filter((d) => d.at === at && themeSprite(d.sprite));
}
const inRooms = (d, room) => !d.rooms || d.rooms.includes(room.id);

function buildStatic() {
  const { rooms, desks, W, H } = state.layout;
  const nav = state.nav;
  const aberta = state.layout_plan === 'open';
  const c = document.createElement('canvas'); c.width = W * T; c.height = H * T;
  const s = c.getContext('2d');
  s.fillStyle = '#1b1f27'; s.fillRect(0, 0, c.width, c.height);
  const tint = state.snap.theme && state.snap.theme.floorTint;
  for (const r of rooms) {
    const topo = temParede(r) ? 2 : 0;
    const floor = FLOORS[r.floor] || FLOORS.madeira;
    for (let cy = r.y + topo; cy < r.y + r.h; cy++) for (let cx = r.x; cx < r.x + r.w; cx++) floor(s, cx * T, cy * T, hashStr(`${cx},${cy}`) % 97, cx, cy);
    if (tint) { s.fillStyle = tint; s.fillRect(r.x * T, (r.y + topo) * T, r.w * T, (r.h - topo) * T); }
    if (topo) drawWall(s, r.x * T, r.y * T, r.w * T, WALLS[r.wall] || WALLS.clara);
    if (!aberta) {
      s.fillStyle = '#2a2e37';
      s.fillRect(r.x * T, r.y * T, r.w * T, 2); s.fillRect(r.x * T, (r.y + r.h) * T - 2, r.w * T, 2);
      s.fillRect(r.x * T, r.y * T, 2, r.h * T); s.fillRect((r.x + r.w) * T - 2, r.y * T, 2, r.h * T);
    }
  }
  if (aberta) {
    // contorno só por fora do salão
    const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (nav.floor[y * W + x] >= 0 || nav.wallRow[y * W + x]);
    s.fillStyle = '#2a2e37';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!dentro(x, y)) continue;
      if (!dentro(x - 1, y)) s.fillRect(x * T, y * T, 2, T);
      if (!dentro(x + 1, y)) s.fillRect((x + 1) * T - 2, y * T, 2, T);
      if (!dentro(x, y - 1)) s.fillRect(x * T, y * T, T, 2);
      if (!dentro(x, y + 1)) s.fillRect(x * T, (y + 1) * T - 2, T, 2);
    }
    // divisórias baixas entre as salas, com as passagens abertas
    for (const e of nav.edges) {
      if (e.door) continue;
      if (e.v) {
        s.fillStyle = '#6e5a46'; s.fillRect(e.x * T - 2, e.y * T - 6, 4, T);
        s.fillStyle = '#8f7a63'; s.fillRect(e.x * T - 2, e.y * T - 6, 1, T);
      } else {
        s.fillStyle = 'rgba(169,198,214,0.55)'; s.fillRect(e.x * T, e.y * T - 9, T, 7);
        s.fillStyle = '#6e5a46'; s.fillRect(e.x * T, e.y * T - 10, T, 2); s.fillRect(e.x * T, e.y * T - 2, T, 3);
        s.fillStyle = '#8f7a63'; s.fillRect(e.x * T, e.y * T - 10, T, 1);
      }
    }
    // batentes nas pontas das passagens
    for (const e of nav.edges) {
      if (!e.door) continue;
      s.fillStyle = '#5b4a39';
      if (e.v) { s.fillRect(e.x * T - 2, e.y * T - 6, 4, 2); } else { s.fillRect(e.x * T, e.y * T - 2, 2, 3); s.fillRect((e.x + 1) * T - 2, e.y * T - 2, 2, 3); }
    }
  }
  // móveis (tapetes primeiro; os de parede ficam na faixa da parede; os de chão por ordem de altura)
  const items = (state.snap.office.furniture || []).map((f) => ({ f, key: furnitureKey(f.type), def: furniture(f.type) })).filter((x) => x.def);
  items.sort((a, b) => (FLAT_FURNITURE.has(b.key) - FLAT_FURNITURE.has(a.key)) || a.f.pos[1] - b.f.pos[1]);
  // luz das janelas entrando no chão da sala (uma faixa inclinada que vai sumindo); só de dia, desenhada a cada quadro
  const luz = document.createElement('canvas'); luz.width = c.width; luz.height = c.height;
  state.luzJanelas = luz;
  for (const { f, key, def } of items) {
    if (key !== 'janela') continue;
    const r = rooms.find((q) => temParede(q) && f.pos[0] >= q.x && f.pos[0] < q.x + q.w && f.pos[1] < q.y + 2);
    if (!r) continue;
    const y0 = (r.y + 2) * T, alto = Math.min(3 * T, (r.y + r.h) * T - y0);
    for (let dy = 0; dy < alto; dy++) {
      const x0 = Math.max(r.x * T, Math.round(f.pos[0] * T + 2 + dy * 0.6)), x1 = Math.min((r.x + r.w) * T, Math.round(f.pos[0] * T + def.w - 2 + dy * 0.6));
      if (x1 <= x0) continue;
      const lg = luz.getContext('2d'); lg.fillStyle = `rgba(255,236,190,${(0.16 * (1 - dy / alto)).toFixed(3)})`; lg.fillRect(x0, y0 + dy, x1 - x0, 1);
    }
  }
  for (const { f, key, def } of items) {
    s.save();
    const x = f.pos[0] * T, y = f.pos[1] * T;
    if (!WALL_FURNITURE.has(key) && !FLAT_FURNITURE.has(key)) sombraChao(s, x + def.w / 2, y + def.h - 1, def.w / 2 - 1, 2, 0.28);
    if (f.flip) { s.translate(x * 2 + def.w, 0); s.scale(-1, 1); }
    def.draw(s, x, y);
    s.restore();
  }
  // mesas
  for (const d of desks) { sombraChao(s, d.x * T + 16, d.y * T + 15, 15, 2, 0.3); furniture('mesa').draw(s, d.x * T, d.y * T); }
  // enfeites fixos do tema (os de parede pulam os blocos ocupados por janela, quadro, relógio…)
  const wallBusy = (cx, r) => items.some(({ f, def }) => f.pos[1] < r.y + 2 && f.pos[1] + def.h / T > r.y && cx >= f.pos[0] - 1 && cx < f.pos[0] + def.w / T + 1);
  rooms.forEach((r, ri) => {
    if (temParede(r)) {
      for (const d of decorations('ceiling')) {
        if (!inRooms(d, r)) continue;
        const sp = themeSprite(d.sprite);
        for (let x = r.x * T + 2; x < (r.x + r.w) * T - 2; x += sp.width) s.drawImage(sp, 0, 0, Math.min(sp.width, (r.x + r.w) * T - 2 - x), sp.height, x, r.y * T + 2, Math.min(sp.width, (r.x + r.w) * T - 2 - x), sp.height);
      }
      for (const d of decorations('wall')) {
        if (!inRooms(d, r)) continue;
        const sp = themeSprite(d.sprite), every = Math.max(1, Number(d.every) || 4);
        for (let cx = r.x + 1 + ((d.offset | 0) % every); cx < r.x + r.w - 1; cx += every) if (!wallBusy(cx, r)) s.drawImage(sp, cx * T + ((T - sp.width) >> 1), r.y * T + 2 * T - 5 - sp.height);
      }
    }
    for (const d of decorations('corner')) {
      if (!inRooms(d, r)) continue;
      const sp = themeSprite(d.sprite);
      const lado = d.side || (ri % 2 ? 'right' : 'left');
      const x = lado === 'right' ? (r.x + r.w) * T - sp.width - 4 : r.x * T + 4;
      s.drawImage(sp, x, (r.y + r.h) * T - sp.height - 4);
    }
  });
  for (const d of decorations('desk')) {
    const sp = themeSprite(d.sprite);
    for (const dk of desks) s.drawImage(sp, dk.x * T + 2, dk.y * T + 3 - sp.height);
  }
  state.staticLayer = c;
}

// ---------- status ----------
const statusOf = (id) => {
  const a = state.agents.get(id);
  if (!a) return 'offline';
  if (a.status !== 'offline' && Date.now() - state.clockSkew - a.seenAt > state.offlineAfterMs) return 'offline';
  return a.status;
};
const ATIVO = new Set(['working', 'waiting', 'error']);
// quem não sai da mesa: o agente central (distribui as tarefas) e quem tem "fica na mesa"
const naMesa = (a) => !!(a.central || a.fixed);

// ---------- os agentes andando pelo escritório ----------
// modos: seated (na mesa), pause (parado em pé), walk (passeando), ring (celular tocando), run (correndo para a mesa)
const VEL = { walk: 26, run: 72 }; // pixels por segundo
const rnd = (a, b) => a + Math.random() * (b - a);
const centroBloco = (i) => { const W = state.nav.W; return { x: (i % W) * T + 8, y: ((i / W) | 0) * T + 12 }; };
const blocoDe = (x, y) => { const { W, H } = state.nav; const tx = Math.min(W - 1, Math.max(0, Math.floor(x / T))), ty = Math.min(H - 1, Math.max(0, Math.floor((y - 1) / T))); return ty * W + tx; };

function assento(d) {
  const { W, H, walk } = state.nav;
  const cands = [[d.x, d.y + 1], [d.x + 1, d.y + 1], [d.x, d.y + 2], [d.x + 1, d.y + 2]];
  const ok = cands.find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x]);
  return { entrada: ok ? ok[1] * W + ok[0] : -1, x: d.x * T + 16, y: d.y * T + 27 };
}

function syncEntities() {
  const antigos = state.ents || new Map();
  const ents = new Map();
  for (const d of state.layout.desks) {
    const id = d.agent.id;
    const seat = assento(d);
    const st = statusOf(id);
    let e = antigos.get(id);
    if (e) { e.desk = d; e.seat = seat; e.agent = d.agent; e.look = agentLook(d.agent); }
    else {
      e = { id, desk: d, agent: d.agent, seat, look: agentLook(d.agent), path: [], facing: 'down', step: 0, timer: 0, last: st };
      // abriu o painel fora do expediente: quem está livre já está em casa
      if (!ATIVO.has(st) && !d.agent.central && state.relogioCfg && periodo() === 'noite') Object.assign(e, { mode: 'casa', fora: 'casa', alfa: 0, x: seat.x, y: seat.y, path: [] });
      else if (naMesa(d.agent) || ATIVO.has(st) || seat.entrada < 0) sentar(e);
      else {
        // começa em pé num lugar qualquer da mesma região da mesa
        const lista = areaDoAgente({ agent: d.agent, seat }, seat.entrada);
        const p = centroBloco(lista.length ? lista[(Math.random() * lista.length) | 0] : seat.entrada);
        Object.assign(e, { mode: 'pause', x: p.x, y: p.y, timer: rnd(300, 3000) });
      }
    }
    // vontades: começam sorteadas para cada um ter o seu ritmo; o escritório foi refeito, então ninguém está no meio de nada
    if (!e.vont) e.vont = { sede: rnd(0, 60), banheiro: rnd(0, 40), social: rnd(0, 60), diversao: rnd(0, 60), cansaco: rnd(0, 30) };
    if (e.atv || e.mode === 'atividade') { e.atv = null; e.indo = false; e.oculto = false; if (e.mode === 'atividade') { e.mode = 'pause'; e.timer = rnd(500, 1500); } }
    // se a mesa mudou de lugar com o agente sentado, ele vai junto
    if (e.mode === 'seated') { e.x = seat.x; e.y = seat.y; }
    else if (e.mode === 'casa' || e.mode === 'sumindo') { e.x = seat.x; e.y = seat.y; }
    else if (!state.nav.walk[blocoDe(e.x, e.y)]) sentar(e);
    ents.set(id, e);
  }
  state.ents = ents;
}
// blocos por onde o agente pode passear: a região toda, ou só a própria sala (fica_na_sala)
function areaDoAgente(e, aqui) {
  const nav = state.nav;
  const lista = nav.comps[nav.comp[aqui]] || [];
  if (!e.agent.stay || e.seat.entrada < 0) return lista;
  const sala = nav.floor[e.seat.entrada];
  const dentro = lista.filter((i) => nav.floor[i] === sala);
  return dentro.length ? dentro : lista;
}
function sentar(e) { Object.assign(e, { mode: 'seated', x: e.seat.x, y: e.seat.y, path: [], timer: rnd(1500, 4000) }); }
function levantar(e) {
  if (e.seat.entrada < 0) return;
  const p = centroBloco(e.seat.entrada);
  Object.assign(e, { mode: 'pause', x: p.x, y: p.y, facing: 'down', timer: rnd(400, 1200) });
}
function passear(e) {
  const nav = state.nav;
  const aqui = blocoDe(e.x, e.y);
  const lista = areaDoAgente(e, aqui);
  if (!lista.length) { e.mode = 'pause'; e.timer = 3000; return; }
  const area = new Set(lista);
  const pois = nav.pois.filter((i) => area.has(i));
  const alvo = pois.length && Math.random() < 0.4 ? pois[(Math.random() * pois.length) | 0] : lista[(Math.random() * lista.length) | 0];
  const p = caminho(aqui, alvo);
  if (!p || !p.length) { e.mode = 'pause'; e.timer = rnd(1000, 3000); return; }
  e.path = p; e.mode = 'walk'; e.poi = pois.includes(alvo);
}
function irParaMesa(e, calmo = false) {
  if (e.atv) terminar(e);
  // dia de atendimento: antes de ir para a mesa, busca o paciente na sala de espera
  if (!calmo && buscarPaciente(e)) return;
  const aqui = blocoDe(e.x, e.y);
  const p = e.seat.entrada >= 0 ? caminho(aqui, e.seat.entrada) : null;
  if (!p) { sentar(e); return; }
  e.path = p; e.mode = calmo ? 'voltar' : 'run';
}
function chamar(e) {
  if (e.mode === 'casa' || e.mode === 'sumindo') aparecer(e); // estava em casa: aparece na mesa
  if (e.atv) terminar(e); // larga o que estava fazendo (sai do banheiro, levanta do sofá…)
  // a tarefa sai da mesa do agente central (o Musashi) e chega no celular de quem vai fazer
  const central = [...state.ents.values()].find((x) => x.agent.central && x !== e);
  const voo = central ? 700 : 0;
  if (central) state.mail.push({ de: { x: central.x, y: central.y - 24 }, para: e, t: 0, dur: voo });
  e.mode = 'ring'; e.path = []; e.timer = voo + 1100; e.facing = 'down';
}

// ---------- reações ao resultado das tarefas ----------
// sucesso: pula, solta confete e vai tomar um café
function comemorar(e, tarefa) {
  state.flash.set(e.id, { texto: '✓ ' + (String(tarefa || '').replace(/^[^\p{L}\p{N}]+/u, '') || 'feito'), ate: Date.now() + 4500 });
  setTimeout(refreshOverlay, 4600);
  refreshOverlay();
  if (e.mode === 'celebrate') return; // já está comemorando: uma festa só
  // quem fica na mesa comemora sem sair dela
  if (naMesa(e.agent)) { if (!state.festaCentral || Date.now() - state.festaCentral > 1500) { state.festaCentral = Date.now(); confete(e.desk.x * T + 16, e.desk.y * T + 2, e.look.shirt[0]); } return; }
  if (e.atv) terminar(e);
  if (e.mode === 'seated') levantar(e);
  if (e.seat.entrada < 0 && e.mode === 'seated') return;
  e.mode = 'celebrate'; e.timer = 2600; e.path = []; e.facing = 'down';
  confete(e.x, e.y - 14, e.look.shirt[0]);
}
function confete(x, y, cor) {
  const cores = [cor, '#f2c14e', '#4fa66a', '#4a7fd4', '#e26fa6', '#ffffff'];
  if (state.burst.length > 220) return;
  for (let i = 0; i < 36; i++) {
    const a = rnd(-Math.PI, 0), v = rnd(30, 75);
    state.burst.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, c: cores[i % cores.length], vida: rnd(1200, 2000), giro: Math.random() < 0.5 });
  }
}
function irAoCafe(e) {
  const nav = state.nav, aqui = blocoDe(e.x, e.y);
  const area = new Set(areaDoAgente(e, aqui));
  const opcoes = nav.cafes.filter((i) => area.has(i));
  const p = opcoes.length ? caminho(aqui, opcoes[(Math.random() * opcoes.length) | 0]) : null;
  if (p && p.length) { e.path = p; e.mode = 'walk'; e.poi = true; } else { e.mode = 'pause'; e.timer = rnd(800, 2000); }
}
// ---------- vontades (o que cada um faz quando está livre) ----------
// cada agente tem necessidades que sobem com o tempo (0 a 100). Livre, ele atende a mais urgente:
// sede → bebedouro/café; banheiro → banheiro; papo → conversa com outro agente livre;
// diversão → celular no sofá ou um livro na estante; cansaço → cochilo no sofá.
// Tarefa de verdade sempre manda: ele larga tudo e corre para a mesa.
const VONTADE = 50; // a partir daqui a necessidade vira vontade
// ?pressa no endereço acelera as vontades 20x (para testar e para se divertir)
const PRESSA = new URLSearchParams(location.search).has('pressa') ? 20 : 1;
if (PRESSA > 1) window.kaisha = state; // para inspecionar no console
function envelhecer(e, st, dt) {
  const v = e.vont, m = (dt / 60000) * PRESSA, livre = !ATIVO.has(st);
  v.sede = Math.min(100, v.sede + m * (st === 'working' ? 9 : 7));
  v.banheiro = Math.min(100, v.banheiro + m * 2.5);
  v.cansaco = Math.max(0, Math.min(100, v.cansaco + m * (st === 'working' ? 6 : 0.6)));
  const conversando = e.atv && e.atv.tipo === 'papo' && e.mode === 'atividade';
  if (livre && !conversando) v.social = Math.min(100, v.social + m * 6);
  if (livre && !e.atv) v.diversao = Math.min(100, v.diversao + m * 5);
}
function decidir(e) {
  const v = e.vont, nav = state.nav;
  // o relógio manda antes das vontades: fora do expediente vai para casa; no almoço come; sexta tem happy hour
  const per = state.periodo;
  if (per === 'noite' && !e.agent.central) { irEmbora(e); return; }
  if (per === 'almoco' && e.almoco !== hojeChave() && !naMesa(e.agent)) {
    e.almoco = hojeChave();
    if (Math.random() < 0.5 && comecarRefeicao(e, 'almocar')) return;
    irEmbora(e, 'almoco', Date.now() + rnd(20, 45) * 60000 / PRESSA); return;
  }
  if (per === 'happy' && Math.random() < 0.8 && comecarRefeicao(e, 'happy')) return;
  if (!v || !nav.lugares) { passear(e); return; }
  const opcoes = [];
  if (v.banheiro > VONTADE + 5) opcoes.push(['banheiro', v.banheiro + 10]);
  if (v.sede > VONTADE) opcoes.push(['beber', v.sede]);
  if (v.cansaco > 70) opcoes.push(['cochilar', v.cansaco - 5]);
  if (v.social > VONTADE) opcoes.push(['papo', v.social]);
  if (v.diversao > VONTADE) opcoes.push(['jogar', v.diversao + 8], ['celular', v.diversao], ['ler', v.diversao - 12]);
  // um pouco de sorte para ninguém ficar previsível demais
  const ordem = opcoes.map(([t, p]) => [t, p + Math.random() * 15]).sort((a, b) => b[1] - a[1]);
  for (const [tipo] of ordem) if (comecar(e, tipo)) return;
  passear(e);
}
function comecar(e, tipo) {
  const L2 = state.nav.lugares, aqui = blocoDe(e.x, e.y);
  const area = new Set(areaDoAgente(e, aqui));
  if (tipo === 'papo') return comecarPapo(e, aqui, area);
  if (tipo === 'jogar') return comecarJogo(e, aqui, area);
  let alvos = [];
  if (tipo === 'beber') alvos = L2.agua.map((a) => ({ key: 'a:' + a.tile, tile: a.tile, extra: { bebida: a.tipo } }));
  else if (tipo === 'banheiro') alvos = L2.banheiros.map((b) => ({ key: 'wc:' + b.id, tile: b.frente, extra: { wc: b } }));
  else if (tipo === 'celular' || tipo === 'cochilar') alvos = L2.sofas.map((s) => ({ key: 's:' + s.px + ':' + s.py, tile: s.frente, extra: { sofa: s } }));
  else if (tipo === 'ler') alvos = L2.estantes.map((t) => ({ key: 'e:' + t, tile: t }));
  let melhor = null;
  for (const a of alvos) {
    if (!area.has(a.tile) || state.slots.has(a.key)) continue;
    const p = caminho(aqui, a.tile);
    if (p && (!melhor || p.length < melhor.p.length)) melhor = { a, p };
  }
  if (!melhor) return false;
  state.slots.set(melhor.a.key, e.id);
  e.atv = { tipo, key: melhor.a.key, ...(melhor.a.extra || {}) };
  e.path = melhor.p; e.mode = 'walk'; e.poi = false; e.indo = true;
  return true;
}
function comecarPapo(e, aqui, area) {
  const { W, walk, pass } = state.nav;
  const cands = [...state.ents.values()].filter((o) => o !== e && !o.atv && o.vont && !naMesa(o.agent) && ['pause', 'walk'].includes(o.mode)
    && !ATIVO.has(statusOf(o.id)) && area.has(blocoDe(o.x, o.y)));
  cands.sort((a, b) => b.vont.social - a.vont.social);
  for (const o of cands.slice(0, 3)) {
    const ot = blocoDe(o.x, o.y);
    // de preferência um em cima do outro, para as placas de nome não se encavalarem
    const lados = [ot + W, ot - W, ot - 1, ot + 1].filter((i) => i >= 0 && i < walk.length && walk[i] && pass(ot, i) && area.has(i));
    let melhor = null;
    for (const t of lados) { const p = caminho(aqui, t); if (p && (!melhor || p.length < melhor.p.length)) melhor = { p }; }
    if (!melhor) continue;
    // o outro para onde está e espera
    Object.assign(o, centroBloco(ot), { path: [], mode: 'atividade', atv: { tipo: 'esperaPapo', com: e.id }, timer: 25000, indo: false });
    e.atv = { tipo: 'papo', com: o.id };
    e.path = melhor.p; e.mode = 'walk'; e.poi = false; e.indo = true;
    return true;
  }
  return false;
}
const virarPara = (e, o) => (Math.abs(o.x - e.x) >= Math.abs(o.y - e.y) ? (o.x > e.x ? 'right' : 'left') : (o.y > e.y ? 'down' : 'up'));
function chegouAtividade(e) {
  const a = e.atv; e.indo = false; e.path = [];
  if (!a) { e.mode = 'pause'; e.timer = rnd(800, 2000); return; }
  e.mode = 'atividade'; e.step = 0; e.inicio = Date.now();
  if (a.tipo === 'beber') { e.timer = rnd(6000, 10000); e.facing = 'down'; }
  else if (a.tipo === 'banheiro') { e.timer = rnd(14000, 26000); e.oculto = true; }
  else if (a.tipo === 'celular' || a.tipo === 'cochilar') { e.x = a.sofa.px; e.y = a.sofa.py; e.facing = 'down'; e.timer = a.tipo === 'cochilar' ? rnd(20000, 40000) : rnd(15000, 30000); }
  else if (a.tipo === 'ler') { e.timer = rnd(10000, 18000); e.facing = 'down'; }
  else if (a.tipo === 'embora') { e.atv = null; e.mode = 'sumindo'; return; }
  else if (a.tipo === 'almocar' || a.tipo === 'happy') {
    e.facing = a.facing || 'down';
    e.timer = (a.tipo === 'almocar' ? rnd(15, 25) : rnd(4, 8)) * 60000 / PRESSA;
    a.comida = ['🍝', '🍔', '🥗', '🍱', '🍕', '🌮'][hashStr(e.id + hojeChave()) % 6];
  }
  else if (a.tipo === 'jogar') {
    const j = state.jogos.get(a.jogo);
    if (!j) { e.atv = null; e.mode = 'pause'; e.timer = rnd(800, 2000); return; }
    const sp = j.lugar.spots[a.lado];
    Object.assign(e, centroBloco(sp.tile), { facing: sp.facing });
    e.timer = 45000; // espera o parceiro chegar
    j.prontos.add(e.id);
    if (j.jogadores.every((id) => j.prontos.has(id))) {
      const dur = rnd(20000, 40000);
      j.inicio = Date.now(); j.fim = j.inicio + dur;
      for (const id of j.jogadores) { const p = state.ents.get(id); if (p) p.timer = dur; }
    }
  }
  else if (a.tipo === 'papo') {
    const o = state.ents.get(a.com);
    if (!o || !o.atv || o.atv.com !== e.id || o.mode !== 'atividade') { e.atv = null; e.mode = 'pause'; e.timer = rnd(800, 2000); return; }
    const dur = rnd(9000, 16000);
    e.timer = dur; o.timer = dur + 50; o.atv.tipo = 'papo'; o.inicio = e.inicio; o.step = 0;
    e.facing = virarPara(e, o); o.facing = virarPara(o, e);
    // cada conversa tem os seus assuntos
    const assuntos = ['💬', '😂', '☕', '👍', '🤔', '⚽', '🎮', '🍕', '📈', '🐱', '🎵', '🙄', '😮', '💡'];
    const embaralha = assuntos.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]).slice(0, 5);
    a.assuntos = embaralha; o.atv.assuntos = embaralha; a.fala = true; o.atv.fala = false;
  }
}
// sai da atividade (terminou ou foi chamado): libera o lugar e volta para o chão
function terminar(e) {
  const a = e.atv;
  if (!a) return;
  if (a.key && state.slots.get(a.key) === e.id) state.slots.delete(a.key);
  if (a.jogo != null) {
    // saiu no meio: o jogo acaba para todo mundo
    const j = state.jogos.get(a.jogo);
    state.jogos.delete(a.jogo); state.slots.delete('g:' + a.jogo);
    if (j) for (const id of j.jogadores) {
      const o = id !== e.id && state.ents.get(id);
      if (o && o.atv && o.atv.jogo === a.jogo) { o.atv = null; o.indo = false; if (o.mode === 'atividade' || o.mode === 'walk') { o.mode = 'pause'; o.path = []; o.timer = rnd(800, 2500); } }
    }
  }
  if (a.sofa && e.mode === 'atividade') Object.assign(e, centroBloco(a.sofa.frente));
  if (a.wc && e.oculto) Object.assign(e, centroBloco(a.wc.frente), { facing: 'down' });
  if (a.com) {
    const o = state.ents.get(a.com);
    if (o && o.atv && o.atv.com === e.id) { o.atv = null; o.indo = false; if (o.mode === 'atividade' || o.mode === 'walk') { o.mode = 'pause'; o.path = []; o.timer = rnd(800, 2500); } }
  }
  e.atv = null; e.indo = false; e.oculto = false;
}
function concluir(e) {
  const a = e.atv, v = e.vont;
  if (a && a.tipo === 'jogar') { fimDeJogo(e); return; }
  if (a && v) {
    if (a.tipo === 'beber') { v.sede = rnd(0, 8); v.banheiro = Math.min(100, v.banheiro + 30); if (a.bebida === 'cafe') v.cansaco = Math.max(0, v.cansaco - 25); }
    else if (a.tipo === 'banheiro') v.banheiro = rnd(0, 5);
    else if (a.tipo === 'celular') { v.diversao = rnd(0, 10); v.cansaco = Math.max(0, v.cansaco - 10); }
    else if (a.tipo === 'ler') v.diversao = rnd(5, 15);
    else if (a.tipo === 'cochilar') v.cansaco = rnd(0, 10);
    else if (a.tipo === 'almocar') { v.social = Math.max(0, v.social - 30); v.sede = Math.max(0, v.sede - 30); v.cansaco = Math.min(100, v.cansaco + 10); }
    else if (a.tipo === 'happy') { v.social = rnd(0, 5); v.diversao = rnd(0, 5); v.banheiro = Math.min(100, v.banheiro + 35); }
    else if (a.tipo === 'papo') {
      for (const x of [e, state.ents.get(a.com)]) if (x && x.vont) { x.vont.social = rnd(0, 8); x.vont.diversao = Math.max(0, x.vont.diversao - 15); }
    }
  }
  terminar(e);
  e.mode = 'pause'; e.timer = rnd(1500, 4000);
}
// ---------- jogos (sinuca, pebolim, videogame) ----------
// quem tem vontade de se divertir chama outro agente livre; pebolim só com dois, sinuca e videogame dá para jogar sozinho
state.jogos = new Map(); // id do móvel -> { lugar, jogadores, prontos, inicio, fim }
function comecarJogo(e, aqui, area) {
  const L2 = state.nav.lugares;
  const parceiros = [...state.ents.values()].filter((o) => o !== e && !o.atv && o.vont && !naMesa(o.agent) && ['pause', 'walk'].includes(o.mode) && !ATIVO.has(statusOf(o.id)))
    .sort((a, b) => (b.vont.diversao + b.vont.social / 2) - (a.vont.diversao + a.vont.social / 2));
  const opcoes = L2.jogos.filter((j) => !state.slots.has('g:' + j.id) && area.has(j.spots[0].tile)).sort(() => Math.random() - 0.5);
  for (const j of opcoes) {
    const p0 = caminho(aqui, j.spots[0].tile);
    if (!p0) continue;
    // parceiro: alguém que alcance o outro lado (o primeiro da fila de quem mais quer)
    let par = null, p1 = null;
    if (j.spots.length > 1) for (const o of parceiros.slice(0, 3)) {
      const ot = blocoDe(o.x, o.y);
      if (!new Set(areaDoAgente(o, ot)).has(j.spots[1].tile)) continue;
      const c = caminho(ot, j.spots[1].tile);
      if (c) { par = o; p1 = c; break; }
    }
    if (!par && j.tipo === 'pebolim') continue;
    const jogo = { lugar: j, jogadores: par ? [e.id, par.id] : [e.id], prontos: new Set(), inicio: 0, fim: 0 };
    state.jogos.set(j.id, jogo); state.slots.set('g:' + j.id, e.id);
    e.atv = { tipo: 'jogar', jogo: j.id, jogoTipo: j.tipo, lado: 0 };
    e.path = p0; e.mode = 'walk'; e.poi = false; e.indo = true;
    if (par) { par.atv = { tipo: 'jogar', jogo: j.id, jogoTipo: j.tipo, lado: 1 }; par.path = p1; par.mode = 'walk'; par.poi = false; par.indo = true; }
    return true;
  }
  return false;
}
// fim natural: sorteia quem ganhou, comemora, conta a vitória do dia e todo mundo volta a ficar livre
function fimDeJogo(e) {
  const a = e.atv, j = state.jogos.get(a.jogo);
  const ids = j ? j.jogadores : [e.id];
  const comecou = j && j.inicio;
  const vencedor = comecou && ids.length > 1 ? ids[(Math.random() * ids.length) | 0] : null;
  const agora = Date.now();
  for (const id of ids) {
    const p = state.ents.get(id);
    if (!p || !p.atv || p.atv.jogo !== a.jogo) continue;
    if (comecou && p.vont) { p.vont.diversao = rnd(0, 8); if (ids.length > 1) p.vont.social = Math.max(0, p.vont.social - 30); p.vont.cansaco = Math.max(0, p.vont.cansaco - 5); }
    if (comecou) p.reacao = { emoji: !vencedor ? '😎' : id === vencedor ? '🏆' : ['😤', '😩', '🙃'][hashStr(id + agora) % 3], ate: agora + 3000 };
    if (id === vencedor) contarVitoria(id, a.jogoTipo);
    p.atv = null; p.indo = false; p.mode = 'pause'; p.timer = rnd(2500, 4500); p.path = [];
  }
  state.jogos.delete(a.jogo); state.slots.delete('g:' + a.jogo);
}
// vitórias do dia (guardadas neste navegador)
const chaveVitorias = () => 'kaisha_vitorias_' + (ANDAR || 'principal') + '_' + new Date().toLocaleDateString('sv');
function lerVitorias() { try { return JSON.parse(localStorage.getItem(chaveVitorias()) || '{}'); } catch { return {}; } }
function contarVitoria(id, tipo) {
  const v = lerVitorias();
  v[id] = v[id] || {}; v[id][tipo] = (v[id][tipo] || 0) + 1;
  try { localStorage.setItem(chaveVitorias(), JSON.stringify(v)); } catch {}
}

// ---------- relógio: expediente, almoço, happy hour e noite ----------
// expediente: "seg-sex 08:00-18:00" (padrão); almoco: "12:00-13:00"; happy_hour: "sex 16:30-18:00"; relogio: não desliga tudo
const DIAS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const Q = new URLSearchParams(location.search);
function faixa(txt, diasPadrao) {
  const t = String(txt || '').toLowerCase().replace(/á/g, 'a').replace(/à/g, 'a');
  if (!t || /^(nao|não|no|off|false|nenhum|-)$/.test(t)) return null;
  let dias = diasPadrao;
  const md = t.match(/\b(dom|seg|ter|qua|qui|sex|sab|sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*(?:-|–|a|ate|to)\s*(dom|seg|ter|qua|qui|sex|sab|sun|mon|tue|wed|thu|fri|sat)[a-z]*)?/);
  if (md) { const a = DIAS[md[1]], b = md[2] != null ? DIAS[md[2]] : a; dias = new Set(); for (let d = a; ; d = (d + 1) % 7) { dias.add(d); if (d === b) break; } }
  const mh = t.match(/(\d{1,2})(?:[:h](\d{2}))?\s*(?:-|–|as|a|ate|to)\s*(\d{1,2})(?:[:h](\d{2}))?/);
  if (!mh) return null;
  return { dias, de: +mh[1] * 60 + (+mh[2] || 0), ate: +mh[3] * 60 + (+mh[4] || 0) };
}
function lerRelogio(o) {
  if (!o || o.clock === false) return null;
  const util = new Set([1, 2, 3, 4, 5]);
  const exp = faixa(o.hours || 'seg-sex 08:00-18:00', util) || faixa('seg-sex 08:00-18:00', util);
  return { exp, almoco: faixa(o.lunch || '12:00-13:00', exp.dias), happy: faixa(o.happy_hour || 'sex 16:30-18:00', new Set([5])) };
}
// ?hora=22:30 e ?dia=sex no endereço simulam outro horário (para testar)
function agoraRelogio() {
  const d = new Date(Date.now() - (state.clockSkew || 0));
  let dia = d.getDay(), min = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const h = (Q.get('hora') || '').match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (h) min = +h[1] * 60 + (+h[2] || 0);
  const dq = (Q.get('dia') || '').toLowerCase().slice(0, 3);
  if (DIAS[dq] != null) dia = DIAS[dq];
  return { dia, min };
}
const hojeChave = () => new Date(Date.now() - (state.clockSkew || 0)).toLocaleDateString('sv');
const dentro = (f, r) => !!f && f.dias.has(r.dia) && r.min >= f.de && r.min < f.ate;
function periodo() {
  const c = state.relogioCfg;
  if (!c) return 'trabalho';
  const r = agoraRelogio();
  if (!dentro(c.exp, r)) return 'noite';
  if (dentro(c.almoco, r)) return 'almoco';
  if (dentro(c.happy, r)) return 'happy';
  return 'trabalho';
}
// a luz vai baixando meia hora depois do fim do expediente e volta meia hora antes do início
function escuridao() {
  const c = state.relogioCfg;
  if (!c) return 0;
  const r = agoraRelogio(), MAX = 0.55;
  if (!c.exp.dias.has(r.dia)) return MAX;
  const antes = c.exp.de - r.min, depois = r.min - c.exp.ate;
  const k = antes > 0 ? 1 - Math.min(1, Math.max(0, (30 - antes) / 30)) : depois >= 0 ? Math.min(1, depois / 30) : 0;
  return k * MAX;
}
function irEmbora(e, motivo = 'casa', volta = 0) {
  if (e.atv) terminar(e);
  e.fora = motivo; e.voltaEm = volta;
  if (e.mode === 'seated' && !naMesa(e.agent)) levantar(e);
  const sai = state.nav.saida;
  const p = !naMesa(e.agent) && sai >= 0 && e.mode !== 'seated' ? caminho(blocoDe(e.x, e.y), sai) : null;
  if (p && p.length) { e.path = p; e.mode = 'walk'; e.poi = false; e.indo = true; e.atv = { tipo: 'embora' }; }
  else { e.mode = 'sumindo'; e.path = []; }
}
// voltou do almoço ou chegou de manhã: entra pela saída e vai para a mesa
function chegar(e) {
  e.fora = null; e.voltaEm = 0; e.alfa = 0;
  const sai = state.nav.saida;
  const p = !naMesa(e.agent) && sai >= 0 && e.seat.entrada >= 0 ? caminho(sai, e.seat.entrada) : null;
  if (p && p.length) { Object.assign(e, centroBloco(sai)); e.path = p; e.mode = 'voltar'; }
  else sentar(e);
}
// chamado em casa: aparece direto na frente da mesa
function aparecer(e) {
  e.fora = null; e.voltaEm = 0; e.alfa = 0.01; e.path = [];
  if (e.seat.entrada >= 0) Object.assign(e, centroBloco(e.seat.entrada));
  e.mode = 'pause';
}
// almoço e happy hour: lugares em volta da mesa de reunião (e, no happy hour, perto do café e do bebedouro)
function comecarRefeicao(e, tipo) {
  const L2 = state.nav.lugares;
  if (!L2) return false;
  const aqui = blocoDe(e.x, e.y), area = new Set(areaDoAgente(e, aqui));
  const lugares = [...L2.mesa, ...(tipo === 'happy' ? L2.agua.map((a) => ({ tile: a.tile, facing: 'down' })) : [])];
  // de preferência sem ninguém do lado, para as placas de nome não se encavalarem
  const vizinhos = (t) => (state.slots.has('m:' + (t - 1)) ? 1 : 0) + (state.slots.has('m:' + (t + 1)) ? 1 : 0);
  const livres = lugares.filter((l) => area.has(l.tile) && !state.slots.has('m:' + l.tile)).map((l) => [vizinhos(l.tile) + Math.random() * 0.9, l]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const l of livres) {
    const p = caminho(aqui, l.tile);
    if (!p) continue;
    state.slots.set('m:' + l.tile, e.id);
    e.atv = { tipo, key: 'm:' + l.tile, facing: l.facing };
    e.path = p; e.mode = 'walk'; e.poi = false; e.indo = true;
    return true;
  }
  return false;
}

// ---------- reações ----------
// POST /api/reactions: festa (todo mundo aplaude quem recebeu), preocupado (gota de suor por 10 min), alivio
function reagir(r) {
  if (!state.ents) return;
  const alvo = r.agent ? state.ents.get(r.agent) : null;
  const agora = Date.now();
  if (r.tipo === 'festa') {
    if (alvo) {
      alvo.preocupado = 0;
      if (!ATIVO.has(statusOf(alvo.id)) && !['casa', 'sumindo'].includes(alvo.mode) && !alvo.oculto) comemorar(alvo, r.texto || '');
      else confete(alvo.desk.x * T + 16, alvo.desk.y * T + 2, alvo.look.shirt[0]);
    }
    for (const e of state.ents.values()) {
      if (e === alvo || e.oculto || ['casa', 'sumindo', 'run', 'ring', 'buscar', 'chamando'].includes(e.mode) || ATIVO.has(statusOf(e.id))) continue;
      e.reacao = { emoji: '👏', ate: agora + 3500 };
      if (e.mode === 'pause' || e.mode === 'walk') {
        if (e.atv) terminar(e);
        e.path = []; e.mode = 'aplaudir'; e.timer = 3000;
        if (alvo) e.facing = virarPara(e, alvo.mode === 'seated' ? { x: alvo.desk.x * T + 16, y: alvo.desk.y * T + 27 } : alvo);
      }
    }
  } else if (r.tipo === 'preocupado' && alvo) { alvo.preocupado = agora + 10 * 60000; alvo.reacao = { emoji: '😟', ate: agora + 4000 }; }
  else if (r.tipo === 'alivio' && alvo) { alvo.preocupado = 0; alvo.reacao = { emoji: '😮‍💨', ate: agora + 3500 }; }
}
// alguém deu erro: quem está livre por perto olha assustado
function olharErro(e) {
  const agora = Date.now(), alvo = e.mode === 'seated' ? { x: e.desk.x * T + 16, y: e.desk.y * T + 27 } : e;
  for (const o of state.ents.values()) {
    if (o === e || o.oculto || !['pause', 'walk'].includes(o.mode) || ATIVO.has(statusOf(o.id))) continue;
    if (Math.hypot(o.x - alvo.x, o.y - alvo.y) > 10 * T) continue;
    if (o.atv) terminar(o);
    o.path = []; o.mode = 'pause'; o.timer = 2500; o.facing = virarPara(o, alvo);
    o.reacao = { emoji: '😮', ate: agora + 2500 };
  }
}
// o agente central recebeu tarefa: quem está jogando ou no sofá às vezes disfarça e volta para a mesa
function chefePassa(chefe) {
  const agora = Date.now();
  for (const o of [...state.ents.values()]) {
    if (o === chefe || naMesa(o.agent) || o.mode !== 'atividade' || !o.atv || !['jogar', 'celular', 'ler', 'cochilar'].includes(o.atv.tipo) || Math.random() < 0.5) continue;
    terminar(o);
    o.reacao = { emoji: '😳', ate: agora + 2500 };
    o.disfarce = agora + rnd(20000, 40000);
    irParaMesa(o, true);
  }
}
// gota de suor (preocupado)
function suor(x, topo) {
  const k = (Date.now() / 900) % 1;
  pinta(x + 13, topo + 1 + Math.round(k * 4), 2, 3, '#7fc4f0'); pinta(x + 13, topo + Math.round(k * 4), 1, 1, '#b7dcf2');
}
// noite: escurece tudo, com a luz do monitor acesa em quem está na mesa
function desenhaNoite() {
  const k = escuridao();
  if (k <= 0) return;
  const { W, H } = state.layout;
  let c = state.noiteCanvas;
  if (!c || c.width !== W * T || c.height !== H * T) { c = document.createElement('canvas'); c.width = W * T; c.height = H * T; state.noiteCanvas = c; }
  const n = c.getContext('2d');
  n.globalCompositeOperation = 'source-over';
  n.clearRect(0, 0, c.width, c.height);
  n.fillStyle = `rgba(10,16,38,${k.toFixed(3)})`; n.fillRect(0, 0, c.width, c.height);
  n.globalCompositeOperation = 'destination-out';
  const luzes = [];
  for (const e of state.ents.values()) {
    if (e.mode !== 'seated') continue;
    const cx = e.desk.x * T + 16, cy = e.desk.y * T + 6;
    luzes.push([cx, cy]);
    const gr = n.createRadialGradient(cx, cy, 6, cx, cy, 44);
    gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = gr; n.fillRect(cx - 44, cy - 44, 88, 88);
  }
  g.drawImage(c, 0, 0);
  // brilho quente do abajur
  for (const [cx, cy] of luzes) {
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 30);
    gr.addColorStop(0, `rgba(255,214,140,${(0.22 * k / 0.55).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gr; g.fillRect(cx - 30, cy - 30, 60, 60);
  }
}

const FAZENDO = { beber: 'beber', banheiro: 'banheiro', celular: 'celular', ler: 'ler', cochilar: 'cochilar', papo: 'papo', esperaPapo: 'papo', jogar: 'jogar', almocar: 'almocar', happy: 'happy', embora: 'embora' };

// erro: o inspetor (ex.: Sentinela) vai até a mesa de quem falhou
function chamarInspetor(alvo) {
  const insp = [...state.ents.values()].find((x) => x.agent.inspector && x !== alvo);
  if (!insp || ATIVO.has(statusOf(insp.id)) || insp.mode === 'visit' || insp.mode === 'inspect') return;
  const { W, walk, comp } = state.nav;
  const ent = alvo.seat.entrada;
  if (ent < 0) return;
  if (insp.atv) terminar(insp);
  if (insp.mode === 'seated') levantar(insp);
  const aqui = blocoDe(insp.x, insp.y);
  const perto = [ent + 2, ent - 1, ent + W, ent + W + 1, ent].filter((i) => i >= 0 && i < walk.length && walk[i] && comp[i] === comp[aqui]);
  const p = perto.length ? caminho(aqui, perto[0]) : null;
  if (!p) return;
  insp.path = p; insp.mode = 'visit'; insp.visita = alvo.id;
}

function mudouStatus(e, st) {
  if (st === 'error' && e.last !== 'error' && !e.agent.inspector) chamarInspetor(e);
  if (st === 'error' && e.last !== 'error') olharErro(e);
  if (e.agent.central && ATIVO.has(st) && !ATIVO.has(e.last)) chefePassa(e);
  if (ATIVO.has(st) && !ATIVO.has(e.last)) {
    if (!['seated', 'run', 'ring', 'buscar', 'chamando', 'voltar'].includes(e.mode)) chamar(e);
    else if (e.mode === 'seated' && !e.agent.central) {
      const central = [...state.ents.values()].find((x) => x.agent.central && x !== e);
      if (central) state.mail.push({ de: { x: central.x, y: central.y - 24 }, para: e, t: 0, dur: 700 });
    }
  }
  if (!ATIVO.has(st) && e.mode === 'seated') e.timer = rnd(1500, 4000);
  if (!ATIVO.has(st) && (e.mode === 'run' || e.mode === 'ring' || e.mode === 'voltar')) { e.mode = 'pause'; e.path = []; e.timer = rnd(500, 1500); }
  if (ATIVO.has(st) && (e.mode === 'celebrate' || e.mode === 'visit' || e.mode === 'inspect')) chamar(e);
  e.last = st;
}

function andar(e, dt, vel) {
  let resta = (vel * dt) / 1000;
  while (resta > 0 && e.path.length) {
    const alvo = centroBloco(e.path[0]);
    const dx = alvo.x - e.x, dy = alvo.y - e.y, dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) e.facing = dx > 0 ? 'right' : 'left'; else if (dist > 0.01) e.facing = dy > 0 ? 'down' : 'up';
    if (dist <= resta) { e.x = alvo.x; e.y = alvo.y; e.path.shift(); resta -= dist; }
    else { e.x += (dx / dist) * resta; e.y += (dy / dist) * resta; resta = 0; }
  }
  e.step += (vel * dt) / 1000;
  return !e.path.length;
}

function atualizar(dt) {
  for (const e of state.ents.values()) {
    const st = statusOf(e.id);
    if (st !== e.last) mudouStatus(e, st);
    const ativo = ATIVO.has(st);
    if (e.vont && e.mode !== 'casa') envelhecer(e, st, dt);
    if (e.alfa != null && e.alfa < 1 && e.mode !== 'sumindo' && e.mode !== 'casa') e.alfa = Math.min(1, e.alfa + dt / 600);
    switch (e.mode) {
      case 'casa': {
        if (ativo) { chamar(e); break; }
        if (e.fora === 'casa' && state.periodo !== 'noite' && !e.voltaEm) e.voltaEm = Date.now() + rnd(0, 20 * 60000) / PRESSA;
        if (e.fora === 'almoco' && state.periodo === 'noite') { e.fora = 'casa'; e.voltaEm = 0; }
        if (e.voltaEm && Date.now() >= e.voltaEm) chegar(e);
        break;
      }
      case 'sumindo':
        if (ativo) { e.alfa = 1; chamar(e); break; }
        e.alfa = (e.alfa ?? 1) - dt / 700;
        if (e.alfa <= 0) { Object.assign(e, { alfa: 0, mode: 'casa', path: [], x: e.seat.x, y: e.seat.y }); }
        break;
      case 'aplaudir':
        if (ativo) { chamar(e); break; }
        e.timer -= dt; if (e.timer <= 0) { e.mode = 'pause'; e.timer = rnd(800, 2000); }
        break;
      case 'chegando':
        // chegando para trabalhar: entra pela saída e vai direto para a mesa
        if (ativo) { chamar(e); break; }
        if (andar(e, dt, VEL.walk * 1.1)) { const p = e.seat.entrada >= 0 ? caminho(blocoDe(e.x, e.y), e.seat.entrada) : null; if (p && p.length) { e.path = p; e.mode = 'voltar'; } else sentar(e); }
        break;
      case 'seated':
        if (!ativo && naMesa(e.agent) && !e.agent.central && state.periodo === 'noite') { irEmbora(e); break; }
        if (!ativo && !naMesa(e.agent) && !(e.disfarce > Date.now())) { e.timer -= dt; if (e.timer <= 0) levantar(e); }
        break;
      case 'pause':
        if (ativo) { chamar(e); break; }
        if (naMesa(e.agent)) { irParaMesa(e, true); break; }
        e.timer -= dt; if (e.timer <= 0) decidir(e);
        break;
      case 'walk':
        if (ativo) { chamar(e); break; }
        if (naMesa(e.agent)) { irParaMesa(e, true); break; }
        if (andar(e, dt, VEL.walk)) {
          if (e.indo) chegouAtividade(e);
          else { e.mode = 'pause'; e.timer = e.poi ? rnd(3000, 8000) : rnd(1200, 5000); e.facing = e.poi ? 'up' : e.facing; }
        }
        break;
      case 'atividade':
        if (ativo) { chamar(e); break; }
        if (!e.atv || naMesa(e.agent)) { terminar(e); e.mode = 'pause'; e.timer = rnd(500, 1500); break; }
        e.step += dt / 1000;
        if (e.atv.tipo === 'esperaPapo' || e.atv.tipo === 'papo') { const o = state.ents.get(e.atv.com); if (o) e.facing = virarPara(e, o); }
        e.timer -= dt; if (e.timer <= 0) concluir(e);
        break;
      case 'ring':
        e.timer -= dt; if (e.timer <= 0) irParaMesa(e);
        break;
      case 'celebrate':
        e.timer -= dt; e.step += dt / 1000;
        // depois da festa, a sede bate
        if (e.timer <= 0) { if (e.vont) { e.vont.sede = Math.max(e.vont.sede, 65); decidir(e); } else irAoCafe(e); }
        break;
      case 'visit':
        if (ativo) { chamar(e); break; }
        if (andar(e, dt, VEL.walk * 1.8)) { e.mode = 'inspect'; e.timer = 5000; e.facing = 'up'; }
        break;
      case 'inspect':
        if (ativo) { chamar(e); break; }
        e.timer -= dt; if (e.timer <= 0) { e.mode = 'pause'; e.timer = rnd(500, 1500); e.visita = null; }
        break;
      case 'buscar':
        // indo até a sala de espera chamar o paciente
        if (andar(e, dt, VEL.walk * 1.5)) {
          const b = state.buscas.get(e.id);
          if (b) b.chegou = Date.now();
          e.mode = 'chamando'; e.timer = 900; e.facing = b && b.olhar ? b.olhar : 'down';
        }
        break;
      case 'chamando':
        e.timer -= dt; if (e.timer <= 0) irParaMesa(e, true);
        break;
      case 'run':
      case 'voltar': {
        const vel = e.mode === 'voltar' ? VEL.walk * 1.15 : VEL.run;
        if (andar(e, dt, vel)) {
          // último trecho: da frente da mesa até a cadeira
          const dx = e.seat.x - e.x, dy = e.seat.y - e.y, dist = Math.hypot(dx, dy), passo = (vel * dt) / 1000;
          if (dist <= passo) sentar(e); else { e.x += (dx / dist) * passo; e.y += (dy / dist) * passo; e.facing = 'up'; }
        }
        break;
      }
    }
  }
}

// ---------- visitas (pacientes, clientes) ----------
// chegam CHEGADA antes do horário, esperam sentadas na sala de espera, no horário vão até a mesa de quem atende
// e ficam lá até o fim; depois saem pela porta da sala de espera. Visitas online não aparecem (só o agente atende).
const CHEGADA = 15 * 60000, SAIDA = 90000;
function lugaresDeVisita() {
  if (state.lugaresVisita) return state.lugaresVisita;
  const { W, H, walk, floor, comp } = state.nav;
  const rooms = state.layout.rooms;
  const ri = rooms.findIndex((r) => r.kind === 'waiting');
  const out = { ok: ri >= 0, entrada: -1, assentos: [], emPe: [], spot: new Map() };
  state.lugaresVisita = out;
  if (ri < 0) return out;
  const r = rooms[ri];
  const tiles = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x < W && y < H && floor[y * W + x] === ri && walk[y * W + x]) tiles.push(y * W + x);
  if (!tiles.length) { out.ok = false; return out; }
  // porta: bloco livre mais embaixo, perto do meio da sala
  const meio = r.x + r.w / 2;
  tiles.sort((a, b) => ((b / W) | 0) - ((a / W) | 0) || Math.abs((a % W) - meio) - Math.abs((b % W) - meio));
  out.entrada = tiles[0];
  const regiao = comp[out.entrada];
  // assentos: cada bloco dos sofás da sala de espera, com o bloco da frente livre para chegar
  for (const f of state.snap.office.furniture || []) {
    if (furnitureKey(f.type) !== 'sofa') continue;
    const def = furniture('sofa'); const tw = Math.ceil(def.w / T), th = Math.ceil(def.h / T);
    for (let dx = 0; dx < tw; dx++) {
      const x = f.pos[0] + dx, y = f.pos[1];
      if (floor[y * W + x] !== ri) continue;
      const frente = (y + th) * W + x;
      if (y + th < H && walk[frente] && comp[frente] === regiao) out.assentos.push({ frente, px: x * T + 8, py: y * T + 13 });
    }
  }
  // em pé: blocos da sala longe da porta, para quem não achou sofá
  out.emPe = tiles.filter((i) => comp[i] === regiao && i !== out.entrada).sort((a, b) => hashStr('p' + a) - hashStr('p' + b));
  // na frente de quem atende: do outro lado da mesa (de frente para o agente) ou ao lado
  for (const d of state.layout.desks) {
    // do outro lado da mesa (de frente para o agente), ao lado da mesa, ou ao lado da cadeira: sempre dentro da sala de quem atende
    const cands = [[d.x, d.y - 2, 'down'], [d.x + 1, d.y - 2, 'down'], [d.x + 2, d.y, 'left'], [d.x - 1, d.y, 'right'], [d.x + 2, d.y - 1, 'left'], [d.x - 1, d.y - 1, 'right'], [d.x + 2, d.y + 1, 'left'], [d.x - 1, d.y + 1, 'right'], [d.x + 3, d.y + 1, 'left'], [d.x - 2, d.y + 1, 'right']];
    const cad = [[d.x, d.y + 1], [d.x + 1, d.y + 1], [d.x, d.y + 2]].map(([x, y]) => y * W + x).find((i) => i >= 0 && i < W * H && walk[i]);
    const salaMesa = cad != null ? floor[cad] : -1;
    const oks = cands.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x] && comp[y * W + x] === regiao && (salaMesa < 0 || floor[y * W + x] === salaMesa));
    if (oks.length) out.spot.set(d.agent.id, oks.map(([x, y, f]) => ({ tile: y * W + x, facing: f })));
  }
  return out;
}
// o próximo paciente presencial já fica esperando na sala de espera, mesmo que falte mais de 15 min
// (só com o escritório aberto: fora do expediente ele chega 15 min antes, como os outros)
function proximaVisita(agora) {
  if (state.periodo === 'noite') return null;
  let prox = null;
  for (const v of state.visits) if (!v.online && v.inicio > agora && (!prox || v.inicio < prox.inicio)) prox = v;
  return prox;
}
// no horário da consulta presencial, quem atende vai até a sala de espera chamar o paciente e os dois vão juntos para a sala
function buscarPaciente(e) {
  const b = state.buscas.get(e.id);
  if (!b || b.chegou || Date.now() - b.t0 > 45000) return false;
  const pe = state.visitas.get(b.visitId);
  if (!pe) { b.chegou = Date.now(); return false; }
  const { W, H, walk } = state.nav;
  const base = (pe.mode === 'sentado' || pe.mode === 'senta') && pe.alvo && pe.alvo.sentar ? pe.alvo.tile : blocoDe(pe.x, pe.y);
  const aqui = e.mode === 'seated' && e.seat.entrada >= 0 ? e.seat.entrada : blocoDe(e.x, e.y);
  const cands = [[base + 1, 'left'], [base - 1, 'right'], [base + W, 'up'], [base - W, 'down'], [base, 'up']]
    .filter(([i]) => i >= 0 && i < W * H && walk[i] && Math.abs((i % W) - (base % W)) <= 1);
  for (const [i, olhar] of cands) {
    const p = caminho(aqui, i);
    if (!p) continue;
    if (e.mode === 'seated') Object.assign(e, centroBloco(aqui));
    b.olhar = olhar;
    e.path = p.length ? p : [i]; e.mode = 'buscar';
    return true;
  }
  b.chegou = Date.now();
  return false;
}
function faseDaVisita(v, agora, prox = proximaVisita(agora)) {
  if (v.online) return null;
  if (agora < v.inicio - CHEGADA) return prox && prox.id === v.id ? 'espera' : null;
  if (agora < v.inicio) return 'espera';
  if (agora < v.fim) return 'consulta';
  if (agora < v.fim + SAIDA) return 'saindo';
  return null;
}
function atualizarVisitas(dt) {
  const L2 = lugaresDeVisita();
  if (!L2.ok) { state.visitas.clear(); state.chamadas.clear(); return; }
  const agora = Date.now() - state.clockSkew;
  const lista = [...state.visits].sort((a, b) => a.inicio - b.inicio);
  const prox = proximaVisita(agora);
  // teleconsulta: uma janela de vídeo aparece na mesa de quem atende
  state.chamadas.clear();
  for (const v of lista) {
    if (!v.online || agora < v.inicio || agora >= v.fim) continue;
    const ag = state.ents && state.ents.get(v.agente);
    if (ag) state.chamadas.set('online:' + v.id, { v, x: ag.desk.x * T - 6, y: ag.desk.y * T - 2, alfa: 1, fase: 'online', look: agentLook({ id: 'visita:' + v.id }) });
  }
  const vivas = new Set();
  // lugares já ocupados continuam com quem está neles (ninguém troca de cadeira quando outro sai)
  const ocupados = new Set(), naConsulta = new Map();
  for (const v of lista) {
    const e = state.visitas.get(v.id), fase = faseDaVisita(v, agora, prox);
    if (!e || !e.lugar) continue;
    if ((fase === 'espera' || fase === 'consulta') && e.lugar.tipo !== 's') ocupados.add(e.lugar.chave);
    if (fase === 'consulta' && e.lugar.tipo === 's') naConsulta.set(e.lugar.chave, v.id);
  }
  let emPe = 0;
  // buscas que já não fazem sentido (consulta acabou ou mudou)
  for (const [ag, b] of state.buscas) {
    const v = lista.find((x) => x.id === b.visitId);
    if (!v || faseDaVisita(v, agora, prox) !== 'consulta' || Date.now() - b.t0 > 120000) state.buscas.delete(ag);
  }
  for (const v of lista) {
    const fase = faseDaVisita(v, agora, prox);
    let e = state.visitas.get(v.id);
    if (!fase || (fase === 'saindo' && !e)) continue;
    vivas.add(v.id);
    // começou a consulta de quem estava esperando: quem atende vem buscar
    if (fase === 'consulta' && e && e.fase === 'espera' && state.visitasProntas && v.agente && !state.buscas.has(v.agente)) {
      const doc = state.ents && state.ents.get(v.agente);
      if (doc) {
        state.buscas.set(v.agente, { visitId: v.id, chegou: 0, t0: Date.now() });
        if (['seated', 'pause', 'walk', 'celebrate', 'visit', 'inspect', 'voltar', 'run'].includes(doc.mode)) {
          if (!buscarPaciente(doc)) irParaMesa(doc, true);
        }
      }
    }
    const busca = v.agente && state.buscas.get(v.agente);
    const esperandoBusca = fase === 'consulta' && busca && busca.visitId === v.id && (!busca.chegou || Date.now() - busca.chegou < 900) && Date.now() - busca.t0 < 45000;
    // aonde ir
    let alvo;
    if (fase === 'espera') {
      if (e && e.lugar && e.lugar.tipo !== 's') alvo = e.lugar;
      else {
        const a = L2.assentos.find((x) => !ocupados.has('a' + x.frente));
        if (a) alvo = { tipo: 'a', chave: 'a' + a.frente, tile: a.frente, sentar: a };
        else {
          let t = L2.emPe[emPe++ % Math.max(1, L2.emPe.length)] ?? L2.entrada;
          for (let k = 0; ocupados.has('p' + t) && k < L2.emPe.length; k++) t = L2.emPe[emPe++ % L2.emPe.length];
          alvo = { tipo: 'p', chave: 'p' + t, tile: t, facing: 'down' };
        }
        ocupados.add(alvo.chave);
      }
    } else if (fase === 'consulta' && esperandoBusca && e && e.lugar) {
      alvo = e.lugar; // continua sentado até a doutora chegar
    } else if (fase === 'consulta') {
      if (e && e.lugar && e.lugar.tipo === 's' && naConsulta.get(e.lugar.chave) === v.id) alvo = e.lugar;
      else {
        const sps = L2.spot.get(v.agente) || [];
        const sp = sps.find((x) => !naConsulta.has('s' + x.tile)) || sps[0];
        alvo = sp ? { tipo: 's', chave: 's' + sp.tile, tile: sp.tile, facing: sp.facing } : { tipo: 'p', chave: 'p' + L2.entrada, tile: L2.entrada, facing: 'up' };
        naConsulta.set(alvo.chave, v.id);
      }
    } else alvo = { tipo: 'x', chave: 'saida', tile: L2.entrada, sair: true };
    if (!e) {
      e = { id: v.id, look: agentLook({ id: 'visita:' + v.id }), path: [], step: 0, facing: 'up', alfa: 1, chave: null };
      const nasce = state.visitasProntas ? L2.entrada : alvo.tile;
      Object.assign(e, centroBloco(nasce));
      if (state.visitasProntas) e.alfa = 0;
      state.visitas.set(v.id, e);
    }
    e.v = v; e.fase = fase;
    e.lugar = alvo;
    if (e.chave !== alvo.chave) {
      // quem está no sofá levanta pela frente dele
      const origem = (e.mode === 'sentado' || e.mode === 'senta') && e.alvo && e.alvo.sentar ? e.alvo.tile : blocoDe(e.x, e.y);
      e.chave = alvo.chave; e.alvo = alvo;
      let p = state.visitasProntas || e.mode ? caminho(origem, alvo.tile) : [];
      if (p && origem !== blocoDe(e.x, e.y)) p = [origem, ...p];
      if (p && p.length) { e.path = p; e.mode = 'walk'; }
      else { Object.assign(e, centroBloco(alvo.tile)); e.path = []; chegou(e); }
    }
  }
  // quem saiu da lista (consulta desmarcada) vai embora pela porta
  for (const [id, e] of state.visitas) if (!vivas.has(id) && e.chave !== 'saida') {
    const origem = (e.mode === 'sentado' || e.mode === 'senta') && e.alvo && e.alvo.sentar ? e.alvo.tile : blocoDe(e.x, e.y);
    e.chave = 'saida'; e.alvo = { tile: L2.entrada, sair: true };
    const p = caminho(origem, L2.entrada);
    if (p) { e.path = origem !== blocoDe(e.x, e.y) ? [origem, ...p] : p; e.mode = 'walk'; } else e.mode = 'sumindo';
  }
  // movimento
  for (const [id, e] of state.visitas) {
    if (e.alfa < 1 && e.mode !== 'sumindo') e.alfa = Math.min(1, e.alfa + dt / 600);
    if (e.mode === 'walk') { if (andar(e, dt, VEL.walk * 1.1)) chegou(e); }
    else if (e.mode === 'senta') {
      const a = e.alvo.sentar, dx = a.px - e.x, dy = a.py - e.y, dist = Math.hypot(dx, dy), passo = (VEL.walk * dt) / 1000;
      if (dist <= passo) { e.x = a.px; e.y = a.py; e.mode = 'sentado'; e.facing = 'down'; } else { e.x += (dx / dist) * passo; e.y += (dy / dist) * passo; e.facing = 'up'; }
    } else if (e.mode === 'sumindo') { e.alfa -= dt / 600; if (e.alfa <= 0) state.visitas.delete(id); }
  }
  state.visitasProntas = true;
}
// janela de videochamada flutuando ao lado do monitor: rosto do paciente e luz de "ao vivo"
function desenhaChamada(c) {
  const x = Math.round(c.x) - 8, y = Math.round(c.y) - 12;
  g.fillStyle = '#1b1f27'; g.fillRect(x - 1, y - 1, 18, 14);
  g.fillStyle = '#3b6fb6'; g.fillRect(x, y, 16, 12);
  g.fillStyle = '#5a8fd6'; g.fillRect(x, y, 16, 3);
  const k = c.look;
  g.fillStyle = k.shirt[0]; g.fillRect(x + 4, y + 9, 8, 3);
  g.fillStyle = k.skin; g.fillRect(x + 5, y + 3, 6, 6);
  g.fillStyle = k.hair; g.fillRect(x + 5, y + 2, 6, 2); g.fillRect(x + 4, y + 3, 1, 3); g.fillRect(x + 11, y + 3, 1, 3);
  g.fillStyle = '#1b1f27'; g.fillRect(x + 6, y + 5, 1, 1); g.fillRect(x + 9, y + 5, 1, 1);
  if (tick % 8 < 5) { g.fillStyle = '#ff4d4d'; g.fillRect(x + 13, y + 1, 2, 2); }
  // fio até o monitor
  g.fillStyle = 'rgba(27,31,39,0.6)'; g.fillRect(x + 17, y + 12, 6, 1);
}
function chegou(e) {
  const a = e.alvo;
  if (a.sentar) { e.mode = 'senta'; return; }
  if (a.sair) { e.mode = 'sumindo'; return; }
  e.mode = 'parado'; e.facing = a.facing || 'down';
}
function desenhaVisita(e) {
  g.globalAlpha = Math.max(0, Math.min(1, e.alfa));
  const andando = e.mode === 'walk' || e.mode === 'senta';
  const fr = andando ? 1 + (Math.floor(e.step / 4) % 2) : 0;
  const x = Math.round(e.x - 8), y = Math.round(e.y - 20);
  if (e.mode !== 'sentado') sombraChao(g, x + 8, Math.round(e.y) - 1, 5, 1, 0.32);
  g.drawImage(walkerSprite(e.look, e.facing, fr), x, y);
  g.globalAlpha = 1;
}

// ---------- quadro a quadro ----------
let tick = 0, lastTick = 0, lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!state.layout || !state.staticLayer || !state.ents) return;
  const dt = Math.min(100, lastT ? t - lastT : 16); lastT = t;
  if (t - lastTick > 140) { tick++; lastTick = t; }
  state.periodo = periodo();
  atualizar(dt);
  atualizarVisitas(dt);
  g.imageSmoothingEnabled = false;
  g.setTransform(state.scale, 0, 0, state.scale, 0, 0);
  g.drawImage(state.staticLayer, 0, 0);
  if (state.luzJanelas && state.periodo !== 'noite') g.drawImage(state.luzJanelas, 0, 0);
  luzesBanheiro();
  desenhaJogos();
  const heads = decorations('head');
  // monitores (o status aparece na tela mesmo com o agente a caminho)
  for (const e of state.ents.values()) drawMonitor(g, e.desk.x * T + 8, e.desk.y * T - 8, statusOf(e.id), tick + (hashStr(e.id) % 7));
  // cadeiras vazias e agentes, de cima para baixo
  const desenhos = [];
  for (const e of state.ents.values()) sombraChao(g, e.desk.x * T + 16, e.desk.y * T + 27, 6, 1, 0.3);
  for (const e of state.ents.values()) {
    if (e.mode !== 'seated') desenhos.push({ y: e.desk.y * T + 27, f: () => g.drawImage(emptyChair(), e.desk.x * T + 8, e.desk.y * T + 9) });
    desenhos.push({ y: e.y, f: () => desenhaAgente(e, heads) });
  }
  for (const v of state.visitas.values()) desenhos.push({ y: v.y, f: () => desenhaVisita(v) });
  for (const c of state.chamadas.values()) desenhos.push({ y: 1e6, f: () => desenhaChamada(c) });
  desenhos.sort((a, b) => a.y - b.y).forEach((d) => d.f());
  desenhaNoite();
  desenhaCorreio(dt);
  desenhaConfete(dt);
  drawEffect();
  if (state.editing && state.editDraw) state.editDraw(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  moverOverlay();
}

function desenhaAgente(e, heads) {
  if (e.oculto) return; // no banheiro
  const st = statusOf(e.id);
  g.globalAlpha = (st === 'offline' ? 0.55 : 1) * (e.alfa ?? 1);
  if (e.mode === 'casa') { g.globalAlpha = 1; return; }
  let topo;
  if (e.mode === 'seated') {
    const x = e.desk.x * T + 8, y = e.desk.y * T + 9;
    const finge = e.disfarce > Date.now(); // o chefe passou: finge que está trabalhando
    const fr = st === 'working' || finge ? (tick % 2) + 1 : 0;
    const bob = st === 'error' ? 1 : st === 'idle' && tick % 12 < 6 ? 1 : 0; // com erro, ombros caídos
    g.drawImage(agentSprite(e.look, fr), x, y + bob);
    topo = y + bob;
    if (st === 'waiting') maoLevantada(x, y + bob, e.look);
    // almoço na mesa (quem não sai dela)
    if (state.periodo === 'almoco' && !ATIVO.has(st) && naMesa(e.agent) && !e.agent.central) { pinta(x + 4, y + bob + 1, 8, 2, '#f7f3ea'); pinta(x + 6, y + bob, 4, 1, '#d98f3f'); if (Math.floor(Date.now() / 6000) % 3 === 0) balao(x + 8, y + bob, '🍱'); }
    if (e.reacao && e.reacao.ate > Date.now()) balao(x + 8, y + bob, e.reacao.emoji);
    if (e.preocupado > Date.now()) suor(x, y + bob);
  } else {
    const andando = e.mode === 'walk' || e.mode === 'run' || e.mode === 'visit' || e.mode === 'buscar' || e.mode === 'voltar' || e.mode === 'chegando';
    const fr = andando ? 1 + (Math.floor(e.step / (e.mode === 'run' ? 5 : 4)) % 2) : 0;
    // comemorando: pulinhos
    const quica = e.mode === 'celebrate' ? -Math.round(Math.abs(Math.sin(e.step * 7)) * 7) : andando && fr === 1 ? -1 : 0;
    const x = Math.round(e.x - 8), y = Math.round(e.y - 20 + quica);
    const atv = e.mode === 'atividade' && e.atv;
    const noSofa = atv && e.atv.sofa;
    const naTv = atv && e.atv.jogoTipo === 'videogame';
    if (noSofa) { g.drawImage(sittingSprite(e.look), x, y + 2); topo = y + 2; }
    else if (naTv) {
      // sentado de costas na cadeira gamer; com o jogo rolando, aperta os botões sem parar
      const j = state.jogos.get(e.atv.jogo);
      topo = Math.round(e.y) - 18;
      g.drawImage(agentSprite(e.look, j && j.inicio ? (tick % 2) + 1 : 0), x, topo);
    } else {
      sombraChao(g, x + 8, Math.round(e.y) - 1, 5, 1, 0.32);
      g.drawImage(walkerSprite(e.look, e.facing, fr), x, y);
      topo = y;
    }
    if (atv) desenhaAtividade(e, x, topo);
    if (e.mode === 'aplaudir') { if (tick % 2) bracosParaCima(x, y, e.look); }
    if (e.reacao && e.reacao.ate > Date.now()) balao(x + 8, topo, e.reacao.emoji);
    if (e.preocupado > Date.now() && !(e.reacao && e.reacao.ate > Date.now())) suor(x, topo);
    if (e.mode === 'celebrate') bracosParaCima(x, y, e.look);
    if (e.mode === 'inspect') lupa(Math.round(e.x) + 5, y + 7);
    if (e.mode === 'ring') {
      // celular vibrando acima da cabeça
      const tremor = tick % 2 ? 1 : -1;
      const px = Math.round(e.x) - 3 + tremor, py = y - 13;
      g.drawImage(phoneSprite(), px, py);
      if (tick % 4 < 2) { g.fillStyle = '#f2c14e'; g.fillRect(px - 3, py + 1, 1, 3); g.fillRect(px + 8, py + 1, 1, 3); g.fillRect(px - 5, py, 1, 5); g.fillRect(px + 10, py, 1, 5); }
    }
    if (e.mode === 'run' && tick % 2) { g.fillStyle = 'rgba(255,255,255,0.5)'; const atras = { left: 9, right: -9, up: 0, down: 0 }[e.facing]; g.fillRect(Math.round(e.x) + atras - 1, Math.round(e.y) - 3, 2, 1); }
  }
  for (const h of heads) { const sp = themeSprite(h.sprite); g.drawImage(sp, Math.round(e.mode === 'seated' ? e.desk.x * T + 16 : e.x) - (sp.width >> 1), topo - sp.height + 3); }
  if (st === 'error') nuvem(e.mode === 'seated' ? e.desk.x * T + 16 : e.x, topo);
  g.globalAlpha = 1;
}

// o que aparece na mão (ou sobre a cabeça) durante cada vontade
const pinta = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function desenhaAtividade(e, x, y) {
  const a = e.atv;
  if (a.tipo === 'beber') {
    const cx = x + 11, cy = y + 10;
    if (a.bebida === 'cafe') {
      pinta(cx, cy, 4, 4, '#f2efe6'); pinta(cx, cy, 4, 1, '#6b3e1e'); pinta(cx + 4, cy + 1, 1, 2, '#f2efe6');
      pinta(cx + 1 + (tick % 4 < 2 ? 0 : 1), cy - 3 - (tick % 2), 1, 2, 'rgba(255,255,255,0.55)');
    } else { pinta(cx, cy, 3, 4, '#e8f1ff'); pinta(cx, cy + 1, 3, 2, '#7fc4f0'); }
  } else if (a.tipo === 'celular') {
    pinta(x + 6, y + 10, 4, 5, '#22252b'); pinta(x + 7, y + 11, 2, 3, tick % 7 < 6 ? '#7fd1ff' : '#4fa66a');
    // de vez em quando ri do que está vendo
    const k = Math.floor(e.step / 4);
    if (k % 3 === 2) balao(x + 8, y, ['😂', '😍', '👀', '🤣', '😮'][(hashStr(e.id) + k) % 5]);
  } else if (a.tipo === 'cochilar') {
    for (let i = 0; i < 3; i++) {
      const k = (e.step * 0.6 + i / 3) % 1, zx = x + 10 + Math.round(k * 6), zy = y - 1 - Math.round(k * 12), c = `rgba(214,222,235,${(1 - k).toFixed(2)})`;
      pinta(zx, zy, 3, 1, c); pinta(zx + 1, zy + 1, 1, 1, c); pinta(zx, zy + 2, 3, 1, c);
    }
  } else if (a.tipo === 'ler') {
    const capa = ['#c0504d', '#4f81bd', '#9bbb59', '#8064a2'][hashStr(e.id) % 4];
    pinta(x + 3, y + 10, 10, 5, capa); pinta(x + 4, y + 10, 4, 4, '#f7f3ea'); pinta(x + 8, y + 10, 4, 4, '#f7f3ea'); pinta(x + 8, y + 10, 1, 5, capa);
  } else if (a.tipo === 'almocar') {
    // prato na mão e, de vez em quando, o que está comendo
    pinta(x + 3, y + 12, 10, 3, '#f7f3ea'); pinta(x + 5, y + 12, 6, 1, '#d98f3f'); pinta(x + 6, y + 11, 3, 1, '#4fa66a');
    if (Math.floor(e.step / 5) % 3 === 1) balao(x + 8, y, a.comida || '🍝');
  } else if (a.tipo === 'happy') {
    pinta(x + 11, y + 9, 3, 5, '#d9a441'); pinta(x + 11, y + 8, 3, 1, '#ffffff'); pinta(x + 14, y + 10, 1, 2, '#d9a441');
    const k = Math.floor(e.step / 2.5) + (hashStr(e.id) % 4);
    if (k % 2 === 0) balao(x + 8, y, ['🍻', '🎉', '🍕', '🥳', '😂', '🎶'][k % 6]);
    if (Math.random() < 0.0015) confete(e.x, e.y - 18, e.look.shirt[0]);
  } else if (a.tipo === 'jogar') {
    const j = state.jogos.get(a.jogo);
    if (!j) return;
    if (!j.inicio) { if (Math.floor(Date.now() / 1500) % 2) balao(x + 8, y, { sinuca: '🎱', pebolim: '⚽', videogame: '🎮' }[a.jogoTipo]); return; }
    if (a.jogoTipo === 'sinuca') {
      // taco: na vez dele, puxa e dá a tacada
      const t = (Date.now() - j.inicio) / 2600, vez = Math.floor(t) % j.jogadores.length === a.lado, f = t % 1;
      const recuo = vez && f < 0.3 ? Math.round(f * 12) : vez && f < 0.36 ? -2 : 0;
      const d = e.facing === 'right' ? 1 : e.facing === 'left' ? -1 : 0;
      if (d) { for (let k = 0; k < 14; k++) pinta(x + 8 + d * (2 + k - recuo), y + 13 - (k >> 3), 1, 1, k > 11 ? '#f7f3ea' : '#c9a46a'); }
      else for (let k = 0; k < 12; k++) pinta(x + 8, y + 8 - k + recuo, 1, 1, k > 9 ? '#f7f3ea' : '#c9a46a');
    }
  } else if (a.tipo === 'papo' && a.assuntos) {
    // falam um de cada vez
    const fase = Math.floor((Date.now() - (e.inicio || 0)) / 1800);
    if ((fase % 2 === 0) === !!a.fala) balao(x + 8, y, a.assuntos[Math.floor(fase / 2) % a.assuntos.length]);
  }
}
// balão de fala com um emoji
function balao(cx, topo, emoji) {
  const bx = Math.round(cx) - 7, by = topo - 15;
  pinta(bx, by + 1, 14, 9, '#ffffff'); pinta(bx + 1, by, 12, 11, '#ffffff'); pinta(bx + 5, by + 11, 2, 1, '#ffffff'); pinta(bx + 5, by + 12, 1, 1, '#ffffff');
  g.font = '8px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1b1f27';
  g.fillText(emoji, bx + 7, by + 6);
}
// partes que se mexem nos jogos: bolas da sinuca, bola e bonecos do pebolim, tela do videogame
const tri = (v) => { const f = v % 2; return f < 1 ? f : 2 - f; };
function posBola(lj, k, i) {
  const X = lj.x * T, Y = lj.y * T;
  if (k <= 0) { // arrumadas: branca à esquerda, triângulo à direita
    if (i === 0) return [X + 12, Y + 14];
    const tri3 = [[0, 0], [2, -1], [2, 1], [4, -2], [4, 0], [4, 2]][i - 1];
    return [X + 30 + tri3[0], Y + 14 + tri3[1] * 2];
  }
  const h = hashStr(`${lj.id}:${k}:${i}`);
  return [X + 5 + (h % 37), Y + 9 + ((h >>> 8) % 12)];
}
function desenhaJogos() {
  const L2 = state.nav && state.nav.lugares;
  if (!L2 || !L2.jogos.length) return;
  const agora = Date.now();
  for (const lj of L2.jogos) {
    const j = state.jogos.get(lj.id), rodando = !!(j && j.inicio), t = rodando ? (agora - j.inicio) / 1000 : 0;
    const X = lj.x * T, Y = lj.y * T;
    if (lj.tipo === 'sinuca') {
      const cores = ['#f7f3ea', '#f2c14e', '#d9534f', '#4a7fd4', '#8a63d2', '#f0883e', '#1f2228'];
      // depois de cada tacada as bolas rolam até a nova posição (2,6 s por tacada)
      const k = rodando ? Math.floor(t / 2.6) : 0, f = rodando ? Math.min(1, ((t / 2.6) % 1) / 0.45) : 1, ease = 1 - (1 - f) ** 3;
      cores.forEach((c, i) => {
        const [ax, ay] = posBola(lj, k, i), [bx, by] = posBola(lj, rodando ? k + 1 : 0, i);
        const px = rodando ? ax + (bx - ax) * ease : ax, py = rodando ? ay + (by - ay) * ease : ay;
        pinta(Math.round(px), Math.round(py), 2, 2, c);
      });
    } else if (lj.tipo === 'pebolim') {
      const by = Y + 4 + (rodando ? tri(t * 0.9) * 6 : 3), bx = X + 3 + (rodando ? tri(t * 0.55) * 25 : 12.5);
      [[6, '#d9534f'], [11, '#4a7fd4'], [20, '#d9534f'], [25, '#4a7fd4']].forEach(([rx, c], ri) => {
        const alvo = rodando ? Math.max(Y + 4, Math.min(Y + 8, by - 1 + Math.sin(t * 3 + ri) )) : Y + 6;
        for (const dy of [-3, 3]) pinta(X + rx - 1, Math.round(alvo + dy * (ri % 2 ? 0.7 : 1)), 3, 2, c);
      });
      pinta(Math.round(bx), Math.round(by), 2, 2, '#ffffff');
    } else if (lj.tipo === 'videogame') {
      const sx = X + 3, sy = Y + 2, w = 26, h = 13;
      if (!rodando) { pinta(sx, sy, w, h, '#22262e'); pinta(X + 10, Y + 19, 1, 1, agora % 2000 < 1000 ? '#d9534f' : '#5a2a2a'); continue; }
      // pong de dois jogadores
      pinta(sx, sy, w, h, '#0f1a2a');
      for (let yy = 0; yy < h; yy += 3) pinta(sx + 13, sy + yy, 1, 2, '#2c4766');
      const bx = sx + 2 + tri(t * 0.8) * (w - 5), byy = sy + 1 + tri(t * 1.1) * (h - 3);
      const pl = Math.max(sy, Math.min(sy + h - 4, byy - 1 + Math.sin(t * 2) * 2)), pr = Math.max(sy, Math.min(sy + h - 4, byy - 2 + Math.cos(t * 1.7) * 2));
      pinta(sx + 1, Math.round(pl), 1, 4, '#7fd1ff'); pinta(sx + w - 2, Math.round(pr), 1, 4, '#f28b82');
      pinta(Math.round(bx), Math.round(byy), 2, 2, '#ffffff');
      pinta(X + 10, Y + 19, 1, 1, '#4fa66a');
    }
  }
}

// luz da porta do banheiro: vermelha com alguém lá dentro
function luzesBanheiro() {
  const L2 = state.nav && state.nav.lugares;
  if (!L2 || !L2.banheiros.length) return;
  for (const b of L2.banheiros) {
    const ocupado = [...state.ents.values()].some((e) => e.oculto && e.atv && e.atv.key === 'wc:' + b.id);
    pinta(b.x * T + 12, b.y * T + 6, 2, 2, ocupado ? '#ff5a4f' : '#4fd16a');
  }
}

// nuvem cinza com chuva e raios (erro); acompanha o agente
function nuvem(cx, topo) {
  const x = Math.round(cx) - 10, y = topo - 15;
  const raio = tick % 14 < 2;
  g.fillStyle = raio ? '#9aa3ad' : '#5d6470';
  g.fillRect(x + 4, y + 2, 13, 5); g.fillRect(x + 2, y + 4, 17, 4); g.fillRect(x + 7, y, 6, 3); g.fillRect(x + 13, y + 1, 4, 2);
  g.fillStyle = raio ? '#c7ccd2' : '#7d8590'; g.fillRect(x + 5, y + 2, 5, 2); g.fillRect(x + 8, y + 1, 4, 1);
  g.fillStyle = '#7fb3ff';
  for (let i = 0; i < 4; i++) { const dy = (tick * 2 + i * 3) % 7; g.fillRect(x + 4 + i * 4, y + 9 + dy, 1, 2); }
  if (raio) { g.fillStyle = '#ffe14d'; g.fillRect(x + 11, y + 8, 2, 2); g.fillRect(x + 10, y + 10, 2, 2); g.fillRect(x + 11, y + 12, 2, 2); g.fillRect(x + 10, y + 14, 1, 2); }
}
// mão levantada com "?" piscando (esperando o Carlos)
function maoLevantada(x, y, look) {
  g.fillStyle = look.shirt[1]; g.fillRect(x + 13, y + 2, 2, 7);
  g.fillStyle = look.skin; g.fillRect(x + 13, y - 1, 3, 3);
  if (tick % 6 < 4) {
    const qx = x + 6, qy = y - 13;
    g.fillStyle = '#1b1f27'; g.fillRect(qx - 1, qy - 1, 7, 11);
    g.fillStyle = '#f2c14e';
    g.fillRect(qx + 1, qy, 3, 1); g.fillRect(qx, qy + 1, 1, 2); g.fillRect(qx + 4, qy + 1, 1, 2); g.fillRect(qx + 3, qy + 3, 1, 1); g.fillRect(qx + 2, qy + 4, 1, 2); g.fillRect(qx + 2, qy + 7, 1, 2);
  }
}
function bracosParaCima(x, y, look) {
  g.fillStyle = look.shirt[1]; g.fillRect(x + 1, y + 6, 2, 4); g.fillRect(x + 13, y + 6, 2, 4);
  g.fillStyle = look.skin; g.fillRect(x, y + 3, 3, 3); g.fillRect(x + 13, y + 3, 3, 3);
}
function lupa(x, y) {
  g.fillStyle = '#5a3b24'; g.fillRect(x + 4, y + 4, 2, 4);
  g.fillStyle = '#c9cdd2'; g.fillRect(x, y - 1, 6, 1); g.fillRect(x, y + 4, 6, 1); g.fillRect(x - 1, y, 1, 4); g.fillRect(x + 6, y, 1, 4);
  g.fillStyle = 'rgba(183,220,242,0.7)'; g.fillRect(x, y, 6, 4);
}
function desenhaConfete(dt) {
  const k = dt / 1000;
  state.burst = state.burst.filter((p) => {
    p.vy += 90 * k; p.vx *= 0.985; p.x += p.vx * k; p.y += p.vy * k; p.vida -= dt;
    g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.giro && tick % 2 ? 2 : 1, p.giro && tick % 2 ? 1 : 2);
    return p.vida > 0;
  });
}

function desenhaCorreio(dt) {
  const env = mailSprite();
  state.mail = state.mail.filter((m) => {
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const px = m.para.x, py = m.para.y - 30;
    const x = m.de.x + (px - m.de.x) * k, y = m.de.y + (py - m.de.y) * k - Math.sin(k * Math.PI) * 24;
    g.drawImage(env, Math.round(x - 3), Math.round(y - 2));
    return k < 1;
  });
}

// neve, confete e folhas (efeitos de tema)
// Halloween: alguns morcegos atravessam a tela batendo as asas, e umas folhas secas caem
function morcegos(W, H) {
  const ps = state.particles;
  const nM = Math.max(3, Math.min(9, (W * H / 40) | 0));
  if (!ps.length || ps[0].morcego === undefined) {
    ps.length = 0;
    for (let i = 0; i < nM; i++) ps.push({ morcego: true, x: Math.random() * W * T, y: Math.random() * H * T * 0.7, v: (0.4 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1), f: Math.random() * 6.28, a: Math.random() * 6.28 });
    for (let i = 0; i < 40; i++) ps.push({ morcego: false, x: Math.random() * W * T, y: Math.random() * H * T, v: 0.2 + Math.random() * 0.4, d: Math.random() * 6.28, c: ['#c9783b', '#8a4a2a', '#6b3f7a'][i % 3] });
  }
  for (const p of ps) {
    if (!p.morcego) {
      p.y += p.v; p.d += 0.03; p.x += Math.sin(p.d) * 0.3;
      if (p.y > H * T) { p.y = -4; p.x = Math.random() * W * T; }
      g.fillStyle = p.c; g.fillRect(p.x | 0, p.y | 0, 1, 1); continue;
    }
    p.x += p.v; p.a += 0.02; p.f += 0.35;
    const y = (p.y + Math.sin(p.a) * 6) | 0;
    if (p.x < -10) p.x = W * T + 8; if (p.x > W * T + 10) p.x = -8;
    const x = p.x | 0; const asa = Math.sin(p.f) > 0 ? -2 : 1;
    g.fillStyle = '#1c1824';
    g.fillRect(x - 1, y, 3, 2);                 // corpo
    g.fillRect(x - 4, y + asa, 3, 1); g.fillRect(x - 3, y + (asa < 0 ? -1 : 1), 2, 1); // asa esquerda
    g.fillRect(x + 2, y + asa, 3, 1); g.fillRect(x + 2, y + (asa < 0 ? -1 : 1), 2, 1); // asa direita
    g.fillStyle = '#ff5c5c'; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1);  // olhinhos
  }
}

function drawEffect() {
  const ef = state.snap && state.snap.theme && state.snap.theme.effect;
  if (!ef) { state.particles.length = 0; return; }
  const { W, H } = state.layout;
  if (ef === 'morcegos' || ef === 'bats') return morcegos(W, H);
  const max = Math.min(160, W * H / 3);
  const cores = ef === 'confetti' || ef === 'confete' ? ['#ff6b6b', '#f2c14e', '#4fa66a', '#4a7fd4', '#e26fa6'] : ef === 'leaves' || ef === 'folhas' ? ['#c9783b', '#e0a43a', '#a85a2a'] : ['#ffffff', '#e8f1ff'];
  while (state.particles.length < max) state.particles.push({ x: Math.random() * W * T, y: Math.random() * H * T - H * T, v: 0.25 + Math.random() * 0.5, d: Math.random() * 6.28, c: cores[(Math.random() * cores.length) | 0] });
  for (const p of state.particles) {
    p.y += p.v; p.d += 0.03; p.x += Math.sin(p.d) * 0.3;
    if (p.y > H * T) { p.y = -4; p.x = Math.random() * W * T; }
    g.fillStyle = p.c; g.fillRect(p.x | 0, p.y | 0, 1, ef === 'confetti' || ef === 'confete' ? 2 : 1);
  }
}

// ---------- sobreposição (nomes, balões, salas) ----------
function resize() {
  if (!state.layout) return;
  const { W, H } = state.layout;
  // cabe inteiro na tela (largura e altura), em passos de 1/4 para os pixels ficarem uniformes;
  // em telas muito pequenas fica no mínimo 1,5x com rolagem, para os nomes continuarem legíveis
  const cs = getComputedStyle(stage);
  const livreW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const livreH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let s = Math.min(livreW / (W * T), livreH / (H * T));
  s = Math.max(1.5, Math.floor(s * 4) / 4);
  state.scale = s;
  canvas.width = W * T * s; canvas.height = H * T * s;
  canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px';
  overlay.style.width = canvas.width + 'px'; overlay.style.height = canvas.height + 'px';
  overlay.style.setProperty('--s', s);
  placeOverlay();
}

const nodes = new Map();
function buildOverlay() {
  overlay.innerHTML = ''; nodes.clear();
  for (const r of state.layout.rooms) {
    const n = el('div', 'room-name', r.name.toUpperCase());
    n.dataset.x = (r.x + r.w / 2) * T; n.dataset.y = r.y * T + (temParede(r) ? 6 : 4);
    if (!temParede(r)) n.classList.add('on-floor');
    overlay.append(n);
  }
  for (const d of state.layout.desks) {
    const plate = el('button', 'plate');
    plate.type = 'button';
    plate.append(el('span', 'plate-name'), el('span', 'plate-role', d.agent.role || ''), el('span', 'plate-status'));
    plate.querySelector('.plate-name').textContent = d.agent.name || d.agent.id;
    plate.addEventListener('click', () => openPanel(d.agent));
    const bubble = el('div', 'bubble');
    const hit = el('button', 'hit'); hit.type = 'button'; hit.setAttribute('aria-label', d.agent.name || d.agent.id);
    hit.addEventListener('click', () => openPanel(d.agent));
    overlay.append(hit, bubble, plate);
    nodes.set(d.agent.id, { plate, bubble, hit, agent: d.agent, pos: '' });
  }
  const q = (state.snap.office.furniture || []).find((f) => furnitureKey(f.type) === 'quadro');
  if (q) {
    const sb = el('div', 'scoreboard');
    sb.append(el('span', 'sb-t', L.today), el('span', 'sb-n'));
    sb.dataset.x = q.pos[0] * T + 16; sb.dataset.y = q.pos[1] * T + 4;
    sb.classList.add('room-name');
    overlay.append(sb);
  }
  placeOverlay(); refreshOverlay();
}
function placeOverlay() {
  const s = state.scale;
  for (const n of overlay.querySelectorAll('.room-name')) { n.style.left = n.dataset.x * s + 'px'; n.style.top = n.dataset.y * s + 'px'; }
  for (const n of nodes.values()) { n.hit.style.width = 20 * s + 'px'; n.hit.style.height = 30 * s + 'px'; n.pos = ''; }
  moverOverlay();
}
// placa, balão e área de clique acompanham o agente
const tagsVisita = new Map();
function moverTagsVisita() {
  const s = state.scale;
  const todos = new Map([...state.visitas, ...state.chamadas]);
  for (const [id, n] of tagsVisita) if (!todos.has(id) || !overlay.contains(n)) { n.remove(); tagsVisita.delete(id); }
  for (const [id, e] of todos) {
    let n = tagsVisita.get(id);
    if (!n) { n = el('div', 'visit-tag'); overlay.append(n); tagsVisita.set(id, n); }
    const txt = e.v ? (e.fase === 'online' ? '💻 ' + e.v.nome + ' · online' : e.v.nome) : '';
    if (n.textContent !== txt) n.textContent = txt;
    n.style.left = Math.round(e.x) * s + 'px';
    n.style.top = (Math.round(e.y) - (e.fase === 'online' ? 14 : 27)) * s + 'px';
    n.style.opacity = Math.max(0, Math.min(1, e.alfa));
    n.dataset.fase = e.fase || '';
  }
}
function moverOverlay() {
  if (!state.ents) return;
  moverTagsVisita();
  const s = state.scale;
  for (const [id, n] of nodes) {
    const e = state.ents.get(id);
    if (!e) continue;
    // dentro do banheiro: some a placa também
    const oculto = !!e.oculto;
    if (n.oculto !== oculto) { n.oculto = oculto; for (const x of [n.plate, n.bubble, n.hit]) x.style.visibility = oculto ? 'hidden' : ''; }
    const sentado = e.mode === 'seated' || e.mode === 'casa';
    const fora = e.mode === 'casa' ? e.fora || 'casa' : '';
    if ((n.plate.dataset.fora || '') !== fora) n.plate.dataset.fora = fora;
    const cx = sentado ? e.desk.x * T + 16 : Math.round(e.x);
    const pe = sentado ? e.desk.y * T + 29 : Math.round(e.y) + 2;
    const cabeca = sentado ? e.desk.y * T - 10 : Math.round(e.y) - (e.mode === 'ring' ? 36 : 24);
    const chave = `${cx},${pe},${cabeca},${s}`;
    if (chave === n.pos) continue;
    n.pos = chave;
    n.plate.style.left = cx * s + 'px'; n.plate.style.top = pe * s + 'px';
    n.bubble.style.left = cx * s + 'px'; n.bubble.style.top = cabeca * s + 'px';
    n.hit.style.left = (cx - 10) * s + 'px'; n.hit.style.top = (sentado ? e.desk.y * T - 8 : Math.round(e.y) - 28) * s + 'px';
    n.plate.classList.toggle('walking', !sentado);
  }
}
// placar do dia, pintado sobre o quadro da parede (ou no topo, se não houver quadro)
function mostrarPlacar() {
  const sc = state.score;
  const el2 = overlay.querySelector('.scoreboard');
  const txt = sc ? [`✓ ${sc.success}`, `? ${sc.question}`, `⛈ ${sc.error}`] : null;
  if (el2 && txt) { el2.querySelector('.sb-n').innerHTML = txt.map((t, i) => `<span data-k="${['success', 'question', 'error'][i]}">${t}</span>`).join(''); }
  $('#score').textContent = sc ? `hoje ${sc.success} ✓ · ${sc.question} ? · ${sc.error} ⛈` : '';
}
function refreshOverlay() {
  const counts = { working: 0, waiting: 0, idle: 0, error: 0, offline: 0 };
  for (const [id, n] of nodes) {
    const a = state.agents.get(id);
    const st = statusOf(id);
    counts[st]++;
    const fila = a && a.queue ? ' · ' + L.queue(a.queue) : '';
    const ps = n.plate.querySelector('.plate-status');
    ps.textContent = (L[st] || st) + (st === 'working' || st === 'waiting' ? fila : '');
    n.plate.dataset.status = st;
    const fl = state.flash.get(id);
    const festa = fl && fl.ate > Date.now();
    const mostra = festa || (a && a.task && (st === 'working' || st === 'waiting' || st === 'error'));
    const txt = festa ? fl.texto : mostra ? a.task : '';
    n.bubble.textContent = txt.length > 42 ? txt.slice(0, 41) + '…' : txt;
    n.bubble.hidden = !mostra;
    n.bubble.dataset.status = festa ? 'success' : st;
    if (a && a.progress != null && st === 'working') n.plate.style.setProperty('--p', a.progress); else n.plate.style.removeProperty('--p');
  }
  mostrarPlacar();
  const agora = Date.now() - state.clockSkew;
  const naEspera = state.visits.filter((v) => faseDaVisita(v, agora) === 'espera').length;
  $('#counts').textContent = [...['working', 'waiting', 'error'].filter((k) => counts[k]).map((k) => `${counts[k]} ${L[k].toLowerCase()}`), naEspera ? `${naEspera} ${L.inWaiting}` : ''].filter(Boolean).join(' · ') || `${nodes.size} ${L.agents}`;
  if (state.selected) fillPanel(state.selected, false);
}

// ---------- painel do agente ----------
async function openPanel(agent) {
  state.selected = agent;
  $('#panel').hidden = false;
  fillPanel(agent, true);
}
async function fillPanel(agent, carregar) {
  const a = state.agents.get(agent.id);
  const st = statusOf(agent.id);
  $('#p-name').textContent = agent.name || agent.id;
  desenharRetrato($('#p-retrato'), agentLook(agent), agent.name || agent.id, { erro: st === 'error' });
  $('#p-role').textContent = [agent.role, agent.id !== agent.name ? agent.id : ''].filter(Boolean).join(' · ');
  $('#p-status').textContent = (L[st] || st) + (a && a.queue ? ' · ' + L.queue(a.queue) : '');
  $('#p-status').dataset.status = st;
  $('#p-task').textContent = a && a.task ? a.task : '';
  $('#p-updated').textContent = a ? `${L.updated} ${L.ago((Date.now() - state.clockSkew - a.updatedAt) / 1000)}` : '';
  mostrarVontades(agent);
  if (!carregar) return;
  const ul = $('#p-history'); ul.innerHTML = '';
  try {
    const r = await fetch(api(`/api/agents/${encodeURIComponent(agent.id)}/history?limit=40`)).then((x) => x.json());
    if (!r.history.length) ul.append(el('li', 'empty', L.noHistory));
    for (const h of r.history) {
      const li = el('li');
      const when = new Date(h.at).toLocaleString(document.documentElement.lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      li.append(el('span', 'h-when', when), el('span', 'h-status', ({ success: '✓ ', question: '? ', error: '⛈ ' }[h.outcome] || '') + (L[h.status] || h.status)), el('span', 'h-task', h.task || ''));
      li.querySelector('.h-status').dataset.status = h.status;
      ul.append(li);
    }
  } catch { ul.append(el('li', 'empty', '—')); }
}
// barras de vontade no painel do agente (atualizam sozinhas enquanto o painel está aberto)
function mostrarVontades(agent) {
  const box = $('#p-needs');
  const e = state.ents && state.ents.get(agent.id);
  if (!e || !e.vont) { box.hidden = true; return; }
  box.hidden = false;
  const a = e.atv;
  const agora = e.mode === 'casa' ? (e.fora === 'almoco' ? L.doing.almocoFora : L.doing.casa) : e.mode === 'aplaudir' ? L.doing.aplaudir : e.disfarce > Date.now() && e.mode === 'seated' ? L.doing.disfarce : naMesa(e.agent) ? L.doing.fixo : e.mode === 'seated' ? L.doing.mesa : a ? (e.indo ? L.doing.indo + ': ' : '') + (a.tipo === 'jogar' ? L.doing['jogo_' + a.jogoTipo] : L.doing[FAZENDO[a.tipo]] || a.tipo) : L.doing.livre;
  const linhas = [el('div', 'n-now', `${L.now}: ${agora}`)];
  for (const k of ['sede', 'banheiro', 'social', 'diversao', 'cansaco']) {
    const v = Math.round(e.vont[k]);
    const bar = el('div', 'n-bar'); const i = el('i'); i.style.width = v + '%'; if (v > (k === 'cansaco' ? 70 : VONTADE)) i.className = 'alto'; bar.append(i);
    bar.title = v + '%';
    linhas.push(el('span', '', L.needs[k]), bar);
  }
  const vit = lerVitorias()[agent.id];
  if (vit) linhas.push(el('div', 'n-now', `${L.wins}: ` + [['sinuca', '🎱'], ['pebolim', '⚽'], ['videogame', '🎮']].filter(([k]) => vit[k]).map(([k, ic]) => `${ic} ${vit[k]}`).join(' · ')));
  box.replaceChildren(...linhas);
}
setInterval(() => { if (state.selected && !$('#panel').hidden) mostrarVontades(state.selected); }, 1000);
$('#p-close').addEventListener('click', () => { $('#panel').hidden = true; state.selected = null; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#p-close').click(); });

// ---------- andares ----------
// abas no topo, uma por andar (só aparecem quando há mais de um)
function mostrarAndares(lista) {
  const nav = $('#floors');
  state.floors = lista || [];
  nav.hidden = state.floors.length < 2;
  nav.replaceChildren(...state.floors.map((f) => {
    const a = el('a', 'floor-tab', f.name);
    a.href = f.main ? location.pathname : `?andar=${encodeURIComponent(f.id)}`;
    if (f.id === state.floor) a.setAttribute('aria-current', 'page');
    return a;
  }));
}

// ---------- dados ----------
function applySnapshot(snap) {
  // durante a edição o rascunho manda; a versão do servidor entra quando a edição termina
  if (state.editing) { state.pendingSnap = snap; return; }
  const mudouTema = !state.snap || (state.snap.theme && state.snap.theme.id) !== (snap.theme && snap.theme.id);
  state.snap = snap;
  state.relogioCfg = lerRelogio(snap.office);
  const lang = snap.office.lang || state.lang || 'pt-BR';
  L = I18N[lang] || I18N[lang.split('-')[0]] || I18N['pt-BR'];
  document.documentElement.lang = lang;
  $('#office-name').textContent = snap.office.name;
  document.title = `${snap.office.name} · Kaisha`;
  const faixa = snap.special ? (snap.special.message || snap.special.name) : (snap.theme && snap.theme.title) || '';
  $('#banner').textContent = faixa; $('#banner').hidden = !faixa;
  $('#theme').textContent = snap.theme ? `${L.theme}: ${snap.theme.name}` : '';
  const erros = snap.erros || [];
  $('#errors').hidden = !erros.length;
  $('#errors').textContent = erros.length ? `⚠ ${L.configError}: ${erros.join(' · ')}` : '';
  if (mudouTema) state.particles.length = 0;
  rebuild();
}
function rebuild() {
  if (!state.snap) return;
  // a planta mudou: as visitas reaparecem direto no lugar
  state.lugaresVisita = null; state.visitas.clear(); state.visitasProntas = false;
  buildLayout(); buildStatic(); syncEntities(); buildOverlay(); resize();
}
function upsertAgents(list) {
  let novo = false;
  // resultado novo de uma tarefa: comemora (o erro e a pergunta aparecem pelo próprio status)
  const festas = [];
  for (const a of list) {
    const antes = state.agents.get(a.id);
    if (a.outcome === 'success' && (!antes || antes.updatedAt !== a.updatedAt)) festas.push(a);
  }
  for (const a of list) { if (!state.agents.has(a.id) && !state.layout?.desks.some((d) => d.agent.id === a.id)) novo = true; state.agents.set(a.id, a); }
  if (novo) rebuild(); else refreshOverlay();
  for (const a of festas) { const e = state.ents && state.ents.get(a.id); if (e) comemorar(e, a.task); }
}

async function loadState() {
  const resp = await fetch(api('/api/state'));
  // andar que não existe (link antigo): volta para o principal
  if (resp.status === 404 && ANDAR) { location.replace(location.pathname); return; }
  const r = await resp.json();
  state.floor = r.floor;
  mostrarAndares(r.floors);
  state.offlineAfterMs = r.offlineAfterMs || state.offlineAfterMs;
  state.clockSkew = Date.now() - r.serverTime;
  state.lang = r.lang;
  state.agents = new Map(r.agents.map((a) => [a.id, a]));
  state.score = r.score || null;
  state.visits = r.visits || [];
  applySnapshot({ version: r.version, office: r.office, erros: r.erros, theme: r.theme, special: r.special, themes: r.themes });
}

function connect() {
  const es = new EventSource(api('/api/stream'));
  const dot = $('#live');
  es.addEventListener('hello', (e) => {
    dot.dataset.on = '1'; dot.title = L.connected;
    // o servidor foi atualizado: recarrega para pegar o painel novo
    const v = JSON.parse(e.data).version;
    if (v && '__V__' !== '_' + '_V_' + '_' && v !== '__V__') location.reload();
  });
  es.addEventListener('agents', (e) => upsertAgents(JSON.parse(e.data)));
  es.addEventListener('visits', (e) => { state.visits = JSON.parse(e.data) || []; refreshOverlay(); });
  es.addEventListener('floors', (e) => mostrarAndares(JSON.parse(e.data)));
  es.addEventListener('score', (e) => { state.score = JSON.parse(e.data); mostrarPlacar(); });
  es.addEventListener('office', (e) => applySnapshot(JSON.parse(e.data)));
  es.addEventListener('reaction', (e) => reagir(JSON.parse(e.data)));
  es.addEventListener('removed', (e) => { state.agents.delete(JSON.parse(e.data).id); rebuild(); });
  let caiu = false;
  es.onerror = () => { dot.dataset.on = '0'; dot.title = L.reconnecting; caiu = true; };
  es.onopen = () => { if (caiu) { caiu = false; loadState().catch(() => {}); } };
}

window.addEventListener('resize', resize);
setInterval(refreshOverlay, 15000); // vira "offline" sem precisar de evento
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' }); }, 1000);

initEditor({ state, rebuild, canvas, applySnapshot, api });
loadState().then(() => { connect(); requestAnimationFrame(frame); }).catch((e) => { $('#errors').hidden = false; $('#errors').textContent = '⚠ ' + e.message; });
