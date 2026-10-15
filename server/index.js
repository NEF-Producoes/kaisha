// Kaisha: servidor HTTP com API de status, eventos ao vivo (SSE) e a página do escritório.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, STATUSES } from './config.js';
import { openDb } from './db.js';
import { ROOT } from './office.js';
import { createFloors } from './floors.js';

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'AVISO', ...a),
};

if (!config.apiKey) log.warn('KAISHA_API_KEY não definida: a API de status vai recusar todos os envios até você definir uma.');

const MAIN = config.mainFloor;
const db = openDb(config.dataDir, { mainFloor: MAIN });
const clients = new Set(); // { res, floor }

// ---------- tempo real ----------
const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
// cada painel aberto escuta um andar; floor null = todos
const broadcast = (floor, event, data) => { for (const c of clients) if (floor == null || c.floor === floor) send(c.res, event, data); };

// junta atualizações do mesmo agente que chegam em rajada (no máximo 4 envios por segundo)
const pendentes = new Map();
let flushTimer = null;
const placarMudou = new Set();
const queueAgent = (agent, comResultado = false) => {
  pendentes.set(agent.floor + '\u0000' + agent.id, agent);
  if (comResultado) placarMudou.add(agent.floor);
  if (!flushTimer) flushTimer = setTimeout(() => {
    flushTimer = null;
    const porAndar = new Map();
    for (const a of pendentes.values()) { if (!porAndar.has(a.floor)) porAndar.set(a.floor, []); porAndar.get(a.floor).push(a); }
    pendentes.clear();
    for (const [floor, lote] of porAndar) broadcast(floor, 'agents', lote);
    for (const floor of placarMudou) broadcast(floor, 'score', placarHoje(floor));
    placarMudou.clear();
  }, 250);
};

// início do dia no fuso do escritório, para o placar zerar à meia-noite local
function inicioDoDia(now = Date.now()) {
  const f = (tz) => new Date(new Date(now).toLocaleString('en-US', { timeZone: tz }));
  const local = f(config.tz);
  const desvio = local - f('UTC');
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) - desvio;
}
const placarHoje = (floor) => ({ ...db.score(floor, inicioDoDia()), since: inicioDoDia() });
let diaAtual = inicioDoDia();
setInterval(() => { const d = inicioDoDia(); if (d !== diaAtual) { diaAtual = d; for (const f of floors.ids()) broadcast(f, 'score', placarHoje(f)); } }, 60000).unref();

const floors = createFloors({
  dataDir: config.dataDir, tz: config.tz, log, mainId: MAIN,
  onChange: (floor, snap) => broadcast(floor, 'office', snap),
  onList: (lista) => broadcast(null, 'floors', lista),
});
floors.seed(config.seedFloors, db);
// agente com estado num andar onde não está declarado, mas declarado em outro: o estado e o histórico vão para lá
function arrumarAgentes() {
  for (const f of floors.ids()) {
    const declarados = new Set(floors.get(f).snapshot().office.agents.map((a) => a.id));
    for (const id of db.ids(f)) {
      if (declarados.has(id)) continue;
      const destino = floors.floorOfAgent(id);
      if (destino && destino !== f && db.move(id, f, destino)) log.info(`agente "${id}" levado do andar "${f}" para "${destino}"`);
    }
  }
}
arrumarAgentes();
const floorDaChave = (env) => floors.ids().find((f) => f.toUpperCase().replace(/-/g, '_') === env.toUpperCase());

// ---------- utilidades ----------
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req, limit = 256 * 1024) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('corpo grande demais'), { code: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON inválido'), { code: 400 })); }
  });
  req.on('error', reject);
});

