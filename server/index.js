#!/usr/bin/env node
// Scavenge server — zero-dependency Node 18+ HTTP API, Server-Sent Events stream and static host.
'use strict';
loadEnv();
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('../public/js/core');
const { state, save, DATA } = require('./engine/store');
const scheduler = require('./engine/scheduler');
const ai = require('./engine/ai');
const earth = require('./connectors/earth');
const social = require('./connectors/social');
const radioDir = require('./connectors/radio');
const flights = require('./connectors/flights');
const situational = require('./connectors/situational');
const demoSim = process.env.SCAVENGE_DEMO === '1' ? require('../public/js/sim').create(core) : null;
const radioRef = require('../public/js/radio');
const { createSDR } = require('./engine/sdr');
const { createTX, createIntercom } = require('./engine/tx');
const { createAuth } = require('./engine/auth');
const { createAccounts } = require('./engine/accounts');
const auth = createAuth(DATA);
const accounts = createAccounts({ dataDir: DATA, auth });
social.setAccounts(accounts);
const { createTraffic } = require('./connectors/traffic');
const traffic = createTraffic({ key: () => accounts.key('tomtom'), posts: () => state.posts.slice(-4000) });
const { createRouting } = require('./connectors/routing');
const routing = createRouting({ key: () => accounts.key('tomtom'), traffic, posts: () => state.posts.slice(-4000) });

const PORT = +process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, '../public');
const TOKEN = process.env.SCAVENGE_TOKEN; // optional shared access token for write routes

