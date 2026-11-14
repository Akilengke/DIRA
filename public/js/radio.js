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

  return { CHANNELS, AMATEUR, PROTECTED, parseRanges, txCheck, fmtFreq, NUMBERS };
});
