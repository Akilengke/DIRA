// Live flights from community ADS-B networks (free, no key): adsb.lol → airplanes.live → adsb.fi.
// Each answers "aircraft within 250 nm of a point", so a map view is covered with a grid of points,
// fetched one per ~1.1 s (their fair-use limit) and cached briefly. Optional OpenSky Network credentials
// add a whole-world view. Also: aircraft lookup, flight routes, and airports with their radio frequencies
// (OurAirports open data).
'use strict';
const fs = require('fs');
const path = require('path');
const { getJSON, request } = require('./http');
const RAD = require('../../public/js/radio');

const PROVIDERS = [
  { id: 'adsb.lol', point: (la, lo, r) => `https://api.adsb.lol/v2/point/${la}/${lo}/${r}`, find: { hex: h => `https://api.adsb.lol/v2/hex/${h}`, callsign: c => `https://api.adsb.lol/v2/callsign/${c}`, reg: g => `https://api.adsb.lol/v2/reg/${g}` } },
  { id: 'airplanes.live', point: (la, lo, r) => `https://api.airplanes.live/v2/point/${la}/${lo}/${r}`, find: { hex: h => `https://api.airplanes.live/v2/hex/${h}`, callsign: c => `https://api.airplanes.live/v2/callsign/${c}`, reg: g => `https://api.airplanes.live/v2/reg/${g}` } },
  { id: 'adsb.fi', point: (la, lo, r) => `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}`, find: { hex: h => `https://opendata.adsb.fi/api/v2/hex/${h}`, callsign: c => `https://opendata.adsb.fi/api/v2/callsign/${c}`, reg: g => `https://opendata.adsb.fi/api/v2/registration/${g}` } }
];
const STEP = 6;          // grid spacing in degrees of latitude (a 250 nm circle spans ~8.3°)
const TTL = 12000;       // tile cache lifetime
const MAX_TILES = 12;

function norm(a, source) {
  if (a.lat == null || a.lon == null) return null;
  const ground = a.alt_baro === 'ground';
  return { hex: a.hex, flight: (a.flight || '').trim() || null, reg: a.r || null, type: a.t || null, desc: a.desc || null, lat: a.lat, lon: a.lon,
    alt: ground ? 0 : (a.alt_baro ?? a.alt_geom ?? null), gs: a.gs != null ? Math.round(a.gs) : null, track: a.track ?? a.true_heading ?? null, vr: a.baro_rate ?? a.geom_rate ?? null,
    squawk: a.squawk || null, emergency: a.emergency && a.emergency !== 'none' ? a.emergency : null, category: a.category || null, ground,
    mil: !!(a.dbFlags & 1), seen: a.seen_pos ?? a.seen ?? 0, source };
}

// ---- tile cache + paced fetch queue ---------------------------------------------------------
const tiles = new Map();        // key → { at, list, source, error }
const queue = []; let busy = false, pi = 0;
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const key = queue.shift(); const [la, lo] = key.split(',').map(Number);
    let done = false;
    for (let n = 0; n < PROVIDERS.length && !done; n++) {
      const p = PROVIDERS[(pi + n) % PROVIDERS.length];
      try {
        const j = await getJSON(p.point(la, lo, 250), { timeout: 12000 });
        tiles.set(key, { at: Date.now(), list: (j.ac || j.aircraft || []).map(a => norm(a, p.id)).filter(Boolean), source: p.id });
        done = true;
      } catch (e) { pi = (pi + 1) % PROVIDERS.length; tiles.set(key, Object.assign(tiles.get(key) || { list: [] }, { error: e.message, at: tiles.get(key)?.at || 0 })); }
      await new Promise(r => setTimeout(r, 1100));
    }
  }
  busy = false;
}
function want(key) { const t = tiles.get(key); if ((!t || Date.now() - t.at > TTL) && !queue.includes(key)) { queue.push(key); pump(); } }

