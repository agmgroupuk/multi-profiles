// Multi Profiles — dashboard client logic.
// Collects browser-side observable data and talks to the JSON API.

const $ = (sel, root = document) => root.querySelector(sel);

function setFields(root, data) {
  root.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.getAttribute('data-field');
    const value = data ? data[key] : undefined;
    el.textContent = value === undefined || value === null || value === '' ? '—' : String(value);
  });
}

function formatTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function isWebglSupported() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

function collectBrowserInfo() {
  return {
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio || null,
    platform: navigator.platform || null,
    colorDepth: window.screen.colorDepth || null,
    online: navigator.onLine,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    cookiesEnabled: navigator.cookieEnabled,
    localStorageAvailable: (() => {
      try {
        return typeof window.localStorage !== 'undefined';
      } catch (e) {
        return false;
      }
    })(),
    sessionStorageAvailable: (() => {
      try {
        return typeof window.sessionStorage !== 'undefined';
      } catch (e) {
        return false;
      }
    })(),
    indexedDbAvailable: typeof window.indexedDB !== 'undefined',
    webglSupported: isWebglSupported(),
    serviceWorkerSupported: 'serviceWorker' in navigator,
  };
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.message) || (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

async function refreshSession() {
  const data = await fetchJSON('/api/session');
  setFields($('#session-kv'), {
    sessionId: data.sessionId,
    isNew: data.isNew ? 'yes' : 'no',
    cookiePresent: data.cookiePresent ? 'yes' : 'no',
    createdAt: formatTime(data.createdAt),
    lastActivity: formatTime(data.lastActivity),
    user: data.loggedIn ? data.user : 'not logged in',
  });
  return data;
}

function renderHistoryRow(record) {
  const c = record.client || {};
  return `
    <tr>
      <td><input type="checkbox" class="row-select" value="${record.testId}" /></td>
      <td class="mono">${record.testId.slice(0, 8)}</td>
      <td>${new Date(record.timestamp).toLocaleString()}</td>
      <td class="mono">${record.sessionId.slice(0, 8)}</td>
      <td class="mono">${record.server.ip || '—'}</td>
      <td>${c.language || '—'}</td>
      <td>${c.timezone || '—'}</td>
      <td>${c.screen || '—'}</td>
    </tr>
  `;
}

async function refreshHistory() {
  const records = await fetchJSON('/api/history?limit=50');
  const tbody = $('#history-tbody');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">No tests yet.</td></tr>';
    return;
  }
  tbody.innerHTML = records.map(renderHistoryRow).join('');
}

async function runTest() {
  const statusEl = $('#run-test-status');
  statusEl.textContent = 'Running...';
  statusEl.className = 'status';
  try {
    const client = collectBrowserInfo();
    const record = await fetchJSON('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client }),
    });

    setFields($('#server-kv'), record.server);
    setFields($('#client-kv'), record.client);

    await refreshSession();
    await refreshHistory();

    statusEl.textContent = `Test recorded (${record.testId.slice(0, 8)})`;
    statusEl.className = 'status success';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const statusEl = $('#login-status');
  const username = $('#login-username').value;
  const password = $('#login-password').value;
  try {
    const result = await fetchJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    statusEl.textContent = `Logged in as ${result.user}`;
    statusEl.className = 'status success';
    await refreshSession();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
  }
}

async function handleLogout() {
  const statusEl = $('#login-status');
  try {
    await fetchJSON('/api/logout', { method: 'POST' });
    statusEl.textContent = 'Logged out';
    statusEl.className = 'status';
    await refreshSession();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
  }
}

async function handleCompare() {
  const ids = Array.from(document.querySelectorAll('.row-select:checked')).map((el) => el.value);
  const output = $('#compare-output');
  if (ids.length < 2) {
    output.innerHTML = '<p class="hint">Select at least two tests to compare.</p>';
    return;
  }
  try {
    const records = await fetchJSON(`/api/compare?ids=${encodeURIComponent(ids.join(','))}`);
    const rows = [
      ['Test ID', (r) => r.testId.slice(0, 8)],
      ['Session ID', (r) => r.sessionId.slice(0, 8)],
      ['Timestamp', (r) => new Date(r.timestamp).toLocaleString()],
      ['IP', (r) => r.server.ip || '—'],
      ['User-Agent', (r) => r.server.userAgent || '—'],
      ['Accept-Language', (r) => r.server.acceptLanguage || '—'],
      ['Browser language', (r) => (r.client && r.client.language) || '—'],
      ['Timezone', (r) => (r.client && r.client.timezone) || '—'],
      ['Screen', (r) => (r.client && r.client.screen) || '—'],
      ['Viewport', (r) => (r.client && r.client.viewport) || '—'],
      ['Platform', (r) => (r.client && r.client.platform) || '—'],
      ['IP version', (r) => (r.server && r.server.ipVersion) || '—'],
      ['CPU cores', (r) => (r.client && r.client.hardwareConcurrency) || '—'],
      ['Device memory (GB)', (r) => (r.client && r.client.deviceMemory) || '—'],
      ['Max touch points', (r) => (r.client && r.client.maxTouchPoints) ?? '—'],
    ];

    const header = `<tr><th>Field</th>${records.map((_, i) => `<th>Test ${i + 1}</th>`).join('')}</tr>`;
    const body = rows
      .map(([label, getter]) => `<tr><td>${label}</td>${records.map((r) => `<td class="mono">${getter(r)}</td>`).join('')}</tr>`)
      .join('');

    output.innerHTML = `<table>${header}${body}</table>`;
  } catch (err) {
    output.innerHTML = `<p class="status error">${err.message}</p>`;
  }
}

async function init() {
  await refreshSession();
  await refreshHistory();

  $('#run-test-btn').addEventListener('click', runTest);
  $('#login-form').addEventListener('submit', handleLogin);
  $('#logout-btn').addEventListener('click', handleLogout);
  $('#compare-btn').addEventListener('click', handleCompare);

  // Run an initial test automatically so the dashboard has data on first load.
  runTest();
}

init();
