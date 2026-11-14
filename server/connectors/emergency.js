// Emergency incident feeds — free and keyless.
//  • Aircraft squawking emergency codes (7700 general, 7600 radio failure, 7500 unlawful interference) via adsb.lol
//  • GDACS global disaster alerts (UN / EU JRC): cyclones, floods, quakes, volcanoes, droughts, wildfires
//  • US National Weather Service extreme & severe warnings
'use strict';
const { getJSON } = require('./http');
const core = require('../../public/js/core');

const SQUAWK = { 7700: ['general emergency', 'critical'], 7600: ['radio failure', 'warning'], 7500: ['unlawful interference', 'critical'] };

async function aircraft() {
  const out = [];
  for (const code of Object.keys(SQUAWK)) {
    try {
      const j = await getJSON(`https://api.adsb.lol/v2/sqk/${code}`);
      for (const a of j.ac || []) {
        if (a.lat == null) continue;
        const call = (a.flight || a.r || a.hex || '').trim();
        out.push({
          id: `ac_${a.hex}_${code}`, layer: 'emergency', kind: 'aircraft', squawk: code, source: 'ADS-B (adsb.lol)',
          title: `${call || 'Unknown aircraft'} squawking ${code} (${SQUAWK[code][0]})`,
          detail: [a.t, a.alt_baro != null ? (a.alt_baro === 'ground' ? 'on ground' : `${a.alt_baro} ft`) : null, a.gs ? `${Math.round(a.gs)} kt` : null, a.emergency && a.emergency !== 'none' ? `emergency: ${a.emergency}` : null].filter(Boolean).join(' · '),
          lat: a.lat, lon: a.lon, track: a.track, ts: Date.now() - (a.seen || 0) * 1000, severity: SQUAWK[code][1],
          url: `https://globe.adsb.lol/?icao=${a.hex}`, country: nearestCountry(a.lat, a.lon)
        });
      }
    } catch (e) { if (code === '7700') throw e; }
  }
  return out;
}

async function gdacs() {
  const j = await getJSON('https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP', { timeout: 25000 });
  const TYPE = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire', TS: 'Tsunami' };
  return (j.features || []).filter(f => f.geometry && f.geometry.type === 'Point' && /orange|red/i.test(f.properties.alertlevel || '')).map(f => {
    const p = f.properties;
    return {
      id: `gd_${p.eventtype}_${p.eventid}`, layer: 'emergency', kind: 'disaster', source: 'GDACS',
      title: `GDACS ${String(p.alertlevel).toLowerCase()} alert — ${TYPE[p.eventtype] || p.eventtype}${p.country ? ', ' + p.country : ''}`,
      detail: p.severitydata?.severitytext || p.description || p.name || '', lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      ts: Date.parse(p.fromdate || p.datemodified) || Date.now(), severity: /red/i.test(p.alertlevel) ? 'critical' : 'warning',
      url: p.url?.report || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`, country: p.country
    };
  });
}

async function nws() {
  const j = await getJSON('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', { headers: { Accept: 'application/geo+json' } });
  return (j.features || []).filter(f => f.geometry).slice(0, 150).map(f => {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const [lon, lat] = ring.reduce((a, c) => [a[0] + c[0] / ring.length, a[1] + c[1] / ring.length], [0, 0]);
    const p = f.properties;
    return { id: 'nws_' + p.id.split('/').pop(), layer: 'emergency', kind: 'weather', source: 'US National Weather Service', title: p.event + ' — ' + (p.areaDesc || '').split(';')[0],
      detail: p.headline || '', lat, lon, ts: Date.parse(p.sent), severity: p.severity === 'Extreme' ? 'critical' : 'warning', url: p['@id'] || p.id, country: 'United States' };
  });
}

function nearestCountry(lat, lon) {
  let best = null, d = Infinity;
  for (const c of core.CITIES) { const x = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (x < d) { d = x; best = c; } }
  return d < 60 ? best.country : null;
}

module.exports = { aircraft, gdacs, nws, nearestCountry };
