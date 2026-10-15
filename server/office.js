// Lê o office.yaml e os temas, valida, e observa os arquivos para recarregar ao vivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const BUILTIN_THEMES = path.join(ROOT, 'themes');
const EXAMPLE_OFFICE = path.join(ROOT, 'examples', 'office.yaml');

// Aceita as chaves em português ou em inglês.
const ALIAS = {
  nome: 'name', tema: 'theme', salas: 'rooms', piso: 'floor', parede: 'wall', agentes: 'agents', cargo: 'role',
  sala: 'room', mesa: 'desk', cor: 'color', moveis: 'furniture', móveis: 'furniture', tipo: 'type', posicao: 'pos', posição: 'pos',
  datas_especiais: 'special_days', data: 'date', calendario: 'calendar', calendário: 'calendar', periodo: 'period', período: 'period',
  de: 'from', ate: 'to', até: 'to', enfeites: 'decorations', ponto: 'at', efeito: 'effect', desenhos: 'sprites',
  paleta: 'palette', pixels: 'pixels', cabelo: 'hair', pele: 'skin', roupa: 'shirt', idioma: 'lang', titulo: 'title', título: 'title',
  movel: 'movable', ordem: 'order', fica_na_sala: 'stay', fica_na_mesa: 'fixed', na_mesa: 'fixed', penteado: 'hairstyle', cabelo_estilo: 'hairstyle', na_sala: 'stay', stay_in_room: 'stay', planta: 'plan', central: 'central', inspetor: 'inspector', móvel: 'movable', calendarios: 'calendars', calendários: 'calendars', base: 'base', cada: 'every', escala: 'scale', espelhar: 'flip', mensagem: 'message',
  expediente: 'hours', horario: 'hours', horário: 'hours', almoco: 'lunch', almoço: 'lunch', relogio: 'clock', relógio: 'clock',
};
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[ALIAS[k] || k] = norm(val);
    return o;
  }
  return v;
};

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const pair = (v) => Array.isArray(v) && v.length >= 2 && isNum(v[0]) && isNum(v[1]);