// ------------------------------------------------------------------ live stream (SSE)
const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => broadcast('ping', { t: Date.now() }), 25000).unref();
const sdr = createSDR({ dataDir: DATA, onTransmission: tx => scheduler.onTransmission(tx), onLevel: l => broadcast('sdr', l) });
const tx = createTX({ dataDir: DATA });
const intercom = createIntercom({ dataDir: DATA, broadcast: (t, d) => broadcast(t, d) });
const readRaw = (req, max) => new Promise((ok, bad) => { const parts = []; let n = 0; req.on('data', c => { n += c.length; if (n > max) { bad(Object.assign(new Error('Upload too large.'), { code: 413 })); req.destroy(); } else parts.push(c); }); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', bad); });

// ------------------------------------------------------------------ helpers
const sameOrigin = req => { try { return new URL(req.headers.origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; } };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, process.env.CORS_ORIGIN ? { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN } : {}));
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = req => new Promise((ok, bad) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
const sinceMin = (q, d) => Date.now() - (+q.get('minutes') || d) * 60000;
function scoped(q) {
  let p = state.posts;
  const plat = q.get('platform'), country = q.get('country'), city = q.get('city'), term = q.get('q'), topic = q.get('topic');
  if (topic) p = p.filter(x => (x.topics || []).includes(topic));
  if (plat) { const set = new Set(plat.split(',')); p = p.filter(x => set.has(x.platform)); }
  if (country) p = p.filter(x => x.country === country);
  if (city) p = p.filter(x => x.city === city);
  if (term) { const t = term.toLowerCase(); p = p.filter(x => x.text.toLowerCase().includes(t)); }
  return p;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// ------------------------------------------------------------------ routes
const routes = {
  // ---- operator sign-in & connected accounts
  'GET /api/auth/status': (q, req) => auth.status(req),
  'POST /api/auth/setup': async (q, req, res) => auth.setup(await readBody(req), req, res),
  'POST /api/auth/login': async (q, req, res) => auth.login(await readBody(req), req, res),
  'POST /api/auth/logout': (q, req, res) => auth.logout(req, res),
  'GET /api/accounts': (q, req) => { const l = accounts.list(req); return auth.isOperator(req) ? l : { platforms: l.platforms.map(p => Object.assign(p, { appClientId: null, redirect: null })), accounts: l.accounts.map(a => ({ platform: a.platform, handle: a.handle, status: a.status })), callbackBase: null, keys: { tomtom: { configured: l.keys.tomtom.configured } } }; },
  'POST /api/accounts/connect': async (q, req) => { const b = await readBody(req); return accounts.start(b.platform, b, req); },
  'POST /api/accounts/app': async (q, req) => { const b = await readBody(req); return b.clear ? accounts.clearApp(b.platform) : accounts.setApp(b.platform, b); },
  'DELETE /api/accounts': q => accounts.remove(q.get('id')),
  'GET /api/health': () => ({ ok: true, mode: process.env.SCAVENGE_DEMO === '1' ? 'demo' : 'live', posts: state.posts.length, uptime: process.uptime() }),
  'GET /api/sources': () => ({ connectors: social.map(c => ({ id: c.id, label: c.label, free: c.free, enabled: c.enabled(), needs: c.needs || null, status: state.sources[c.id] || null })), earth: Object.values(state.sources).filter(s => /^(earth|emg)_/.test(s.id)) }),
  'GET /api/feed': q => { const p = scoped(q); const lim = Math.min(+q.get('limit') || 200, 2000); return p.slice(-lim).reverse(); },
  'GET /api/trends': q => core.trends(scoped(q), { windowMin: +q.get('window') || 30, limit: +q.get('limit') || 25, country: q.get('country') || undefined }),
  'GET /api/analytics': q => {
    const p = scoped(q).filter(x => x.ts >= sinceMin(q, 60 * 24));
    return {
      total: p.length,
      sentiment: { positive: p.filter(x => x.mood === 'positive').length, neutral: p.filter(x => x.mood === 'neutral').length, negative: p.filter(x => x.mood === 'negative').length, avg: p.length ? +(p.reduce((a, x) => a + x.sentiment, 0) / p.length).toFixed(3) : 0 },
      topics: core.topicBreakdown(p, { windowMin: +q.get('window') || 30 }),
      platforms: core.breakdown(p, 'platform'), countries: core.breakdown(p, 'country').slice(0, 50), cities: core.breakdown(p, 'city').slice(0, 50),
      timeline: core.timeline(p, +q.get('buckets') || 30), trends: core.trends(p, { windowMin: +q.get('window') || 30, limit: 20 })
    };
  },
  'GET /api/brief': async q => ai.briefing(state.posts, { country: q.get('country') || undefined, topic: q.get('topic') || undefined }),
  'GET /api/topics': () => Object.entries(core.CATEGORIES).map(([key, c]) => ({ key, label: c.label })),
  'GET /api/tv/resolve': async q => tvResolve(q.get('url')),
  'GET /api/events': q => { const l = (q.get('layers') || 'quake,nature,news,weather').split(','); return Object.fromEntries(l.map(k => [k, state.events[k] || []])); },
  'GET /api/rules': () => state.rules,
  // ---- emergencies & radio
  'GET /api/emergency': () => state.events.emergency || [],
  'GET /api/radio/channels': () => radioRef.CHANNELS,
  'GET /api/radio/log': q => state.radioLog.slice(0, +q.get('limit') || 100),
  'GET /api/radio/stations': q => radioDir.stations({ country: q.get('country'), q: q.get('q'), tag: q.get('tag'), limit: q.get('limit') }),
  'GET /api/radio/kiwi': q => radioDir.nearestKiwi(+q.get('lat') || 0, +q.get('lon') || 0, +q.get('hz') || 2182000, q.get('mode') || 'usb'),
  // ---- flights
  'GET /api/flights': q => {
    if (demoSim) { const [a, b, c, d] = ['lamin', 'lomin', 'lamax', 'lomax'].map(k => +q.get(k)); return { aircraft: demoSim.flights().filter(f => f.lat >= a && f.lat <= c && f.lon >= b && f.lon <= d), source: 'simulator', partial: false }; }
    return flights.inBox(Object.fromEntries(['lamin', 'lomin', 'lamax', 'lomax'].map(k => [k, q.get(k)])));
  },
  'GET /api/flights/find': q => demoSim ? demoSim.flights().filter(f => [f.flight, f.reg, f.hex].some(x => x && x.toUpperCase() === String(q.get('q') || '').trim().toUpperCase())) : flights.find(q.get('q')),
  'GET /api/flights/route': q => demoSim ? (() => { const f = demoSim.flights().find(x => x.flight === q.get('callsign')); const A = radioRef.AIRPORTS; return f ? { codes: f.from + '-' + f.to, plausible: true, airports: [A.find(a => a.icao === f.from), A.find(a => a.icao === f.to)] } : null; })() : flights.route(q.get('callsign'), q.get('lat'), q.get('lon')),
  'GET /api/traffic/incidents': q => demoSim ? demoSim.traffic() : traffic.incidents(Object.fromEntries(['lamin', 'lomin', 'lamax', 'lomax'].map(k => [k, q.get(k)]))),
  'POST /api/route': async (q, req) => {
    if (!auth.isOperator(req)) throw Object.assign(new Error(auth.isSetup() ? 'Route planning is for operators. Sign in first.' : 'Set up the operator sign-in first (Sign in → setup code from the server log).'), { code: 401 });
    const b = await readBody(req);
    if (demoSim) return demoSim.route(b.from, b.to);
    return routing.plan({ from: b.from, to: b.to });
  },
  'GET /api/conflicts': () => situational.conflicts(),
  'GET /api/weather/radar': () => situational.radar(),
  'GET /api/airports/near': q => flights.nearAirports(DATA, q.get('lat'), q.get('lon'), q.get('n')),
  'GET /api/sdr/status': () => sdr.status(),
  'POST /api/sdr/tune': async (q, req) => { const b = await readBody(req); return sdr.start({ freqs: b.freqs || [b.hz], mode: b.mode, squelch: b.squelch, gain: b.gain }); },
  'POST /api/sdr/stop': () => { sdr.stop(); return sdr.status(); },
  'GET /api/tx/status': () => tx.status(),
  'POST /api/tx': async (q, req) => tx.transmit({ audio: await readRaw(req, 6e6), hz: +req.headers['x-freq'], pin: req.headers['x-operator-pin'], operator: decodeURIComponent(req.headers['x-operator'] || ''), ip: req.socket.remoteAddress }),
  'GET /api/intercom': () => intercom.list(),
  'POST /api/intercom': async (q, req) => {
    const type = req.headers['content-type'] || '';
    if (type.startsWith('application/json')) { const b = await readBody(req); return intercom.add({ from: b.from, text: b.text, channel: b.channel }); }
    return intercom.add({ from: decodeURIComponent(req.headers['x-from'] || ''), channel: decodeURIComponent(req.headers['x-channel'] || ''), duration: req.headers['x-duration'], type, audio: await readRaw(req, 4e6) });
  },
  'POST /api/rules': async (q, req) => {
    const b = await readBody(req);
    const cats = Array.isArray(b.categories) ? b.categories.filter(c => core.CATEGORIES[c]) : [];
    if (!b.name || !((Array.isArray(b.terms) && b.terms.length) || cats.length)) throw Object.assign(new Error('A rule needs a name and at least one word or topic.'), { code: 400 });
    const rule = { id: b.id || 'r_' + Date.now().toString(36), name: String(b.name).slice(0, 80), terms: (b.terms || []).map(String).slice(0, 25), categories: cats, platforms: b.platforms || [], country: b.country || '', mood: b.mood || 'any', match: b.match === 'all' ? 'all' : 'any', enabled: b.enabled !== false, delivery: b.delivery || { inapp: true }, hits: 0 };
    const i = state.rules.findIndex(r => r.id === rule.id);
    if (i >= 0) state.rules[i] = Object.assign(state.rules[i], rule); else state.rules.push(rule);
    save('rules', state.rules); setTimeout(scheduler.pollSocial, 500);
    return rule;
  },
  'DELETE /api/rules': q => { state.rules = state.rules.filter(r => r.id !== q.get('id')); save('rules', state.rules); return { ok: true }; },
  'GET /api/alerts': q => state.alerts.slice(0, +q.get('limit') || 100),
  'GET /api/watch': () => state.watch,
  'POST /api/watch': async (q, req) => { const b = await readBody(req); state.watch = [...new Set((b.terms || []).map(String).map(s => s.trim()).filter(Boolean))].slice(0, 40); save('watch', state.watch); setTimeout(scheduler.pollSocial, 500); return state.watch; }
};

async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Freq,X-Operator,X-Operator-Pin,X-From,X-Channel,X-Duration' }); return res.end(); }
  if (u.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`event: hello\ndata: ${JSON.stringify({ posts: state.posts.length })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  if (u.pathname.startsWith('/api/oauth/callback/')) {
    const platform = path.basename(u.pathname);
    if (!auth.isOperator(req)) { res.writeHead(302, { Location: '/?account_error=' + encodeURIComponent('Sign in as the operator before connecting accounts.') + '#accounts' }); return res.end(); }
    try { const a = await accounts.callback(platform, u.searchParams); res.writeHead(302, { Location: `/?connected=${encodeURIComponent(platform)}&handle=${encodeURIComponent(a.handle || '')}#accounts` }); }
    catch (e) { res.writeHead(302, { Location: '/?account_error=' + encodeURIComponent(e.message.slice(0, 200)) + '#accounts' }); }
    return res.end();
  }
  { const m = /^\/api\/traffic\/flow\/([\w-]+)\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(u.pathname); if (m) return traffic.tile(m[1], +m[2], +m[3], +m[4], res); }
  if (u.pathname === '/api/sdr/audio') return sdr.listen(req, res);
  if (u.pathname.startsWith('/api/radio/clip/')) return sdr.clip(path.basename(u.pathname, '.wav'), res);
  if (u.pathname.startsWith('/api/intercom/audio/')) return intercom.audio(path.basename(u.pathname), res);
  if (u.pathname.startsWith('/api/radio/play/')) return radioDir.pipeStation(path.basename(u.pathname), req, res).catch(e => { if (!res.headersSent) send(res, 502, { error: 'Station unavailable: ' + e.message }); else res.end(); });
  if (u.pathname === '/api/satellite') {
    try { const img = await earth.satellite(u.searchParams.get('date'), u.searchParams.get('layer') || 'true'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }); return res.end(img); }
    catch (e) { return send(res, 502, { error: 'Satellite imagery unavailable: ' + e.message }); }
  }
  const route = routes[`${req.method} ${u.pathname}`];
  if (route) {
    const open = /^\/api\/auth\//.test(u.pathname);
    const needsOperator = !open && req.method !== 'GET' && (auth.isSetup() || /^\/api\/accounts/.test(u.pathname) || TOKEN);
    if (needsOperator && !auth.isOperator(req)) return send(res, 401, { error: auth.isSetup() ? 'Sign in as the operator to make changes.' : 'Set up the operator sign-in first (Sign in → setup code from the server log).' });
    if (req.method !== 'GET' && !open && req.headers.origin && !sameOrigin(req)) return send(res, 403, { error: 'Cross-site request refused.' });
    try { return send(res, 200, await route(u.searchParams, req, res)); }
    catch (e) { return send(res, e.code || 500, { error: e.message }); }
  }
  if (u.pathname.startsWith('/api/')) return send(res, 404, { error: 'Unknown endpoint ' + u.pathname });
  // static files
  const f = path.normalize(path.join(PUBLIC, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname)));
  if (!f.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(f, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    // The page is authored as a body fragment (so it also publishes as a hosted artifact); give it a document skeleton here.
    if (path.basename(f) === 'index.html') data = '<!doctype html><html lang="en"><head><meta charset="utf-8">\n' + data + '\n</html>';
    send(res, 200, data, MIME[path.extname(f)] || 'application/octet-stream');
  });
}

