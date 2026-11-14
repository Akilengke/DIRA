// Route analysis shared by the server and the test site.
// Takes candidate routes (from TomTom, OSRM or the simulator) plus what Scavenge knows about the roads
// (traffic incidents, closures, flooding, speed cameras, speed limits, incidents in the news) and ranks them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScavengeRoute = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = Math.PI / 180;
  // metres between two [lon, lat] points (equirectangular is accurate enough at road scale)
  const dist = (a, b) => { const x = (b[0] - a[0]) * R * Math.cos((a[1] + b[1]) / 2 * R), y = (b[1] - a[1]) * R; return Math.sqrt(x * x + y * y) * 6371000; };
  function segDist(p, a, b) {
    const c = Math.cos(p[1] * R), ax = (a[0] - p[0]) * c, ay = a[1] - p[1], bx = (b[0] - p[0]) * c, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    const x = ax + t * dx, y = ay + t * dy; return Math.sqrt(x * x + y * y) * R * 6371000;
  }
  // nearest distance from a point to a line, and the index of the segment
  function near(line, p) {
    let best = Infinity, idx = 0;
    for (let i = 0; i < line.length - 1; i++) { const d = segDist(p, line[i], line[i + 1]); if (d < best) { best = d; idx = i; } }
    if (line.length === 1) best = dist(line[0], p);
    return { d: best, idx };
  }
  const BLOCKING = { 8: 'Road closed', 11: 'Flooded road' };
  const SLOW = { 1: 'Accident', 7: 'Lane closed', 9: 'Road works', 14: 'Broken-down vehicle', 3: 'Dangerous conditions' };
  const NEWS = { crash: 'Crash reported', flood: 'Flooding reported', protest: 'Protest / unrest', fire: 'Fire', explosion: 'Explosion', shooting: 'Shooting', collapse: 'Collapse', attack: 'Attack', storm: 'Storm damage' };
  const fmt = s => { s = Math.round(s / 60); return s < 60 ? s + ' min' : Math.floor(s / 60) + ' h ' + String(s % 60).padStart(2, '0') + ' min'; };

  /**
   * routes: [{ id, line:[[lon,lat]...], length (m), time (s, with traffic if known), noTrafficTime (s),
   *            trafficIncluded (bool), sections:[{kind:'jam'|'roadworks'|'closure'|'other', from, to, delay, speed, magnitude, label}],
   *            limits:[{from, to, kmh}] }]   (from/to are point indexes into line)
   * ctx:    { incidents:[{cat, kind, lat, lon, line, description, road, delay}], cameras:[{lat, lon, maxspeed}],
   *           news:[{lat, lon, type, label, text, id}], tolerance (m, default 60) }
   */
  function analyse(routes, ctx = {}) {
    const tol = ctx.tolerance || 60;
    const out = routes.map((r, n) => {
      const line = r.line, cum = [0];
      for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
      const length = r.length || cum[cum.length - 1];
      const notes = [], closures = [], slow = [], news = [], cameras = [];
      const jams = (r.sections || []).filter(s => s.kind === 'jam' || s.kind === 'roadworks').map(s => ({ label: s.label || (s.kind === 'jam' ? 'Congestion' : 'Road works'), delay: s.delay || 0, speed: s.speed, magnitude: s.magnitude, at: line[Math.min(line.length - 1, s.from || 0)], km: (cum[Math.min(cum.length - 1, s.to || 0)] - cum[Math.min(cum.length - 1, s.from || 0)]) / 1000 }));
      for (const s of r.sections || []) if (s.kind === 'closure') closures.push({ label: s.label || 'Road closed', at: line[Math.min(line.length - 1, s.from || 0)], source: 'route' });
      let extraDelay = 0, slowDelay = 0;
      // incidents from the traffic feed that sit on this route
      for (const i of ctx.incidents || []) {
        const pts = i.line && i.line.length ? i.line : [[i.lon, i.lat]];
        const d = Math.min(...pts.map(p => near(line, p).d));
        if (d > tol) continue;
        if (BLOCKING[i.cat]) { if (!closures.some(c => dist(c.at, pts[0]) < 300)) closures.push({ label: BLOCKING[i.cat], detail: i.description, road: i.road, at: [i.lon, i.lat], source: 'traffic', cat: i.cat }); }
        else if (SLOW[i.cat]) { slow.push({ label: SLOW[i.cat], detail: i.description, road: i.road, at: [i.lon, i.lat] }); if (!r.trafficIncluded) { const d = i.cat === 1 ? 420 : 180; extraDelay += d; slowDelay += d; } }
        else if (i.cat === 6 && !r.trafficIncluded) { jams.push({ label: 'Congestion' + (i.road ? ' on ' + i.road : ''), delay: i.delay || 300, magnitude: i.magnitude, at: [i.lon, i.lat] }); extraDelay += i.delay || 300; }
      }
      // incidents reported in the news within 300 m of the route in the last few hours
      for (const p of ctx.news || []) {
        if (!NEWS[p.type]) continue;
        const d = near(line, [p.lon, p.lat]).d;
        if (d < 300) news.push({ label: NEWS[p.type], detail: (p.text || '').slice(0, 140), at: [p.lon, p.lat], id: p.id });
      }
      // speed cameras on the route, with the limit at that point
      for (const c of ctx.cameras || []) {
        const m = near(line, [c.lon, c.lat]);
        if (m.d > Math.max(35, tol / 2)) continue;
        const lim = (r.limits || []).find(l => m.idx >= l.from && m.idx < l.to);
        cameras.push({ lat: c.lat, lon: c.lon, maxspeed: c.maxspeed || (lim && lim.kmh) || null, km: cum[m.idx] / 1000 });
      }
      cameras.sort((a, b) => a.km - b.km);
      // speed limits: the route can't legally be faster than driving every stretch at its limit
      let legal = 0, covered = 0, wsum = 0, max = 0;
      for (const l of r.limits || []) {
        if (!l.kmh) continue;
        const len = cum[Math.min(cum.length - 1, l.to)] - cum[Math.min(cum.length - 1, l.from)];
        legal += len / (l.kmh / 3.6); covered += len; wsum += l.kmh * len; max = Math.max(max, l.kmh);
      }
      let time = (r.time || length / 11) + extraDelay;
      if (covered > length * 0.5) {
        const legalAll = legal + (length - covered) / 13.9; // uncovered stretches at 50 km/h
        if (time < legalAll) { notes.push('Time adjusted to keep within speed limits'); time = legalAll; }
      }
      const delay = jams.reduce((a, j) => a + j.delay, 0);
      const blocked = closures.length > 0;
      const risk = news.length * 240 + slow.filter(s => r.trafficIncluded).length * 60;
      const score = time + risk + cameras.length * 8 + (blocked ? 1e6 : 0);
      return Object.assign({}, r, { n, length, eta: Math.round(time), delay: Math.round(delay + slowDelay), blocked, closures, slow, news, cameras, jams,
        limitAvg: covered ? Math.round(wsum / covered) : null, limitMax: max || null, limitCoverage: length ? covered / length : 0, score, notes });
    });
    const ranked = out.slice().sort((a, b) => a.score - b.score);
    ranked.forEach((r, i) => { r.rank = i + 1; r.label = String.fromCharCode(65 + i); });
    const best = ranked[0];
    return { routes: ranked, best: best && best.id, summary: best ? explain(ranked) : 'No route found.' };
  }

  const desc = cl => [...new Set(cl.map(c => c.label.toLowerCase() + (c.road ? ' on ' + c.road : '')))].join(' and ');
  function explain(ranked) {
    const b = ranked[0], o = ranked.slice(1);
    const parts = [`Route ${b.label} is the best option: about ${fmt(b.eta)} for ${(b.length / 1000).toFixed(1)} km`];
    if (b.delay > 60) parts[0] += `, including ${fmt(b.delay)} of traffic delay`;
    parts[0] += '.';
    if (o.length) {
      const nx = o[0], gain = nx.eta - b.eta;
      const why = [];
      if (nx.blocked) why.push(`route ${nx.label} runs into ${desc(nx.closures)}`);
      else if (gain > 30) why.push(`it saves ${fmt(gain)} over route ${nx.label}`);
      else why.push(`it is about the same time as route ${nx.label}`);
      if (nx.delay - b.delay > 120) why.push(`avoids ${fmt(nx.delay - b.delay)} more congestion`);
      if (nx.news.length > b.news.length) why.push(`passes fewer reported incidents (${nx.news.map(n => n.label.toLowerCase()).slice(0, 2).join(', ')})`);
      if (!nx.blocked && Math.abs(gain) <= 30 && b.cameras.length < nx.cameras.length) why.push('has fewer speed cameras');
      parts.push('It was chosen because ' + why.join(', ') + '.');
      const blk = o.filter(r => r.blocked && r !== nx);
      if (blk.length) parts.push(`Avoided: ${blk.map(r => `route ${r.label} (${desc(r.closures)})`).join('; ')}.`);
    }
    if (b.closures.length && !b.blocked) parts.push(`Note: ${b.closures.map(c => c.label).join(', ')} reported near the route.`);
    if (b.cameras.length) {
      const lims = [...new Set(b.cameras.map(c => c.maxspeed).filter(Boolean))];
      parts.push(`${b.cameras.length} speed camera${b.cameras.length > 1 ? 's' : ''} on the way${lims.length ? ' (limits ' + lims.join(' / ') + ' km/h)' : ''}.`);
    }
    if (b.limitAvg) parts.push(`Average speed limit ${b.limitAvg} km/h${b.limitMax > b.limitAvg ? ', up to ' + b.limitMax + ' km/h' : ''}.`);
    if (b.news.length) parts.push(`Watch for: ${b.news.map(n => n.label.toLowerCase()).join(', ')} reported nearby.`);
    if (b.notes.length) parts.push(b.notes.join('. ') + '.');
    return parts.join(' ');
  }

  // Google Maps directions link that follows the chosen route (up to 8 via points)
  function googleLink(route) {
    const L = route.line, a = L[0], b = L[L.length - 1], via = [];
    for (let i = 1; i <= 8; i++) { const p = L[Math.floor(i * (L.length - 1) / 9)]; if (p) via.push(p[1].toFixed(5) + ',' + p[0].toFixed(5)); }
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + a[1].toFixed(5) + ',' + a[0].toFixed(5) + '&destination=' + b[1].toFixed(5) + ',' + b[0].toFixed(5) + '&waypoints=' + encodeURIComponent(via.join('|'));
  }

  return { analyse, explain, googleLink, dist, near, fmt };
});
