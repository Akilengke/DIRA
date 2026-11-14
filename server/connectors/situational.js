// Conflict-zone intensity from news reports (GDELT GEO, free) and live weather radar frames (RainViewer, free).
'use strict';
const { getJSON } = require('./http');
const CF = require('../../public/js/conflicts');

let conflictCache = { at: 0, value: null };
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };

/** Reference zones enriched with the number of conflict-related news reports nearby in the last 7 days. */
async function conflicts() {
  if (conflictCache.value && Date.now() - conflictCache.at < 30 * 60000) return conflictCache.value;
  let events = [], note = null;
  try {
    const j = await getJSON(`https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(CF.QUERY)}&format=GeoJSON&timespan=7d&maxpoints=400`, { timeout: 30000 });
    events = (j.features || []).map((f, i) => ({ id: 'cf' + i, name: f.properties.name, count: f.properties.count || 1, html: f.properties.html, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  } catch (e) { note = 'News intensity unavailable: ' + e.message; }
  const zones = CF.ZONES.map(z => {
    const near = events.filter(e => km(z.lat, z.lon, e.lat, e.lon) <= z.km * 1.15);
    return Object.assign({}, z, { reports7d: near.reduce((a, e) => a + e.count, 0), places: near.sort((a, b) => b.count - a.count).slice(0, 6).map(e => ({ name: e.name, count: e.count })) });
  });
  const value = { zones, events, asOf: CF.asOf, updated: Date.now(), note };
  if (!note) conflictCache = { at: Date.now(), value };
  return value;
}

let radarCache = { at: 0, value: null };
async function radar() {
  if (radarCache.value && Date.now() - radarCache.at < 5 * 60000) return radarCache.value;
  const j = await getJSON('https://api.rainviewer.com/public/weather-maps.json', { timeout: 15000 });
  const value = { host: j.host, frames: [...(j.radar?.past || []), ...(j.radar?.nowcast || [])].map(f => ({ time: f.time * 1000, path: f.path, forecast: (j.radar?.nowcast || []).includes(f) })), maxZoom: 7 };
  radarCache = { at: Date.now(), value };
  return value;
}

module.exports = { conflicts, radar };
