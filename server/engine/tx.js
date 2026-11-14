// Talk-back.
//  1. Ops intercom: push-to-talk voice and text between Scavenge operators (no radio licence needed).
//  2. On-air transmit through YOUR OWN radio, for licensed operators only:
//     • off unless TX_ENABLED=1, and needs TX_CALLSIGN and an operator PIN (TX_PIN) on every transmission
//     • frequency must sit inside TX_ALLOWED_RANGES (default: amateur bands); aviation, beacon and
//       distress-guard frequencies are always refused (Ch16 / 2182 kHz only with TX_MARINE_LICENSED=1)
//     • keys the rig through Hamlib's rigctld (or VOX), plays the recorded audio, always releases PTT,
//       caps each over at TX_MAX_SECONDS, and logs every transmission.
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const radio = require('../../public/js/radio');

const env = k => (process.env[k] || '').trim();
const has = bin => { try { return spawnSync('which', [bin]).status === 0; } catch { return false; } };

function createTX({ dataDir }) {
  const logFile = path.join(dataDir, 'tx-log.json');
  let log = []; try { log = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
  let busy = false;
  const cfg = () => ({
    enabled: env('TX_ENABLED') === '1', callsign: env('TX_CALLSIGN').toUpperCase(), pin: env('TX_PIN'), ranges: radio.parseRanges(env('TX_ALLOWED_RANGES')),
    marine: env('TX_MARINE_LICENSED') === '1', ptt: env('TX_PTT') || 'rigctld', host: env('RIGCTLD_HOST') || '127.0.0.1', port: +env('RIGCTLD_PORT') || 4532,
    device: env('TX_AUDIO_DEVICE') || 'default', max: Math.min(+env('TX_MAX_SECONDS') || 60, 180)
  });

  function status() {
    const c = cfg();
    const why = !c.enabled ? 'Transmit is switched off. A licensed operator can enable it in .env (TX_ENABLED=1).'
      : !c.callsign ? 'Set TX_CALLSIGN to your licensed call sign.'
      : !c.pin || c.pin.length < 6 ? 'Set TX_PIN (at least 6 characters) so only you can key the radio.'
      : !has('ffmpeg') ? 'Install ffmpeg on the server to play recorded audio into the radio.' : null;
    return { ready: !why, reason: why, callsign: c.callsign || null, ptt: c.ptt, marine: c.marine, maxSeconds: c.max, busy,
      bands: c.ranges.map(([a, b]) => `${radio.fmtFreq(a)}–${radio.fmtFreq(b)}`), recent: log.slice(0, 20) };
  }

  function rig(cmd, c) {
    return new Promise((ok, bad) => {
      const s = net.connect(c.port, c.host); let buf = '';
      const t = setTimeout(() => { s.destroy(); bad(new Error('rigctld did not answer. Is it running? e.g. rigctld -m <model> -r /dev/ttyUSB0')); }, 3000);
      s.on('connect', () => s.write(cmd + '\n'));
      s.on('data', d => { buf += d; if (/RPRT -?\d+/.test(buf)) { clearTimeout(t); s.end(); const code = +/RPRT (-?\d+)/.exec(buf)[1]; code === 0 ? ok() : bad(new Error(`rigctld refused "${cmd}" (RPRT ${code})`)); } });
      s.on('error', e => { clearTimeout(t); bad(new Error('Cannot reach rigctld: ' + e.message)); });
    });
  }

  function play(file, c) {
    return new Promise((ok, bad) => {
      const tpl = env('TX_PLAY_CMD') || 'ffmpeg -hide_banner -loglevel error -i {file} -t {max} -ac 1 -f alsa {device}';
      const parts = tpl.split(' ').filter(Boolean).map(x => x.replace('{file}', file).replace('{max}', String(c.max)).replace('{device}', c.device));
      const p = spawn(parts[0], parts.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; p.stderr.on('data', d => (err += d));
      const kill = setTimeout(() => p.kill('SIGKILL'), (c.max + 5) * 1000);
      p.on('exit', code => { clearTimeout(kill); code === 0 ? ok() : bad(new Error('Audio playout failed: ' + (err.trim().split('\n').pop() || 'exit ' + code))); });
      p.on('error', e => { clearTimeout(kill); bad(e); });
    });
  }

  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  async function transmit({ audio, hz, pin, operator, ip }) {
    const c = cfg(), s = status();
    const fail = (msg, code = 400) => { throw Object.assign(new Error(msg), { code }); };
    if (!s.ready) fail(s.reason, 403);
    if (!same(pin || '', c.pin)) { record({ hz, operator, ip, ok: false, error: 'wrong PIN' }); fail('Wrong operator PIN.', 403); }
    const chk = radio.txCheck(+hz, c.ranges, { marine: c.marine });
    if (!chk.ok) fail(chk.reason, 403);
    if (!audio || audio.length < 1000) fail('The recording is empty.');
    if (busy) fail('Already transmitting. Wait for the current over to finish.', 409);
    busy = true;
    const file = path.join(dataDir, `tx-${Date.now()}.audio`);
    fs.writeFileSync(file, audio);
    let keyed = false;
    try {
      if (c.ptt === 'rigctld') { await rig(`F ${Math.round(+hz)}`, c); await rig('T 1', c); keyed = true; }
      await play(file, c);
      record({ hz: +hz, operator, ip, ok: true, bytes: audio.length });
      return { ok: true, freq: radio.fmtFreq(+hz), callsign: c.callsign };
    } catch (e) {
      record({ hz: +hz, operator, ip, ok: false, error: e.message });
      throw Object.assign(e, { code: 502 });
    } finally {
      if (keyed) { for (let i = 0; i < 3; i++) { try { await rig('T 0', c); break; } catch {} } }
      busy = false; fs.rm(file, () => {});
    }
  }

  function record(e) {
    log.unshift(Object.assign({ ts: Date.now(), callsign: cfg().callsign }, e));
    log = log.slice(0, 500);
    fs.writeFile(logFile, JSON.stringify(log, null, 1), () => {});
  }

  return { status, transmit };
}

// ---- Ops intercom ---------------------------------------------------------------------------
function createIntercom({ dataDir, broadcast }) {
  const dir = path.join(dataDir, 'intercom'); fs.mkdirSync(dir, { recursive: true });
  let msgs = []; try { msgs = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch {}
  const persist = () => fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(msgs.slice(0, 200)), () => {});
  function add({ from, text, audio, type, duration, channel }) {
    const id = 'ic' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const m = { id, from: String(from || 'Operator').slice(0, 40), channel: String(channel || 'Ops').slice(0, 30), ts: Date.now(), text: text ? String(text).slice(0, 1000) : null, duration: +duration || null };
    if (audio) {
      if (audio.length > 4e6) throw Object.assign(new Error('Voice message is too long (4 MB max).'), { code: 413 });
      const ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : 'webm';
      fs.writeFileSync(path.join(dir, `${id}.${ext}`), audio); m.audio = `api/intercom/audio/${id}.${ext}`;
    }
    if (!m.text && !m.audio) throw Object.assign(new Error('Send a voice message or some text.'), { code: 400 });
    msgs.unshift(m); if (msgs.length > 200) { const old = msgs.pop(); if (old.audio) fs.rm(path.join(dir, path.basename(old.audio)), () => {}); }
    persist(); broadcast('intercom', m);
    return m;
  }
  function audio(name, res) {
    if (!/^ic[a-z0-9]+\.(webm|ogg|m4a)$/.test(name)) { res.writeHead(400); return res.end(); }
    fs.readFile(path.join(dir, name), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': name.endsWith('ogg') ? 'audio/ogg' : name.endsWith('m4a') ? 'audio/mp4' : 'audio/webm' }); res.end(d); });
  }
  return { add, list: () => msgs.slice(0, 100), audio };
}

module.exports = { createTX, createIntercom };