// quem envia status: header "apikey" (configurável) com o token, como na Evolution API.
// KAISHA_API_KEY vale para todos os andares; KAISHA_API_KEY_<ANDAR> só para o próprio andar.
function quemEscreve(req) {
  const k = req.headers[config.apiKeyHeader] || '';
  if (!k) return null;
  if (config.apiKey && safeEq(k, config.apiKey)) return { master: true, floor: null };
  for (const fk of config.floorKeys) if (safeEq(k, fk.key)) { const floor = floorDaChave(fk.env); if (floor) return { master: false, floor }; }
  return null;
}
const canWrite = (req, floor) => { const q = quemEscreve(req); return !!q && (q.master || (floor != null && q.floor === floor)); };
// quem vê o painel: livre, ou senha (Basic) se VIEW_PASSWORD estiver definida; a apikey também abre
const canView = (req) => {
  if (!config.viewPassword) return true;
  if (quemEscreve(req)) return true;
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Basic ')) return false;
  const senha = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  return safeEq(senha, config.viewPassword);
};
const askPassword = (res) => { res.writeHead(401, { 'www-authenticate': 'Basic realm="Kaisha", charset="UTF-8"', 'content-type': 'text/plain; charset=utf-8' }); res.end('Senha necessária'); };

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
function parseEvent(b) {
  const agent = String(b.agent ?? b.agente ?? '').trim();
  if (!/^[\w.\-:]{1,64}$/.test(agent)) return { erro: 'agent: obrigatório, até 64 caracteres (letras, números, _ . - :)' };
  const status = String(b.status ?? '').trim().toLowerCase();
  if (!STATUSES.includes(status)) return { erro: `status: use ${STATUSES.join(', ')}` };
  const queue = b.queue ?? b.fila;
  const progress = b.progress ?? b.progresso;
  const ttl = b.ttl ?? b.duracao ?? b.duração;
  // resultado da tarefa: sucesso, pergunta (precisa de alguém) ou erro
  const RES = { success: 'success', sucesso: 'success', ok: 'success', done: 'success', question: 'question', pergunta: 'question', duvida: 'question', dúvida: 'question', error: 'error', erro: 'error', falha: 'error' };
  const brutoRes = b.outcome ?? b.resultado;
  const outcome = brutoRes == null || brutoRes === '' ? null : RES[String(brutoRes).trim().toLowerCase()];
  if (brutoRes != null && brutoRes !== '' && !outcome) return { erro: 'outcome: use success, question ou error' };
  const floor = String(b.floor ?? b.andar ?? '').trim().toLowerCase() || null;
  return {
    ev: {
      floor, agent, status,
      task: clip(b.task ?? b.tarefa, 200),
      queue: queue == null || queue === '' ? null : Math.max(0, Math.round(Number(queue)) || 0),
      progress: progress == null || progress === '' ? null : Math.min(1, Math.max(0, Number(progress) || 0)),
      outcome,
      ttl: ttl == null || ttl === '' ? null : Math.min(86400, Math.max(1, Math.round(Number(ttl)) || 0)) || null,
      meta: b.meta && typeof b.meta === 'object' && JSON.stringify(b.meta).length <= 4000 ? JSON.parse(JSON.stringify(b.meta)) : null,
    },
  };
}

// visitas: { dia: "2026-10-14", visitas: [{ id, nome, inicio, fim, agente, online }] }
// nome curto (iniciais, de preferência): o painel pode estar aberto para outras pessoas
function parseVisitas(b) {
  const dia = String(b.dia ?? b.date ?? b.day ?? '').trim() || hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erro: 'dia: use AAAA-MM-DD' };
  const bruto = b.visitas ?? b.visits;
  if (!Array.isArray(bruto)) return { erro: 'visitas: lista obrigatória (pode ser vazia)' };
  if (bruto.length > 200) return { erro: 'no máximo 200 visitas por dia' };
  const lista = [];
  for (const [i, v] of bruto.entries()) {
    const id = String(v.id ?? '').trim().slice(0, 128);
    const inicio = Date.parse(v.inicio ?? v.start), fim = Date.parse(v.fim ?? v.end);
    if (!id) return { erro: `visita #${i + 1}: id obrigatório` };
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return { erro: `visita "${id}": inicio e fim em ISO 8601, com fim depois do início` };
    lista.push({
      id, inicio, fim,
      nome: clip(String(v.nome ?? v.name ?? '').trim() || '•', 40),
      agente: v.agente ?? v.agent ? String(v.agente ?? v.agent).trim().slice(0, 64) : null,
      online: v.online === true || v.online === 'sim',
    });
  }
  return { dia, lista };
}
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const visitasHoje = (f) => { const d = inicioDoDia(); return db.visits(f, d, d + 86400000); };

