// Multi Profiles — Browser Profile Testing Lab
// Express server: serves the dashboard and exposes JSON APIs for
// server-observable request data, session tracking, dummy login, and test history.

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Only trust X-Forwarded-For/Proto when TRUST_PROXY says so — otherwise any direct
// client (curl, browser) could spoof its own IP by sending that header itself.
// Set TRUST_PROXY=1 on Railway (exactly one reverse proxy hop in front of the app).
function resolveTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const hops = Number(raw);
  return Number.isFinite(hops) ? hops : raw; // also allow CIDR/subnet strings
}
app.set('trust proxy', resolveTrustProxy());

app.use(express.json());

app.use(
  session({
    name: 'mp.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// --- Dummy local test credentials (never real third-party auth) ---
const TEST_USERNAME = 'test';
// Password is hashed at rest; the plaintext "test123" is never stored.
const TEST_PASSWORD_HASH = crypto.createHash('sha256').update('test123').digest('hex');

function verifyPassword(candidate) {
  const candidateHash = crypto.createHash('sha256').update(String(candidate)).digest('hex');
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(TEST_PASSWORD_HASH);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- In-memory test history (acceptable for v1; swap for a DB later without API changes) ---
const MAX_HISTORY = 200;
const history = [];

// Track session creation/last-activity time server-side (in addition to the cookie itself).
app.use((req, res, next) => {
  const isNewSession = !req.session.createdAt;
  if (isNewSession) {
    req.session.createdAt = Date.now();
  }
  req.session.isNewSession = isNewSession;
  req.session.lastActivity = Date.now();
  next();
});

// A single connection is only ever IPv4 or IPv6, so exactly one of these is populated.
function splitIp(ip) {
  if (!ip) return { ipv4: null, ipv6: null };
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return normalized.includes(':') ? { ipv4: null, ipv6: normalized } : { ipv4: normalized, ipv6: null };
}

function getServerInfo(req) {
  const { ipv4, ipv6 } = splitIp(req.ip);
  return {
    timestamp: new Date().toISOString(),
    ipv4,
    ipv6,
    userAgent: req.get('user-agent') || null,
    acceptLanguage: req.get('accept-language') || null,
    referer: req.get('referer') || null,
    sessionId: req.sessionID,
  };
}

app.use(express.static(path.join(__dirname, 'public')));

// GET /api/session — current session identity/lifecycle info
app.get('/api/session', (req, res) => {
  res.json({
    sessionId: req.sessionID,
    isNew: req.session.isNewSession,
    createdAt: req.session.createdAt,
    lastActivity: req.session.lastActivity,
    cookiePresent: Boolean(req.headers.cookie),
    loggedIn: Boolean(req.session.user),
    user: req.session.user || null,
  });
});

// GET /api/test — server-observable request info, without recording history
app.get('/api/test', (req, res) => {
  res.json(getServerInfo(req));
});

// POST /api/test — record a full test (server info + client-supplied browser info)
app.post('/api/test', (req, res) => {
  const clientInfo = (req.body && typeof req.body.client === 'object' && req.body.client) || {};

  const record = {
    testId: crypto.randomUUID(),
    sessionId: req.sessionID,
    timestamp: new Date().toISOString(),
    server: getServerInfo(req),
    client: clientInfo,
  };

  history.unshift(record);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

  res.status(201).json(record);
});

// GET /api/history?limit=50 — recent test records (newest first)
app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_HISTORY);
  res.json(history.slice(0, limit));
});

function flattenRecord(r) {
  return {
    testId: r.testId,
    sessionId: r.sessionId,
    timestamp: r.timestamp,
    ipv4: r.server.ipv4,
    ipv6: r.server.ipv6,
    userAgent: r.server.userAgent,
    acceptLanguage: r.server.acceptLanguage,
    referer: r.server.referer,
    language: r.client.language,
    timezone: r.client.timezone,
    screen: r.client.screen,
    viewport: r.client.viewport,
    devicePixelRatio: r.client.devicePixelRatio,
    platform: r.client.platform,
    colorDepth: r.client.colorDepth,
    online: r.client.online,
    hardwareConcurrency: r.client.hardwareConcurrency,
    deviceMemory: r.client.deviceMemory,
    maxTouchPoints: r.client.maxTouchPoints,
    cookiesEnabled: r.client.cookiesEnabled,
    localStorageAvailable: r.client.localStorageAvailable,
    sessionStorageAvailable: r.client.sessionStorageAvailable,
    indexedDbAvailable: r.client.indexedDbAvailable,
    webglSupported: r.client.webglSupported,
    serviceWorkerSupported: r.client.serviceWorkerSupported,
  };
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(','));
  }
  return lines.join('\n');
}

// GET /api/history/export?format=json|csv&ids=a,b,c — download test history as a file
app.get('/api/history/export', (req, res) => {
  const format = (req.query.format || 'json').toLowerCase();
  const idsParam = req.query.ids;

  let records = history;
  if (idsParam) {
    const ids = String(idsParam).split(',').map((id) => id.trim()).filter(Boolean);
    const byId = new Map(history.map((r) => [r.testId, r]));
    records = ids.map((id) => byId.get(id)).filter(Boolean);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'csv') {
    const csv = toCsv(records.map(flattenRecord));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="multi-profiles-history-${stamp}.csv"`);
    return res.send(csv);
  }

  if (format !== 'json') {
    return res.status(400).json({ error: 'Unsupported format. Use "json" or "csv".' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="multi-profiles-history-${stamp}.json"`);
  res.send(JSON.stringify(records, null, 2));
});

// GET /api/history/:testId — single record detail
app.get('/api/history/:testId', (req, res) => {
  const record = history.find((r) => r.testId === req.params.testId);
  if (!record) {
    return res.status(404).json({ error: 'Test record not found' });
  }
  res.json(record);
});

// GET /api/compare?ids=id1,id2,id3 — records for side-by-side comparison, in requested order
app.get('/api/compare', (req, res) => {
  const idsParam = req.query.ids;
  if (!idsParam) {
    return res.status(400).json({ error: 'Query parameter "ids" is required (comma-separated test IDs)' });
  }
  const ids = String(idsParam)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const byId = new Map(history.map((r) => [r.testId, r]));
  const records = ids.map((id) => byId.get(id)).filter(Boolean);

  res.json(records);
});

// POST /api/login — dummy local test login only (no real third-party auth)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  if (username === TEST_USERNAME && verifyPassword(password)) {
    req.session.user = username;
    req.session.loginAt = Date.now();
    return res.json({ success: true, user: username, loginAt: req.session.loginAt });
  }

  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  delete req.session.user;
  delete req.session.loginAt;
  res.json({ success: true });
});

// JSON 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Fallback error handler — never leak stack traces to clients
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Multi Profiles test lab running on port ${PORT}`);
});
