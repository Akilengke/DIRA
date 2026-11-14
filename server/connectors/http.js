'use strict';
const UA = process.env.SCAVENGE_USER_AGENT || 'Scavenge/1.0 (social & earth monitor)';

async function request(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers),
      body: opts.raw != null ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
    return res;
  } finally { clearTimeout(timer); }
}
async function getJSON(url, opts) { const r = await request(url, opts); const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error('Invalid JSON from ' + new URL(url).host); } }
const stripHtml = s => (s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();

module.exports = { request, getJSON, stripHtml };