// ---------- arquivos estáticos ----------
const WEB = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB)) return json(res, 404, { erro: 'não encontrado' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { erro: 'não encontrado' });
    const ext = path.extname(file);
    // HTML e JS levam a versão nos endereços (app.js?v=0.3.0): atualizou o Kaisha, o navegador baixa de novo
    if (ext === '.html' || ext === '.js') {
      const body = fs.readFileSync(file, 'utf8').replaceAll('__V__', VERSION);
      res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
      return res.end(body);
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- rotas ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') return json(res, 200, { ok: true, version: VERSION });

    const andarPedido = (url.searchParams.get('andar') || url.searchParams.get('floor') || '').trim().toLowerCase() || null;
    const semAndar = (res2, f) => json(res2, 404, { erro: `andar "${f}" não existe`, andares: floors.list().map((x) => x.id) });
    const negado = () => json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido para este andar` });

    // escrita: só com a apikey
    if (req.method === 'POST' && (p === '/api/events' || p === '/api/heartbeat' || p === '/api/reload')) {
      const quem = quemEscreve(req);
      if (!quem) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      if (p === '/api/reload') {
        const alvo = andarPedido || quem.floor;
        if (alvo && !floors.has(alvo)) return semAndar(res, alvo);
        if (!quem.master && alvo !== quem.floor) return negado();
        for (const f of alvo ? [alvo] : floors.ids()) floors.get(f).reload();
        return json(res, 200, { ok: true });
      }
      const body = await readBody(req);
      // em qual andar: o pedido diz; senão o andar da chave; senão onde o agente está declarado; senão o principal
      const andarDe = (pedido, agente) => pedido || andarPedido || quem.floor || floors.floorOfAgent(agente) || MAIN;
      const pode = (f) => quem.master || f === quem.floor;
      if (p === '/api/heartbeat') {
        const ids = Array.isArray(body.agents) ? body.agents : [body.agent ?? body.agente];
        const pedido = String(body.floor ?? body.andar ?? '').trim().toLowerCase() || null;
        const out = [];
        for (const id of ids.map((x) => String(x || '').trim()).filter(Boolean)) {
          const f = andarDe(pedido, id);
          if (!floors.has(f) || !pode(f)) continue;
          const a = db.heartbeat(f, id); if (a) { out.push(a); queueAgent(a); }
        }
        return json(res, 200, { ok: true, agents: out.length });
      }
      const lista = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
      if (lista.length > 100) return json(res, 400, { erro: 'no máximo 100 eventos por chamada' });
      const ok = [], erros = [];
      lista.forEach((b, i) => {
        const { ev, erro } = parseEvent(b || {});
        if (erro) { erros.push({ index: i, erro }); return; }
        const f = andarDe(ev.floor, ev.agent);
        if (!floors.has(f)) { erros.push({ index: i, erro: `andar "${f}" não existe` }); return; }
        if (!pode(f)) { erros.push({ index: i, erro: `esta chave não escreve no andar "${f}"` }); return; }
        const a = db.record(f, ev);
        ok.push(a); queueAgent(a, !!ev.outcome);
      });
      return json(res, erros.length && !ok.length ? 400 : 200, { ok: ok.length, erros });
    }
    // visitas do dia (pacientes, clientes): substitui a lista inteira daquele dia no andar
    if (req.method === 'POST' && p === '/api/visits') {
      const quem = quemEscreve(req);
      if (!quem) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      const body = await readBody(req);
      const f = String(body.floor ?? body.andar ?? '').trim().toLowerCase() || andarPedido || quem.floor || MAIN;
      if (!floors.has(f)) return semAndar(res, f);
      if (!quem.master && quem.floor !== f) return negado();
      const r = parseVisitas(body);
      if (r.erro) return json(res, 400, { erro: r.erro });
      const sumiram = db.setVisits(f, r.dia, r.lista);
      // a lista de visitas também é sinal de vida de quem atende (aparece como livre se ainda não existia)
      for (const ag of new Set(r.lista.map((v) => v.agente).filter(Boolean))) {
        const a = db.heartbeat(f, ag) || db.record(f, { agent: ag, status: 'idle' });
        queueAgent(a);
      }
      // atendimento cancelado no meio: o agente fica livre
      for (const v of sumiram) if (v.agente) queueAgent(db.record(f, { agent: v.agente, status: 'idle' }));
      broadcast(f, 'visits', visitasHoje(f));
      return json(res, 200, { ok: true, andar: f, dia: r.dia, visitas: r.lista.length });
    }
    // reações: o escritório inteiro reage a algo que aconteceu (pagamento recebido = festa; atraso = preocupado)
    // não muda o status de ninguém: { andar, agente, reacao: festa | preocupado | alivio, texto }
    if (req.method === 'POST' && (p === '/api/reactions' || p === '/api/reacoes')) {
      const quem = quemEscreve(req);
      if (!quem) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      const body = await readBody(req);
      const TIPOS = { festa: 'festa', party: 'festa', aplauso: 'festa', applause: 'festa', comemorar: 'festa', preocupado: 'preocupado', worried: 'preocupado', preocupacao: 'preocupado', alivio: 'alivio', alívio: 'alivio', relief: 'alivio' };
      const tipo = TIPOS[String(body.reaction ?? body.reacao ?? body.reação ?? body.tipo ?? '').trim().toLowerCase()];
      if (!tipo) return json(res, 400, { erro: 'reacao: use festa, preocupado ou alivio' });
      const agente = String(body.agent ?? body.agente ?? '').trim().slice(0, 64) || null;
      const f = String(body.floor ?? body.andar ?? '').trim().toLowerCase() || andarPedido || quem.floor || (agente && floors.floorOfAgent(agente)) || MAIN;
      if (!floors.has(f)) return semAndar(res, f);
      if (!quem.master && quem.floor !== f) return negado();
      broadcast(f, 'reaction', { tipo, agent: agente, texto: clip(body.text ?? body.texto, 80), em: Date.now() });
      return json(res, 200, { ok: true, andar: f, reacao: tipo });
    }
    // editor do painel: confere a chave e grava o escritório (cria o andar se ainda não existir, só com a chave geral)
    if (p === '/api/auth' && req.method === 'GET') {
      const quem = quemEscreve(req);
      const f = andarPedido || MAIN;
      return quem && (quem.master || quem.floor === f) ? json(res, 200, { ok: true, master: quem.master }) : json(res, 401, { erro: 'chave inválida' });
    }
    if (p === '/api/office' && req.method === 'PUT') {
      const f = andarPedido || MAIN;
      const body = await readBody(req, 512 * 1024);
      if (!floors.has(f)) {
        const quem = quemEscreve(req);
        if (!quem || !quem.master) return negado();
        const r = floors.create(f, body);
        return r.erros.length ? json(res, 400, { erros: r.erros }) : json(res, 201, { ok: true, andar: f });
      }
      if (!canWrite(req, f)) return negado();
      const r = floors.get(f).save(body);
      if (!r.erros.length) broadcast(null, 'floors', floors.list());
      return r.erros.length ? json(res, 400, { erros: r.erros }) : json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && p.startsWith('/api/agents/')) {
      const f = andarPedido || MAIN;
      if (!canWrite(req, f)) return negado();
      const id = decodeURIComponent(p.slice('/api/agents/'.length));
      const n = db.remove(f, id);
      broadcast(f, 'removed', { id });
      return json(res, 200, { ok: n > 0 });
    }

    // leitura e página: senha opcional
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'método não permitido' });
    if (!canView(req)) return askPassword(res);

    const andar = andarPedido || MAIN;
    if (p === '/api/floors') return json(res, 200, { main: MAIN, floors: floors.list() });
    if (p.startsWith('/api/') && !floors.has(andar)) return semAndar(res, andar);
    if (p === '/api/state') return json(res, 200, { floor: andar, floors: floors.list(), agents: db.state(andar), visits: visitasHoje(andar), score: placarHoje(andar), ...floors.get(andar).snapshot(), offlineAfterMs: config.offlineAfterMs, lang: config.lang, serverTime: Date.now() });
    if (p === '/api/office') return json(res, 200, floors.get(andar).snapshot());
    if (p.startsWith('/api/agents/') && p.endsWith('/history')) {
      const id = decodeURIComponent(p.slice('/api/agents/'.length, -'/history'.length));
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      return json(res, 200, { agent: db.get(andar, id), history: db.history(andar, id, limit) });
    }
    if (p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n');
      send(res, 'hello', { serverTime: Date.now(), version: VERSION, floor: andar });
      const c = { res, floor: andar };
      clients.add(c);
      req.on('close', () => clients.delete(c));
      return;
    }
    return serveStatic(req, res, p);
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) log.warn('erro:', e);
    if (!res.headersSent) json(res, code, { erro: e.message });
  }
});

// mantém as conexões ao vivo abertas atrás de proxies (Cloudflare, Traefik do EasyPanel)
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000).unref();
// status com prazo vencido voltam para "livre"
setInterval(() => { for (const a of db.expire()) queueAgent(a); }, 2000).unref();
// visitas: no horário marcado o agente atende (status working até o fim); no fim, volta livre com sucesso
function cuidarDasVisitas() {
  const now = Date.now();
  // quem está atendendo não vira offline no meio da consulta
  for (const r of db.attending()) db.heartbeat(r.floor, r.agente, now);
  for (const v of db.dueVisits(now)) {
    if (!floors.has(v.floor)) continue;
    const quem = v.nome;
    if (v.estado == null && now < v.fim) {
      db.markVisit(v.floor, v.id, 'atendendo');
      if (v.agente) queueAgent(db.record(v.floor, { agent: v.agente, status: 'working', task: (v.online ? 'Teleconsulta · ' : 'Atendendo ') + quem, ttl: Math.ceil((v.fim - now) / 1000) + 5, meta: { visita: v.id } }));
      broadcast(v.floor, 'visits', visitasHoje(v.floor));
    } else {
      db.markVisit(v.floor, v.id, 'concluida');
      // só comemora se a visita foi acompanhada (estava em atendimento)
      if (v.estado === 'atendendo' && v.agente) {
        const outra = db.attendingFor(v.floor, v.agente).find((x) => x.fim > now);
        // outro paciente ainda em atendimento com o mesmo agente (horários sobrepostos): continua trabalhando
        if (outra) queueAgent(db.record(v.floor, { agent: v.agente, status: 'working', task: (outra.online ? 'Teleconsulta · ' : 'Atendendo ') + outra.nome, ttl: Math.ceil((outra.fim - now) / 1000) + 5, outcome: 'success', meta: { visita: outra.id } }), true);
        else queueAgent(db.record(v.floor, { agent: v.agente, status: 'idle', task: 'Atendimento concluído · ' + quem, outcome: 'success' }), true);
      }
      broadcast(v.floor, 'visits', visitasHoje(v.floor));
    }
  }
}
setInterval(cuidarDasVisitas, 5000).unref();
setInterval(() => db.pruneVisits(Date.now() - 3 * 86400000), 3600000).unref();
// agentes sem sinal viram offline
setInterval(() => { for (const a of db.sweepOffline(Date.now() - config.offlineAfterMs)) queueAgent(a); }, 30000).unref();
// limpa histórico antigo uma vez por hora
setInterval(() => { const n = db.prune(Date.now() - config.historyDays * 86400000); if (n) log.info(`histórico: ${n} eventos antigos apagados`); }, 3600000).unref();

server.listen(config.port, config.host, () => log.info(`Kaisha ${VERSION} ouvindo em http://${config.host}:${config.port} (dados em ${config.dataDir}; andares: ${floors.list().map((f) => f.id).join(', ')})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
