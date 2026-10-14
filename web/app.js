// Kaisha · escritório no navegador
import { T, sprite, cached, agentLook, agentSprite, walkerSprite, phoneSprite, mailSprite, emptyChair, FLOORS, WALLS, furniture, furnitureKey, WALL_FURNITURE, FLAT_FURNITURE, drawMonitor, hashStr } from './sprites.js?v=__V__';

const I18N = {
  'pt-BR': {
    working: 'Executando', waiting: 'Aguardando', idle: 'Livre', error: 'Erro', offline: 'Offline',
    queue: (n) => `${n} na fila`, noDesk: 'Sem mesa', history: 'Histórico', close: 'Fechar', updated: 'atualizado',
    connected: 'ao vivo', reconnecting: 'reconectando…', noHistory: 'Sem eventos ainda.', configError: 'Erro na configuração',
    ago: (s) => (s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`),
    theme: 'Tema', agents: 'agentes', today: 'HOJE', success: 'Sucesso', question: 'Pergunta',
  },
  en: {
    working: 'Working', waiting: 'Waiting', idle: 'Idle', error: 'Error', offline: 'Offline',
    queue: (n) => `${n} queued`, noDesk: 'No desk', history: 'History', close: 'Close', updated: 'updated',
    connected: 'live', reconnecting: 'reconnecting…', noHistory: 'No events yet.', configError: 'Configuration error',
    ago: (s) => (s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`),
    theme: 'Theme', agents: 'agents', today: 'TODAY', success: 'Success', question: 'Question',
  },
};
let L = I18N['pt-BR'];

const $ = (s) => document.querySelector(s);
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
  state.nav = { W, H, floor, wallRow, walk, doors, edges, pass, comp, comps, pois: pois.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x]).map(([x, y]) => y * W + x),
    cafes: cafes.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && walk[y * W + x]).map(([x, y]) => y * W + x) };
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
    if (topo) {
      const [wall, wallDark, base] = WALLS[r.wall] || WALLS.clara;
      s.fillStyle = wall; s.fillRect(r.x * T, r.y * T, r.w * T, 2 * T);
      s.fillStyle = wallDark; s.fillRect(r.x * T, r.y * T + 2 * T - 5, r.w * T, 3);
      s.fillStyle = base; s.fillRect(r.x * T, r.y * T + 2 * T - 2, r.w * T, 2);
    }
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
  for (const { f, def } of items) {
    s.save();
    const x = f.pos[0] * T, y = f.pos[1] * T;
    if (f.flip) { s.translate(x * 2 + def.w, 0); s.scale(-1, 1); }
    def.draw(s, x, y);
    s.restore();
  }
  // mesas
  for (const d of desks) furniture('mesa').draw(s, d.x * T, d.y * T);
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
      if (d.agent.central || ATIVO.has(st) || seat.entrada < 0) sentar(e);
      else {
        // começa em pé num lugar qualquer da mesma região da mesa
        const lista = state.nav.comps[state.nav.comp[seat.entrada]] || [seat.entrada];
        const p = centroBloco(lista[(Math.random() * lista.length) | 0]);
        Object.assign(e, { mode: 'pause', x: p.x, y: p.y, timer: rnd(300, 3000) });
      }
    }
    // se a mesa mudou de lugar com o agente sentado, ele vai junto
    if (e.mode === 'seated') { e.x = seat.x; e.y = seat.y; }
    else if (!state.nav.walk[blocoDe(e.x, e.y)]) sentar(e);
    ents.set(id, e);
  }
  state.ents = ents;
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
  const lista = nav.comps[nav.comp[aqui]];
  if (!lista) { e.mode = 'pause'; e.timer = 3000; return; }
  const pois = nav.pois.filter((i) => nav.comp[i] === nav.comp[aqui]);
  const alvo = pois.length && Math.random() < 0.4 ? pois[(Math.random() * pois.length) | 0] : lista[(Math.random() * lista.length) | 0];
  const p = caminho(aqui, alvo);
  if (!p || !p.length) { e.mode = 'pause'; e.timer = rnd(1000, 3000); return; }
  e.path = p; e.mode = 'walk'; e.poi = pois.includes(alvo);
}
function irParaMesa(e) {
  const aqui = blocoDe(e.x, e.y);
  const p = e.seat.entrada >= 0 ? caminho(aqui, e.seat.entrada) : null;
  if (!p) { sentar(e); return; }
  e.path = p; e.mode = 'run';
}
function chamar(e) {
  // a tarefa sai da mesa do agente central (o Musashi) e chega no celular de quem vai fazer
  const central = [...state.ents.values()].find((x) => x.agent.central && x !== e);
  const voo = central ? 700 : 0;
  if (central) state.mail.push({ de: { x: central.x, y: central.y - 24 }, para: e, t: 0, dur: voo });
  e.mode = 'ring'; e.path = []; e.timer = voo + 1100; e.facing = 'down';
}

