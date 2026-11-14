// Route ranking: blocked and congested routes lose; cameras and limits are counted.
'use strict';
const assert = require('assert');
const RP = require('../public/js/routeplan');
const core = require('../public/js/core');
const sim = require('../public/js/sim').create(core);
const ok = m => console.log('✓ ' + m);

const line = (a, b, n = 20) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
const A = [36.80, -1.28], B = [36.90, -1.28];
const r1 = { id: 'fast', line: line(A, B), time: 900, trafficIncluded: false, sections: [], limits: [{ from: 0, to: 20, kmh: 80 }] };
const r2 = { id: 'slow', line: [A, [36.85, -1.30], B], time: 1300, trafficIncluded: false, sections: [], limits: [] };
let res = RP.analyse([r1, r2], { cameras: [{ lat: -1.28, lon: 36.85, maxspeed: 80 }] });
assert.strictEqual(res.best, 'fast'); assert.strictEqual(res.routes[0].cameras.length, 1); assert.strictEqual(res.routes[0].limitAvg, 80);
ok('fastest route wins, camera and limit found');

res = RP.analyse([r1, r2], { incidents: [{ cat: 11, kind: 'Flooding', lat: -1.28, lon: 36.85, description: 'Flooded' }] });
assert.strictEqual(res.best, 'slow'); assert.ok(res.routes[1].blocked); assert.ok(/flooded/i.test(res.summary));
ok('flooded route is avoided');

res = RP.analyse([r1, r2], { incidents: [{ cat: 6, kind: 'Traffic jam', delay: 1200, lat: -1.28, lon: 36.85, line: [[36.84, -1.28], [36.86, -1.28]] }] });
assert.strictEqual(res.best, 'slow');
ok('heavy congestion pushes traffic onto the alternative');

const fast = Object.assign({}, r1, { time: 60 });
res = RP.analyse([fast], {});
assert.ok(res.routes[0].eta > 60 && res.routes[0].notes.length);
ok('travel time respects speed limits');

const s = sim.route('Donholm', 'CBD');
assert.ok(s.routes.length >= 2 && !s.routes[0].blocked && /google\.com\/maps\/dir/.test(s.routes[0].google));
ok('simulator plans Nairobi routes with a Google Maps link');
assert.throws(() => sim.route('Atlantis', 'CBD'));
ok('unknown places are reported');
console.log('All route checks passed.');
