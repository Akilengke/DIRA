// Public radio: broadcast station directory (radio-browser.info, free & open) and the public KiwiSDR receiver
// network (hundreds of volunteer-run HF receivers you can tune from a browser).
'use strict';
const { getJSON, request } = require('./http');

const MIRRORS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info'];
const known = new Map(); // stationuuid → stream URL. Only these may be proxied, so /api/radio/play is never an open proxy.

async function stations({ country, q, tag, limit = 60 }) {
  const qs = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: String(Math.min(+limit || 60, 200)) });
  if (country) qs.set('countrycode', country);
  if (q) qs.set('name', q);
  if (tag) qs.set('tag', tag);
  let last;
  for (const host of MIRRORS) {
    try {
      const list = await getJSON(`https://${host}/json/stations/search?${qs}`);
      return list.map(s => {
        known.set(s.stationuuid, s.url_resolved || s.url);
        return { id: s.stationuuid, name: s.name.trim(), url: s.url_resolved || s.url, homepage: s.homepage, favicon: s.favicon, tags: (s.tags || '').split(',').filter(Boolean).slice(0, 4),
          country: s.country, countrycode: s.countrycode, state: s.state, language: s.language, codec: s.codec, bitrate: s.bitrate,
          lat: s.geo_lat, lon: s.geo_long, votes: s.votes, clicks: s.clickcount };
      });
    } catch (e) { last = e; }
  }
  throw last;
}

/** Relay an approved station's stream (used when the page is HTTPS and the station is plain HTTP). */
async function pipeStation(id, req, res) {
  const url = known.get(id);
  if (!url) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unknown station. Search for it first.' })); }
  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());
  const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Scavenge/1.0', 'Icy-MetaData': '0' } });
  res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store' });
  const { Readable } = require('stream');
  Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
}

// ---- KiwiSDR public receivers --------------------------------------------------------------
let kiwiCache = { at: 0, list: [] };
async function kiwiList() {
  if (Date.now() - kiwiCache.at < 30 * 60000 && kiwiCache.list.length) return kiwiCache.list;
  const r = await request('http://rx.linkfanel.net/kiwisdr_com.js', { headers: { Accept: '*/*' }, timeout: 20000 });
  const txt = await r.text();
  // The file is a JS assignment of a JSON-like array. Parse it as data (never eval), tolerating trailing commas.
  const arr = txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1).replace(/,\s*([\]}])/g, '$1');
  const list = JSON.parse(arr).map(k => {
    const m = /\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?/.exec(k.gps || '');
    const [lo, hi] = String(k.bands || '0-30000000').split('-').map(Number);
    return { name: k.name, url: k.url, lat: m ? +m[1] : null, lon: m ? +m[2] : null, users: +k.users || 0, max: +k.users_max || 0, antenna: k.antenna, loc: k.loc, lo, hi, offline: k.offline === 'yes' || k.status === 'offline' };
  }).filter(k => k.url && k.lat != null && !k.offline);
  kiwiCache = { at: Date.now(), list };
  return list;
}
const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
/** Nearest public receivers with a free slot that cover `hz`, each with a ready-tuned listening link. */
async function nearestKiwi(lat, lon, hz, mode, n = 6) {
  const list = await kiwiList();
  const khz = hz / 1000;
  return list.filter(k => hz >= k.lo && hz <= k.hi && k.users < k.max)
    .map(k => Object.assign({}, k, { km: Math.round(km(lat, lon, k.lat, k.lon)), listen: `${k.url.replace(/\/$/, '')}/?f=${khz}${mode || 'usb'}z8` }))
    .sort((a, b) => a.km - b.km).slice(0, n);
}

module.exports = { stations, pipeStation, nearestKiwi, km };
