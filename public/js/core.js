/* Scavenge core analysis engine — shared by the Node backend and the browser.
 * Zero dependencies. Provides: tokenizing, sentiment, geo-tagging, trend detection,
 * rule matching and an automatic text briefing.                                   */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScavengeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- gazetteer
  // [city, country (map name), ISO2, lat, lon, aliases]
  const CITIES = [
    ['Nairobi','Kenya','KE',-1.286,36.817],['Mombasa','Kenya','KE',-4.043,39.668],['Nakuru','Kenya','KE',-0.303,36.08],['Kisumu','Kenya','KE',-0.091,34.768],['Eldoret','Kenya','KE',0.514,35.27],
    ['Kampala','Uganda','UG',0.347,32.582],['Dar es Salaam','Tanzania','TZ',-6.792,39.208],['Kigali','Rwanda','RW',-1.944,30.062],['Addis Ababa','Ethiopia','ET',9.03,38.74],['Mogadishu','Somalia','SO',2.046,45.318],
    ['Khartoum','Sudan','SD',15.5,32.56],['Cairo','Egypt','EG',30.044,31.236],['Lagos','Nigeria','NG',6.524,3.379],['Abuja','Nigeria','NG',9.076,7.399],['Accra','Ghana','GH',5.603,-0.187],
    ['Dakar','Senegal','SN',14.716,-17.467],['Kinshasa','Dem. Rep. Congo','CD',-4.441,15.266],['Luanda','Angola','AO',-8.839,13.289],['Johannesburg','South Africa','ZA',-26.204,28.047],['Cape Town','South Africa','ZA',-33.925,18.424],
    ['Harare','Zimbabwe','ZW',-17.829,31.052],['Lusaka','Zambia','ZM',-15.387,28.323],['Casablanca','Morocco','MA',33.573,-7.59],['Algiers','Algeria','DZ',36.754,3.059],['Tunis','Tunisia','TN',36.806,10.181],
    ['London','United Kingdom','GB',51.507,-0.128],['Manchester','United Kingdom','GB',53.48,-2.242],['Paris','France','FR',48.857,2.352],['Berlin','Germany','DE',52.52,13.405],['Munich','Germany','DE',48.137,11.575],
    ['Madrid','Spain','ES',40.417,-3.704],['Barcelona','Spain','ES',41.385,2.173],['Rome','Italy','IT',41.903,12.496],['Milan','Italy','IT',45.464,9.19],['Amsterdam','Netherlands','NL',52.368,4.904],
    ['Brussels','Belgium','BE',50.85,4.352],['Zurich','Switzerland','CH',47.377,8.541],['Vienna','Austria','AT',48.208,16.374],['Stockholm','Sweden','SE',59.329,18.069],['Oslo','Norway','NO',59.914,10.752],
    ['Warsaw','Poland','PL',52.23,21.012],['Kyiv','Ukraine','UA',50.45,30.524],['Moscow','Russia','RU',55.756,37.617],['Istanbul','Turkey','TR',41.008,28.978],['Athens','Greece','GR',37.984,23.728],
    ['Lisbon','Portugal','PT',38.722,-9.139],['Dublin','Ireland','IE',53.35,-6.26],['Tel Aviv','Israel','IL',32.085,34.782],['Tehran','Iran','IR',35.689,51.389],['Baghdad','Iraq','IQ',33.315,44.366],
    ['Riyadh','Saudi Arabia','SA',24.713,46.675],['Dubai','United Arab Emirates','AE',25.205,55.271],['Doha','Qatar','QA',25.285,51.531],['Karachi','Pakistan','PK',24.861,67.01],['Lahore','Pakistan','PK',31.55,74.343],
    ['Delhi','India','IN',28.614,77.209,['new delhi']],['Mumbai','India','IN',19.076,72.878],['Bengaluru','India','IN',12.972,77.595,['bangalore']],['Kolkata','India','IN',22.573,88.364],['Dhaka','Bangladesh','BD',23.81,90.413],
    ['Kathmandu','Nepal','NP',27.717,85.324],['Colombo','Sri Lanka','LK',6.927,79.861],['Beijing','China','CN',39.904,116.407],['Shanghai','China','CN',31.23,121.474],['Shenzhen','China','CN',22.543,114.058],
    ['Hong Kong','China','HK',22.319,114.169],['Taipei','Taiwan','TW',25.033,121.565],['Tokyo','Japan','JP',35.676,139.65],['Osaka','Japan','JP',34.694,135.502],['Seoul','Korea','KR',37.567,126.978],
    ['Manila','Philippines','PH',14.6,120.984],['Jakarta','Indonesia','ID',-6.208,106.846],['Singapore','Singapore','SG',1.352,103.82],['Kuala Lumpur','Malaysia','MY',3.139,101.687],['Bangkok','Thailand','TH',13.756,100.502],
    ['Hanoi','Vietnam','VN',21.028,105.854],['Ho Chi Minh City','Vietnam','VN',10.823,106.63,['saigon']],['Sydney','Australia','AU',-33.869,151.209],['Melbourne','Australia','AU',-37.814,144.963],['Auckland','New Zealand','NZ',-36.848,174.763],
    ['New York','United States','US',40.713,-74.006,['nyc']],['Washington','United States','US',38.907,-77.037,['washington dc','d.c.']],['Los Angeles','United States','US',34.052,-118.244],['Chicago','United States','US',41.878,-87.63],['Houston','United States','US',29.76,-95.37],
    ['Miami','United States','US',25.762,-80.192],['San Francisco','United States','US',37.775,-122.419],['Seattle','United States','US',47.606,-122.332],['Atlanta','United States','US',33.749,-84.388],['Dallas','United States','US',32.777,-96.797],
    ['Toronto','Canada','CA',43.653,-79.383],['Vancouver','Canada','CA',49.283,-123.121],['Montreal','Canada','CA',45.502,-73.567],['Mexico City','Mexico','MX',19.433,-99.133],['Havana','Cuba','CU',23.113,-82.366],
    ['Bogotá','Colombia','CO',4.711,-74.072,['bogota']],['Caracas','Venezuela','VE',10.481,-66.904],['Lima','Peru','PE',-12.046,-77.043],['Santiago','Chile','CL',-33.449,-70.669],['Buenos Aires','Argentina','AR',-34.604,-58.382],
    ['São Paulo','Brazil','BR',-23.551,-46.633,['sao paulo']],['Rio de Janeiro','Brazil','BR',-22.907,-43.173,['rio']]
  ].map(([city, country, cc, lat, lon, alias]) => ({ city, country, cc, lat, lon, alias: alias || [] }));

  const COUNTRY_ALIASES = {
    'united states': ['usa', 'u.s.', 'america', 'american', 'americans'], 'united kingdom': ['uk', 'britain', 'british', 'england', 'scotland'],
    'kenya': ['kenyan', 'kenyans'], 'nigeria': ['nigerian'], 'south africa': ['south african'], 'china': ['chinese'], 'japan': ['japanese'],
    'india': ['indian'], 'brazil': ['brazilian'], 'germany': ['german'], 'france': ['french'], 'russia': ['russian'], 'ukraine': ['ukrainian'],
    'mexico': ['mexican'], 'canada': ['canadian'], 'australia': ['australian'], 'korea': ['south korea', 'korean'], 'israel': ['israeli'],
    'iran': ['iranian'], 'turkey': ['turkish', 'türkiye'], 'ethiopia': ['ethiopian'], 'uganda': ['ugandan'], 'tanzania': ['tanzanian'],
    'egypt': ['egyptian'], 'pakistan': ['pakistani'], 'indonesia': ['indonesian'], 'philippines': ['filipino'], 'spain': ['spanish'], 'italy': ['italian']
  };
  const COUNTRIES = {};
  CITIES.forEach(c => { if (!COUNTRIES[c.country]) COUNTRIES[c.country] = c; });
  // Language → most likely country, used only when nothing in the text names a place.
  const LANG_COUNTRY = { ja: 'Japan', ko: 'Korea', pt: 'Brazil', de: 'Germany', fr: 'France', it: 'Italy', es: 'Spain', nl: 'Netherlands', pl: 'Poland', tr: 'Turkey', ru: 'Russia', uk: 'Ukraine', sw: 'Kenya', zh: 'China', id: 'Indonesia', th: 'Thailand', vi: 'Vietnam', fa: 'Iran', ar: 'Egypt', hi: 'India', sv: 'Sweden' };

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PLACE_PATTERNS = [];
  CITIES.forEach(c => [c.city, ...c.alias].forEach(n => PLACE_PATTERNS.push({ re: new RegExp('(^|[^\\p{L}])' + esc(n.toLowerCase()) + '([^\\p{L}]|$)', 'u'), place: c, kind: 'city' })));
  Object.keys(COUNTRIES).forEach(name => {
    const names = [name.toLowerCase(), ...(COUNTRY_ALIASES[name.toLowerCase()] || [])];
    names.forEach(n => PLACE_PATTERNS.push({ re: new RegExp('(^|[^\\p{L}])' + esc(n) + '([^\\p{L}]|$)', 'u'), place: COUNTRIES[name], kind: 'country' }));
  });

  /** Infer where a post is about. Returns {city, country, lat, lon, geoSource} or {}. */
  function geotag(text, lang, hint) {
    if (hint && hint.lat != null) return hint;
    const t = (text || '').toLowerCase();
    let best = null;
    for (const p of PLACE_PATTERNS) {
      if (p.re.test(t)) { if (!best || (p.kind === 'city' && best.kind !== 'city')) best = p; if (best.kind === 'city') break; }
    }
    if (best) {
      const jitter = () => (Math.random() - 0.5) * (best.kind === 'city' ? 0.4 : 3);
      return { city: best.kind === 'city' ? best.place.city : null, country: best.place.country, lat: best.place.lat + jitter(), lon: best.place.lon + jitter(), geoSource: 'text' };
    }
    const lc = lang && LANG_COUNTRY[lang.slice(0, 2)];
    if (lc && COUNTRIES[lc]) { const c = COUNTRIES[lc]; return { city: null, country: lc, lat: c.lat + (Math.random() - 0.5) * 4, lon: c.lon + (Math.random() - 0.5) * 4, geoSource: 'language' }; }
    return {};
  }

  // ---------------------------------------------------------------- sentiment
  // Compact AFINN-style lexicon (-5..+5). Extend freely.
  const LEX = {};
  const add = (score, words) => words.split(' ').forEach(w => (LEX[w] = score));
  add(3, 'amazing awesome brilliant excellent fantastic wonderful outstanding superb victory triumph breakthrough thrilled love loved loving');
  add(2, 'good great happy glad win wins won winning success successful celebrate celebrating hope hopeful growth record improve improved improving safe peace support proud progress boost strong recovery rescue rescued beautiful best cheers relief');
  add(1, 'ok okay like nice calm stable fair fine helpful interesting useful agree agreed thanks thank fun cool open free');
  add(-1, 'delay delayed concern concerns worried slow slowdown issue issues problem problems doubt unclear expensive cost costs warning warn tense');
  add(-2, 'bad sad angry anger fear afraid fail failed failure loss lost lose crisis protest protests shortage hike hikes inflation outage strike strikes injured unrest flood flooding drought shortage scam fraud collapse corrupt corruption');
  add(-3, 'terrible awful horrible disaster deadly attack attacks killed violence crash crashed explosion war hate hated victims emergency devastating devastated');
  add(-4, 'catastrophe catastrophic massacre tragedy tragic terror terrorist');
  const NEGATORS = new Set(['not', "n't", 'no', 'never', 'without', 'hardly']);

  const STOP = new Set(('a an the and or but if then so of to in on at by for with from up down out over under about into than as is are was were be been being am do does did have has had having i me my we our you your he she it its they them their this that these those there here what which who whom whose when where why how all any both each few more most other some such only own same too very can will just should now also would could may might must shall rt via amp new one two get got go going make made say says said like let us im dont cant ive youre theyre its http https www com pic twitter status today day time year years people via just really still back even much many well see way want need know think thing things lot get again after before tonight evening morning yesterday tomorrow right near across another every around being here look looks looking anyone everyone someone great stay').split(' '));
  const PLACE_WORDS = new Set();
  CITIES.forEach(c => { [c.city, c.country, ...c.alias].forEach(n => { const l = n.toLowerCase(); PLACE_WORDS.add(l); l.split(' ').forEach(w => w.length >= 3 && PLACE_WORDS.add(w)); }); });
  Object.values(COUNTRY_ALIASES).flat().forEach(a => PLACE_WORDS.add(a));

  function tokenize(text) {
    return (text || '').toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .match(/[#@]?[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu) || [];
  }

  function sentiment(text) {
    const toks = tokenize(text);
    let score = 0, hits = 0;
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i].replace(/^#/, '');
      const v = LEX[w];
      if (v) { const neg = NEGATORS.has(toks[i - 1]) || NEGATORS.has(toks[i - 2]); score += neg ? -v * 0.6 : v; hits++; }
    }
    const comparative = toks.length ? score / Math.sqrt(toks.length) : 0;
    const norm = Math.max(-1, Math.min(1, comparative / 2.5));
    return { score: +norm.toFixed(3), label: norm > 0.12 ? 'positive' : norm < -0.12 ? 'negative' : 'neutral', hits };
  }

  /** Extract trend candidates (hashtags, single terms and two-word phrases). */
  function terms(text) {
    const toks = tokenize(text);
    const out = new Set();
    let prev = null;
    for (const t of toks) {
      if (t.startsWith('@')) { prev = null; continue; }
      const bare = t.replace(/^#/, '');
      if (t.startsWith('#') && bare.length > 1) { out.add('#' + bare); prev = null; continue; }
      if (STOP.has(bare) || PLACE_WORDS.has(bare) || bare.length < 3 || /^\d+$/.test(bare)) { prev = null; continue; }
      out.add(bare);
      if (prev) out.add(prev + ' ' + bare);
      prev = bare;
    }
    return [...out];
  }

  // ---------------------------------------------------------------- topic categories
  const CATEGORIES = {
    economy:  { label: 'Economy', words: 'economy economic economics inflation interest rate rates bank banks central gdp market markets stock stocks shares currency shilling dollar euro trade tariff tariffs tax taxes budget jobs unemployment price prices fuel salary salaries investment investor investors recession growth bitcoin btc crypto stablecoin remittance remittances funding imf debt loan loans exports imports revenue earnings' },
    politics: { label: 'Politics', words: 'election elections vote votes voting voter voters polling ballot ballots parliament senate congress president minister ministers government policy law bill campaign party opposition midterm midterms midterms2026 electionnight governor regulators regulation regulations protest protests democracy referendum cabinet mp mps senator' },
    conflict: { label: 'Conflict & war', words: 'war wars conflict military army troops soldiers ceasefire shelling missile missiles drone drones airstrike airstrikes attack attacks killed bomb bombing explosion rebels militia defense defence invasion border clashes refugees humanitarian sanctions hostages frontline insurgents peace' },
    disaster: { label: 'Climate & disasters', words: 'flood floods flooding rain rains storm storms typhoon cyclone hurricane earthquake quake landslide drought wildfire wildfires bushfire heatwave heat climate climatecrisis emissions cop31 tsunami volcano eruption solar' },
    tech:     { label: 'Technology', words: 'ai tech technology startup startups software cloud outage gpu chip chips app apps data cyber hack hacked hacking engineer engineers model models robot robots internet digital' },
    health:   { label: 'Health', words: 'health hospital hospitals cholera virus outbreak vaccine vaccines vaccination disease doctors doctor nurses patients covid malaria mpox clinic medicine' },
    sports:   { label: 'Sports', words: 'football match goal goals league championsleague ucl fans var referee winner cup olympics marathon athletics tournament' },
    emergency: { label: 'Emergencies & distress', words: 'mayday sos distress emergency emergencies rescue rescued trapped evacuate evacuation evacuated missing stranded capsized sinking ditching collapsed casualties injured survivors 7700 panpan pan-pan searchandrescue sar lifeboat coastguard ambulance firefighters' },
    crime:    { label: 'Crime & security', words: 'police crime crimes scam scams fraud arrest arrested robbery theft security kidnapping smuggling trafficking court' }
  };
  const CAT_INDEX = new Map();
  Object.entries(CATEGORIES).forEach(([k, c]) => c.words.split(' ').forEach(w => { if (!CAT_INDEX.has(w)) CAT_INDEX.set(w, []); CAT_INDEX.get(w).push(k); }));
  /** Which topic categories a post belongs to (several allowed). */
  function classify(text) {
    const hits = {};
    for (const t of tokenize(text)) { const w = t.replace(/^[#@]/, ''); const cs = CAT_INDEX.get(w); if (cs) cs.forEach(c => (hits[c] = (hits[c] || 0) + 1)); }
    return Object.keys(hits).sort((a, b) => hits[b] - hits[a]);
  }
  /** Radio/text distress grading. MAYDAY = grave and imminent danger; PAN-PAN = urgency; SECURITE = safety. */
  function distress(text) {
    const t = ' ' + (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ') + ' ';
    // A coast station acknowledging a MAYDAY is safety traffic, not a new distress call.
    if (/\b(received|receive|roger|copy|acknowledge[ds]?) (your |the )?may ?day\b/.test(t) && !/\bmay ?day relay\b/.test(t)) return { level: 'ack', label: 'MAYDAY ACK', severity: 'info' };
    if (/\bmay ?day\b/.test(t) || /\bm ?a ?y ?d ?a ?y\b/.test(t) || /\bsquawk(ing)? 7700\b/.test(t)) return { level: 'mayday', label: 'MAYDAY', severity: 'critical' };
    if (/\bpan[ -]?pan\b/.test(t) || /\bsquawk(ing)? 7600\b/.test(t)) return { level: 'panpan', label: 'PAN-PAN', severity: 'warning' };
    if (/\bs ?o ?s\b/.test(t) && /\b(help|boat|ship|vessel|trapped|stranded|sinking|lost|need|send)\b/.test(t)) return { level: 'sos', label: 'SOS', severity: 'critical' };
    if (/\bsecurit[eé]\b/.test(t)) return { level: 'securite', label: 'SÉCURITÉ', severity: 'info' };
    if (/\b(trapped|need rescue|send help|we are sinking|taking on water|man overboard|abandon(ing)? ship)\b/.test(t)) return { level: 'distress', label: 'DISTRESS', severity: 'warning' };
    return null;
  }

  /** Volume, tone and momentum per category. */
  function topicBreakdown(posts, opts) {
    opts = opts || {}; const now = opts.now || Date.now(), win = (opts.windowMin || 30) * 60000;
    const rows = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, { key: k, label: CATEGORIES[k].label, count: 0, sentiment: 0, cur: 0, prev: 0 }]));
    for (const p of posts) for (const c of p.topics || []) { const r = rows[c]; if (!r) continue; r.count++; r.sentiment += p.sentiment || 0; const age = now - p.ts; if (age <= win) r.cur++; else if (age <= 2 * win) r.prev++; }
    return Object.values(rows).map(r => Object.assign(r, { sentiment: r.count ? +(r.sentiment / r.count).toFixed(3) : 0, velocity: +((r.cur - r.prev) / Math.max(1, r.prev)).toFixed(2) })).sort((a, b) => b.count - a.count);
  }

  /** Normalise a raw post into Scavenge's common record shape. */
  function enrich(post) {
    const s = sentiment(post.text);
    const g = geotag(post.text, post.lang, post.lat != null ? { lat: post.lat, lon: post.lon, country: post.country, city: post.city, geoSource: 'native' } : null);
    return Object.assign({}, post, g, { sentiment: s.score, mood: s.label, terms: terms(post.text), topics: classify(post.text) });
  }

  // ---------------------------------------------------------------- trends
  /** Rank terms by volume and acceleration: recent window vs. the window before it. */
  function trends(posts, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const win = (opts.windowMin || 30) * 60000;
    const filter = opts.country ? p => p.country === opts.country : opts.city ? p => p.city === opts.city : () => true;
    const cur = new Map(), prev = new Map(), mood = new Map(), plat = new Map();
    for (const p of posts) {
      if (!filter(p)) continue;
      const age = now - p.ts;
      const bucket = age <= win ? cur : age <= win * 2 ? prev : null;
      if (!bucket) continue;
      for (const t of p.terms || []) {
        bucket.set(t, (bucket.get(t) || 0) + 1);
        if (bucket === cur) {
          mood.set(t, (mood.get(t) || 0) + (p.sentiment || 0));
          if (!plat.has(t)) plat.set(t, new Set());
          plat.get(t).add(p.platform);
        }
      }
    }
    const rows = [];
    for (const [term, n] of cur) {
      if (n < (opts.minCount || 2)) continue;
      const before = prev.get(term) || 0;
      const velocity = (n - before) / Math.max(1, before);
      const words = term.split(' ').length;
      const score = n * (1 + Math.min(velocity, 5) * 0.35) * (words > 1 ? 1.25 : 1) * (term[0] === '#' ? 1.2 : 1) * (1 + (plat.get(term).size - 1) * 0.15);
      rows.push({ term, count: n, previous: before, velocity: +velocity.toFixed(2), sentiment: +(mood.get(term) / n).toFixed(3), platforms: [...plat.get(term)], score: +score.toFixed(2) });
    }
    rows.sort((a, b) => b.score - a.score);
    // Drop single words already covered by a stronger phrase containing them.
    const kept = [];
    for (const r of rows) {
      if (!r.term.includes(' ') && kept.some(k => k.term.includes(' ') && k.term.split(' ').includes(r.term) && k.count >= r.count * 0.8)) continue;
      kept.push(r);
      if (kept.length >= (opts.limit || 25)) break;
    }
    return kept;
  }

  /** Group posts by a key → {key, count, sentiment}. */
  function breakdown(posts, key) {
    const m = new Map();
    for (const p of posts) {
      const k = p[key]; if (!k) continue;
      const r = m.get(k) || { key: k, count: 0, sentiment: 0, lat: p.lat, lon: p.lon, country: p.country };
      r.count++; r.sentiment += p.sentiment || 0; m.set(k, r);
    }
    return [...m.values()].map(r => Object.assign(r, { sentiment: +(r.sentiment / r.count).toFixed(3) })).sort((a, b) => b.count - a.count);
  }

  /** Posts per minute per platform, for the timeline chart. */
  function timeline(posts, minutes, now) {
    now = now || Date.now(); minutes = minutes || 30;
    const step = 60000, start = now - minutes * step;
    const series = {};
    for (const p of posts) {
      if (p.ts < start) continue;
      const i = Math.min(minutes - 1, Math.floor((p.ts - start) / step));
      (series[p.platform] = series[p.platform] || new Array(minutes).fill(0))[i]++;
    }
    return { start, step, minutes, series };
  }

  // ---------------------------------------------------------------- alerts
  /** Does this enriched post satisfy an alert rule? */
  function matchRule(rule, p) {
    if (rule.enabled === false) return false;
    if (rule.platforms && rule.platforms.length && !rule.platforms.includes(p.platform)) return false;
    if (rule.country && p.country !== rule.country) return false;
    if (rule.mood && rule.mood !== 'any' && p.mood !== rule.mood) return false;
    const cats = rule.categories || [];
    if (cats.length && !(p.topics || []).some(c => cats.includes(c))) return false;
    const text = (p.text || '').toLowerCase();
    if (!(rule.terms || []).filter(Boolean).length) return cats.length ? (p.topics || []).filter(c => cats.includes(c)) : false;
    const hits = (rule.terms || []).filter(t => {
      t = t.toLowerCase().trim(); if (!t) return false;
      if (t.startsWith('"') && t.endsWith('"')) return text.includes(t.slice(1, -1));
      return new RegExp('(^|[^\\p{L}\\p{N}])' + esc(t) + '([^\\p{L}\\p{N}]|$)', 'u').test(text);
    });
    if (!hits.length) return false;
    if (rule.match === 'all' && hits.length < rule.terms.filter(Boolean).length) return false;
    return hits;
  }

  // ---------------------------------------------------------------- briefing
  /** Rule-based situation briefing (used when no LLM is configured). */
  function brief(posts, opts) {
    opts = opts || {};
    let scope = opts.country ? posts.filter(p => p.country === opts.country) : posts;
    if (opts.topic) scope = scope.filter(p => (p.topics || []).includes(opts.topic));
    if (!scope.length) return 'No signal captured yet for this scope. Add watch terms or wait for the next sweep.';
    const tr = trends(scope, { windowMin: opts.windowMin || 30, limit: 6, minCount: 2 });
    const avg = scope.reduce((a, p) => a + (p.sentiment || 0), 0) / scope.length;
    const plats = breakdown(scope, 'platform');
    const ctry = breakdown(scope, 'country').slice(0, 3);
    const tone = avg > 0.15 ? 'leaning positive' : avg < -0.15 ? 'leaning negative' : 'mixed';
    const lines = [];
    lines.push(`${scope.length.toLocaleString()} posts analysed across ${plats.length} platforms${opts.country ? ' about ' + opts.country : ''}. Overall tone is ${tone} (${avg >= 0 ? '+' : ''}${avg.toFixed(2)}).`);
    if (tr.length) {
      const top = tr[0];
      lines.push(`Leading topic: “${top.term}” with ${top.count} mentions${top.previous ? `, ${top.velocity >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(top.velocity * 100))}% on the previous window` : ', newly emerged'} and ${top.sentiment < -0.1 ? 'negative' : top.sentiment > 0.1 ? 'positive' : 'neutral'} sentiment.`);
      if (tr.length > 1) lines.push(`Also trending: ${tr.slice(1, 5).map(t => `“${t.term}” (${t.count})`).join(', ')}.`);
      const neg = tr.filter(t => t.sentiment < -0.2);
      if (neg.length) lines.push(`Watch for friction around ${neg.slice(0, 2).map(t => `“${t.term}”`).join(' and ')}, where the conversation is notably negative.`);
    }
    if (!opts.country && ctry.length) lines.push(`Most active locations: ${ctry.map(c => `${c.key} (${c.count})`).join(', ')}.`);
    const tb = topicBreakdown(scope, { windowMin: opts.windowMin || 30 }).filter(t => t.count);
    if (tb.length && !opts.topic) lines.push(`Dominant theme: ${tb[0].label.toLowerCase()} (${Math.round(tb[0].count / scope.length * 100)}% of posts)${tb[1] ? `, then ${tb[1].label.toLowerCase()}` : ''}${tb.find(t => t.key === 'conflict' && t.velocity > 0.3) ? '. Conflict-related chatter is accelerating' : ''}.`);
    lines.push(`Loudest platform: ${plats[0].key} with ${Math.round((plats[0].count / scope.length) * 100)}% of volume.`);
    return lines.join(' ');
  }

  return { CATEGORIES, classify, distress, topicBreakdown, CITIES, COUNTRIES, geotag, sentiment, tokenize, terms, enrich, trends, breakdown, timeline, matchRule, brief };
});
