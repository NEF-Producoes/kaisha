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

  const upsert = db.prepare(`
    INSERT INTO agents (id, status, task, queue, progress, meta, updated_at, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, task = excluded.task, queue = excluded.queue,
      progress = excluded.progress, meta = excluded.meta, updated_at = excluded.updated_at, seen_at = excluded.seen_at
  `);
  const insertEvent = db.prepare('INSERT INTO events (agent, status, task, queue, meta, at) VALUES (?, ?, ?, ?, ?, ?)');
  const touch = db.prepare('UPDATE agents SET seen_at = ? WHERE id = ?');
  const all = db.prepare('SELECT * FROM agents');
  const one = db.prepare('SELECT * FROM agents WHERE id = ?');
  const history = db.prepare('SELECT status, task, queue, meta, at FROM events WHERE agent = ? ORDER BY at DESC, id DESC LIMIT ?');
  const stale = db.prepare("SELECT id FROM agents WHERE status != 'offline' AND seen_at < ?");
  const setOffline = db.prepare("UPDATE agents SET status = 'offline', task = NULL, queue = NULL, progress = NULL, updated_at = ? WHERE id = ?");
  const prune = db.prepare('DELETE FROM events WHERE at < ?');
  const remove = db.prepare('DELETE FROM agents WHERE id = ?');

  const row = (r) => r && ({
    id: r.id, status: r.status, task: r.task ?? null, queue: r.queue ?? null, progress: r.progress ?? null,
    meta: r.meta ? JSON.parse(r.meta) : null, updatedAt: r.updated_at, seenAt: r.seen_at,
  });

  return {
    record(ev, now = Date.now()) {
      const meta = ev.meta ? JSON.stringify(ev.meta) : null;
      upsert.run(ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, ev.progress ?? null, meta, now, now);
      insertEvent.run(ev.agent, ev.status, ev.task ?? null, ev.queue ?? null, meta, now);
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
      return history.all(agent, limit).map((r) => ({ status: r.status, task: r.task ?? null, queue: r.queue ?? null, meta: r.meta ? JSON.parse(r.meta) : null, at: r.at }));
    },
    sweepOffline(olderThan, now = Date.now()) {
      const ids = stale.all(olderThan).map((r) => r.id);
      for (const id of ids) { setOffline.run(now, id); insertEvent.run(id, 'offline', null, null, null, now); }
      return ids.map((id) => row(one.get(id)));
    },
    prune(before) { return prune.run(before).changes; },
    remove(agent) { return remove.run(agent).changes; },
  };
}