// ---------- reações ao resultado das tarefas ----------
// sucesso: pula, solta confete e vai tomar um café
function comemorar(e, tarefa) {
  state.flash.set(e.id, { texto: '✓ ' + (tarefa || 'feito'), ate: Date.now() + 4500 });
  setTimeout(refreshOverlay, 4600);
  refreshOverlay();
  if (e.mode === 'celebrate') return; // já está comemorando: uma festa só
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
  const opcoes = nav.cafes.filter((i) => nav.comp[i] === nav.comp[aqui]);
  const p = opcoes.length ? caminho(aqui, opcoes[(Math.random() * opcoes.length) | 0]) : null;
  if (p && p.length) { e.path = p; e.mode = 'walk'; e.poi = true; } else { e.mode = 'pause'; e.timer = rnd(800, 2000); }
}
// erro: o inspetor (ex.: Sentinela) vai até a mesa de quem falhou
function chamarInspetor(alvo) {
  const insp = [...state.ents.values()].find((x) => x.agent.inspector && x !== alvo);
  if (!insp || ATIVO.has(statusOf(insp.id)) || insp.mode === 'visit' || insp.mode === 'inspect') return;
  const { W, walk, comp } = state.nav;
  const ent = alvo.seat.entrada;
  if (ent < 0) return;
  if (insp.mode === 'seated') levantar(insp);
  const aqui = blocoDe(insp.x, insp.y);
  const perto = [ent + 2, ent - 1, ent + W, ent + W + 1, ent].filter((i) => i >= 0 && i < walk.length && walk[i] && comp[i] === comp[aqui]);
  const p = perto.length ? caminho(aqui, perto[0]) : null;
  if (!p) return;
  insp.path = p; insp.mode = 'visit'; insp.visita = alvo.id;
}

