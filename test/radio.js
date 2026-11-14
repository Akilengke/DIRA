// Radio subsystem checks: transmission segmenting, distress grading, and the full licensed-transmit path
// against a fake rigctld (no real radio is keyed).
'use strict';
const assert = require('assert');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Segmenter } = require('../server/engine/sdr');
const core = require('../public/js/core');

const ok = m => console.log('✓ ' + m);
(async () => {
  // 1. Segmenter: 1 s silence, 2 s "voice", 2 s silence → exactly one ~2 s clip.
  const segs = [];
  const s = new Segmenter({ rate: 8000, threshold: 500, onSegment: (pcm, ms) => segs.push(ms) });
  const block = (sec, amp) => { const b = Buffer.alloc(8000 * sec * 2); for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 3)), i * 2); return b; };
  [block(1, 0), block(2, 3000), block(2, 0)].forEach(b => { for (let i = 0; i < b.length; i += 1234) s.push(b.subarray(i, i + 1234)); });
  assert.strictEqual(segs.length, 1); assert(segs[0] >= 1900 && segs[0] <= 2400, 'clip length ' + segs[0]);
  ok('segmenter cuts one transmission (' + segs[0] + ' ms)');

  assert.strictEqual(core.distress('Mayday mayday mayday this is vessel Amani').level, 'mayday');
  assert.strictEqual(core.distress('Pan-pan, engine failure').level, 'panpan');
  assert.strictEqual(core.distress('loving the new SOS album'), null);
  ok('distress grading');

  // 2. Licensed transmit through a fake rigctld.
  const cmds = [];
  const rig = net.createServer(c => c.on('data', d => { cmds.push(String(d).trim()); c.write('RPRT 0\n'); })).listen(0);
  await new Promise(r => rig.on('listening', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scv-tx-'));
  Object.assign(process.env, { TX_ENABLED: '1', TX_CALLSIGN: 'test1', TX_PIN: '123456', RIGCTLD_PORT: String(rig.address().port), TX_PLAY_CMD: 'true {file}' });
  const { createTX } = require('../server/engine/tx');
  const tx = createTX({ dataDir: dir });
  assert(tx.status().ready, tx.status().reason);
  const audio = Buffer.alloc(5000, 1);
  await assert.rejects(tx.transmit({ audio, hz: 145500000, pin: 'wrong!' }), /Wrong operator PIN/);
  await assert.rejects(tx.transmit({ audio, hz: 121500000, pin: '123456' }), /aeronautical/);
  await assert.rejects(tx.transmit({ audio, hz: 156800000, pin: '123456' }), /channel 16/);
  await assert.rejects(tx.transmit({ audio, hz: 98000000, pin: '123456' }), /outside your licensed/);
  ok('refuses wrong PIN, aviation, Ch16 and unlicensed frequencies');
  const r = await tx.transmit({ audio, hz: 145500000, pin: '123456', operator: 'tester' });
  assert(r.ok && r.callsign === 'TEST1');
  assert.deepStrictEqual(cmds, ['F 145500000', 'T 1', 'T 0']);
  ok('keys rig, plays audio, releases PTT: ' + cmds.join(' → '));
  Object.assign(process.env, { TX_PLAY_CMD: 'false {file}' }); cmds.length = 0;
  await assert.rejects(tx.transmit({ audio, hz: 145500000, pin: '123456' }), /playout failed/);
  assert.strictEqual(cmds[cmds.length - 1], 'T 0');
  ok('PTT is released even when playout fails');
  rig.close();
  console.log('Radio checks passed.');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
