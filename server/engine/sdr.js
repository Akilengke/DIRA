// Local software-defined radio receiver (RTL-SDR dongle, ~US$30) driven through rtl_fm.
//  • Tunes one frequency, or scans a list and stops on activity (squelch).
//  • Streams the audio to every listening browser (MP3 via ffmpeg, else raw WAV).
//  • Cuts each transmission into a clip, optionally transcribes it with any Whisper-compatible
//    endpoint, and flags MAYDAY / PAN-PAN / SÉCURITÉ calls as emergencies.
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const core = require('../../public/js/core');
const radio = require('../../public/js/radio');

const RATE = 24000;
const has = bin => { try { return spawnSync('which', [bin]).status === 0; } catch { return false; } };

/** Splits a 16-bit mono PCM stream into transmissions using an energy gate. Pure; unit-tested. */
class Segmenter {
  constructor(o) {
    Object.assign(this, { rate: RATE, threshold: 600, hangMs: 1500, minMs: 700, maxMs: 60000 }, o);
    this.frame = Math.round(this.rate / 10); this.carry = Buffer.alloc(0); this.active = null; this.quiet = 0; this.level = 0;
  }
  push(buf) {
    let b = this.carry.length ? Buffer.concat([this.carry, buf]) : buf;
    const bytes = this.frame * 2;
    let off = 0;
    for (; off + bytes <= b.length; off += bytes) {
      const f = b.subarray(off, off + bytes);
      let sum = 0; for (let i = 0; i < f.length; i += 2) { const v = f.readInt16LE(i); sum += v * v; }
      const rms = Math.sqrt(sum / this.frame); this.level = rms;
      if (rms >= this.threshold) {
        if (!this.active) this.active = { start: Date.now(), frames: [] };
        this.quiet = 0;
      } else if (this.active) this.quiet += 100;
      if (this.active) {
        this.active.frames.push(Buffer.from(f));
        const len = this.active.frames.length * 100;
        if (this.quiet >= this.hangMs || len >= this.maxMs) this.close();
      }
    }
    this.carry = b.subarray(off);
  }
  close() {
    const a = this.active; this.active = null; this.quiet = 0;
    if (!a) return;
    const keep = a.frames.slice(0, a.frames.length - Math.floor(this.hangMs / 100) + 2);
    const ms = keep.length * 100;
    if (ms >= this.minMs) this.onSegment && this.onSegment(Buffer.concat(keep), ms, a.start);
  }
}

function wavHeader(dataLen, rate = RATE) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(dataLen === 0xffffffff ? 0xffffffff : 36 + dataLen, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dataLen, 40);
  return h;
}

async function transcribe(wav) {
  const base = process.env.TRANSCRIBE_URL;
  if (!base) return null;
  const fd = new FormData();
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  fd.append('model', process.env.TRANSCRIBE_MODEL || 'whisper-1');
  const r = await fetch(base.replace(/\/$/, '') + '/audio/transcriptions', { method: 'POST', body: fd, headers: process.env.TRANSCRIBE_API_KEY ? { Authorization: 'Bearer ' + process.env.TRANSCRIBE_API_KEY } : {} });
  if (!r.ok) throw new Error('transcription ' + r.status);
  const j = await r.json();
  return (j.text || '').trim() || null;
}

