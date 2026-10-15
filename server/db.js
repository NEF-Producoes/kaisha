// Estado atual e histórico dos agentes em SQLite (módulo nativo do Node, sem dependências).
// Cada agente pertence a um andar (floor): o mesmo id pode existir em andares diferentes.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dataDir, { mainFloor = 'principal' } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'kaisha.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  const existe = (t) => !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const temColuna = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);

  // colunas que chegaram depois da primeira versão (bancos antigos)
  if (existe('agents')) {
    if (!temColuna('agents', 'expires_at')) db.exec('ALTER TABLE agents ADD COLUMN expires_at INTEGER');
    if (!temColuna('agents', 'outcome')) db.exec('ALTER TABLE agents ADD COLUMN outcome TEXT');
  }
  if (existe('events') && !temColuna('events', 'outcome')) db.exec('ALTER TABLE events ADD COLUMN outcome TEXT');

  if (existe('events') && !temColuna('events', 'floor')) {
    db.exec('ALTER TABLE events ADD COLUMN floor TEXT');
    db.prepare('UPDATE events SET floor = ? WHERE floor IS NULL').run(mainFloor);
  }
  // 0.6: andares. A chave do agente passa a ser (andar, id); o que já existia fica no andar principal.
  if (existe('agents') && !temColuna('agents', 'floor')) {
    db.exec('BEGIN');
    db.exec('ALTER TABLE agents RENAME TO agents_v05');
    criarTabelas();
    db.prepare(`INSERT INTO agents (floor, id, status, task, queue, progress, meta, updated_at, seen_at, expires_at, outcome)
      SELECT ?, id, status, task, queue, progress, meta, updated_at, seen_at, expires_at, outcome FROM agents_v05`).run(mainFloor);
    db.exec('DROP TABLE agents_v05');
    db.exec('COMMIT');
  }
  criarTabelas();

  function criarTabelas() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        floor TEXT NOT NULL,
        id TEXT NOT NULL,
        status TEXT NOT NULL,
        task TEXT,
        queue INTEGER,
        progress REAL,
        meta TEXT,
        updated_at INTEGER NOT NULL,
        seen_at INTEGER NOT NULL,
        expires_at INTEGER,
        outcome TEXT,
        PRIMARY KEY (floor, id)
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        status TEXT NOT NULL,
        task TEXT,
        queue INTEGER,
        meta TEXT,
        at INTEGER NOT NULL,
        outcome TEXT,
        floor TEXT
      );
      CREATE TABLE IF NOT EXISTS visits (
        floor TEXT NOT NULL,
        id TEXT NOT NULL,
        dia TEXT NOT NULL,
        nome TEXT NOT NULL,
        inicio INTEGER NOT NULL,
        fim INTEGER NOT NULL,
        agente TEXT,
        online INTEGER NOT NULL DEFAULT 0,
        estado TEXT,
        PRIMARY KEY (floor, id)
      );
      DROP INDEX IF EXISTS events_agent_at;
      CREATE INDEX IF NOT EXISTS events_floor_agent_at ON events (floor, agent, at DESC);
    `);
  }

  const upsert = db.prepare(`
    INSERT INTO agents (floor, id, status, task, queue, progress, meta, updated_at, seen_at, expires_at, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(floor, id) DO UPDATE SET status = excluded.status, task = excluded.task, queue = excluded.queue,
      progress = excluded.progress, meta = excluded.meta, updated_at = excluded.updated_at, seen_at = excluded.seen_at,
      expires_at = excluded.expires_at, outcome = excluded.outcome
  `);
  const insertEvent = db.prepare('INSERT INTO events (floor, agent, status, task, queue, meta, at, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const placar = db.prepare('SELECT outcome, COUNT(*) AS n FROM events WHERE floor = ? AND outcome IS NOT NULL AND at >= ? GROUP BY outcome');
  const placarAgente = db.prepare('SELECT agent, outcome, COUNT(*) AS n FROM events WHERE floor = ? AND outcome IS NOT NULL AND at >= ? GROUP BY agent, outcome');
  const touch = db.prepare('UPDATE agents SET seen_at = ? WHERE floor = ? AND id = ?');
  const all = db.prepare('SELECT * FROM agents WHERE floor = ?');
  const one = db.prepare('SELECT * FROM agents WHERE floor = ? AND id = ?');
  const history = db.prepare('SELECT status, task, queue, meta, at, outcome FROM events WHERE floor = ? AND agent = ? ORDER BY at DESC, id DESC LIMIT ?');
  const stale = db.prepare("SELECT floor, id FROM agents WHERE status != 'offline' AND seen_at < ?");
  const setOffline = db.prepare("UPDATE agents SET status = 'offline', task = NULL, queue = NULL, progress = NULL, expires_at = NULL, outcome = NULL, updated_at = ? WHERE floor = ? AND id = ?");
  const prune = db.prepare('DELETE FROM events WHERE at < ?');
  const expired = db.prepare('SELECT floor, id FROM agents WHERE expires_at IS NOT NULL AND expires_at <= ?');
  const remove = db.prepare('DELETE FROM agents WHERE floor = ? AND id = ?');
  const ids = db.prepare('SELECT id FROM agents WHERE floor = ?');
  const moveAgent = db.prepare('UPDATE agents SET floor = ? WHERE floor = ? AND id = ?');
  const moveEvents = db.prepare('UPDATE events SET floor = ? WHERE floor = ? AND agent = ?');

  // visitas (pacientes, clientes): chegam numa sala de espera e são atendidas por um agente no horário marcado
  const visitasDoDia = db.prepare('SELECT * FROM visits WHERE floor = ? AND dia = ?');
  const apagaVisita = db.prepare('DELETE FROM visits WHERE floor = ? AND id = ?');
  const gravaVisita = db.prepare(`INSERT INTO visits (floor, id, dia, nome, inicio, fim, agente, online, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(floor, id) DO UPDATE SET dia = excluded.dia, nome = excluded.nome, inicio = excluded.inicio, fim = excluded.fim, agente = excluded.agente, online = excluded.online`);
  const visitasJanela = db.prepare('SELECT * FROM visits WHERE floor = ? AND fim >= ? AND inicio < ? ORDER BY inicio');
  const visitasAtivas = db.prepare("SELECT * FROM visits WHERE (estado IS NULL AND inicio <= ?) OR (estado = 'atendendo' AND fim <= ?)");
  const marcaVisita = db.prepare('UPDATE visits SET estado = ? WHERE floor = ? AND id = ?');
  const emAtendimento = db.prepare("SELECT DISTINCT floor, agente FROM visits WHERE estado = 'atendendo' AND agente IS NOT NULL");
  const atendendoPor = db.prepare("SELECT * FROM visits WHERE floor = ? AND agente = ? AND estado = 'atendendo' ORDER BY fim DESC");
  const podaVisitas = db.prepare('DELETE FROM visits WHERE fim < ?');
  const visita = (r) => ({ id: r.id, nome: r.nome, inicio: r.inicio, fim: r.fim, agente: r.agente, online: !!r.online, estado: r.estado ?? null });

  const row = (r) => r && ({
    floor: r.floor, id: r.id, status: r.status, task: r.task ?? null, queue: r.queue ?? null, progress: r.progress ?? null,
    meta: r.meta ? JSON.parse(r.meta) : null, updatedAt: r.updated_at, seenAt: r.seen_at, outcome: r.outcome ?? null,
  });

  return {
    record(floor, ev, now = Date.now()) {
      const meta = ev.meta ? JSON.stringify(ev.meta) : null;
      const expira = ev.ttl ? now + ev.ttl * 1000 : null;
      upsert.run(floor, ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, ev.progress ?? null, meta, now, now, expira, ev.outcome ?? null);
      insertEvent.run(floor, ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, meta, now, ev.outcome ?? null);
      return row(one.get(floor, ev.agent));
    },
    heartbeat(floor, agent, now = Date.now()) {
      const r = one.get(floor, agent);
      if (!r) return null;
      touch.run(now, floor, agent);
      // um agente offline que dá sinal de vida volta como "idle"
      if (r.status === 'offline') return this.record(floor, { agent, status: 'idle' }, now);
      return row(one.get(floor, agent));
    },
    has(floor, agent) { return !!one.get(floor, agent); },
    state(floor) { return all.all(floor).map(row); },
    get(floor, agent) { return row(one.get(floor, agent)); },
    ids(floor) { return ids.all(floor).map((r) => r.id); },
    history(floor, agent, limit = 50) {
      return history.all(floor, agent, limit).map((r) => ({ status: r.status, task: r.task ?? null, queue: r.queue ?? null, meta: r.meta ? JSON.parse(r.meta) : null, at: r.at, outcome: r.outcome ?? null }));
    },
    sweepOffline(olderThan, now = Date.now()) {
      const lista = stale.all(olderThan);
      for (const r of lista) { setOffline.run(now, r.floor, r.id); insertEvent.run(r.floor, r.id, 'offline', null, null, null, now, null); }
      return lista.map((r) => row(one.get(r.floor, r.id)));
    },
    // status com prazo (ttl) que venceu: o agente volta a ficar livre
    expire(now = Date.now()) {
      return expired.all(now).map((r) => this.record(r.floor, { agent: r.id, status: 'idle' }, now));
    },
    // quantas tarefas terminaram em sucesso, pergunta e erro desde o início do dia, no andar
    score(floor, desde) {
      const out = { success: 0, question: 0, error: 0 };
      for (const r of placar.all(floor, desde)) if (r.outcome in out) out[r.outcome] = r.n;
      // por agente, para o painel somar por ala (placar de cada quadro HOJE)
      out.byAgent = {};
      for (const r of placarAgente.all(floor, desde)) { if (!(r.outcome in out)) continue; const a = (out.byAgent[r.agent] ||= { success: 0, question: 0, error: 0 }); a[r.outcome] = r.n; }
      return out;
    },
    // leva o agente (estado e histórico) para outro andar, se lá ainda não existir
    move(agent, de, para) {
      if (one.get(para, agent)) return false;
      moveAgent.run(para, de, agent); moveEvents.run(para, de, agent);
      return true;
    },
    // troca as visitas de um dia inteiro; devolve as que estavam em atendimento e sumiram (canceladas)
    setVisits(floor, dia, lista) {
      const antes = new Map(visitasDoDia.all(floor, dia).map((r) => [r.id, r]));
      const novos = new Set(lista.map((v) => v.id));
      const sumiram = [];
      db.exec('BEGIN');
      try {
        for (const [id, r] of antes) if (!novos.has(id)) { apagaVisita.run(floor, id); if (r.estado === 'atendendo') sumiram.push(visita(r)); }
        for (const v of lista) gravaVisita.run(floor, v.id, dia, v.nome, v.inicio, v.fim, v.agente ?? null, v.online ? 1 : 0, null);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return sumiram;
    },
    visits(floor, de, ate) { return visitasJanela.all(floor, de, ate).map(visita); },
    // visitas que começaram (sem estado) ou terminaram (em atendimento) até agora
    dueVisits(now = Date.now()) { return visitasAtivas.all(now, now).map((r) => ({ floor: r.floor, ...visita(r) })); },
    attendingFor(floor, agente) { return atendendoPor.all(floor, agente).map(visita); },
    attending() { return emAtendimento.all(); },
    markVisit(floor, id, estado) { marcaVisita.run(estado, floor, id); },
    pruneVisits(before) { return podaVisitas.run(before).changes; },
    prune(before) { return prune.run(before).changes; },
    remove(floor, agent) { return remove.run(floor, agent).changes; },
  };
}