/** Aircraft inside a bounding box. Returns what is cached now; stale tiles refresh in the background. */
async function inBox({ lamin, lomin, lamax, lomax }) {
  lamin = Math.max(-85, +lamin); lamax = Math.min(85, +lamax); lomin = +lomin; lomax = +lomax;
  if (!(lamax > lamin) || !(lomax > lomin)) throw Object.assign(new Error('Pass lamin, lomin, lamax, lomax.'), { code: 400 });
  const mid = (lamin + lamax) / 2, lonStep = STEP / Math.max(0.25, Math.cos(mid * Math.PI / 180));
  const rows = [], cols = [];
  for (let la = Math.floor(lamin / STEP) * STEP + STEP / 2; la < lamax + STEP / 2; la += STEP) rows.push(+la.toFixed(2));
  for (let lo = Math.floor(lomin / lonStep) * lonStep + lonStep / 2; lo < lomax + lonStep / 2; lo += lonStep) cols.push(+(((lo + 540) % 360) - 180).toFixed(2));
  if (rows.length * cols.length > MAX_TILES) {
    // Zoomed out: show a world snapshot from OpenSky (live with credentials, every ~15 min anonymously).
    try {
      const all = await opensky.all();
      let list = all.list.filter(a => a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax);
      if (list.length > 3000) { const step = list.length / 3000; list = Array.from({ length: 3000 }, (_, i) => list[Math.floor(i * step)]); }
      return { aircraft: list, source: opensky.enabled() ? 'OpenSky Network' : 'OpenSky Network (snapshot)', snapshot: !opensky.enabled(), partial: false, tooWide: false, at: all.at, total: all.list.length };
    } catch (e) { return { aircraft: [], tooWide: true, source: null, partial: false, note: 'World view unavailable: ' + e.message }; }
  }
  const keys = rows.flatMap(la => cols.map(lo => `${la},${lo}`));
  keys.forEach(want);
  const seen = new Map(); let oldest = Infinity; const sources = new Set(); let errors = 0;
  for (const k of keys) {
    const t = tiles.get(k); if (!t) continue;
    if (t.error && !t.list.length) errors++;
    if (t.source) sources.add(t.source); if (t.at) oldest = Math.min(oldest, t.at);
    for (const a of t.list) if (a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax) { const prev = seen.get(a.hex); if (!prev || prev.seen > a.seen) seen.set(a.hex, a); }
  }
  return { aircraft: [...seen.values()], source: [...sources].join(', ') || null, partial: keys.some(k => !tiles.get(k) || !tiles.get(k).at), pending: queue.length, errors, tiles: keys.length, at: isFinite(oldest) ? oldest : null };
}

async function find(q) {
  q = String(q || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!q) throw Object.assign(new Error('Enter a callsign, registration or ICAO hex code.'), { code: 400 });
  const kinds = /^[0-9A-F]{6}$/.test(q) ? ['hex', 'callsign'] : /-/.test(q) ? ['reg', 'callsign'] : ['callsign', 'reg'];
  for (const p of PROVIDERS) for (const k of kinds) {
    try { const j = await getJSON(p.find[k](k === 'hex' ? q.toLowerCase() : q), { timeout: 10000 }); const list = (j.ac || j.aircraft || []).map(a => norm(a, p.id)).filter(Boolean); if (list.length) return list; } catch {}
  }
  return [];
}

// ---- routes (which airports a callsign flies between) ---------------------------------------
const routes = new Map();
async function route(callsign, lat, lon) {
  callsign = String(callsign || '').trim().toUpperCase(); if (!callsign) return null;
  const c = routes.get(callsign); if (c && Date.now() - c.at < 30 * 60000) return c.value;
  let value = null;
  for (const url of ['https://api.adsb.lol/api/0/routeset', 'https://adsb.im/api/0/routeset']) {
    try {
      const j = await getJSON(url, { method: 'POST', body: { planes: [{ callsign, lat: +lat || 0, lng: +lon || 0 }] }, timeout: 10000 });
      const r = Array.isArray(j) ? j[0] : null;
      if (r && (r.airport_codes || r._airport_codes_iata) && r.airport_codes !== 'unknown') {
        value = { codes: r.airport_codes, iata: r._airport_codes_iata, plausible: r.plausible !== 0 && r.plausible !== false,
          airports: (r._airports || []).map(a => ({ icao: a.icao, iata: a.iata, name: a.name, city: a.location, country: a.countryiso2, lat: a.lat, lon: a.lon })) };
        break;
      }
    } catch {}
  }
  routes.set(callsign, { at: Date.now(), value });
  return value;
}

