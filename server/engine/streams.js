// Audio streams the admin adds (their own scanner feed, an Icecast/Broadcastify feed they're licensed for, …).
// The server relays them to the signed-in admin so the browser can process the audio (clarity, squelch, volume).
// LiveATC.net prohibits third-party use and relaying of its streams, so its hosts are refused unless the owner
// has LiveATC's written permission and sets LIVEATC_PERMISSION=1.
'use strict';
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const { Readable } = require('stream');

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168)\./];
const isLiveATC = host => /(^|\.)liveatc\.net$/i.test(host);

function createStreams(dataDir) {
  const file = path.join(dataDir, 'streams.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => fs.writeFileSync(file, JSON.stringify(list, null, 1));
  let active = 0;

  async function check(u) {
    let url;
    try { url = new URL(String(u || '').trim()); } catch { throw Object.assign(new Error('Enter a full stream URL (http:// or https://).'), { code: 400 }); }
    if (!/^https?:$/.test(url.protocol)) throw Object.assign(new Error('Only http and https streams are supported.'), { code: 400 });
    if (isLiveATC(url.hostname) && process.env.LIVEATC_PERMISSION !== '1')
      throw Object.assign(new Error('LiveATC.net does not allow its streams to be used in other apps. Listen on liveatc.net, or set LIVEATC_PERMISSION=1 once LiveATC has given you written permission.'), { code: 403 });
    const addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw Object.assign(new Error('That stream host could not be found.'), { code: 400 });
    if (addrs.some(a => PRIVATE.some(r => r.test(a.address))) && process.env.STREAMS_ALLOW_PRIVATE !== '1')
      throw Object.assign(new Error('Streams on private network addresses are blocked (set STREAMS_ALLOW_PRIVATE=1 to allow a feed on your own network).'), { code: 400 });
    return url;
  }

  const pub = s => ({ id: s.id, name: s.name, icao: s.icao, freq: s.freq, host: new URL(s.url).hostname, added: s.added });
  return {
    list: () => list.map(pub),
    async add({ name, icao, freq, url, rights }) {
      if (!rights) throw Object.assign(new Error('Confirm that you have the right to relay this stream.'), { code: 400 });
      const u = await check(url);
      const s = { id: crypto.randomBytes(5).toString('hex'), name: String(name || u.hostname).slice(0, 60), icao: String(icao || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), freq: freq ? String(freq).slice(0, 20) : '', url: u.href, added: Date.now() };
      list.push(s); save(); return pub(s);
    },
    remove(id) { const n = list.length; list = list.filter(s => s.id !== id); if (list.length !== n) save(); return { ok: true }; },
    // pipe the stream to one listener; playlists (.pls / .m3u) are resolved to their first entry
    async relay(id, req, res) {
      const s = list.find(x => x.id === id);
      if (!s) { res.writeHead(404); return res.end(); }
      if (active >= 4) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('Too many streams playing'); }
      const ac = new AbortController(); req.on('close', () => ac.abort());
      try {
        let url = await check(s.url), r;
        for (let hop = 0; hop < 4; hop++) {
          r = await fetch(url, { redirect: 'manual', signal: ac.signal, headers: { 'User-Agent': process.env.SCAVENGE_USER_AGENT || 'Scavenge/1.0', 'Icy-MetaData': '0' } });
          if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = await check(new URL(r.headers.get('location'), url).href); continue; }
          const ct = r.headers.get('content-type') || '';
          if (/mpegurl|scpls|x-scpls|audio\/x-mpegurl/i.test(ct) || /\.(pls|m3u8?)$/i.test(url.pathname)) {
            const txt = await r.text(), m = /(https?:\/\/[^\s]+)/.exec(txt);
            if (!m) throw new Error('Playlist has no stream address');
            url = await check(m[1]); continue;
          }
          break;
        }
        if (!r.ok || !r.body) throw new Error('Stream answered ' + r.status);
        active++;
        res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        const body = Readable.fromWeb(r.body);
        body.on('error', () => res.end()); res.on('close', () => { body.destroy(); ac.abort(); });
        body.pipe(res).on('finish', () => {});
        res.on('close', () => { active = Math.max(0, active - 1); });
      } catch (e) {
        if (!res.headersSent) { res.writeHead(e.code === 403 ? 403 : 502, { 'Content-Type': 'text/plain' }); res.end(e.message); }
      }
    }
  };
}
module.exports = { createStreams, isLiveATC };