export function validateOffice(raw) {
  const o = norm(raw || {});
  const erros = [];
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];
  if (!rooms.length) erros.push('o escritório precisa de pelo menos uma sala (rooms/salas)');
  const roomIds = new Set();
  rooms.forEach((r, i) => {
    if (!r.id) erros.push(`sala #${i + 1} sem id`);
    else if (roomIds.has(r.id)) erros.push(`sala "${r.id}" repetida`);
    roomIds.add(r.id);
    if (!Array.isArray(r.area) || r.area.length !== 4 || !r.area.every(isNum)) erros.push(`sala "${r.id || i + 1}": area deve ser [coluna, linha, largura, altura]`);
    else if (r.area[2] < 3 || r.area[3] < 4) erros.push(`sala "${r.id}": mínimo 3 de largura e 4 de altura`);
  });
  const agents = Array.isArray(o.agents) ? o.agents : [];
  const agentIds = new Set();
  agents.forEach((a, i) => {
    if (!a.id) erros.push(`agente #${i + 1} sem id`);
    else if (agentIds.has(a.id)) erros.push(`agente "${a.id}" repetido`);
    agentIds.add(a.id);
    if (a.room && !roomIds.has(a.room)) erros.push(`agente "${a.id}": sala "${a.room}" não existe`);
    if (a.desk && !pair(a.desk)) erros.push(`agente "${a.id}": mesa deve ser [coluna, linha]`);
  });
  const furniture = (Array.isArray(o.furniture) ? o.furniture : []).filter((f) => f && f.type);
  furniture.forEach((f, i) => {
    if (!pair(f.pos)) erros.push(`móvel #${i + 1} (${f.type}): pos deve ser [coluna, linha]`);
  });
  const special = (Array.isArray(o.special_days) ? o.special_days : []).filter((d) => d && /^\d{2}-\d{2}$/.test(String(d.date || '')));
  return {
    erros,
    office: {
      name: String(o.name || 'Kaisha'),
      theme: String(o.theme ?? 'auto'),
      calendar: String(o.calendar || 'br'),
      lang: o.lang ? String(o.lang) : null,
      // planta aberta: um salão só, salas separadas por divisórias com passagens
      order: isNum(Number(o.order)) && o.order !== null && o.order !== '' ? Number(o.order) : null, // posição na lista de andares
      plan: ['aberta', 'aberto', 'open', 'integrada'].includes(String(o.plan || '').toLowerCase()) ? 'open' : 'rooms',
      rooms: rooms.map((r) => ({
        id: String(r.id), name: String(r.name ?? r.id), area: r.area, floor: r.floor || 'madeira', wall: r.wall || 'clara',
        // sala de espera: onde as visitas (pacientes, clientes) aguardam até a hora marcada
        kind: ['espera', 'waiting', 'sala_de_espera', 'recepcao_espera'].includes(String(r.type ?? r.kind ?? '').toLowerCase()) ? 'waiting' : null,
      })),
      agents: agents.map((a) => ({
        id: String(a.id), name: String(a.name ?? a.id), role: a.role ? String(a.role) : '', room: a.room ? String(a.room) : null,
        desk: pair(a.desk) ? a.desk : null, color: a.color || null, hair: a.hair || null, skin: a.skin || null, shirt: a.shirt || null,
        central: a.central === true || a.central === 'sim', // fica sempre na mesa e distribui as tarefas
        inspector: a.inspector === true || a.inspector === 'sim', // vai até a mesa de quem deu erro
        stay: a.stay === true || a.stay === 'sim', // quando está livre, anda só dentro da própria sala
        fixed: a.fixed === true || a.fixed === 'sim', // não sai da mesa (sem distribuir tarefas, como o central)
        hairstyle: ({ longo: 'long', long: 'long', comprido: 'long', curto: 'short', short: 'short' })[String(a.hairstyle || '').toLowerCase()] || null,
      })),
      furniture: furniture.map((f) => ({ type: String(f.type), pos: f.pos, room: f.room ? String(f.room) : null, flip: !!f.flip })),
      // vida pelo relógio: expediente (fora dele todo mundo vai para casa e a luz apaga), almoço e happy hour
      hours: o.hours != null && o.hours !== '' ? String(o.hours) : null,
      lunch: o.lunch != null && o.lunch !== '' ? String(o.lunch) : null,
      happy_hour: o.happy_hour != null && o.happy_hour !== '' ? String(o.happy_hour) : null,
      clock: !(o.clock === false || ['nao', 'não', 'no', 'off', 'false'].includes(String(o.clock ?? '').toLowerCase())),
      special_days: special.map((d) => ({ date: String(d.date), name: String(d.name || ''), theme: d.theme ? String(d.theme) : null, message: d.message ? String(d.message) : null })),
    },
  };
}

// ---------- calendário ----------
export function easter(y) {
  // algoritmo de Meeus/Jones/Butcher (calendário gregoriano)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const DAY = 86400000;
const blackFriday = (y) => { // sexta depois da 4ª quinta de novembro
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const firstThu = 1 + ((4 - first + 7) % 7);
  return Date.UTC(y, 10, firstThu + 21 + 1);
};
const baseDate = (base, y) => (base === 'easter' || base === 'pascoa' || base === 'páscoa' ? easter(y) : base === 'black_friday' ? blackFriday(y) : null);

export function todayParts(tz, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), mmdd: `${p.month}-${p.day}`, utc: Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) };
}

function themeSpan(t, y) {
  // devolve [inicio, fim] em ms UTC (dia inteiro) para o ano y, ou null
  if (t.movable) {
    const b = baseDate(String(t.movable.base || ''), y);
    if (b == null) return null;
    return [b + Number(t.movable.from || 0) * DAY, b + Number(t.movable.to || 0) * DAY];
  }
  if (t.period && /^\d{2}-\d{2}$/.test(t.period.from) && /^\d{2}-\d{2}$/.test(t.period.to)) {
    const [fm, fd] = t.period.from.split('-').map(Number), [tm, td] = t.period.to.split('-').map(Number);
    let ini = Date.UTC(y, fm - 1, fd), fim = Date.UTC(y, tm - 1, td);
    if (fim < ini) fim = Date.UTC(y + 1, tm - 1, td); // período que vira o ano (ex.: 26/12 a 02/01)
    return [ini, fim];
  }
  return null;
}

