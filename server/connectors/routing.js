// Fastest-route planner. Candidate routes come from TomTom Routing (live traffic, closures, speed limits) when a
// TomTom key is set, otherwise from the public OSRM router (OpenStreetMap, no live traffic). Scavenge then checks
// every candidate against live traffic incidents, flooding, speed cameras (OpenStreetMap via Overpass) and
// incidents in the news, and ranks them (public/js/routeplan.js). An LLM, when configured, writes the briefing.
'use strict';
const { getJSON, request } = require('./http');
const RP = require('../../public/js/routeplan');

function createRouting({ key, traffic, posts }) {
  const geoCache = new Map();
  async function geocode(q) {
    q = String(q || '').trim();
    if (!q) throw Object.assign(new Error('Enter both a start and a destination.'), { code: 400 });
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
    if (m) return { name: q, lat: +m[1], lon: +m[2] };
    if (geoCache.has(q.toLowerCase())) return geoCache.get(q.toLowerCase());
    let hit = null;
    const k = key();
    if (k) {
      const j = await getJSON(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(k)}&limit=1`, { timeout: 12000 });
      const r = (j.results || [])[0];
      if (r) hit = { name: r.poi ? r.poi.name + ', ' + (r.address.freeformAddress || '') : r.address.freeformAddress, lat: r.position.lat, lon: r.position.lon };
    }
    if (!hit) {
      const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { timeout: 12000 });
      if (j[0]) hit = { name: j[0].display_name.split(',').slice(0, 3).join(','), lat: +j[0].lat, lon: +j[0].lon };
    }
    if (!hit) throw Object.assign(new Error(`Couldn't find "${q}". Try a fuller address or "lat,lon".`), { code: 404 });
    geoCache.set(q.toLowerCase(), hit); if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value);
    return hit;
  }

  async function tomtom(a, b, k) {
    const base = `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?key=${encodeURIComponent(k)}&traffic=true&maxAlternatives=3&alternativeType=anyRoute&routeType=fastest&travelMode=car&departAt=now&computeTravelTimeFor=all&sectionType=traffic`;
    let j;
    try { j = await getJSON(base + '&sectionType=speedLimit', { timeout: 20000 }); } catch (e) { j = await getJSON(base, { timeout: 20000 }); }
    return (j.routes || []).map((r, i) => {
      const line = r.legs.flatMap(l => l.points.map(p => [p.longitude, p.latitude]));
      const sections = (r.sections || []).filter(s => s.sectionType === 'TRAFFIC').map(s => ({
        kind: s.simpleCategory === 'ROAD_CLOSURE' ? 'closure' : s.simpleCategory === 'ROAD_WORK' ? 'roadworks' : s.simpleCategory === 'JAM' ? 'jam' : 'other',
        from: s.startPointIndex, to: s.endPointIndex, delay: s.delayInSeconds || 0, speed: s.effectiveSpeedInKmh, magnitude: s.magnitudeOfDelay,
        label: s.simpleCategory === 'ROAD_CLOSURE' ? 'Road closed' : s.simpleCategory === 'ROAD_WORK' ? 'Road works' : (s.magnitudeOfDelay >= 3 ? 'Heavy congestion' : 'Congestion') }));
      const limits = (r.sections || []).filter(s => s.sectionType === 'SPEED_LIMIT' && s.maxSpeedLimitInKmh).map(s => ({ from: s.startPointIndex, to: s.endPointIndex, kmh: s.maxSpeedLimitInKmh }));
      const sm = r.summary;
      return { id: 'r' + i, line: thin(line), rawLen: line.length, length: sm.lengthInMeters, time: sm.liveTrafficIncidentsTravelTimeInSeconds || sm.travelTimeInSeconds,
        noTrafficTime: sm.noTrafficTravelTimeInSeconds, trafficDelay: sm.trafficDelayInSeconds, trafficIncluded: true, sections, limits, provider: 'TomTom (live traffic)' };
    }).map(rescale);
  }
  async function osrm(a, b) {
    const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?alternatives=3&overview=full&geometries=geojson&steps=false`, { timeout: 20000 });
    if (j.code !== 'Ok') throw new Error('Router: ' + (j.message || j.code));
    return j.routes.map((r, i) => ({ id: 'r' + i, line: thin(r.geometry.coordinates), length: r.distance, time: r.duration, noTrafficTime: r.duration, trafficIncluded: false, sections: [], limits: [], provider: 'OSRM / OpenStreetMap (no live traffic)' }));
  }
  // keep the line light for the browser, remembering how indexes map
  function thin(line) { if (line.length <= 700) return line; const st = Math.ceil(line.length / 700), out = line.filter((_, i) => i % st === 0); out.push(line[line.length - 1]); out.step = st; return out; }
  function rescale(r) {
    const st = r.line.step; if (!st) return r;
    const f = i => Math.min(r.line.length - 1, Math.round(i / st));
    r.sections.forEach(s => { s.from = f(s.from); s.to = f(s.to); }); r.limits.forEach(l => { l.from = f(l.from); l.to = f(l.to); });
    return r;
  }

  async function cameras(bb) {
    const area = (bb.n - bb.s) * (bb.e - bb.w);
    if (area > 6) return { list: [], note: 'Trip too long to scan for speed cameras.' };
    const q = `[out:json][timeout:20];(node["highway"="speed_camera"](${bb.s},${bb.w},${bb.n},${bb.e});node["enforcement"="maxspeed"](${bb.s},${bb.w},${bb.n},${bb.e}););out;`;
    try {
      const r = await request('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: undefined, timeout: 25000, raw: 'data=' + encodeURIComponent(q) });
      const j = await r.json();
      return { list: (j.elements || []).map(e => ({ lat: e.lat, lon: e.lon, maxspeed: parseInt(e.tags && e.tags.maxspeed, 10) || null })) };
    } catch (e) { return { list: [], note: 'Speed camera data unavailable (' + e.message + ').' }; }
  }

  async function llm(facts) {
    const base = process.env.LLM_BASE_URL; if (!base) return null;
    try {
      const r = await request(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', timeout: 15000, headers: process.env.LLM_API_KEY ? { Authorization: 'Bearer ' + process.env.LLM_API_KEY } : {},
        body: { model: process.env.LLM_MODEL || 'llama3.1', temperature: 0.2, max_tokens: 220, messages: [
          { role: 'system', content: 'You are a traffic operations analyst. In 3 short sentences, recommend the best route from the JSON facts and say why (time, congestion, closures, flooding, speed cameras, limits). Use only the facts given.' },
          { role: 'user', content: JSON.stringify(facts) }] } });
      const j = await r.json(); return (j.choices && j.choices[0] && j.choices[0].message.content || '').trim() || null;
    } catch (e) { return null; }
  }

  async function plan({ from, to }) {
    const [a, b] = await Promise.all([geocode(from), geocode(to)]);
    if (RP.dist([a.lon, a.lat], [b.lon, b.lat]) > 1500000) throw Object.assign(new Error('Those places are too far apart for road routing here (over 1,500 km).'), { code: 400 });
    const k = key(), notes = [];
    let routes;
    if (k) { try { routes = await tomtom(a, b, k); } catch (e) { notes.push('TomTom routing failed (' + e.message + '); using OpenStreetMap routing without live traffic.'); } }
    else notes.push('No TomTom key: routes come from OpenStreetMap without live traffic or speed limits. Add a free key in Accounts.');
    if (!routes || !routes.length) routes = await osrm(a, b);
    if (!routes.length) throw Object.assign(new Error('No road route found between those places.'), { code: 404 });
    const all = routes.flatMap(r => r.line), pad = 0.01;
    const bb = { s: Math.min(...all.map(p => p[1])) - pad, n: Math.max(...all.map(p => p[1])) + pad, w: Math.min(...all.map(p => p[0])) - pad, e: Math.max(...all.map(p => p[0])) + pad };
    const [inc, cam] = await Promise.all([
      k ? traffic.incidents({ lamin: bb.s, lomin: bb.w, lamax: bb.n, lomax: bb.e }).catch(() => ({ incidents: [] })) : { incidents: [] },
      cameras(bb)]);
    if (inc.tooWide) notes.push('Trip area is larger than the traffic incident feed covers; closures checked by the router only.');
    if (cam.note) notes.push(cam.note);
    const news = posts().filter(p => p.incident && p.lat != null && Date.now() - p.ts < 4 * 3600000 && p.lat >= bb.s && p.lat <= bb.n && p.lon >= bb.w && p.lon <= bb.e)
      .map(p => ({ lat: p.lat, lon: p.lon, type: p.incident.type, text: p.text, id: p.id }));
    const res = RP.analyse(routes, { incidents: inc.incidents || [], cameras: cam.list, news });
    const best = res.routes[0];
    const ai = await llm({ from: a.name, to: b.name, routes: res.routes.map(r => ({ route: r.label, minutes: Math.round(r.eta / 60), km: +(r.length / 1000).toFixed(1), trafficDelayMin: Math.round(r.delay / 60), blockedBy: r.closures.map(c => c.label), speedCameras: r.cameras.length, avgLimitKmh: r.limitAvg, newsIncidents: r.news.map(n => n.label) })), chosen: best.label });
    return { from: a, to: b, provider: routes[0].provider, routes: res.routes.map(r => Object.assign(r, { google: RP.googleLink(r) })), best: res.best,
      summary: ai || res.summary, engine: ai ? (process.env.LLM_MODEL || 'llm') : 'scavenge-route', notes, cameraCount: cam.list.length, updated: Date.now() };
  }
  return { plan, geocode };
}
module.exports = { createRouting };
