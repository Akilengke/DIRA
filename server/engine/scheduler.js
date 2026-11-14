// Polls every connector on its own cadence, enriches posts with AI analysis, feeds alerts, pushes to clients.
'use strict';
const core = require('../../public/js/core');
const social = require('../connectors/social');
const earth = require('../connectors/earth');
const emergency = require('../connectors/emergency');
const { state, addPost, markDirty } = require('./store');
const alerts = require('./alerts');

let broadcast = () => {};
const SOCIAL_MS = (+process.env.POLL_SOCIAL_SEC || 90) * 1000;
const EVENTS_MS = (+process.env.POLL_EVENTS_SEC || 300) * 1000;
const WEATHER_MS = (+process.env.POLL_WEATHER_SEC || 900) * 1000;
const AIR_MS = (+process.env.POLL_AIRCRAFT_SEC || 60) * 1000;
const SEEN_INC = new Set();

function watchTerms() {
  const t = new Set(state.watch.map(s => s.trim()).filter(Boolean));
  state.rules.filter(r => r.enabled !== false).forEach(r => r.terms.forEach(x => x && t.add(x.replace(/^"|"$/g, ''))));
  return [...t];
}

function setStatus(id, label, ok, info) {
  state.sources[id] = Object.assign(state.sources[id] || { id, label }, { ok, at: Date.now(), info });
  broadcast('source', state.sources[id]);
}

function ingest(raw) {
  let n = 0;
  for (const r of raw) {
    if (!r.text || state.seen.has(r.id)) continue;
    const p = core.enrich(r);
    if (!p.country && r.sourceCountry) { const c = core.geotag(r.sourceCountry); Object.assign(p, c, { geoSource: 'source' }); }
    if (r.platform === 'emergency' || r.platform === 'radio') p.topics = [...new Set(['emergency', ...(p.topics || [])])];
    if (addPost(p)) {
      n++; broadcast('post', p); alerts.check(p, broadcast);
      const d = r.platform !== 'emergency' && core.distress(p.text);
      if (d && d.severity !== 'info') addPostIncident(p, d);
    }
  }
  if (n) { markDirty(); alerts.persist(); }
  return n;
}

// A post or radio call that reads as a distress call becomes an incident on the emergency board.
const PLATNAME = k => ({ x: 'X', facebook: 'Facebook', linkedin: 'LinkedIn', reddit: 'Reddit', mastodon: 'Mastodon', bluesky: 'Bluesky', youtube: 'YouTube', hackernews: 'Hacker News', news: 'the news' }[k] || k);
function addPostIncident(p, d) {
  const inc = { id: 'pi_' + p.id, layer: 'emergency', kind: p.platform === 'radio' ? 'radio' : 'social', source: p.platform === 'radio' ? 'Radio · ' + (p.channel || '') : p.platform,
    title: p.platform === 'radio' ? `${d.label} call on ${p.channel || p.author}` : `${d.label} post on ${PLATNAME(p.platform)}: “${p.text.slice(0, 70)}${p.text.length > 70 ? '…' : ''}”`, detail: p.text, lat: p.lat, lon: p.lon, ts: p.ts, severity: d.severity, country: p.country, postId: p.id, url: p.url, simulated: p.simulated };
  state.incidents.posts.unshift(inc);
  state.incidents.posts = state.incidents.posts.filter(x => Date.now() - x.ts < 12 * 3600000).slice(0, 150);
  publishIncidents();
}
function publishIncidents() {
  const sev = { critical: 0, warning: 1, info: 2 };
  state.events.emergency = [...state.incidents.feeds, ...state.incidents.posts].sort((a, b) => sev[a.severity] - sev[b.severity] || b.ts - a.ts);
  broadcast('events', { layer: 'emergency', items: state.events.emergency });
}
// Official incidents also enter the stream as posts, so feeds, alert rules and analytics see them.
function announce(list) {
  const fresh = list.filter(i => !SEEN_INC.has(i.id)); fresh.forEach(i => SEEN_INC.add(i.id));
  ingest(fresh.map(i => ({ id: 'inc_' + i.id, platform: 'emergency', author: i.source, text: `${i.title}. ${i.detail || ''}`.trim(), url: i.url, ts: i.ts || Date.now(), lat: i.lat, lon: i.lon, country: i.country, simulated: i.simulated })));
}
const feedCache = { aircraft: [], gdacs: [], nws: [] };
async function pollEmergency(which) {
  const jobs = which === 'air' ? { aircraft: emergency.aircraft } : { gdacs: emergency.gdacs, nws: emergency.nws };
  for (const [k, fn] of Object.entries(jobs)) {
    try { feedCache[k] = await fn(); setStatus('emg_' + k, { aircraft: 'Aircraft emergency squawks (adsb.lol)', gdacs: 'GDACS disaster alerts', nws: 'US weather warnings (NWS)' }[k], true, feedCache[k].length + ' active'); }
    catch (e) { setStatus('emg_' + k, k, false, e.message); }
  }
  state.incidents.feeds = [...feedCache.aircraft, ...feedCache.gdacs, ...feedCache.nws];
  announce(state.incidents.feeds); publishIncidents();
}