function createSDR({ dataDir, onTransmission, onLevel }) {
  const clipDir = path.join(dataDir, 'radio'); fs.mkdirSync(clipDir, { recursive: true });
  const st = { proc: null, enc: null, listeners: new Set(), freqs: [], current: null, mode: 'fm', squelch: 0, started: null, error: null, clips: [] };
  const seg = new Segmenter({ threshold: +process.env.SDR_VOX_LEVEL || 600, onSegment: (pcm, ms, start) => save(pcm, ms, start).catch(e => console.warn('[sdr] clip', e.message)) });
  let lvlTimer = null;

  async function save(pcm, ms, start) {
    const id = 'rx' + start.toString(36);
    const wav = Buffer.concat([wavHeader(pcm.length), pcm]);
    fs.writeFileSync(path.join(clipDir, id + '.wav'), wav);
    st.clips.push(id); while (st.clips.length > 300) { const old = st.clips.shift(); fs.rm(path.join(clipDir, old + '.wav'), () => {}); }
    const hz = st.current || st.freqs[0];
    const ch = radio.CHANNELS.find(c => c.hz === hz);
    const tx = { id, freq: hz, channel: ch ? ch.name : radio.fmtFreq(hz), mode: st.mode, ts: start, duration: +(ms / 1000).toFixed(1), clip: `api/radio/clip/${id}.wav`,
      lat: +process.env.SDR_LAT || null, lon: +process.env.SDR_LON || null, text: null, distress: null };
    try { tx.text = await transcribe(wav); } catch (e) { tx.note = e.message; }
    if (tx.text) tx.distress = core.distress(tx.text);
    onTransmission(tx);
  }

  function status() {
    return { available: has('rtl_fm'), encoder: has('ffmpeg') ? 'mp3' : 'wav', running: !!st.proc, freqs: st.freqs, current: st.current, mode: st.mode, squelch: st.squelch,
      listeners: st.listeners.size, started: st.started, error: st.error, transcription: !!process.env.TRANSCRIBE_URL, location: process.env.SDR_LAT ? [+process.env.SDR_LAT, +process.env.SDR_LON] : null };
  }

  function stop() {
    if (st.proc) { st.proc.removeAllListeners('exit'); st.proc.kill('SIGTERM'); }
    if (st.enc) st.enc.kill('SIGTERM');
    st.proc = st.enc = null; st.current = null; seg.close(); clearInterval(lvlTimer);
  }

  function start({ freqs, mode, squelch, gain }) {
    if (!has('rtl_fm')) throw Object.assign(new Error('rtl_fm is not installed on this server. Install rtl-sdr and plug in an RTL-SDR dongle.'), { code: 409 });
    freqs = (freqs || []).map(Number).filter(f => f > 24e6 && f < 1.8e9).slice(0, 30);
    if (!freqs.length) throw Object.assign(new Error('Pick at least one frequency between 24 MHz and 1.8 GHz. HF (below 24 MHz) needs a direct-sampling dongle; set SDR_EXTRA_ARGS="-E direct2".'), { code: 400 });
    if (freqs.length > 1 && !(+squelch > 0)) squelch = 60; // scanning needs squelch so rtl_fm can hop
    stop();
    const m = ['fm', 'am', 'usb', 'lsb'].includes(mode) ? mode : 'fm';
    const args = ['-M', m, '-s', String(RATE), '-l', String(+squelch || 0), '-E', 'pad', ...(gain ? ['-g', String(gain)] : []), ...freqs.flatMap(f => ['-f', String(f)]),
      ...(process.env.SDR_EXTRA_ARGS || '').split(' ').filter(Boolean), '-'];
    const p = spawn('rtl_fm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    Object.assign(st, { proc: p, freqs, mode: m, squelch: +squelch || 0, started: Date.now(), error: null, current: freqs[0] });
    if (has('ffmpeg')) {
      st.enc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', 'pipe:0', '-f', 'mp3', '-b:a', '48k', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
      st.enc.stdout.on('data', d => { for (const res of st.listeners) res.write(d); });
      st.enc.stdin.on('error', () => {});
    }
    p.stdout.on('data', d => {
      seg.push(d);
      if (st.enc) st.enc.stdin.write(d); else for (const res of st.listeners) res.write(d);
    });
    p.stderr.on('data', d => { const m2 = /Tuned to (\d+) Hz/.exec(String(d)); if (m2 && freqs.length > 1) st.current = +m2[1] - 0; if (/No supported devices|usb_claim_interface error|Failed to open/.test(String(d))) st.error = String(d).trim().split('\n').pop(); });
    p.on('exit', code => { if (st.proc === p) { st.error = st.error || `rtl_fm stopped (exit ${code})`; stop(); onLevel(status()); } });
    lvlTimer = setInterval(() => onLevel({ level: Math.round(seg.level), current: st.current, active: !!seg.active }), 500);
    return status();
  }

  function listen(req, res) {
    if (!st.proc) { res.writeHead(409, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Receiver is not running. Tune a frequency first.' })); }
    const mp3 = !!st.enc;
    res.writeHead(200, { 'Content-Type': mp3 ? 'audio/mpeg' : 'audio/wav', 'Cache-Control': 'no-store', 'Transfer-Encoding': 'chunked' });
    if (!mp3) res.write(wavHeader(0xffffffff));
    st.listeners.add(res); req.on('close', () => st.listeners.delete(res));
  }

  function clip(id, res) {
    if (!/^rx[a-z0-9]+$/.test(id)) { res.writeHead(400); return res.end(); }
    fs.readFile(path.join(clipDir, id + '.wav'), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(d); });
  }

  return { start, stop, status, listen, clip, feed: d => seg.push(d) };
}

module.exports = { createSDR, Segmenter, wavHeader, RATE };