export function activeTheme(office, themes, tz, now = new Date()) {
  const hoje = todayParts(tz, now);
  const especial = office.special_days.find((d) => d.date === hoje.mmdd) || null;
  const escolha = office.theme;
  if (escolha === 'none' || escolha === 'nenhum') return { theme: null, special: especial };
  if (escolha && escolha !== 'auto') return { theme: themes.get(escolha) || null, special: especial };
  if (especial && especial.theme && themes.get(especial.theme)) return { theme: themes.get(especial.theme), special: especial };
  let melhor = null;
  for (const t of themes.values()) {
    if (t.calendars.length && !t.calendars.includes(office.calendar)) continue;
    for (const y of [hoje.y - 1, hoje.y]) {
      const s = themeSpan(t, y);
      if (!s || hoje.utc < s[0] || hoje.utc > s[1]) continue;
      const dur = s[1] - s[0];
      if (!melhor || dur < melhor.dur) melhor = { t, dur }; // o período mais curto vence (ex.: Black Friday dentro de novembro)
    }
  }
  return { theme: melhor ? melhor.t : null, special: especial };
}

// ---------- temas ----------
function loadThemesFrom(dir, origem, out, erros) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const file = ['theme.yaml', 'theme.yml', 'tema.yaml'].map((f) => path.join(dir, ent.name, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    try {
      const t = norm(YAML.parse(fs.readFileSync(file, 'utf8')) || {});
      out.set(ent.name, {
        id: ent.name, origem, name: String(t.name || ent.name),
        period: t.period || null, movable: t.movable || null,
        calendars: Array.isArray(t.calendars) ? t.calendars.map(String) : (t.calendar ? [String(t.calendar)] : []),
        effect: t.effect || null, title: t.title || null,
        decorations: Array.isArray(t.decorations) ? t.decorations : [],
        sprites: t.sprites && typeof t.sprites === 'object' ? t.sprites : {},
        floorTint: t.floor_tint || t.piso_tom || null,
      });
    } catch (e) {
      erros.push(`tema ${ent.name}: ${e.message.split('\n')[0]}`);
    }
  }
}

// Um escritório (andar) lido de um arquivo YAML. O andar principal é o /data/office.yaml;
// os outros ficam em /data/andares/<id>.yaml (veja floors.js).
export function createOfficeStore({ dataDir, officeFile = path.join(dataDir, 'office.yaml'), tz, onChange, log = console, rotulo = 'office.yaml' }) {
  const userThemes = path.join(dataDir, 'themes');
  fs.mkdirSync(path.dirname(officeFile), { recursive: true });
  if (!fs.existsSync(officeFile)) {
    // KAISHA_EXAMPLE escolhe qual exemplo vira o primeiro office.yaml (ex.: musashi)
    const nome = String(process.env.KAISHA_EXAMPLE || 'office').replace(/[^\w-]/g, '');
    const escolhido = path.join(ROOT, 'examples', `${nome}.yaml`);
    fs.copyFileSync(fs.existsSync(escolhido) ? escolhido : EXAMPLE_OFFICE, officeFile);
    log.info?.(`office.yaml de exemplo criado em ${officeFile}`);
  }
  let state = { office: null, themes: new Map(), erros: [], version: 0 };

  const reload = (motivo) => {
    const erros = [];
    let office = state.office;
    try {
      const { erros: e, office: o } = validateOffice(YAML.parse(fs.readFileSync(officeFile, 'utf8')));
      if (e.length) erros.push(...e.map((x) => rotulo + ': ' + x));
      else office = o;
    } catch (e) {
      erros.push(rotulo + ': ' + e.message.split('\n')[0]);
    }
    const themes = new Map();
    loadThemesFrom(BUILTIN_THEMES, 'kaisha', themes, erros);
    loadThemesFrom(userThemes, 'usuario', themes, erros); // temas do usuário sobrescrevem os de mesmo nome
    if (!office) office = validateOffice({ rooms: [{ id: 'sala', area: [0, 0, 12, 8] }] }).office;
    state = { office, themes, erros, version: state.version + 1 };
    if (erros.length) log.warn?.(`[${rotulo} · ${motivo}] ${erros.join(' | ')}`);
    else log.info?.(`[${rotulo} · ${motivo}] escritório "${office.name}" carregado (${office.rooms.length} salas, ${office.agents.length} agentes, ${themes.size} temas)`);
    onChange?.(snapshot());
  };

  const snapshot = (now = new Date()) => {
    const { theme, special } = activeTheme(state.office, state.themes, tz, now);
    return {
      version: state.version, office: state.office, erros: state.erros, special,
      theme: theme ? { id: theme.id, name: theme.name, effect: theme.effect, title: theme.title, decorations: theme.decorations, sprites: theme.sprites, floorTint: theme.floorTint } : null,
      themes: [...state.themes.values()].map((t) => ({ id: t.id, name: t.name })),
    };
  };

  // recarga ao vivo: confere a cada segundo a data e o tamanho do office.yaml e dos temas.
  // (polling funciona em qualquer volume do Docker; o fs.watch perde arquivos trocados por editores)
  const assinatura = () => {
    const partes = [];
    const st = (f) => { try { const x = fs.statSync(f); partes.push(f + ':' + x.mtimeMs + ':' + x.size); } catch { partes.push(f + ':-'); } };
    st(officeFile);
    for (const dir of [BUILTIN_THEMES, userThemes]) {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) if (e.isDirectory()) for (const f of ['theme.yaml', 'theme.yml', 'tema.yaml']) { const full = path.join(dir, e.name, f); if (fs.existsSync(full)) st(full); }
    }
    return partes.join('|');
  };
  let ultima = '';
  const t1 = setInterval(() => { const a = assinatura(); if (a !== ultima) { const primeira = !ultima; ultima = a; if (!primeira && fs.existsSync(officeFile)) reload('arquivo alterado'); } }, 1000);
  t1.unref();
  // garante a troca de tema na virada do dia mesmo sem alteração de arquivo
  let ultimoDia = todayParts(tz).mmdd;
  const t2 = setInterval(() => { const d = todayParts(tz).mmdd; if (d !== ultimoDia) { ultimoDia = d; onChange?.(snapshot()); } }, 60000);
  t2.unref();

  reload('início');
  ultima = assinatura();
  // grava um escritório vindo do editor do painel: valida, guarda backup e escreve o office.yaml
  const save = (dados) => {
    const { erros, office } = validateOffice(dados);
    if (erros.length) return { erros };
    try { fs.copyFileSync(officeFile, officeFile + '.bak'); } catch { /* primeira gravação */ }
    fs.writeFileSync(officeFile, toYaml(office));
    reload('editor');
    ultima = assinatura();
    return { erros: [] };
  };

  const close = () => { clearInterval(t1); clearInterval(t2); };
  return { snapshot, reload: () => reload('manual'), save, close, file: officeFile };
}

