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

// Required so req.ip / req.secure are correct behind Railway's HTTPS reverse proxy.
app.set('trust proxy', 1);

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

function getIpVersion(ip) {
  if (!ip) return null;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return normalized.includes(':') ? 'IPv6' : 'IPv4';
}

function getServerInfo(req) {
  return {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    ipVersion: getIpVersion(req.ip),
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
