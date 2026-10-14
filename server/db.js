// Estado atual e histórico dos agentes em SQLite (módulo nativo do Node, sem dependências).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'kaisha.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      task TEXT,
      queue INTEGER,
      progress REAL,
      meta TEXT,
      updated_at INTEGER NOT NULL,
      seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      task TEXT,
      queue INTEGER,
      meta TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_agent_at ON events (agent, at DESC);
  `);
  // bancos criados antes da versão 0.2 não têm a coluna do tempo de expiração
  // colunas que chegaram depois da primeira versão
  const temColuna = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
  if (!temColuna('agents', 'expires_at')) db.exec('ALTER TABLE agents ADD COLUMN expires_at INTEGER');
  if (!temColuna('agents', 'outcome')) db.exec('ALTER TABLE agents ADD COLUMN outcome TEXT');
  if (!temColuna('events', 'outcome')) db.exec('ALTER TABLE events ADD COLUMN outcome TEXT');

  const upsert = db.prepare(`
    INSERT INTO agents (id, status, task, queue, progress, meta, updated_at, seen_at, expires_at, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, task = excluded.task, queue = excluded.queue,
      progress = excluded.progress, meta = excluded.meta, updated_at = excluded.updated_at, seen_at = excluded.seen_at,
      expires_at = excluded.expires_at, outcome = excluded.outcome
  `);
  const insertEvent = db.prepare('INSERT INTO events (agent, status, task, queue, meta, at, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const placar = db.prepare('SELECT outcome, COUNT(*) AS n FROM events WHERE outcome IS NOT NULL AND at >= ? GROUP BY outcome');
  const touch = db.prepare('UPDATE agents SET seen_at = ? WHERE id = ?');
  const all = db.prepare('SELECT * FROM agents');
  const one = db.prepare('SELECT * FROM agents WHERE id = ?');
  const history = db.prepare('SELECT status, task, queue, meta, at, outcome FROM events WHERE agent = ? ORDER BY at DESC, id DESC LIMIT ?');
  const stale = db.prepare("SELECT id FROM agents WHERE status != 'offline' AND seen_at < ?");
  const setOffline = db.prepare("UPDATE agents SET status = 'offline', task = NULL, queue = NULL, progress = NULL, expires_at = NULL, outcome = NULL, updated_at = ? WHERE id = ?");
  const prune = db.prepare('DELETE FROM events WHERE at < ?');
  const expired = db.prepare('SELECT id FROM agents WHERE expires_at IS NOT NULL AND expires_at <= ?');
  const remove = db.prepare('DELETE FROM agents WHERE id = ?');

  const row = (r) => r && ({
    id: r.id, status: r.status, task: r.task ?? null, queue: r.queue ?? null, progress: r.progress ?? null,
    meta: r.meta ? JSON.parse(r.meta) : null, updatedAt: r.updated_at, seenAt: r.seen_at, outcome: r.outcome ?? null,
  });

  return {
    record(ev, now = Date.now()) {
      const meta = ev.meta ? JSON.stringify(ev.meta) : null;
      const expira = ev.ttl ? now + ev.ttl * 1000 : null;
      upsert.run(ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, ev.progress ?? null, meta, now, now, expira, ev.outcome ?? null);
      insertEvent.run(ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, meta, now, ev.outcome ?? null);
      return row(one.get(ev.agent));
    },
    heartbeat(agent, now = Date.now()) {
      const r = one.get(agent);
      if (!r) return null;
      touch.run(now, agent);
      // um agente offline que dá sinal de vida volta como "idle"
      if (r.status === 'offline') return this.record({ agent, status: 'idle' }, now);
      return row(one.get(agent));
    },
    state() { return all.all().map(row); },
    get(agent) { return row(one.get(agent)); },
    history(agent, limit = 50) {
      return history.all(agent, limit).map((r) => ({ status: r.status, task: r.task ?? null, queue: r.queue ?? null, meta: r.meta ? JSON.parse(r.meta) : null, at: r.at, outcome: r.outcome ?? null }));
    },
    sweepOffline(olderThan, now = Date.now()) {
      const ids = stale.all(olderThan).map((r) => r.id);
      for (const id of ids) { setOffline.run(now, id); insertEvent.run(id, 'offline', null, null, null, now, null); }
      return ids.map((id) => row(one.get(id)));
    },
    // status com prazo (ttl) que venceu: o agente volta a ficar livre
    expire(now = Date.now()) {
      return expired.all(now).map((r) => this.record({ agent: r.id, status: 'idle' }, now));
    },
    // quantas tarefas terminaram em sucesso, pergunta e erro desde o início do dia
    score(desde) {
      const out = { success: 0, question: 0, error: 0 };
      for (const r of placar.all(desde)) if (r.outcome in out) out[r.outcome] = r.n;
      return out;
    },
    prune(before) { return prune.run(before).changes; },
    remove(agent) { return remove.run(agent).changes; },
  };
}
