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
      return out;
    },
    // leva o agente (estado e histórico) para outro andar, se lá ainda não existir
    move(agent, de, para) {
      if (one.get(para, agent)) return false;
      moveAgent.run(para, de, agent); moveEvents.run(para, de, agent);
      return true;
    },
    prune(before) { return prune.run(before).changes; },
    remove(floor, agent) { return remove.run(floor, agent).changes; },
  };
}
