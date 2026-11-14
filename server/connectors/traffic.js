// Live traffic (TomTom Traffic API, free tier with an API key): congestion tiles, incidents with their cause,
// flooded roads, and "why is this road jammed?" attribution. Google's traffic layer can only be shown inside
// Google's own map, so Scavenge links out to it instead of copying its tiles.
'use strict';
const { getJSON, request } = require('./http');

const CAT = { 0: 'Unknown', 1: 'Accident', 2: 'Fog', 3: 'Dangerous conditions', 4: 'Rain', 5: 'Ice', 6: 'Traffic jam', 7: 'Lane closed', 8: 'Road closed', 9: 'Road works', 10: 'Wind', 11: 'Flooding', 14: 'Broken-down vehicle' };
const MAG = { 0: 'Unknown', 1: 'Minor', 2: 'Moderate', 3: 'Major', 4: 'Road closed' };
const NEWS_CAUSE = new Set(['crash', 'flood', 'protest', 'fire', 'collapse', 'explosion', 'shooting', 'storm', 'attack']);
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };

function createTraffic({ key, posts }) {
  const tiles = new Map();
  async function tile(style, z, x, y, res) {
    const k = key(); if (!k) { res.writeHead(404); return res.end(); }
    if (!/^(relative0|relative0-dark|relative-delay|reduced-sensitivity)$/.test(style) || ![z, x, y].every(n => Number.isInteger(n) && n >= 0) || z > 22) { res.writeHead(400); return res.end(); }
    const id = `${style}/${z}/${x}/${y}`, hit = tiles.get(id);
    if (hit && Date.now() - hit.at < 120000) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=120' }); return res.end(hit.buf); }
    try {
      const r = await request(`https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(k)}&tileSize=256`, { headers: { Accept: 'image/png' } });
      const buf = Buffer.from(await r.arrayBuffer());
      tiles.set(id, { at: Date.now(), buf }); if (tiles.size > 600) tiles.delete(tiles.keys().next().value);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=120' }); res.end(buf);
    } catch (e) { res.writeHead(502); res.end(); }
  }

  const cache = new Map();
  async function incidents({ lamin, lomin, lamax, lomax }) {
    const k = key();
    if (!k) return { configured: false, incidents: [], jams: [] };
    [lamin, lomin, lamax, lomax] = [lamin, lomin, lamax, lomax].map(Number);
    const area = Math.abs(lamax - lamin) * 111 * Math.abs(lomax - lomin) * 111 * Math.cos((lamin + lamax) / 2 * Math.PI / 180);
    if (!(area > 0) || area > 10000) return { configured: true, tooWide: true, incidents: [], jams: [] };
    const r2 = v => (Math.round(v * 50) / 50).toFixed(2), ck = [lamin, lomin, lamax, lomax].map(r2).join(',');
    const c = cache.get(ck); if (c && Date.now() - c.at < 120000) return c.value;
    const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers}}}';
    const j = await getJSON(`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(k)}&bbox=${lomin},${lamin},${lomax},${lamax}&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`, { timeout: 15000 });
    const list = (j.incidents || []).map(f => {
      const p = f.properties, g = f.geometry, line = g.type === 'LineString' ? g.coordinates : [g.coordinates];
      const mid = line[Math.floor(line.length / 2)];
      return { id: p.id, cat: p.iconCategory, kind: CAT[p.iconCategory] || 'Incident', magnitude: p.magnitudeOfDelay, severity: MAG[p.magnitudeOfDelay] || '',
        description: (p.events || []).map(e => e.description).filter(Boolean).join(' · '), from: p.from, to: p.to, road: (p.roadNumbers || []).join(', '),
        delay: p.delay || 0, length: p.length || 0, start: p.startTime, end: p.endTime, lat: mid[1], lon: mid[0], line: line.length > 60 ? line.filter((_, i) => i % Math.ceil(line.length / 60) === 0) : line };
    });
    const others = list.filter(i => i.cat !== 6);
    const recent = posts().filter(p => p.incident && NEWS_CAUSE.has(p.incident.type) && p.lat != null && Date.now() - p.ts < 3 * 3600000);
    const jams = list.filter(i => i.cat === 6 || i.magnitude >= 3).map(jm => {
      let best = null;
      for (const o of others) { if (o === jm) continue; const d = Math.min(...jm.line.map(([lo, la]) => km(la, lo, o.lat, o.lon))); if (d < 2 && (!best || d < best.d)) best = { d, o }; }
      let cause = null;
      if (jm.cat !== 6) cause = { source: 'traffic', label: jm.kind, detail: jm.description };
      else if (best) cause = { source: 'traffic', label: best.o.kind, detail: `${best.o.description || best.o.kind}${best.o.from ? ' near ' + best.o.from : ''} (${best.d.toFixed(1)} km away)`, incidentId: best.o.id };
      else { const n = recent.find(p => km(p.lat, p.lon, jm.lat, jm.lon) < 8); if (n) cause = { source: 'news', label: 'Possible: ' + n.incident.label, detail: n.text.slice(0, 160), postId: n.id }; }
      return Object.assign({}, jm, { heavy: jm.magnitude >= 3 || jm.delay >= 600, cause });
    });
    const value = { configured: true, incidents: list, jams, updated: Date.now() };
    cache.set(ck, { at: Date.now(), value }); if (cache.size > 100) cache.delete(cache.keys().next().value);
    return value;
  }
  return { tile, incidents, configured: () => !!key() };
}
module.exports = { createTraffic, CAT };