// Turn a YouTube channel / @handle / video link into something embeddable.
const tvCache = new Map();
async function tvResolve(url) {
  if (!url) throw Object.assign(new Error('Pass ?url= with a YouTube link.'), { code: 400 });
  const u = new URL(url);
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) throw Object.assign(new Error('Only YouTube links need resolving.'), { code: 400 });
  const vid = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || (u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]{11})/) || [])[1];
  if (vid) return { videoId: vid };
  const direct = (u.pathname.match(/\/channel\/(UC[\w-]{22})/) || [])[1];
  if (direct) return { channelId: direct };
  if (tvCache.has(url)) return tvCache.get(url);
  const html = await (await fetch(url.replace(/\/live\/?$/, ''), { headers: { 'User-Agent': 'Mozilla/5.0 Scavenge', 'Accept-Language': 'en' } })).text();
  const id = (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
  if (!id) throw Object.assign(new Error('Could not find a channel ID on that page.'), { code: 404 });
  const out = { channelId: id }; tvCache.set(url, out); return out;
}

function loadEnv() {
  try {
    require('fs').readFileSync(require('path').join(__dirname, '../.env'), 'utf8').split('\n').forEach(l => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch { /* no .env */ }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`\n  ◉ SCAVENGE online → http://localhost:${PORT}  (${process.env.SCAVENGE_DEMO === '1' ? 'DEMO simulator' : 'LIVE feeds'})\n`);
  scheduler.start(broadcast);
});
