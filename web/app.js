// Kaisha · escritório no navegador
import { T, sprite, cached, agentLook, agentSprite, emptyChair, FLOORS, WALLS, furniture, drawMonitor, hashStr } from './sprites.js';

const I18N = {
  'pt-BR': {
    working: 'Executando', waiting: 'Aguardando', idle: 'Livre', error: 'Erro', offline: 'Offline',
    queue: (n) => `${n} na fila`, noDesk: 'Sem mesa', history: 'Histórico', close: 'Fechar', updated: 'atualizado',
    connected: 'ao vivo', reconnecting: 'reconectando…', noHistory: 'Sem eventos ainda.', configError: 'Erro na configuração',
    ago: (s) => (s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`),
    theme: 'Tema', agents: 'agentes',
  },
  en: {
    working: 'Working', waiting: 'Waiting', idle: 'Idle', error: 'Error', offline: 'Offline',
    queue: (n) => `${n} queued`, noDesk: 'No desk', history: 'History', close: 'Close', updated: 'updated',
    connected: 'live', reconnecting: 'reconnecting…', noHistory: 'No events yet.', configError: 'Configuration error',
    ago: (s) => (s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`),
    theme: 'Theme', agents: 'agents',
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
  selected: null,
};

// ---------- layout ----------
function buildLayout() {
  const office = state.snap.office;
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
      desks.push({ agent: cfg, x: 1 + i * 5, y: H + 2 });
    });
    W = Math.max(W, w); H += 6;
  }
  state.layout = { rooms, desks, W, H };
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
  const c = document.createElement('canvas'); c.width = W * T; c.height = H * T;
  const s = c.getContext('2d');
  s.fillStyle = '#1b1f27'; s.fillRect(0, 0, c.width, c.height);
  const tint = state.snap.theme && state.snap.theme.floorTint;
  for (const r of rooms) {
    const floor = FLOORS[r.floor] || FLOORS.madeira;
    for (let cy = r.y + 2; cy < r.y + r.h; cy++) for (let cx = r.x; cx < r.x + r.w; cx++) floor(s, cx * T, cy * T, hashStr(`${cx},${cy}`) % 97, cx, cy);
    if (tint) { s.fillStyle = tint; s.fillRect(r.x * T, (r.y + 2) * T, r.w * T, (r.h - 2) * T); }
    const [wall, wallDark, base] = WALLS[r.wall] || WALLS.clara;
    s.fillStyle = wall; s.fillRect(r.x * T, r.y * T, r.w * T, 2 * T);
    s.fillStyle = wallDark; s.fillRect(r.x * T, r.y * T + 2 * T - 5, r.w * T, 3);
    s.fillStyle = base; s.fillRect(r.x * T, r.y * T + 2 * T - 2, r.w * T, 2);
    // contorno da sala
    s.fillStyle = '#2a2e37';
    s.fillRect(r.x * T, r.y * T, r.w * T, 2); s.fillRect(r.x * T, (r.y + r.h) * T - 2, r.w * T, 2);
    s.fillRect(r.x * T, r.y * T, 2, r.h * T); s.fillRect((r.x + r.w) * T - 2, r.y * T, 2, r.h * T);
  }
  // móveis (os de parede ficam na faixa da parede, os de chão por ordem de altura)
  const items = (state.snap.office.furniture || []).map((f) => ({ f, def: furniture(f.type) })).filter((x) => x.def);
  items.sort((a, b) => a.f.pos[1] - b.f.pos[1]);
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

// ---------- quadro a quadro ----------
const statusOf = (id) => {
  const a = state.agents.get(id);
  if (!a) return 'offline';
  if (a.status !== 'offline' && Date.now() - state.clockSkew - a.seenAt > state.offlineAfterMs) return 'offline';
  return a.status;
};

