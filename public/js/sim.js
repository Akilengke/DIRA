/* Scavenge simulator — synthetic, clearly-labelled data for the demo/test site and offline mode.
 * Generates a realistic-looking multi-platform stream with topic surges, plus earth events. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScavengeSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = Math.random;
  const pick = a => a[Math.floor(R() * a.length)];
  const wpick = obj => { const e = Object.entries(obj); let t = e.reduce((a, [, w]) => a + w, 0) * R(); for (const [k, w] of e) if ((t -= w) <= 0) return k; return e[0][0]; };

  const PLATFORMS = { x: 26, facebook: 16, reddit: 12, news: 12, bluesky: 8, linkedin: 7, mastodon: 6, youtube: 5, hackernews: 4 };
  const LANG = { Japan: 'ja', Brazil: 'pt', Germany: 'de', France: 'fr', Spain: 'es', Korea: 'ko' };

  const TOPICS = [
    { k: 'election', w: 9, where: ['United States'], t: [
      'Midterm results still coming in from {city}, turnout looks like a record #Midterms2026',
      'Counting delayed in several districts near {city}. Officials ask for patience #Midterms2026',
      'Watching the midterm results live. This race is far too close to call #ElectionNight',
      'Long queues reported at polling stations in {city} yesterday, great to see people voting',
      'Analysis: what the midterm results mean for markets and the economy',
      'Concern over misinformation about vote counting spreading online #Midterms2026']},
    { k: 'rain', w: 7, where: ['Kenya', 'Uganda', 'Tanzania', 'Ethiopia'], t: [
      'Heavy rain in {city} this evening, roads flooding near the CBD. Stay safe #KenyaRains',
      'Short rains have arrived in {city}. Farmers are hopeful for a good season',
      'Flood warning issued for low-lying areas around {city} #KenyaRains',
      'Matatu fares up again in {city} because of the rain traffic. Commuters angry',
      'Landslide risk rising in the highlands after three days of heavy rain near {city}',
      'Beautiful green hills around {city} after the rains, love this season']},
    { k: 'ai', w: 8, where: ['United States', 'United Kingdom', 'India', 'China', 'Kenya', 'Germany', 'Korea'], t: [
      'New open-source AI model released today, benchmarks look impressive #AI',
      'AI startups in {city} are hiring fast. Great time to be an engineer',
      'Worried about AI replacing customer support jobs in {city}',
      'Our team in {city} shipped an AI assistant for farmers, huge success in the pilot #AI',
      'Regulators in {country} propose new rules on AI safety and transparency',
      'GPU shortage again, cloud prices keep rising for AI training']},
    { k: 'climate', w: 6, where: ['Turkey', 'Brazil', 'India', 'Kenya', 'United Kingdom', 'Australia'], t: [
      'Delegates gather for #COP31 climate talks, finance for adaptation is the big issue',
      'Activists protest in {city} demanding faster action on emissions #COP31',
      'Record heat in {city} for November, this is not normal #ClimateCrisis',
      'Solar adoption in {country} hits a new record, great progress',
      'Drought hurting harvests across {country}, food prices expected to rise']},
    { k: 'football', w: 6, where: ['Spain', 'United Kingdom', 'Germany', 'Italy', 'France', 'Nigeria', 'Kenya', 'Brazil'], t: [
      'What a win tonight! #ChampionsLeague matchday was amazing',
      'Fans celebrating in {city} after last minute winner #UCL',
      'Terrible refereeing again, VAR is ruining the game #ChampionsLeague',
      'Watching the match at a pub in {city}, the atmosphere is brilliant']},
    { k: 'crypto', w: 4, where: ['United States', 'Korea', 'Nigeria', 'Brazil', 'Turkey'], t: [
      'Bitcoin breaks above a key level, traders thrilled #BTC',
      'Crypto exchange outage frustrating users in {country} #BTC',
      'Beware of a new crypto scam targeting people in {city}',
      'Stablecoin payments growing fast in {country}, cheaper than remittance fees']},
    { k: 'fuel', w: 4, where: ['Kenya', 'Nigeria', 'Pakistan', 'South Africa', 'India'], t: [
      'Fuel prices hike announced in {country}, transport costs will go up again',
      'Long queues at petrol stations in {city} after the fuel shortage rumours',
      'Fuel price review: drivers in {city} brace for higher pump prices #FuelPrices']},
    { k: 'quake', w: 2, where: ['Japan', 'Indonesia', 'Turkey', 'Chile', 'Philippines', 'Mexico'], t: [
      'Did anyone else feel that earthquake in {city}? Buildings were shaking #earthquake',
      'Strong earthquake felt across {country}, no reports of damage yet #earthquake',
      'Emergency services responding after the quake near {city}']},
    { k: 'tech', w: 4, where: ['United States', 'India', 'Kenya', 'Nigeria', 'Germany'], t: [
      'Major cloud outage hitting apps across {country} right now #outage',
      'Mobile money services down for some users in {city} this morning',
      'Startup in {city} raises a big seed round, proud of the local ecosystem',
      'Hiring: senior engineers in {city}, remote friendly #hiring']},
    { k: 'conflict', w: 4, where: ['Ethiopia', 'Sudan', 'Ukraine', 'Israel', 'Dem. Rep. Congo', 'Somalia'], t: [
      'Ceasefire talks resume in {city} as mediators push for a deal',
      'Humanitarian aid convoy leaves {city}, refugees still arriving at the border',
      'Drone attacks reported overnight near {city}, residents shelter in basements',
      'Defence ministers meet in {city} to discuss the conflict and new sanctions',
      'Peace talks hosted in {city} end without agreement, troops remain on the frontline']},
    { k: 'economy', w: 5, where: ['Kenya', 'United States', 'Nigeria', 'United Kingdom', 'India', 'China', 'Brazil'], t: [
      'Central bank of {country} holds interest rates steady, inflation easing',
      'Stock market in {city} rallies on strong earnings #markets',
      'Currency weakens against the dollar again, importers in {city} worried',
      'New budget in {country} raises taxes on mobile money, traders angry',
      'Unemployment falls in {country}, good news for young job seekers',
      'IMF loan talks with {country} continue as debt payments loom']},
    { k: 'health', w: 2, where: ['Kenya', 'Nigeria', 'India', 'Dem. Rep. Congo', 'Bangladesh'], t: [
      'Cholera cases rising in {city}, hospitals ask residents to boil water',
      'Free vaccination drive in {city} this week, great turnout so far',
      'Doctors in {country} threaten strike over unpaid salaries']},
    { k: 'storm', w: 3, where: ['Philippines', 'Vietnam', 'Japan', 'United States', 'Mexico'], t: [
      'Typhoon warning raised for {city}, schools closed tomorrow',
      'Storm surge flooding the coast near {city}, rescue teams deployed',
      'Power outage across {city} after the storm, hope everyone is safe']}
  ];
  const HANDLES = ['nova', 'orbit', 'kilo', 'vanta', 'delta', 'ember', 'lumen', 'atlas', 'echo', 'zuri', 'baraka', 'amani', 'pixel', 'quartz', 'raven', 'sol', 'tengo', 'wanjiku', 'kito', 'mira', 'otieno', 'ndegwa', 'chen', 'sato', 'ade', 'luca', 'ines', 'yara'];
  const SUFFIX = ['_ke', '_news', 'watch', '254', '_dev', 'hq', '_live', 'fm', '', '', ''];

  function create(core) {
    const byCountry = {};
    core.CITIES.forEach(c => (byCountry[c.country] = byCountry[c.country] || []).push(c));
    let n = 0;
    const weights = Object.fromEntries(TOPICS.map(t => [t.k, t.w]));
    let surge = { k: 'rain', until: Date.now() + 120000 };

    function post(ts) {
      const live = Object.assign({}, weights);
      if (surge && Date.now() < surge.until) live[surge.k] *= 5;
      const key = wpick(live); const topic = TOPICS.find(t => t.k === key);
      const country = pick(topic.where);
      const city = pick(byCountry[country] || core.CITIES);
      const platform = wpick(PLATFORMS);
      let text = pick(topic.t).replace(/#KenyaRains/g, '#' + country.replace(/[^A-Za-z]/g, '') + 'Rains').replace(/\{city\}/g, city.city).replace(/\{country\}/g, country);
      if (R() < 0.5 && !text.includes(city.city)) text += ' — ' + city.city;
      const author = platform === 'news' ? pick(['dailywire.example', 'globedesk.example', 'eastafricanow.example', 'metrotimes.example']) : platform === 'reddit' ? 'u/' + pick(HANDLES) + Math.floor(R() * 900) : '@' + pick(HANDLES) + pick(SUFFIX);
      const id = 'sim_' + (ts || Date.now()).toString(36) + '_' + (n++);
      return { id, platform, author, text, ts: ts || Date.now() - Math.floor(R() * 4000), lang: LANG[country] && R() < 0.3 ? LANG[country] : 'en', url: null, simulated: true,
        lat: city.lat + (R() - 0.5) * 0.6, lon: city.lon + (R() - 0.5) * 0.6, country, city: city.city, metrics: { likes: Math.floor(R() ** 3 * 4000) } };
    }

    function burst() {
      if (!surge || Date.now() > surge.until + 60000) surge = { k: pick(TOPICS).k, until: Date.now() + 90000 + R() * 120000 };
      const k = 1 + Math.floor(R() * 4);
      return Array.from({ length: k }, () => post());
    }

    function backfill(count) {
      const now = Date.now(), out = [];
      for (let i = 0; i < count; i++) out.push(post(now - Math.floor((R() ** 0.8) * 60 * 60000)));
      return out.sort((a, b) => a.ts - b.ts);
    }

    const QUAKE_ZONES = [[35.6, 140.2, 'Honshu, Japan'], [-6.5, 105.4, 'Sunda Strait, Indonesia'], [-33, -71.6, 'Valparaíso, Chile'], [60.5, -152, 'Southern Alaska'], [38.4, 38.3, 'Malatya, Türkiye'], [14.2, -91.9, 'Coast of Guatemala'], [-41.3, 174.8, 'Cook Strait, New Zealand'], [36.1, 70.9, 'Hindu Kush, Afghanistan'], [12.4, 124.6, 'Samar, Philippines'], [-2.9, 35.9, 'Gregory Rift, Tanzania'], [19.4, -155.3, 'Island of Hawaii'], [-15.6, -173, 'Tonga'], [37.7, 20.8, 'Ionian Sea, Greece'], [-20, -69, 'Tarapacá, Chile']];
    const NATURE = [['wildfires', 34.2, -118.4, 'Wildfire — Los Angeles County, CA'], ['wildfires', -33.7, 150.3, 'Bushfire — Blue Mountains, NSW'], ['wildfires', -8.5, -55, 'Fire cluster — Pará, Brazil'], ['wildfires', 8.9, 7.3, 'Savanna fires — Central Nigeria'],
      ['severeStorms', 14.2, 128.5, 'Tropical Storm — Western Pacific'], ['severeStorms', 16.5, -85, 'Tropical Depression — Caribbean'], ['severeStorms', -14, 61, 'Tropical Cyclone — South Indian Ocean'],
      ['volcanoes', 63.9, -22.3, 'Reykjanes volcano, Iceland'], ['volcanoes', -7.54, 110.44, 'Merapi, Indonesia'], ['volcanoes', -1.52, 29.25, 'Nyiragongo, DR Congo'], ['volcanoes', 37.75, 14.99, 'Etna, Italy'],
      ['floods', -0.5, 36.1, 'Flooding — Rift Valley, Kenya'], ['floods', 23.7, 90.4, 'Flooding — Dhaka, Bangladesh'], ['seaLakeIce', -75, -100, 'Iceberg A-23 drift, Southern Ocean'], ['dustHaze', 18, 5, 'Saharan dust plume']];

    function events() {
      const now = Date.now();
      const quake = QUAKE_ZONES.map(([lat, lon, place], i) => { const mag = +(2.6 + R() ** 2 * 4.4).toFixed(1); return { id: 'sim_eq' + i, layer: 'quake', title: `M ${mag} — ${place}`, mag, lat: lat + (R() - .5), lon: lon + (R() - .5), depth: Math.round(5 + R() * 80), ts: now - R() * 86400000, severity: mag >= 6 ? 'critical' : mag >= 4.5 ? 'warning' : 'info', simulated: true }; });
      const nature = NATURE.map(([category, lat, lon, title], i) => ({ id: 'sim_eo' + i, layer: 'nature', category, title, lat, lon, ts: now - R() * 5 * 86400000, severity: category === 'severeStorms' || category === 'volcanoes' ? 'warning' : 'info', simulated: true }));
      const news = core.CITIES.filter(() => R() < 0.35).map((c, i) => { const count = Math.floor(R() ** 2 * 120) + 3; return { id: 'sim_ge' + i, layer: 'news', title: `${c.city}: ${count} news reports`, count, lat: c.lat, lon: c.lon, ts: now, severity: count > 50 ? 'warning' : 'info', simulated: true }; });
      const month = new Date().getUTCMonth();
      const weather = core.CITIES.map(c => {
        const seasonal = Math.cos(((month - (c.lat >= 0 ? 6.5 : 0.5)) / 12) * 2 * Math.PI);
        const temp = +(27 - Math.abs(c.lat) * 0.42 + seasonal * Math.min(Math.abs(c.lat), 50) * 0.28 + (R() - 0.5) * 5).toFixed(1);
        const rainy = R() < 0.25; const wind = +(4 + R() ** 2 * 45).toFixed(1);
        return { id: 'wx_' + c.city, layer: 'weather', city: c.city, country: c.country, lat: c.lat, lon: c.lon, temp, humidity: Math.round(40 + R() * 55), wind, precip: rainy ? +(R() * 14).toFixed(1) : 0, code: rainy ? pick([61, 63, 80, 95]) : pick([0, 1, 2, 3]), ts: now, severity: wind > 40 || temp > 40 ? 'warning' : 'info', simulated: true };
      });
      return { quake, nature, news, weather };
    }

    // ---- emergencies & radio (all clearly simulated) ----
    const INCIDENTS = [
      { kind: 'aircraft', squawk: '7700', title: 'Flight KQ-SIM 312 squawking 7700 (general emergency)', detail: 'B737 descending through FL180, 42 nm east of Mombasa', lat: -3.9, lon: 40.3, severity: 'critical', country: 'Kenya' },
      { kind: 'aircraft', squawk: '7600', title: 'Flight SIM 88 squawking 7600 (radio failure)', detail: 'A320 at FL350 over northern Sudan, track 160°', lat: 18.2, lon: 31.9, severity: 'warning', country: 'Sudan' },
      { kind: 'maritime', title: 'MAYDAY relay — fishing vessel taking on water', detail: '6 persons on board, 18 nm SE of Mombasa, VHF 16', lat: -4.25, lon: 39.95, severity: 'critical', country: 'Kenya' },
      { kind: 'disaster', title: 'GDACS orange alert — flooding, Tana River basin', detail: 'Estimated 40,000 people affected', lat: -1.5, lon: 40.0, severity: 'warning', country: 'Kenya' },
      { kind: 'disaster', title: 'GDACS red alert — tropical cyclone, Bay of Bengal', detail: 'Category 3, landfall expected in 36 h', lat: 17.5, lon: 88.5, severity: 'critical', country: 'Bangladesh' },
      { kind: 'weather', title: 'Extreme heat warning — Rajasthan', detail: 'Max 46 °C expected, issued by national met service', lat: 26.9, lon: 75.8, severity: 'warning', country: 'India' },
      { kind: 'weather', title: 'Tornado warning — North Texas', detail: 'Radar-indicated rotation near Denton', lat: 33.2, lon: -97.1, severity: 'critical', country: 'United States' },
      { kind: 'maritime', title: 'PAN-PAN — yacht with engine failure', detail: 'Drifting 9 nm off Cape Point, 3 on board', lat: -34.45, lon: 18.6, severity: 'warning', country: 'South Africa' }
    ];
    function incidents() { const now = Date.now(); return INCIDENTS.map((x, i) => Object.assign({ id: 'sim_inc' + i, layer: 'emergency', source: x.kind === 'aircraft' ? 'ADS-B (adsb.lol)' : x.kind === 'disaster' ? 'GDACS' : x.kind === 'weather' ? 'Weather service' : 'Radio', ts: now - (i + 1) * 7 * 60000, simulated: true }, x)); }

    const TX = [
      ['156.800', 'VHF 16', 'fm', 'MAYDAY MAYDAY MAYDAY, this is fishing vessel Baraka, Baraka, Baraka. Position 18 miles south east of Mombasa. Taking on water, six persons on board, require immediate assistance. Over.', -4.25, 39.95],
      ['156.800', 'VHF 16', 'fm', 'Fishing vessel Baraka, this is Mombasa Radio. Received MAYDAY. Rescue boat dispatched, estimated time 40 minutes. Put on life jackets. Over.', -4.06, 39.67],
      ['156.800', 'VHF 16', 'fm', 'Mombasa Port Control, this is motor vessel Amani, request pilot boarding at the fairway buoy at 1400. Over.', -4.07, 39.69],
      ['121.500', 'Air guard', 'am', 'PAN-PAN PAN-PAN PAN-PAN, Nairobi Control, Kilo Quebec three one two, cabin pressure problem, descending to flight level one zero zero. ', -3.9, 40.3],
      ['2182', '2182 kHz', 'usb', 'Sécurité, sécurité, sécurité. All ships, this is Cape Town Radio. Navigation warning, unlit buoy adrift off Robben Island. Out.', -33.9, 18.4],
      ['14300', '14.300 MHz', 'usb', 'This is the maritime mobile net, any stations with emergency or priority traffic please call now.', 27, -82],
      ['7110', '7.110 MHz', 'lsb', 'Emergency net control for the flood response. Shelter at Garissa reports 300 people, needs drinking water and medical supplies.', -0.45, 39.65],
      ['145.500', '2 m calling', 'fm', 'Any station, any station, this is a portable station on the Nakuru road, road closed by flooding at the bridge, please relay to traffic police.', -0.3, 36.08]
    ];
    let txi = 0;
    function transmission() {
      const [freq, channel, mode, text, lat, lon] = TX[txi++ % TX.length];
      return { id: 'sim_rx' + Date.now().toString(36) + txi, freq, channel, mode, text, lat, lon, ts: Date.now(), duration: +(3 + text.length / 16).toFixed(1), distress: core.distress(text), simulated: true };
    }

    return { post, burst, backfill, events, incidents, transmission };
  }

  return { create, PLATFORMS: Object.keys(PLATFORMS) };
});