function mudouStatus(e, st) {
  if (st === 'error' && e.last !== 'error' && !e.agent.inspector) chamarInspetor(e);
  if (ATIVO.has(st) && !ATIVO.has(e.last)) {
    if (e.mode !== 'seated' && e.mode !== 'run' && e.mode !== 'ring') chamar(e);
    else if (e.mode === 'seated' && !e.agent.central) {
      const central = [...state.ents.values()].find((x) => x.agent.central && x !== e);
      if (central) state.mail.push({ de: { x: central.x, y: central.y - 24 }, para: e, t: 0, dur: 700 });
    }
  }
  if (!ATIVO.has(st) && e.mode === 'seated') e.timer = rnd(1500, 4000);
  if (!ATIVO.has(st) && (e.mode === 'run' || e.mode === 'ring')) { e.mode = 'pause'; e.path = []; e.timer = rnd(500, 1500); }
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
    switch (e.mode) {
      case 'seated':
        if (!ativo && !e.agent.central) { e.timer -= dt; if (e.timer <= 0) levantar(e); }
        break;
      case 'pause':
        if (ativo) { chamar(e); break; }
        e.timer -= dt; if (e.timer <= 0) passear(e);
        break;
      case 'walk':
        if (ativo) { chamar(e); break; }
        if (andar(e, dt, VEL.walk)) { e.mode = 'pause'; e.timer = e.poi ? rnd(3000, 8000) : rnd(1200, 5000); e.facing = e.poi ? 'up' : e.facing; }
        break;
      case 'ring':
        e.timer -= dt; if (e.timer <= 0) irParaMesa(e);
        break;
      case 'celebrate':
        e.timer -= dt; e.step += dt / 1000;
        if (e.timer <= 0) irAoCafe(e);
        break;
      case 'visit':
        if (ativo) { chamar(e); break; }
        if (andar(e, dt, VEL.walk * 1.8)) { e.mode = 'inspect'; e.timer = 5000; e.facing = 'up'; }
        break;
      case 'inspect':
        if (ativo) { chamar(e); break; }
        e.timer -= dt; if (e.timer <= 0) { e.mode = 'pause'; e.timer = rnd(500, 1500); e.visita = null; }
        break;
      case 'run':
        if (andar(e, dt, VEL.run)) {
          // último trecho: da frente da mesa até a cadeira
          const dx = e.seat.x - e.x, dy = e.seat.y - e.y, dist = Math.hypot(dx, dy), passo = (VEL.run * dt) / 1000;
          if (dist <= passo) sentar(e); else { e.x += (dx / dist) * passo; e.y += (dy / dist) * passo; e.facing = 'up'; }
        }
        break;
    }
  }
}

// ---------- quadro a quadro ----------
let tick = 0, lastTick = 0, lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!state.layout || !state.staticLayer || !state.ents) return;
  const dt = Math.min(100, lastT ? t - lastT : 16); lastT = t;
  if (t - lastTick > 140) { tick++; lastTick = t; }
  atualizar(dt);
  g.imageSmoothingEnabled = false;
  g.setTransform(state.scale, 0, 0, state.scale, 0, 0);
  g.drawImage(state.staticLayer, 0, 0);
  const heads = decorations('head');
  // monitores (o status aparece na tela mesmo com o agente a caminho)
  for (const e of state.ents.values()) drawMonitor(g, e.desk.x * T + 8, e.desk.y * T - 8, statusOf(e.id), tick + (hashStr(e.id) % 7));
  // cadeiras vazias e agentes, de cima para baixo
  const desenhos = [];
  for (const e of state.ents.values()) {
    if (e.mode !== 'seated') desenhos.push({ y: e.desk.y * T + 27, f: () => g.drawImage(emptyChair(), e.desk.x * T + 8, e.desk.y * T + 9) });
    desenhos.push({ y: e.y, f: () => desenhaAgente(e, heads) });
  }
  desenhos.sort((a, b) => a.y - b.y).forEach((d) => d.f());
  desenhaCorreio(dt);
  desenhaConfete(dt);
  drawEffect();
  g.setTransform(1, 0, 0, 1, 0, 0);
  moverOverlay();
}