// ---- OpenSky (optional, whole world) ---------------------------------------------------------
const opensky = (() => {
  let token = null, cache = { at: 0, list: [] }, inflight = null;
  const enabled = () => !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
  async function auth() {
    if (token && Date.now() < token.exp) return token.v;
    const r = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.OPENSKY_CLIENT_ID, client_secret: process.env.OPENSKY_CLIENT_SECRET }) });
    const j = await r.json(); if (!j.access_token) throw new Error('OpenSky login failed');
    token = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }; return token.v;
  }
  async function all() {
    const every = enabled() ? (+process.env.OPENSKY_POLL_SEC || 90) : (+process.env.OPENSKY_ANON_SEC || 900); // anonymous access allows ~100 world fetches a day
    if (cache.list.length && Date.now() - cache.at < every * 1000) return cache;
    if (!cache.list.length && cache.failedAt && Date.now() - cache.failedAt < 120000) throw new Error(cache.error);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const j = await getJSON('https://opensky-network.org/api/states/all', { headers: enabled() ? { Authorization: 'Bearer ' + await auth() } : {}, timeout: 30000 }).catch(e => { cache.failedAt = Date.now(); cache.error = e.message; throw e; });
        cache = { at: Date.now(), list: (j.states || []).filter(s => s[5] != null).map(s => ({ hex: s[0], flight: (s[1] || '').trim() || null, country: s[2], lon: s[5], lat: s[6],
          alt: s[8] ? 0 : s[7] != null ? Math.round(s[7] * 3.28084) : null, ground: !!s[8], gs: s[9] != null ? Math.round(s[9] * 1.94384) : null, track: s[10], vr: s[11] != null ? Math.round(s[11] * 196.85) : null,
          squawk: s[14], seen: Math.max(0, Math.round(j.time - (s[4] || j.time))), source: 'OpenSky Network' })) };
      } finally { inflight = null; }
      return cache;
    })();
    return inflight;
  }
  return { enabled, all };
})();

// ---- airports with radio frequencies (OurAirports, public domain) ----------------------------
let airports = null, loading = null;
function parseCSV(txt) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift(); return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
async function loadAirports(dataDir) {
  if (airports) return airports;
  if (loading) return loading;
  const file = path.join(dataDir, 'airports.json');
  loading = (async () => {
    try { const st = fs.statSync(file); if (Date.now() - st.mtimeMs < 14 * 86400000) return (airports = JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
    try {
      const base = 'https://davidmegginson.github.io/ourairports-data/';
      const [a, f] = await Promise.all([request(base + 'airports.csv', { timeout: 60000, headers: { Accept: 'text/csv' } }).then(r => r.text()), request(base + 'airport-frequencies.csv', { timeout: 60000, headers: { Accept: 'text/csv' } }).then(r => r.text())]);
      const freqs = new Map();
      for (const r of parseCSV(f)) { const k = r.airport_ident; if (!freqs.has(k)) freqs.set(k, []); freqs.get(k).push({ type: r.type, desc: r.description, mhz: +r.frequency_mhz }); }
      airports = parseCSV(a).filter(r => (r.type === 'large_airport' || r.type === 'medium_airport') && r.latitude_deg).map(r => ({
        icao: r.gps_code || r.ident, iata: r.iata_code || null, name: r.name, city: r.municipality, country: r.iso_country, lat: +r.latitude_deg, lon: +r.longitude_deg, size: r.type === 'large_airport' ? 'large' : 'medium',
        freqs: (freqs.get(r.ident) || []).filter(x => x.mhz > 100 && x.mhz < 400) }));
      fs.writeFileSync(file, JSON.stringify(airports));
    } catch (e) {
      console.warn('[airports] OurAirports download failed, using built-in list:', e.message);
      airports = RAD.AIRPORTS.map(a => Object.assign({ freqs: [], size: 'large' }, a));
    }
    return airports;
  })();
  try { return await loading; } finally { loading = null; }
}
async function nearAirports(dataDir, lat, lon, n = 6) { return RAD.nearestAirports(+lat, +lon, Math.min(+n || 6, 20), await loadAirports(dataDir)); }

async function findAirports(dataDir, q) { return RAD.findAirports(q, await loadAirports(dataDir), 8); }

module.exports = { inBox, find, route, nearAirports, findAirports, loadAirports, parseCSV, opensky, norm };
