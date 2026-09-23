(function (root) {
  'use strict';

  const LEVEL_KEYS = ['level', 'loglevel', 'lvl', 'severity', 'severity_text', 'severitytext', 'log.level', '@l'];
  const TIME_KEYS = ['time', 'timestamp', '@timestamp', 'ts', '@t', 'datetime', 'date', 'timestampstr'];
  const MSG_KEYS = ['msg', 'message', '@m', 'messagetemplate', 'event', 'body', 'text'];
  const LOGGER_KEYS = ['logger', 'category', 'scope', 'sourcecontext', 'source', 'log.logger', 'component', 'caller', 'name'];
  const TRACE_KEYS = ['traceid', 'trace_id', 'trace.id', 'trace-id', 'tid'];

  const LEVEL_ALIASES = {
    trace: 'trace', trc: 'trace', verbose: 'trace', vrb: 'trace', finest: 'trace', finer: 'trace',
    debug: 'debug', dbg: 'debug', fine: 'debug', config: 'debug',
    info: 'info', information: 'info', inf: 'info', notice: 'info', log: 'info',
    warn: 'warn', warning: 'warn', wrn: 'warn',
    error: 'error', err: 'error', severe: 'error',
    fatal: 'fatal', critical: 'fatal', crit: 'fatal', panic: 'fatal', emergency: 'fatal', alert: 'fatal', ftl: 'fatal',
  };
  const NUMERIC_LEVELS = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
  const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  const ARGO_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s+/;

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function findKey(obj, candidates) {
    if (!isObject(obj)) return undefined;
    const keys = Object.keys(obj);
    for (const cand of candidates) {
      const hit = keys.find((k) => k.toLowerCase() === cand);
      if (hit !== undefined && obj[hit] !== undefined && obj[hit] !== null && obj[hit] !== '') return hit;
    }
    return undefined;
  }

  function normalizeLevel(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return NUMERIC_LEVELS[value] || null;
    const s = String(value).trim().toLowerCase();
    if (!s) return null;
    if (LEVEL_ALIASES[s]) return LEVEL_ALIASES[s];
    if (/^\d+$/.test(s)) return NUMERIC_LEVELS[Number(s)] || null;
    const one = { t: 'trace', d: 'debug', i: 'info', w: 'warn', e: 'error', f: 'fatal', c: 'fatal' };
    if (s.length === 1 && one[s]) return one[s];
    for (const k of Object.keys(LEVEL_ALIASES)) if (s.startsWith(k)) return LEVEL_ALIASES[k];
    return null;
  }

  function findTraceId(obj) {
    const k = findKey(obj, TRACE_KEYS);
    if (k) return String(obj[k]);
    const scopes = obj.Scopes || obj.scopes;
    if (Array.isArray(scopes)) {
      for (const s of scopes) {
        const sk = findKey(s, TRACE_KEYS);
        if (sk) return String(s[sk]);
      }
    }
    return null;
  }

  function parseLogfmt(text) {
    const pairs = {};
    let count = 0;
    const re = /([A-Za-z0-9_.\-@\/]+)=("(?:[^"\\]|\\.)*"|\S*)/g;
    let m;
    let consumed = 0;
    while ((m = re.exec(text)) !== null) {
      const between = text.slice(consumed, m.index);
      if (between.trim() !== '') return null;
      consumed = m.index + m[0].length;
      let v = m[2];
      if (v.startsWith('"')) {
        try {
          v = JSON.parse(v);
        } catch (e) {
          v = v.slice(1, -1);
        }
      } else if (/^-?\d+(\.\d+)?$/.test(v)) {
        v = Number(v);
      } else if (v === 'true' || v === 'false') {
        v = v === 'true';
      }
      pairs[m[1]] = v;
      count++;
    }
    if (text.slice(consumed).trim() !== '') return null;
    if (count < 2) return null;
    const hasKnown = findKey(pairs, LEVEL_KEYS) || findKey(pairs, MSG_KEYS) || findKey(pairs, TIME_KEYS);
    return hasKnown ? pairs : null;
  }

  function normalize(record, format, raw, argoTs) {
    const levelKey = findKey(record, LEVEL_KEYS);
    const timeKey = findKey(record, TIME_KEYS);
    const msgKey = findKey(record, MSG_KEYS);
    const loggerKey = findKey(record, LOGGER_KEYS);
    const consumed = new Set([levelKey, timeKey, msgKey, loggerKey].filter(Boolean));

    const extras = {};
    for (const k of Object.keys(record)) {
      if (consumed.has(k)) continue;
      const v = record[k];
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) extras[k] = v;
    }

    let message = msgKey ? record[msgKey] : '';
    if (message !== null && typeof message === 'object') message = JSON.stringify(message);

    return {
      format,
      raw,
      record,
      level: normalizeLevel(levelKey ? record[levelKey] : undefined),
      levelRaw: levelKey ? record[levelKey] : null,
      time: timeKey ? String(record[timeKey]) : argoTs || null,
      message: message === undefined || message === null ? '' : String(message),
      logger: loggerKey ? String(record[loggerKey]) : null,
      traceId: findTraceId(record),
      extras,
    };
  }

  function parseLine(text) {
    const original = text;
    let s = text.replace(/^\s+/, '');
    let argoTs = null;
    const tsMatch = ARGO_TS_RE.exec(s);
    if (tsMatch) {
      argoTs = tsMatch[1];
      s = s.slice(tsMatch[0].length);
    }

    const brace = s.indexOf('{');
    if (brace >= 0) {
      const candidate = s.slice(brace).trim();
      if (candidate.endsWith('}')) {
        try {
          const obj = JSON.parse(candidate);
          if (isObject(obj)) return normalize(obj, 'json', original, argoTs);
        } catch (e) {
          /* not json */
        }
      }
    }

    const lf = parseLogfmt(s.trim());
    if (lf) return normalize(lf, 'logfmt', original, argoTs);

    return {
      format: 'raw',
      raw: original,
      record: null,
      level: guessRawLevel(s),
      levelRaw: null,
      time: argoTs,
      message: s.trim(),
      logger: null,
      traceId: null,
      extras: {},
    };
  }

  function guessRawLevel(s) {
    const m = /\b(TRACE|DEBUG|INFO|INFORMATION|WARN|WARNING|ERROR|FATAL|CRITICAL|PANIC)\b/i.exec(s.slice(0, 120));
    return m ? normalizeLevel(m[1]) : null;
  }

  function formatTime(value) {
    if (!value) return '';
    const s = String(value);
    const d = new Date(/^\d{9,13}(\.\d+)?$/.test(s) ? (s.length >= 13 ? Number(s) : Number(s) * 1000) : s);
    if (isNaN(d.getTime())) return s.length > 24 ? s.slice(0, 24) : s;
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  const api = { parseLine, parseLogfmt, normalizeLevel, formatTime, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArgoJsonl = api;
})(typeof window !== 'undefined' ? window : globalThis);