function desenhaAgente(e, heads) {
  const st = statusOf(e.id);
  g.globalAlpha = st === 'offline' ? 0.55 : 1;
  let topo;
  if (e.mode === 'seated') {
    const x = e.desk.x * T + 8, y = e.desk.y * T + 9;
    const fr = st === 'working' ? (tick % 2) + 1 : 0;
    const bob = st === 'error' ? 1 : st === 'idle' && tick % 12 < 6 ? 1 : 0; // com erro, ombros caídos
    g.drawImage(agentSprite(e.look, fr), x, y + bob);
    topo = y + bob;
    if (st === 'waiting') maoLevantada(x, y + bob, e.look);
  } else {
    const andando = e.mode === 'walk' || e.mode === 'run' || e.mode === 'visit';
    const fr = andando ? 1 + (Math.floor(e.step / (e.mode === 'run' ? 5 : 4)) % 2) : 0;
    // comemorando: pulinhos
    const quica = e.mode === 'celebrate' ? -Math.round(Math.abs(Math.sin(e.step * 7)) * 7) : andando && fr === 1 ? -1 : 0;
    const x = Math.round(e.x - 8), y = Math.round(e.y - 20 + quica);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, Math.round(e.y) - 1, 10, 2);
    g.drawImage(walkerSprite(e.look, e.facing, fr), x, y);
    topo = y;
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
function drawEffect() {
  const ef = state.snap && state.snap.theme && state.snap.theme.effect;
  if (!ef) { state.particles.length = 0; return; }
  const { W, H } = state.layout;
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
  const disp = stage.clientWidth;
  let s = disp / (W * T);
  // pixel inteiro quando cabe; em telas pequenas fica em 2x com rolagem lateral, para os nomes continuarem legíveis
  s = s >= 2 ? Math.floor(s * 2) / 2 : 2;
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
function moverOverlay() {
  if (!state.ents) return;
  const s = state.scale;
  for (const [id, n] of nodes) {
    const e = state.ents.get(id);
    if (!e) continue;
    const sentado = e.mode === 'seated';
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
  $('#counts').textContent = ['working', 'waiting', 'error'].filter((k) => counts[k]).map((k) => `${counts[k]} ${L[k].toLowerCase()}`).join(' · ') || `${nodes.size} ${L.agents}`;
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
  $('#p-role').textContent = [agent.role, agent.id !== agent.name ? agent.id : ''].filter(Boolean).join(' · ');
  $('#p-status').textContent = (L[st] || st) + (a && a.queue ? ' · ' + L.queue(a.queue) : '');
  $('#p-status').dataset.status = st;
  $('#p-task').textContent = a && a.task ? a.task : '';
  $('#p-updated').textContent = a ? `${L.updated} ${L.ago((Date.now() - state.clockSkew - a.updatedAt) / 1000)}` : '';
  if (!carregar) return;
  const ul = $('#p-history'); ul.innerHTML = '';
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/history?limit=40`).then((x) => x.json());
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
$('#p-close').addEventListener('click', () => { $('#panel').hidden = true; state.selected = null; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#p-close').click(); });

// ---------- dados ----------
function applySnapshot(snap) {
  const mudouTema = !state.snap || (state.snap.theme && state.snap.theme.id) !== (snap.theme && snap.theme.id);
  state.snap = snap;
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
  const r = await fetch('/api/state').then((x) => x.json());
  state.offlineAfterMs = r.offlineAfterMs || state.offlineAfterMs;
  state.clockSkew = Date.now() - r.serverTime;
  state.lang = r.lang;
  state.agents = new Map(r.agents.map((a) => [a.id, a]));
  state.score = r.score || null;
  applySnapshot({ version: r.version, office: r.office, erros: r.erros, theme: r.theme, special: r.special, themes: r.themes });
}

function connect() {
  const es = new EventSource('/api/stream');
  const dot = $('#live');
  es.addEventListener('hello', (e) => {
    dot.dataset.on = '1'; dot.title = L.connected;
    // o servidor foi atualizado: recarrega para pegar o painel novo
    const v = JSON.parse(e.data).version;
    if (v && '__V__' !== '_' + '_V_' + '_' && v !== '__V__') location.reload();
  });
  es.addEventListener('agents', (e) => upsertAgents(JSON.parse(e.data)));
  es.addEventListener('score', (e) => { state.score = JSON.parse(e.data); mostrarPlacar(); });
  es.addEventListener('office', (e) => applySnapshot(JSON.parse(e.data)));
  es.addEventListener('removed', (e) => { state.agents.delete(JSON.parse(e.data).id); rebuild(); });
  let caiu = false;
  es.onerror = () => { dot.dataset.on = '0'; dot.title = L.reconnecting; caiu = true; };
  es.onopen = () => { if (caiu) { caiu = false; loadState().catch(() => {}); } };
}

window.addEventListener('resize', resize);
setInterval(refreshOverlay, 15000); // vira "offline" sem precisar de evento
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' }); }, 1000);

loadState().then(() => { connect(); requestAnimationFrame(frame); }).catch((e) => { $('#errors').hidden = false; $('#errors').textContent = '⚠ ' + e.message; });
