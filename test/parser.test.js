const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseLine, formatTime, toMillis } = require('../extension/parser.js');

const samples = path.join(__dirname, '..', 'samples');
const readLines = (f) => fs.readFileSync(path.join(samples, f), 'utf8').split('\n').filter(Boolean);

let checks = 0;
const check = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

const dotnet = readLines('claim-service-app.log').map(parseLine);
check(dotnet.every((p) => p.format === 'json'), 'all .NET lines parse as json');
check(dotnet.every((p) => p.level === 'info' || p.level === 'warn'), '.NET "Information"/"Warning" normalise to info/warn');
check(dotnet.filter((p) => p.level === 'warn').length === 13, 'sample contains 13 Warning lines');
check(dotnet.every((p) => p.logger && p.message), '.NET lines have Category and Message');
check(dotnet.some((p) => p.traceId && /^[0-9a-f]{32}$/.test(p.traceId)), 'trace id extracted from Scopes');
check(dotnet.every((p) => 'EventId' in p.extras), 'EventId kept as extra field');

const dapr = readLines('claim-service-daprd.log').map(parseLine);
const daprJson = dapr.filter((p) => p.format === 'json');
check(daprJson.length >= 20, 'dapr sidecar json lines parsed');
check(daprJson.every((p) => ['info', 'warn', 'error', 'debug'].includes(p.level)), 'dapr levels normalised');
check(daprJson.every((p) => p.time && p.logger === p.record.scope), 'dapr time and scope picked up');

const logfmt = readLines('accrual-daprd.log').map(parseLine).filter((p) => p.format === 'logfmt');
check(logfmt.length === 14, 'logfmt lines detected: ' + logfmt.length);
const daprRaw = readLines('accrual-daprd.log').map(parseLine).filter((p) => p.format === 'raw');
check(daprRaw.length === 4 && daprRaw.every((p) => p.level === null), 'plain-text banner lines stay raw');
check(logfmt.every((p) => p.level === 'info' && p.message && p.time), 'logfmt fields extracted');
check(logfmt.some((p) => p.extras.topic), 'logfmt extras keep quoted values');

const argoTs = parseLine('2026-09-23T15:28:34.123922429Z        {"level":"warn","msg":"hi"}');
check(argoTs.format === 'json' && argoTs.level === 'warn' && argoTs.time === '2026-09-23T15:28:34.123922429Z', 'Argo timestamp prefix stripped and used as time');

const withTime = parseLine('{"level":"error","msg":"boom","ts":"2026-01-02T03:04:05.678Z"}');
check(withTime.time === '2026-01-02T03:04:05.678Z', 'record time preferred');
check(/^\d{2}:\d{2}:\d{2}\.678$/.test(formatTime(withTime.time)), 'formatTime renders HH:MM:SS.mmm');

const pino = parseLine('{"level":50,"time":1700000000000,"msg":"pino error"}');
check(pino.level === 'error', 'numeric pino level mapped');

const raw = parseLine('Starting server on :8080');
check(raw.format === 'raw' && raw.level === null && raw.message === 'Starting server on :8080', 'plain lines stay raw');

const rawLevel = parseLine('2026-09-23 10:00:00 ERROR something broke');
check(rawLevel.format === 'raw' && rawLevel.level === 'error', 'level guessed from raw text');

const truncated = parseLine('{"level":"info","msg":"cut off');
check(truncated.format === 'raw', 'truncated json falls back to raw');

const nested = parseLine('{"severity":"WARNING","message":{"a":1},"labels":{"x":"y"},"n":null}');
check(nested.level === 'warn' && nested.message === '{"a":1}' && nested.extras.n === null && !('labels' in nested.extras), 'object message stringified, objects excluded from extras');

check(toMillis('2026-09-24T10:33:48.956799421Z') === Date.parse('2026-09-24T10:33:48.956Z'), 'toMillis parses RFC3339 with nanoseconds');
check(toMillis(1700000000) === 1700000000000 && toMillis('1700000000000') === 1700000000000, 'toMillis handles epoch seconds and ms');
const blank = parseLine(' '.repeat(31) + '{"level":"info","msg":"same second"}');
check(blank.format === 'json' && blank.time === null && blank.inheritTime === true, 'blank Argo timestamp column marks the line as inheriting the previous time');
check(argoTs.inheritTime === false && raw.inheritTime === false, 'lines with a timestamp or no padding do not inherit');
check(toMillis(null) === null && toMillis('not a date') === null, 'toMillis returns null for missing or invalid input');

console.log(`ok - ${checks} checks passed`);
