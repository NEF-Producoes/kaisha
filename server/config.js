// Configuração lida das variáveis de ambiente (tudo tem um padrão razoável).
import path from 'node:path';

const dur = (v, padrao) => {
  // aceita "15m", "90s", "2h" ou um número em segundos
  const s = String(v ?? '').trim();
  if (!s) return padrao;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(s);
  if (!m) return padrao;
  const n = Number(m[1]);
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[(m[2] || 's').toLowerCase()];
  return Math.round(n * mult);
};

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR || '/data'),
  apiKey: process.env.KAISHA_API_KEY || '',
  apiKeyHeader: (process.env.KAISHA_API_KEY_HEADER || 'apikey').toLowerCase(),
  viewPassword: process.env.VIEW_PASSWORD || '',
  offlineAfterMs: dur(process.env.OFFLINE_AFTER, 15 * 60000),
  historyDays: Number(process.env.HISTORY_DAYS) || 30,
  tz: process.env.TZ || 'America/Sao_Paulo',
  lang: process.env.KAISHA_LANG || process.env.LANG_UI || 'pt-BR',
};

export const STATUSES = ['working', 'waiting', 'idle', 'error', 'offline'];
