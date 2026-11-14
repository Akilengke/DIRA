// Earth-observation feeds: all free and keyless.
//  • USGS earthquakes (past 24h)          • NASA EONET natural events (wildfires, storms, volcanoes, floods, ice)
//  • GDELT GEO news-event locations         • Open-Meteo current weather for monitored cities
//  • NASA GIBS daily satellite mosaic (proxied & cached by /api/satellite)
'use strict';
const { getJSON, request } = require('./http');
const { CITIES } = require('../../public/js/core');

async function earthquakes() {
  const j = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
  return j.features.map(f => ({
    id: 'eq_' + f.id, layer: 'quake', title: f.properties.title, mag: f.properties.mag, ts: f.properties.time,
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2], url: f.properties.url,
    severity: f.properties.mag >= 6 ? 'critical' : f.properties.mag >= 4.5 ? 'warning' : 'info', tsunami: !!f.properties.tsunami
  }));
}

async function naturalEvents() {
  const j = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=300');
  return j.events.map(e => {
    const g = e.geometry[e.geometry.length - 1];
    let [lon, lat] = g.type === 'Point' ? g.coordinates : g.coordinates[0][0];
    const cat = e.categories[0]?.id || 'other';
    return { id: 'eo_' + e.id, layer: 'nature', category: cat, title: e.title, ts: Date.parse(g.date), lat, lon, url: e.sources[0]?.url,
      severity: cat === 'severeStorms' || cat === 'volcanoes' ? 'warning' : 'info' };
  });
}

async function newsEvents(query) {
  const q = query && query.length ? query.slice(0, 4).map(t => t.includes(' ') ? `"${t}"` : t.replace(/^#/, '')).join(' OR ') : 'protest OR election OR crisis OR flood OR attack';
  const j = await getJSON(`https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(q)}&format=GeoJSON&timespan=24h&maxpoints=150`);
  return (j.features || []).map((f, i) => ({
    id: 'ge_' + i + '_' + (f.properties.name || '').slice(0, 20), layer: 'news', title: f.properties.name, count: f.properties.count,
    html: f.properties.html, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], ts: Date.now(), severity: f.properties.count > 50 ? 'warning' : 'info'
  }));
}

// Open-Meteo accepts comma-separated coordinate lists: one request covers every city.
async function weather() {
  const cities = CITIES;
  const lat = cities.map(c => c.lat).join(','), lon = cities.map(c => c.lon).join(',');
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&timezone=UTC`);
  const arr = Array.isArray(j) ? j : [j];
  return arr.map((w, i) => ({
    id: 'wx_' + cities[i].city, layer: 'weather', city: cities[i].city, country: cities[i].country, lat: cities[i].lat, lon: cities[i].lon,
    temp: w.current.temperature_2m, humidity: w.current.relative_humidity_2m, wind: w.current.wind_speed_10m, precip: w.current.precipitation,
    code: w.current.weather_code, ts: Date.parse(w.current.time + 'Z'),
    severity: w.current.wind_speed_10m > 60 || w.current.precipitation > 10 || w.current.temperature_2m > 42 ? 'warning' : 'info'
  }));
}

// NASA GIBS true-colour mosaic, equirectangular, matching the map projection.
const satCache = new Map();
async function satellite(date, layer) {
  // Whitelisted GIBS layers: daily true colour, VIIRS true colour, Black Marble night lights.
  const LAYERS = { true: ['MODIS_Terra_CorrectedReflectance_TrueColor', null], viirs: ['VIIRS_SNPP_CorrectedReflectance_TrueColor', null], night: ['VIIRS_Black_Marble', '2016-01-01'] };
  const [L, fixed] = LAYERS[layer] || LAYERS.true;
  const d = fixed || (/^\d{4}-\d\d-\d\d$/.test(date || '') ? date : new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const key = d + L;
  if (satCache.has(key)) return satCache.get(key);
  const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${L}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&TIME=${d}`;
  const res = await request(url, { timeout: 45000, headers: { Accept: 'image/jpeg' } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (satCache.size > 6) satCache.delete(satCache.keys().next().value);
  satCache.set(key, buf);
  return buf;
}

module.exports = { earthquakes, naturalEvents, newsEvents, weather, satellite };
