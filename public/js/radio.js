/* Scavenge radio reference data — shared by server (enforcement) and browser (display). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScavengeRadio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // kHz for HF entries, MHz written out for VHF/UHF; `hz` is the canonical value.
  const CHANNELS = [
    { group: 'Distress watch', name: 'Marine VHF 16', hz: 156800000, mode: 'fm', note: 'International maritime distress, safety & calling. Line of sight (~40 km): needs a local receiver.' },
    { group: 'Distress watch', name: 'Marine VHF 70 (DSC)', hz: 156525000, mode: 'fm', note: 'Digital selective calling distress alerts. Data bursts, not voice.' },
    { group: 'Distress watch', name: 'Air emergency 121.5', hz: 121500000, mode: 'am', note: 'International aeronautical emergency ("guard"). Local receiver or LiveATC.' },
    { group: 'Distress watch', name: 'Military air guard 243.0', hz: 243000000, mode: 'am', note: 'Military aeronautical emergency.' },
    { group: 'Distress watch', name: 'MF 2182 kHz', hz: 2182000, mode: 'usb', note: 'Maritime distress voice on medium frequency. Reaches hundreds of km.' },
    { group: 'Distress watch', name: 'HF 4125 kHz', hz: 4125000, mode: 'usb', note: 'GMDSS HF distress voice.' },
    { group: 'Distress watch', name: 'HF 6215 kHz', hz: 6215000, mode: 'usb', note: 'GMDSS HF distress voice.' },
    { group: 'Distress watch', name: 'HF 8291 kHz', hz: 8291000, mode: 'usb', note: 'GMDSS HF distress voice.' },
    { group: 'Distress watch', name: 'HF 12290 kHz', hz: 12290000, mode: 'usb', note: 'GMDSS HF distress voice.' },
    { group: 'Distress watch', name: 'HF 16420 kHz', hz: 16420000, mode: 'usb', note: 'GMDSS HF distress voice.' },
    { group: 'Distress watch', name: 'SAR on-scene 5680 kHz', hz: 5680000, mode: 'usb', note: 'Aeronautical search-and-rescue coordination.' },
    { group: 'Amateur emergency nets', name: 'IARU emergency 3760 kHz', hz: 3760000, mode: 'lsb', note: 'Region 1 emergency centre of activity (80 m).' },
    { group: 'Amateur emergency nets', name: 'IARU emergency 7110 kHz', hz: 7110000, mode: 'lsb', note: 'Region 1 emergency centre of activity (40 m).' },
    { group: 'Amateur emergency nets', name: 'IARU emergency 14300 kHz', hz: 14300000, mode: 'usb', note: 'Global emergency centre of activity; maritime mobile nets (20 m).' },
    { group: 'Amateur emergency nets', name: 'IARU emergency 18160 kHz', hz: 18160000, mode: 'usb', note: 'Emergency centre of activity (17 m).' },
    { group: 'Amateur emergency nets', name: 'IARU emergency 21360 kHz', hz: 21360000, mode: 'usb', note: 'Emergency centre of activity (15 m).' },
    { group: 'Amateur emergency nets', name: '2 m calling 145.500', hz: 145500000, mode: 'fm', note: 'Region 1 FM simplex calling frequency.' },
    { group: 'Amateur emergency nets', name: '2 m calling 146.520', hz: 146520000, mode: 'fm', note: 'Americas FM simplex calling frequency.' },
    { group: 'Aviation', name: 'Shannon VOLMET 5505 kHz', hz: 5505000, mode: 'usb', note: 'Continuous aviation weather broadcast for North Atlantic and European airports (HF).' },
    { group: 'Aviation', name: 'Shannon VOLMET 8957 kHz', hz: 8957000, mode: 'usb', note: 'Aviation weather broadcast, daytime HF frequency.' },
    { group: 'Aviation', name: 'Shannon VOLMET 13264 kHz', hz: 13264000, mode: 'usb', note: 'Aviation weather broadcast, long-range HF frequency.' },
    { group: 'Weather & time', name: 'NOAA Weather Radio 162.550', hz: 162550000, mode: 'fm', note: 'US weather alerts (also 162.400–162.525).' },
    { group: 'Weather & time', name: 'WWV time 10 MHz', hz: 10000000, mode: 'am', note: 'Time signal; handy reception check.' }
  ];

  // Default transmit allow-list: amateur bands only (Hz). Operators may change it in .env if they hold other licences.
  const AMATEUR = [[1810e3, 2000e3], [3500e3, 4000e3], [7000e3, 7300e3], [10100e3, 10150e3], [14000e3, 14350e3], [18068e3, 18168e3], [21000e3, 21450e3], [24890e3, 24990e3], [28000e3, 29700e3], [50e6, 54e6], [144e6, 148e6], [430e6, 440e6]];
  // Never transmit here from Scavenge, whatever the configuration: aviation band and emergency beacons.
  const PROTECTED = [[108e6, 137e6, 'aeronautical band'], [242.9e6, 243.1e6, 'military air guard'], [406e6, 406.1e6, 'COSPAS-SARSAT distress beacons'], [2173.5e3, 2190.5e3, 'MF distress guard band'], [156.7625e6, 156.8375e6, 'VHF channel 16 guard band']];

  function parseRanges(str) {
    if (!str) return AMATEUR;
    return str.split(',').map(r => r.trim().split('-').map(x => parseFloat(x) * 1e6)).filter(r => r.length === 2 && r.every(isFinite));
  }
  /** Can Scavenge transmit on `hz`? Returns {ok, reason}. */
  function txCheck(hz, ranges, opts) {
    opts = opts || {};
    if (!isFinite(hz) || hz <= 0) return { ok: false, reason: 'Enter a valid frequency.' };
    const p = PROTECTED.find(([a, b]) => hz >= a && hz <= b);
    // Ch16 / 2182 kHz voice is legitimate for licensed marine stations, so allow it only with an explicit marine licence flag.
    if (p && !(opts.marine && /channel 16|MF distress/.test(p[2]))) return { ok: false, reason: `Transmitting in the ${p[2]} is blocked.` };
    if (!(ranges || AMATEUR).some(([a, b]) => hz >= a && hz <= b)) return { ok: false, reason: 'That frequency is outside your licensed transmit bands.' };
    return { ok: true };
  }
  const fmtFreq = hz => hz >= 30e6 ? (hz / 1e6).toFixed(3) + ' MHz' : (hz / 1e3).toFixed(hz % 1000 ? 1 : 0) + ' kHz';

  // Public emergency numbers (verify locally; mobile phones also accept 112 in most countries).
  const NUMBERS = {
    Kenya: [['Police, fire, ambulance', '999 / 112 / 911'], ['Kenya Red Cross', '1199']],
    Uganda: [['Emergency', '999 / 112']], Tanzania: [['Emergency', '112']], Ethiopia: [['Police', '991'], ['Ambulance', '907']],
    Nigeria: [['Emergency', '112']], 'South Africa': [['Police', '10111'], ['From mobile', '112']], Egypt: [['Police', '122'], ['Ambulance', '123']],
    'United States': [['Emergency', '911']], Canada: [['Emergency', '911']], 'United Kingdom': [['Emergency', '999 / 112']],
    India: [['Emergency', '112']], Australia: [['Emergency', '000']], 'New Zealand': [['Emergency', '111']], Japan: [['Police', '110'], ['Fire & ambulance', '119']],
    Brazil: [['Police', '190'], ['Ambulance', '192'], ['Fire', '193']], Mexico: [['Emergency', '911']], China: [['Police', '110'], ['Ambulance', '120'], ['Fire', '119']]
  };
  const EU = ['France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Austria', 'Sweden', 'Poland', 'Portugal', 'Ireland', 'Greece'];
  EU.forEach(c => (NUMBERS[c] = [['Emergency (EU)', '112']]));

  // Major airports (fallback when the full OurAirports database is not loaded). [ICAO, IATA, name, city, country, lat, lon]
  const AIRPORTS = [
    ['KLGA','LGA','LaGuardia','New York','United States',40.7769,-73.874],
    ['HKJK','NBO','Jomo Kenyatta Intl','Nairobi','Kenya',-1.3192,36.9278], ['HKNW','WIL','Wilson','Nairobi','Kenya',-1.3217,36.8148], ['HKMO','MBA','Moi Intl','Mombasa','Kenya',-4.0348,39.5942],
    ['HKKI','KIS','Kisumu Intl','Kisumu','Kenya',-0.0861,34.7289], ['HKEL','EDL','Eldoret Intl','Eldoret','Kenya',0.4045,35.2389], ['HUEN','EBB','Entebbe Intl','Entebbe','Uganda',0.0424,32.4435],
    ['HTDA','DAR','Julius Nyerere Intl','Dar es Salaam','Tanzania',-6.8781,39.2026], ['HTKJ','JRO','Kilimanjaro Intl','Kilimanjaro','Tanzania',-3.4294,37.0745], ['HRYR','KGL','Kigali Intl','Kigali','Rwanda',-1.9686,30.1395],
    ['HAAB','ADD','Addis Ababa Bole Intl','Addis Ababa','Ethiopia',8.9779,38.7993], ['HCMM','MGQ','Aden Adde Intl','Mogadishu','Somalia',2.0144,45.3047], ['HSSK','KRT','Khartoum Intl','Khartoum','Sudan',15.5895,32.5532],
    ['HECA','CAI','Cairo Intl','Cairo','Egypt',30.1219,31.4056], ['DNMM','LOS','Murtala Muhammed Intl','Lagos','Nigeria',6.5774,3.3212], ['DNAA','ABV','Nnamdi Azikiwe Intl','Abuja','Nigeria',9.0068,7.2632],
    ['DGAA','ACC','Kotoka Intl','Accra','Ghana',5.6052,-0.1668], ['FAOR','JNB','O. R. Tambo Intl','Johannesburg','South Africa',-26.1392,28.246], ['FACT','CPT','Cape Town Intl','Cape Town','South Africa',-33.9649,18.6017],
    ['FVRG','HRE','Robert Gabriel Mugabe Intl','Harare','Zimbabwe',-17.9318,31.0928], ['FLKK','LUN','Kenneth Kaunda Intl','Lusaka','Zambia',-15.3308,28.4526], ['GMMN','CMN','Mohammed V Intl','Casablanca','Morocco',33.3675,-7.5899],
    ['OMDB','DXB','Dubai Intl','Dubai','United Arab Emirates',25.2528,55.3644], ['OTHH','DOH','Hamad Intl','Doha','Qatar',25.2731,51.6081], ['OERK','RUH','King Khalid Intl','Riyadh','Saudi Arabia',24.9576,46.6988],
    ['LTFM','IST','Istanbul','Istanbul','Turkey',41.2753,28.7519], ['EGLL','LHR','Heathrow','London','United Kingdom',51.47,-0.4543], ['LFPG','CDG','Charles de Gaulle','Paris','France',49.0097,2.5479],
    ['EDDF','FRA','Frankfurt','Frankfurt','Germany',50.0379,8.5622], ['EHAM','AMS','Schiphol','Amsterdam','Netherlands',52.3105,4.7683], ['LEMD','MAD','Adolfo Suárez Madrid–Barajas','Madrid','Spain',40.4983,-3.5676],
    ['LIRF','FCO','Fiumicino','Rome','Italy',41.8003,12.2389], ['VIDP','DEL','Indira Gandhi Intl','Delhi','India',28.5562,77.1], ['VABB','BOM','Chhatrapati Shivaji Maharaj Intl','Mumbai','India',19.0896,72.8656],
    ['VHHH','HKG','Hong Kong Intl','Hong Kong','China',22.308,113.9185], ['WSSS','SIN','Changi','Singapore','Singapore',1.3644,103.9915], ['ZBAA','PEK','Beijing Capital Intl','Beijing','China',40.0799,116.6031],
    ['RJTT','HND','Haneda','Tokyo','Japan',35.5494,139.7798], ['YSSY','SYD','Kingsford Smith','Sydney','Australia',-33.9399,151.1753], ['KJFK','JFK','John F. Kennedy Intl','New York','United States',40.6413,-73.7781],
    ['KATL','ATL','Hartsfield–Jackson','Atlanta','United States',33.6407,-84.4277], ['KLAX','LAX','Los Angeles Intl','Los Angeles','United States',33.9416,-118.4085], ['KORD','ORD',"O'Hare Intl",'Chicago','United States',41.9742,-87.9073],
    ['CYYZ','YYZ','Toronto Pearson','Toronto','Canada',43.6777,-79.6248], ['MMMX','MEX','Benito Juárez Intl','Mexico City','Mexico',19.4361,-99.0719], ['SBGR','GRU','Guarulhos','São Paulo','Brazil',-23.4356,-46.4731],
    ['SAEZ','EZE','Ministro Pistarini','Buenos Aires','Argentina',-34.8222,-58.5358]
  ].map(([icao, iata, name, city, country, lat, lon]) => ({ icao, iata, name, city, country, lat, lon }));
  const SQUAWKS = { '7700': 'General emergency', '7600': 'Radio failure', '7500': 'Unlawful interference', '7000': 'VFR conspicuity (Europe)', '1200': 'VFR (Americas)', '2000': 'Entering controlled airspace without a code' };
  const nm = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * 3440.065 * Math.asin(Math.sqrt(x)); };
  // published frequencies for airports in the built-in list (the server uses the full OurAirports data)
  const REF_FREQS = {
    KLGA: [['ATIS', 'D-ATIS', 127.05], ['CLD', 'Clearance delivery', 135.2], ['GND', 'Ground', 121.7], ['TWR', 'Tower', 118.7], ['APP', 'New York Approach (final)', 120.8], ['DEP', 'New York Departure', 120.4]],
    KJFK: [['ATIS', 'ATIS', 128.725], ['CLD', 'Clearance delivery', 135.05], ['GND', 'Ground', 121.9], ['TWR', 'Tower', 119.1], ['APP', 'Kennedy Approach', 132.4]],
    HKJK: [['ATIS', 'ATIS', 127.2], ['GND', 'Ground', 121.9], ['TWR', 'Tower', 118.7], ['APP', 'Nairobi Approach', 119.7]]
  };
  function withFreqs(a) { return Object.assign({ freqs: (REF_FREQS[a.icao] || []).map(([type, desc, mhz]) => ({ type, desc, mhz })) }, a); }
  function findAirports(q, list, n) {
    q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
    const L = list || AIRPORTS.map(withFreqs), score = a => (a.icao || '').toLowerCase() === q ? 0 : (a.iata || '').toLowerCase() === q ? 1 : (a.icao || '').toLowerCase().startsWith(q) ? 2 : (a.city || '').toLowerCase().startsWith(q) ? 3 : (a.name || '').toLowerCase().includes(q) || (a.city || '').toLowerCase().includes(q) ? 4 : 9;
    return L.map(a => [score(a), a]).filter(x => x[0] < 9).sort((x, y) => x[0] - y[0] || (y[1].size === 'large') - (x[1].size === 'large')).slice(0, n || 8).map(x => x[1]);
  }
  function nearestAirports(lat, lon, n, list) { return (list || AIRPORTS).map(a => Object.assign({}, a, { nm: Math.round(nm(lat, lon, a.lat, a.lon)) })).sort((a, b) => a.nm - b.nm).slice(0, n || 5); }

  return { CHANNELS, AMATEUR, PROTECTED, parseRanges, txCheck, fmtFreq, NUMBERS, AIRPORTS, SQUAWKS, nearestAirports, nm, findAirports, withFreqs };
});