let tick = 0, lastTick = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!state.layout || !state.staticLayer) return;
  if (t - lastTick > 140) { tick++; lastTick = t; }
  g.imageSmoothingEnabled = false;
  g.setTransform(state.scale, 0, 0, state.scale, 0, 0);
  g.drawImage(state.staticLayer, 0, 0);
  const heads = decorations('head');
  for (const d of state.layout.desks) {
    const st = statusOf(d.agent.id);
    const x = d.x * T, y = d.y * T;
    drawMonitor(g, x + 8, y - 8, st, tick + (hashStr(d.agent.id) % 7));
    const look = agentLook(d.agent);
    const ay = y + 9;
    if (st === 'offline') { g.drawImage(emptyChair(), x + 8, ay); continue; }
    const fr = st === 'working' ? (tick % 2) + 1 : 0;
    const bob = st === 'idle' && tick % 12 < 6 ? 1 : 0;
    g.drawImage(agentSprite(look, fr), x + 8, ay + bob);
    for (const h of heads) { const sp = themeSprite(h.sprite); g.drawImage(sp, x + 16 - (sp.width >> 1), ay + bob - sp.height + 3); }
    if (st === 'error' && tick % 4 < 2) { g.fillStyle = '#ff5c5c'; g.fillRect(x + 15, ay - 9, 2, 5); g.fillRect(x + 15, ay - 3, 2, 2); }
  }
  drawEffect();
  g.setTransform(1, 0, 0, 1, 0, 0);
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
    n.dataset.x = (r.x + r.w / 2) * T; n.dataset.y = r.y * T + 6;
    overlay.append(n);
  }
  for (const d of state.layout.desks) {
    const plate = el('button', 'plate');
    plate.type = 'button';
    plate.append(el('span', 'plate-name'), el('span', 'plate-role', d.agent.role || ''), el('span', 'plate-status'));
    plate.querySelector('.plate-name').textContent = d.agent.name || d.agent.id;
    plate.dataset.x = d.x * T + 16; plate.dataset.y = d.y * T + 29;
    plate.addEventListener('click', () => openPanel(d.agent));
    const bubble = el('div', 'bubble');
    bubble.dataset.x = d.x * T + 16; bubble.dataset.y = d.y * T - 10;
    const hit = el('button', 'hit'); hit.type = 'button'; hit.setAttribute('aria-label', d.agent.name || d.agent.id);
    hit.dataset.x = d.x * T; hit.dataset.y = d.y * T - 8; hit.addEventListener('click', () => openPanel(d.agent));
    overlay.append(hit, bubble, plate);
    nodes.set(d.agent.id, { plate, bubble, hit, agent: d.agent });
  }
  placeOverlay(); refreshOverlay();
}
function placeOverlay() {
  const s = state.scale;
  for (const n of overlay.children) { n.style.left = n.dataset.x * s + 'px'; n.style.top = n.dataset.y * s + 'px'; }
  for (const { hit } of nodes.values()) { hit.style.width = 32 * s + 'px'; hit.style.height = 36 * s + 'px'; }
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
    const mostra = a && a.task && (st === 'working' || st === 'waiting' || st === 'error');
    n.bubble.textContent = mostra ? (a.task.length > 42 ? a.task.slice(0, 41) + '…' : a.task) : '';
    n.bubble.hidden = !mostra;
    n.bubble.dataset.status = st;
    if (a && a.progress != null && st === 'working') n.plate.style.setProperty('--p', a.progress); else n.plate.style.removeProperty('--p');
  }
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
      li.append(el('span', 'h-when', when), el('span', 'h-status', L[h.status] || h.status), el('span', 'h-task', h.task || ''));
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
  buildLayout(); buildStatic(); buildOverlay(); resize();
}
function upsertAgents(list) {
  let novo = false;
  for (const a of list) { if (!state.agents.has(a.id) && !state.layout?.desks.some((d) => d.agent.id === a.id)) novo = true; state.agents.set(a.id, a); }
  if (novo) rebuild(); else refreshOverlay();
}

async function loadState() {
  const r = await fetch('/api/state').then((x) => x.json());
  state.offlineAfterMs = r.offlineAfterMs || state.offlineAfterMs;
  state.clockSkew = Date.now() - r.serverTime;
  state.lang = r.lang;
  state.agents = new Map(r.agents.map((a) => [a.id, a]));
  applySnapshot({ version: r.version, office: r.office, erros: r.erros, theme: r.theme, special: r.special, themes: r.themes });
}

function connect() {
  const es = new EventSource('/api/stream');
  const dot = $('#live');
  es.addEventListener('hello', () => { dot.dataset.on = '1'; dot.title = L.connected; });
  es.addEventListener('agents', (e) => upsertAgents(JSON.parse(e.data)));
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