/** Called by the SDR receiver (or the demo) for each received transmission. */
function onTransmission(tx) {
  state.radioLog.unshift(tx); state.radioLog = state.radioLog.slice(0, 300);
  broadcast('radio', tx);
  if (tx.text) ingest([{ id: 'radio_' + tx.id, platform: 'radio', author: tx.channel, channel: tx.channel, text: tx.text, ts: tx.ts, lat: tx.lat, lon: tx.lon, url: tx.clip, simulated: tx.simulated }]);
}

async function pollSocial() {
  if (process.env.SCAVENGE_DEMO === '1') return;
  const terms = watchTerms();
  for (const c of social) {
    if (!c.enabled()) { setStatus(c.id, c.label, null, 'Not configured — needs ' + (c.needs || 'credentials')); continue; }
    try {
      const raw = await c.search(terms);
      const n = ingest(raw);
      setStatus(c.id, c.label, true, `${raw.length} fetched, ${n} new`);
    } catch (e) { setStatus(c.id, c.label, false, e.message); }
  }
}

async function pollEarth(kind) {
  const jobs = kind === 'weather' ? { weather: earth.weather } : { quake: earth.earthquakes, nature: earth.naturalEvents, news: () => earth.newsEvents(state.watch) };
  for (const [layer, fn] of Object.entries(jobs)) {
    try {
      state.events[layer] = await fn();
      setStatus('earth_' + layer, { quake: 'USGS earthquakes', nature: 'NASA EONET', news: 'GDELT news events', weather: 'Open-Meteo weather' }[layer], true, state.events[layer].length + ' items');
      broadcast('events', { layer, items: state.events[layer] });
    } catch (e) { setStatus('earth_' + layer, layer, false, e.message); }
  }
}

function start(bc) {
  broadcast = bc;
  if (process.env.SCAVENGE_DEMO === '1') return startDemo();
  pollSocial(); pollEarth('events'); pollEarth('weather'); pollEmergency('air'); pollEmergency('feeds');
  setInterval(() => pollEmergency('air'), AIR_MS);
  setInterval(() => pollEmergency('feeds'), EVENTS_MS);
  setInterval(pollSocial, SOCIAL_MS);
  setInterval(() => pollEarth('events'), EVENTS_MS);
  setInterval(() => pollEarth('weather'), WEATHER_MS);
}

// Offline demo: synthetic stream so the full UI can be explored without network access.
function startDemo() {
  const sim = require('../../public/js/sim');
  const s = sim.create(core);
  s.backfill(600).forEach(p => ingest([p]));
  Object.assign(state.events, s.events());
  setStatus('demo', 'Simulator', true, 'Synthetic data — SCAVENGE_DEMO=1');
  setInterval(() => ingest(s.burst()), 1500);
  state.incidents.feeds = s.incidents(); announce(state.incidents.feeds); publishIncidents();
  setInterval(() => onTransmission(s.transmission()), 20000);
  setTimeout(() => onTransmission(s.transmission()), 2000);
}

module.exports = { start, pollSocial, watchTerms, onTransmission };
