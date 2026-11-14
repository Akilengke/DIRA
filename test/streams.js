// Saved streams: admin-only, LiveATC refused, private hosts refused by default, relay pipes audio, playlists resolved.
'use strict';
const assert = require('assert'), http = require('http'), os = require('os'), path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ok = (c, m) => { if (!c) { console.log('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };
const PORT = 18000 + Math.floor(Math.random() * 900), base = 'http://127.0.0.1:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scv-streams-'));
const audio = http.createServer((req, res) => {
  if (req.url === '/list.pls') { res.writeHead(200, { 'Content-Type': 'audio/x-scpls' }); return res.end(`[playlist]\nFile1=http://127.0.0.1:${audio.address().port}/live.mp3\n`); }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.write(Buffer.alloc(4096, 7)); setTimeout(() => res.end(Buffer.alloc(1024, 9)), 100);
}).listen(0);
const srv = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], { env: Object.assign({}, process.env, { PORT, SCAVENGE_DEMO: '1', SCAVENGE_DATA: DATA }), stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(1500);
  const j = async (u, o = {}) => { const r = await fetch(base + u, o); let b = null; try { b = await r.json(); } catch {} return { r, b }; };
  const li = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  const C = { Cookie: (li.r.headers.get('set-cookie') || '').split(';')[0], 'Content-Type': 'application/json' };
  const add = b => j('/api/streams', { method: 'POST', headers: C, body: JSON.stringify(b) });
  ok((await j('/api/streams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', url: 'https://example.org/a', rights: true }) })).r.status === 401, 'adding streams needs admin');
  ok((await add({ name: 'LGA', url: 'https://d.liveatc.net/klga_twr', rights: true })).r.status === 403, 'LiveATC streams refused');
  ok((await add({ name: 'x', url: 'http://127.0.0.1:9/a', rights: true })).r.status === 400, 'private addresses refused by default');
  ok((await add({ name: 'x', url: 'https://example.org/a' })).r.status === 400, 'rights confirmation required');
  ok((await j('/api/airports/find?q=klga')).b[0].icao === 'KLGA', 'airport search finds KLGA');
  srv.kill(); await wait(400);
  const srv2 = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], { env: Object.assign({}, process.env, { PORT, SCAVENGE_DEMO: '1', SCAVENGE_DATA: DATA, STREAMS_ALLOW_PRIVATE: '1' }), stdio: 'ignore' });
  await wait(1500);
  const li2 = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  C.Cookie = (li2.r.headers.get('set-cookie') || '').split(';')[0];
  const s = await add({ name: 'My LGA scanner', icao: 'klga', freq: '118.700', url: `http://127.0.0.1:${audio.address().port}/list.pls`, rights: true });
  ok(s.r.status === 200 && s.b.icao === 'KLGA', 'own stream saved');
  ok((await fetch(base + '/api/streams/relay?id=' + s.b.id)).status === 401, 'relay needs admin');
  const rr = await fetch(base + '/api/streams/relay?id=' + s.b.id, { headers: { Cookie: C.Cookie } });
  const buf = Buffer.from(await rr.arrayBuffer());
  ok(rr.status === 200 && /audio\/mpeg/.test(rr.headers.get('content-type')) && buf.length === 5120, 'relay resolves the playlist and pipes the audio');
  ok(!JSON.stringify((await j('/api/streams')).b).includes('/list.pls'), 'stream URLs are not exposed to viewers');
  ok((await j('/api/streams?id=' + s.b.id, { method: 'DELETE', headers: C })).r.status === 200, 'stream removed');
  srv2.kill(); audio.close();
  console.log(process.exitCode ? 'Stream checks FAILED.' : 'Stream checks passed.');
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
