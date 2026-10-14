// Kaisha: servidor HTTP com API de status, eventos ao vivo (SSE) e a página do escritório.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, STATUSES } from './config.js';
import { openDb } from './db.js';
import { createOfficeStore, ROOT } from './office.js';

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'AVISO', ...a),
};

if (!config.apiKey) log.warn('KAISHA_API_KEY não definida: a API de status vai recusar todos os envios até você definir uma.');

const db = openDb(config.dataDir);
const clients = new Set();

// ---------- tempo real ----------
const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcast = (event, data) => { for (const res of clients) send(res, event, data); };

// junta atualizações do mesmo agente que chegam em rajada (no máximo 4 envios por segundo)
const pendentes = new Map();
let flushTimer = null;
let placarMudou = false;
const queueAgent = (agent, comResultado = false) => {
  pendentes.set(agent.id, agent);
  if (comResultado) placarMudou = true;
  if (!flushTimer) flushTimer = setTimeout(() => {
    flushTimer = null; const lote = [...pendentes.values()]; pendentes.clear(); broadcast('agents', lote);
    if (placarMudou) { placarMudou = false; broadcast('score', placarHoje()); }
  }, 250);
};

// início do dia no fuso do escritório, para o placar zerar à meia-noite local
function inicioDoDia(now = Date.now()) {
  const f = (tz) => new Date(new Date(now).toLocaleString('en-US', { timeZone: tz }));
  const local = f(config.tz);
  const desvio = local - f('UTC');
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) - desvio;
}
const placarHoje = () => ({ ...db.score(inicioDoDia()), since: inicioDoDia() });
let diaAtual = inicioDoDia();
setInterval(() => { const d = inicioDoDia(); if (d !== diaAtual) { diaAtual = d; broadcast('score', placarHoje()); } }, 60000).unref();

const office = createOfficeStore({ dataDir: config.dataDir, tz: config.tz, log, onChange: (snap) => broadcast('office', snap) });

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

// quem envia status: header "apikey" (configurável) com o token, como na Evolution API
const canWrite = (req) => !!config.apiKey && safeEq(req.headers[config.apiKeyHeader] || '', config.apiKey);
// quem vê o painel: livre, ou senha (Basic) se VIEW_PASSWORD estiver definida; a apikey também abre
const canView = (req) => {
  if (!config.viewPassword) return true;
  if (canWrite(req)) return true;
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
  return {
    ev: {
      agent, status,
      task: clip(b.task ?? b.tarefa, 200),
      queue: queue == null || queue === '' ? null : Math.max(0, Math.round(Number(queue)) || 0),
      progress: progress == null || progress === '' ? null : Math.min(1, Math.max(0, Number(progress) || 0)),
      outcome,
      ttl: ttl == null || ttl === '' ? null : Math.min(86400, Math.max(1, Math.round(Number(ttl)) || 0)) || null,
      meta: b.meta && typeof b.meta === 'object' && JSON.stringify(b.meta).length <= 4000 ? JSON.parse(JSON.stringify(b.meta)) : null,
    },
  };
}

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

    // escrita: só com a apikey
    if (req.method === 'POST' && (p === '/api/events' || p === '/api/heartbeat' || p === '/api/reload')) {
      if (!canWrite(req)) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      if (p === '/api/reload') { office.reload(); return json(res, 200, { ok: true }); }
      const body = await readBody(req);
      if (p === '/api/heartbeat') {
        const ids = Array.isArray(body.agents) ? body.agents : [body.agent ?? body.agente];
        const out = [];
        for (const id of ids.map((x) => String(x || '').trim()).filter(Boolean)) { const a = db.heartbeat(id); if (a) { out.push(a); queueAgent(a); } }
        return json(res, 200, { ok: true, agents: out.length });
      }
      const lista = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
      if (lista.length > 100) return json(res, 400, { erro: 'no máximo 100 eventos por chamada' });
      const ok = [], erros = [];
      lista.forEach((b, i) => {
        const { ev, erro } = parseEvent(b || {});
        if (erro) { erros.push({ index: i, erro }); return; }
        const a = db.record(ev);
        ok.push(a); queueAgent(a, !!ev.outcome);
      });
      return json(res, erros.length && !ok.length ? 400 : 200, { ok: ok.length, erros });
    }
    // editor do painel: confere a chave e grava o escritório
    if (p === '/api/auth' && req.method === 'GET') return canWrite(req) ? json(res, 200, { ok: true }) : json(res, 401, { erro: 'chave inválida' });
    if (p === '/api/office' && req.method === 'PUT') {
      if (!canWrite(req)) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      const body = await readBody(req, 512 * 1024);
      const r = office.save(body);
      return r.erros.length ? json(res, 400, { erros: r.erros }) : json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && p.startsWith('/api/agents/')) {
      if (!canWrite(req)) return json(res, 401, { erro: `header "${config.apiKeyHeader}" ausente ou inválido` });
      const id = decodeURIComponent(p.slice('/api/agents/'.length));
      const n = db.remove(id);
      broadcast('removed', { id });
      return json(res, 200, { ok: n > 0 });
    }

    // leitura e página: senha opcional
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'método não permitido' });
    if (!canView(req)) return askPassword(res);

    if (p === '/api/state') return json(res, 200, { agents: db.state(), score: placarHoje(), ...office.snapshot(), offlineAfterMs: config.offlineAfterMs, lang: config.lang, serverTime: Date.now() });
    if (p === '/api/office') return json(res, 200, office.snapshot());
    if (p.startsWith('/api/agents/') && p.endsWith('/history')) {
      const id = decodeURIComponent(p.slice('/api/agents/'.length, -'/history'.length));
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      return json(res, 200, { agent: db.get(id), history: db.history(id, limit) });
    }
    if (p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n');
      send(res, 'hello', { serverTime: Date.now(), version: VERSION });
      clients.add(res);
      req.on('close', () => clients.delete(res));
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
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();
// status com prazo vencido voltam para "livre"
setInterval(() => { for (const a of db.expire()) queueAgent(a); }, 2000).unref();
// agentes sem sinal viram offline
setInterval(() => { for (const a of db.sweepOffline(Date.now() - config.offlineAfterMs)) queueAgent(a); }, 30000).unref();
// limpa histórico antigo uma vez por hora
setInterval(() => { const n = db.prune(Date.now() - config.historyDays * 86400000); if (n) log.info(`histórico: ${n} eventos antigos apagados`); }, 3600000).unref();

server.listen(config.port, config.host, () => log.info(`Kaisha ${VERSION} ouvindo em http://${config.host}:${config.port} (dados em ${config.dataDir})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