// escreve o office.yaml em português, uma linha por sala, agente e móvel
export function toYaml(o) {
  const limpa = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false));
  const dados = limpa({
    nome: o.name,
    tema: o.theme,
    ordem: o.order ?? null,
    planta: o.plan === 'open' ? 'aberta' : null,
    calendario: o.calendar && o.calendar !== 'br' ? o.calendar : null,
    idioma: o.lang,
    salas: o.rooms.map((r) => limpa({ id: r.id, nome: r.name, tipo: r.kind === 'waiting' ? 'espera' : null, area: r.area, piso: r.floor, parede: r.wall && r.wall !== 'clara' ? r.wall : null })),
    agentes: o.agents.map((a) => limpa({ id: a.id, nome: a.name, cargo: a.role, sala: a.room, mesa: a.desk, cor: a.color, cabelo: a.hair, pele: a.skin, central: a.central || null, inspetor: a.inspector || null, fica_na_sala: a.stay || null, fica_na_mesa: a.fixed || null, penteado: a.hairstyle === 'long' ? 'longo' : a.hairstyle === 'short' ? 'curto' : null })),
    moveis: o.furniture.map((f) => limpa({ tipo: f.type, pos: f.pos, sala: f.room, espelhar: f.flip || null })),
    expediente: o.hours, almoco: o.lunch, happy_hour: o.happy_hour, relogio: o.clock === false ? 'não' : null,
    datas_especiais: o.special_days && o.special_days.length ? o.special_days.map((d) => limpa({ data: d.date, nome: d.name, tema: d.theme, mensagem: d.message })) : null,
  });
  const doc = new YAML.Document(dados);
  for (const k of ['salas', 'agentes', 'moveis', 'datas_especiais']) {
    const seq = doc.get(k, true);
    if (seq && seq.items) for (const it of seq.items) it.flow = true;
  }
  return '# Escritório do Kaisha (editado pelo painel; pode editar à mão também)\n' + doc.toString({ lineWidth: 0, flowCollectionPadding: true });
}
