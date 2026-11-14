// Operator sign-in and the encrypted vault for platform tokens.
//  • First run: the server prints a one-time setup code to its log. Whoever holds the code chooses the operator
//    password (stored as a scrypt hash). Nobody can claim the site without access to the server logs.
//  • Sessions are random 256-bit tokens in an HttpOnly, SameSite=Lax cookie (Secure over HTTPS), valid 30 days.
//  • Secrets (OAuth tokens, app credentials) are encrypted with AES-256-GCM using SCAVENGE_SECRET or a key
//    generated into data/.vault-key on first run.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createAuth(dataDir) {
  const file = path.join(dataDir, 'operator.json');
  let op = {}; try { op = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(op)); fs.renameSync(file + '.tmp', file); try { fs.chmodSync(file, 0o600); } catch {} };
  if (!op.sessions) op.sessions = {};
  let setupCode = null;
  if (!op.hash) {
    setupCode = (process.env.SCAVENGE_SETUP_CODE || crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8)).toUpperCase();
    console.log(`\n  ◉ SCAVENGE operator setup code: ${setupCode}\n    Open the site, choose “Sign in”, and enter this code to create the operator password.\n`);
  }

  // ---- vault
  const keyFile = path.join(dataDir, '.vault-key');
  let key;
  if (process.env.SCAVENGE_SECRET) key = crypto.createHash('sha256').update(process.env.SCAVENGE_SECRET).digest();
  else { try { key = Buffer.from(fs.readFileSync(keyFile, 'utf8'), 'base64'); } catch { key = crypto.randomBytes(32); fs.writeFileSync(keyFile, key.toString('base64')); try { fs.chmodSync(keyFile, 0o600); } catch {} } }
  const seal = obj => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.'); };
  const open = str => { const [iv, tag, enc] = String(str).split('.').map(s => Buffer.from(s, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString('utf8')); };

  // ---- passwords & sessions
  const hashPw = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => e ? bad(e) : ok(k.toString('base64'))));
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const secure = req => (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' || !!req.socket.encrypted;
  const fails = new Map(); // ip → [count, firstTs] — slows down password guessing

  function throttle(ip) {
    const f = fails.get(ip); if (!f) return;
    if (Date.now() - f[1] > 15 * 60000) return fails.delete(ip);
    if (f[0] >= 8) throw Object.assign(new Error('Too many attempts. Wait 15 minutes and try again.'), { code: 429 });
  }
  const failed = ip => { const f = fails.get(ip) || [0, Date.now()]; f[0]++; fails.set(ip, f); };

  function newSession(res, req) {
    const id = crypto.randomBytes(32).toString('base64url');
    op.sessions[crypto.createHash('sha256').update(id).digest('hex')] = { at: Date.now(), exp: Date.now() + 30 * 86400000, ua: String(req.headers['user-agent'] || '').slice(0, 80) };
    for (const [k, v] of Object.entries(op.sessions)) if (v.exp < Date.now()) delete op.sessions[k];
    save();
    res.setHeader('Set-Cookie', `scv_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure(req) ? '; Secure' : ''}`);
  }
  function session(req) {
    const id = cookies(req).scv_session; if (!id) return null;
    const s = op.sessions[crypto.createHash('sha256').update(id).digest('hex')];
    return s && s.exp > Date.now() ? s : null;
  }
  const isOperator = req => !!session(req) || (process.env.SCAVENGE_TOKEN && req.headers.authorization === 'Bearer ' + process.env.SCAVENGE_TOKEN);

  async function setup({ code, password }, req, res) {
    const ip = req.socket.remoteAddress; throttle(ip);
    if (op.hash) throw Object.assign(new Error('The operator account already exists. Sign in instead.'), { code: 409 });
    if (!setupCode || !same(String(code || '').trim().toUpperCase(), setupCode)) { failed(ip); throw Object.assign(new Error('That setup code is not right. It is printed in the server log when Scavenge starts.'), { code: 403 }); }
    if (!password || String(password).length < 10) throw Object.assign(new Error('Choose a password of at least 10 characters.'), { code: 400 });
    const salt = crypto.randomBytes(16).toString('base64');
    op.salt = salt; op.hash = await hashPw(String(password), salt); op.created = Date.now(); setupCode = null; save();
    newSession(res, req); return { ok: true };
  }
  async function login({ password }, req, res) {
    const ip = req.socket.remoteAddress; throttle(ip);
    if (!op.hash) throw Object.assign(new Error('Set up the operator account first with the setup code from the server log.'), { code: 409 });
    if (!same(await hashPw(String(password || ''), op.salt), op.hash)) { failed(ip); throw Object.assign(new Error('Wrong password.'), { code: 403 }); }
    fails.delete(ip); newSession(res, req); return { ok: true };
  }
  function logout(req, res) {
    const id = cookies(req).scv_session; if (id) { delete op.sessions[crypto.createHash('sha256').update(id).digest('hex')]; save(); }
    res.setHeader('Set-Cookie', 'scv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return { ok: true };
  }
  const status = req => ({ setup: !!op.hash, signedIn: !!isOperator(req) });

  return { setup, login, logout, status, isOperator, isSetup: () => !!op.hash, seal, open, cookies, secure };
}

module.exports = { createAuth };
