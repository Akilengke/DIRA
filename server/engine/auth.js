// Operator sign-in and the encrypted vault for platform tokens.
//  • Admin sign-in with a username and password (scrypt hash). First run creates the default admin / admin
//    (override with SCAVENGE_ADMIN_USER / SCAVENGE_ADMIN_PASSWORD). The UI asks to change a default password.
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
  const ready = (async () => {
    if (op.hash) { if (!op.user) { op.user = 'admin'; save(); } return; }
    const user = process.env.SCAVENGE_ADMIN_USER || 'admin', pw = process.env.SCAVENGE_ADMIN_PASSWORD || 'admin';
    op.user = user; op.salt = crypto.randomBytes(16).toString('base64'); op.hash = await hashPw(pw, op.salt); op.isDefault = !process.env.SCAVENGE_ADMIN_PASSWORD; op.created = Date.now(); save();
    console.log(`\n  ◉ SCAVENGE admin sign-in created: user "${user}"${op.isDefault ? ', password "admin" (change it after signing in)' : ''}\n`);
  })();

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

  async function login({ username, password }, req, res) {
    await ready;
    const ip = req.socket.remoteAddress; throttle(ip);
    const okUser = same(String(username || '').trim().toLowerCase(), String(op.user).toLowerCase());
    const okPw = same(await hashPw(String(password || ''), op.salt), op.hash);
    if (!okUser || !okPw) { failed(ip); throw Object.assign(new Error('Wrong username or password.'), { code: 403 }); }
    fails.delete(ip); newSession(res, req); return { ok: true, defaultPassword: !!op.isDefault };
  }
  // change the admin username and/or password (signed in, current password required); signs out other browsers
  async function change({ current, username, password }, req, res) {
    await ready;
    if (!isOperator(req)) throw Object.assign(new Error('Sign in first.'), { code: 401 });
    const ip = req.socket.remoteAddress; throttle(ip);
    if (!same(await hashPw(String(current || ''), op.salt), op.hash)) { failed(ip); throw Object.assign(new Error('Current password is wrong.'), { code: 403 }); }
    const u = String(username || op.user).trim();
    if (!/^[\w.@-]{3,40}$/.test(u)) throw Object.assign(new Error('Username: 3–40 letters, digits, dots, dashes or @.'), { code: 400 });
    if (!password || String(password).length < 8) throw Object.assign(new Error('Choose a new password of at least 8 characters.'), { code: 400 });
    if (String(password) === 'admin') throw Object.assign(new Error('Choose a password other than the default.'), { code: 400 });
    op.user = u; op.salt = crypto.randomBytes(16).toString('base64'); op.hash = await hashPw(String(password), op.salt); op.isDefault = false; op.sessions = {}; save();
    newSession(res, req); return { ok: true };
  }
  const setup = () => { throw Object.assign(new Error('Sign in with the admin username and password.'), { code: 410 }); };
  function logout(req, res) {
    const id = cookies(req).scv_session; if (id) { delete op.sessions[crypto.createHash('sha256').update(id).digest('hex')]; save(); }
    res.setHeader('Set-Cookie', 'scv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return { ok: true };
  }
  const status = req => { const on = !!isOperator(req); return { setup: true, signedIn: on, user: on ? op.user : null, defaultPassword: on && !!op.isDefault }; };

  return { setup, login, change, logout, status, ready, isOperator, isSetup: () => true, seal, open, cookies, secure };
}

module.exports = { createAuth };
