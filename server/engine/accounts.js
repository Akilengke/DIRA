// Connected social accounts. The operator signs in to each platform on the platform's own login page (OAuth);
// Scavenge receives a read-only token, encrypts it, and its connectors use it to monitor trends.
// Bluesky uses an app password (its supported method for third-party tools); Mastodon registers itself with
// whichever instance you name, so it needs no developer setup.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV = k => (process.env[k] || '').trim();
const form = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();
async function call(url, opts = {}) {
  const r = await fetch(url, Object.assign({ headers: {} }, opts, { headers: Object.assign({ 'User-Agent': process.env.SCAVENGE_USER_AGENT || 'Scavenge/1.0', Accept: 'application/json' }, opts.headers) }));
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  if (!r.ok) throw new Error(j.error_description || j.message || j.error?.message || (typeof j.error === 'string' ? j.error : '') || `HTTP ${r.status} from ${new URL(url).host}`);
  return j;
}
const basic = (id, secret) => 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

// Each platform: how to sign in, what Scavenge reads, and what the platform requires.
const PLATFORMS = {
  x: {
    label: 'X (Twitter)', kind: 'oauth', pkce: true, portal: 'https://developer.x.com/en/portal/dashboard',
    reads: 'Recent posts matching your watch terms and alert rules.',
    needs: 'An X developer app (OAuth 2.0, type “Web App”). Searching posts needs an X API plan that includes recent search.',
    authorize: (c, p) => `https://x.com/i/oauth2/authorize?${form({ response_type: 'code', client_id: c.id, redirect_uri: p.redirect, scope: 'tweet.read users.read offline.access', state: p.state, code_challenge: p.challenge, code_challenge_method: 'S256' })}`,
    exchange: (c, p) => call('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(c.secret ? { Authorization: basic(c.id, c.secret) } : {}) }, body: form({ grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirect, code_verifier: p.verifier, client_id: c.id }) }),
    refresh: (c, t) => call('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(c.secret ? { Authorization: basic(c.id, c.secret) } : {}) }, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.id }) }),
    profile: async t => { const j = await call('https://api.x.com/2/users/me', { headers: { Authorization: 'Bearer ' + t.access_token } }); return { id: j.data.id, handle: '@' + j.data.username, name: j.data.name }; }
  },
  reddit: {
    label: 'Reddit', kind: 'oauth', portal: 'https://www.reddit.com/prefs/apps',
    reads: 'Search across Reddit and your subscribed communities, with higher rate limits than anonymous access.',
    needs: 'A Reddit app of type “web app” (free).',
    authorize: (c, p) => `https://www.reddit.com/api/v1/authorize?${form({ client_id: c.id, response_type: 'code', state: p.state, redirect_uri: p.redirect, duration: 'permanent', scope: 'read identity mysubreddits' })}`,
    exchange: (c, p) => call('https://www.reddit.com/api/v1/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basic(c.id, c.secret) }, body: form({ grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirect }) }),
    refresh: (c, t) => call('https://www.reddit.com/api/v1/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basic(c.id, c.secret) }, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token }) }),
    profile: async t => { const j = await call('https://oauth.reddit.com/api/v1/me', { headers: { Authorization: 'Bearer ' + t.access_token } }); return { id: j.id, handle: 'u/' + j.name, name: j.name }; }
  },
  mastodon: {
    label: 'Mastodon', kind: 'mastodon', portal: null, selfRegister: true,
    reads: 'Your home timeline, hashtag timelines and full-text search on your instance.',
    needs: 'Nothing to set up. Enter your instance (e.g. mastodon.social) and sign in.',
    authorize: (c, p) => `https://${p.instance}/oauth/authorize?${form({ client_id: c.id, redirect_uri: p.redirect, response_type: 'code', scope: 'read', state: p.state })}`,
    exchange: (c, p) => call(`https://${p.instance}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'authorization_code', code: p.code, client_id: c.id, client_secret: c.secret, redirect_uri: p.redirect, scope: 'read' }) }),
    profile: async (t, p) => { const j = await call(`https://${p.instance}/api/v1/accounts/verify_credentials`, { headers: { Authorization: 'Bearer ' + t.access_token } }); return { id: j.id, handle: `@${j.acct}@${p.instance}`, name: j.display_name || j.username }; }
  },
  bluesky: {
    label: 'Bluesky', kind: 'password', portal: 'https://bsky.app/settings/app-passwords',
    reads: 'Post search and your following timeline.',
    needs: 'An app password from Bluesky Settings → Privacy and security → App passwords. Never use your main password.',
  },
  youtube: {
    label: 'YouTube', kind: 'oauth', pkce: true, portal: 'https://console.cloud.google.com/apis/credentials',
    reads: 'Newest videos matching your watch terms, using your own API quota.',
    needs: 'A Google Cloud OAuth client (type “Web application”) with the YouTube Data API v3 enabled.',
    authorize: (c, p) => `https://accounts.google.com/o/oauth2/v2/auth?${form({ client_id: c.id, redirect_uri: p.redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.readonly', access_type: 'offline', prompt: 'consent', state: p.state, code_challenge: p.challenge, code_challenge_method: 'S256' })}`,
    exchange: (c, p) => call('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'authorization_code', code: p.code, client_id: c.id, client_secret: c.secret, redirect_uri: p.redirect, code_verifier: p.verifier }) }),
    refresh: (c, t) => call('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.id, client_secret: c.secret }) }),
    profile: async t => { const j = await call('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + t.access_token } }); const ch = (j.items || [])[0]; return { id: ch ? ch.id : 'google', handle: ch ? ch.snippet.title : 'Google account', name: ch ? ch.snippet.title : '' }; }
  },
  facebook: {
    label: 'Facebook & Instagram', kind: 'oauth', portal: 'https://developers.facebook.com/apps',
    reads: 'Posts on Facebook Pages you manage, and recent Instagram posts for your watch hashtags (Instagram professional account linked to a Page).',
    needs: 'A Meta app with Facebook Login. Pages and Instagram permissions need Meta app review before people other than the app’s admins can use them.',
    authorize: (c, p) => `https://www.facebook.com/v21.0/dialog/oauth?${form({ client_id: c.id, redirect_uri: p.redirect, state: p.state, scope: 'pages_show_list,pages_read_engagement,instagram_basic,business_management' })}`,
    exchange: async (c, p) => {
      const short = await call(`https://graph.facebook.com/v21.0/oauth/access_token?${form({ client_id: c.id, client_secret: c.secret, redirect_uri: p.redirect, code: p.code })}`);
      const long = await call(`https://graph.facebook.com/v21.0/oauth/access_token?${form({ grant_type: 'fb_exchange_token', client_id: c.id, client_secret: c.secret, fb_exchange_token: short.access_token })}`);
      return long;
    },
    profile: async t => { const j = await call(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${t.access_token}`); return { id: j.id, handle: j.name, name: j.name }; }
  },
  linkedin: {
    label: 'LinkedIn', kind: 'oauth', portal: 'https://www.linkedin.com/developers/apps',
    reads: 'Posts from LinkedIn company pages you administer.',
    needs: 'A LinkedIn app with “Sign In with LinkedIn using OpenID Connect”. Reading page posts also needs the Community Management API product (LinkedIn approval). LinkedIn offers no public post search.',
    authorize: (c, p) => `https://www.linkedin.com/oauth/v2/authorization?${form({ response_type: 'code', client_id: c.id, redirect_uri: p.redirect, state: p.state, scope: c.orgScope === false ? 'openid profile' : 'openid profile r_organization_social' })}`,
    exchange: (c, p) => call('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirect, client_id: c.id, client_secret: c.secret }) }),
    refresh: (c, t) => call('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.id, client_secret: c.secret }) }),
    profile: async t => { const j = await call('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token } }); return { id: j.sub, handle: j.name, name: j.name }; }
  }
};
const ENV_APPS = { tomtom: ['TOMTOM_API_KEY', ''], x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'], reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'], youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], facebook: ['FB_APP_ID', 'FB_APP_SECRET'], linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] };

function createAccounts({ dataDir, auth }) {
  const file = path.join(dataDir, 'accounts.json');
  let db = { accounts: [], apps: {}, mastodonApps: {} };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(file + '.tmp', file); try { fs.chmodSync(file, 0o600); } catch {} };
  const pending = new Map(); // state → { platform, verifier, instance, redirect, at }

  function app(platform) {
    const sealed = db.apps[platform];
    if (sealed) try { return auth.open(sealed); } catch {}
    const e = ENV_APPS[platform]; if (e && ENV(e[0])) return { id: ENV(e[0]), secret: ENV(e[1]), fromEnv: true };
    return null;
  }
  function setApp(platform, { id, secret }) {
    if (!ENV_APPS[platform]) throw Object.assign(new Error('This platform does not need app credentials.'), { code: 400 });
    if (!id || (platform !== 'x' && platform !== 'tomtom' && !secret)) throw Object.assign(new Error(platform === 'tomtom' ? 'Paste your TomTom API key.' : 'Enter both the client ID and the client secret.'), { code: 400 });
    db.apps[platform] = auth.seal({ id: String(id).trim(), secret: secret ? String(secret).trim() : '' }); save();
    return { ok: true };
  }
  function clearApp(platform) { delete db.apps[platform]; save(); return { ok: true }; }

  const base = req => (ENV('PUBLIC_URL') || `${(req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http')}://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '');
  const redirectFor = (req, platform) => `${base(req)}/api/oauth/callback/${platform}`;

  function list(req) {
    return {
      callbackBase: base(req) + '/api/oauth/callback/',
      platforms: Object.entries(PLATFORMS).map(([id, p]) => {
        const a = app(id);
        return { id, label: p.label, kind: p.kind, reads: p.reads, needs: p.needs, portal: p.portal, redirect: redirectFor(req, id),
          needsApp: !!ENV_APPS[id], appConfigured: !!a, appFromEnv: !!(a && a.fromEnv), appClientId: a ? a.id.slice(0, 6) + '…' : null };
      }),
      keys: { tomtom: (() => { const a = app('tomtom'); return { configured: !!a, fromEnv: !!(a && a.fromEnv), hint: a ? a.id.slice(0, 4) + '…' : null }; })() },
      accounts: db.accounts.map(a => ({ id: a.id, platform: a.platform, handle: a.handle, name: a.name, instance: a.instance, connectedAt: a.connectedAt, lastUsed: a.lastUsed, status: a.status, error: a.error }))
    };
  }

  async function start(platform, body, req) {
    const p = PLATFORMS[platform]; if (!p) throw Object.assign(new Error('Unknown platform.'), { code: 404 });
    if (p.kind === 'password') return blueskyLogin(body);
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const redirect = redirectFor(req, platform);
    let c, instance;
    if (p.kind === 'mastodon') {
      instance = String(body.instance || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(instance)) throw Object.assign(new Error('Enter your instance’s domain, for example mastodon.social.'), { code: 400 });
      const k = instance + '|' + redirect;
      if (!db.mastodonApps[k]) {
        const j = await call(`https://${instance}/api/v1/apps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Scavenge', redirect_uris: redirect, scopes: 'read', website: base(req) }) });
        db.mastodonApps[k] = auth.seal({ id: j.client_id, secret: j.client_secret }); save();
      }
      c = auth.open(db.mastodonApps[k]);
    } else {
      c = app(platform);
      if (!c) throw Object.assign(new Error(`Add your ${p.label} app’s client ID and secret first.`), { code: 409 });
    }
    pending.set(state, { platform, verifier, instance, redirect, at: Date.now() });
    for (const [s, v] of pending) if (Date.now() - v.at > 15 * 60000) pending.delete(s);
    return { url: p.authorize(c, { state, challenge, redirect, instance }) };
  }

  async function callback(platform, q) {
    const st = pending.get(q.get('state')); pending.delete(q.get('state'));
    if (!st || st.platform !== platform) throw new Error('This sign-in link expired or did not start here. Start again from Accounts.');
    if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
    const p = PLATFORMS[platform];
    const c = p.kind === 'mastodon' ? auth.open(db.mastodonApps[st.instance + '|' + st.redirect]) : app(platform);
    const tok = await p.exchange(c, { code: q.get('code'), verifier: st.verifier, redirect: st.redirect, instance: st.instance });
    const t = { access_token: tok.access_token, refresh_token: tok.refresh_token || null, expires_at: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null };
    const prof = await p.profile(t, { instance: st.instance });
    return store(platform, prof, t, { instance: st.instance });
  }

  async function blueskyLogin({ handle, appPassword }) {
    handle = String(handle || '').trim().replace(/^@/, '');
    if (!handle || !appPassword) throw Object.assign(new Error('Enter your Bluesky handle and an app password.'), { code: 400 });
    if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(String(appPassword).trim())) throw Object.assign(new Error('That does not look like a Bluesky app password (xxxx-xxxx-xxxx-xxxx). Create one in Bluesky Settings; never use your main password.'), { code: 400 });
    const s = await call('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: handle, password: String(appPassword).trim() }) });
    return { account: store('bluesky', { id: s.did, handle: '@' + s.handle, name: s.handle }, { access_token: s.accessJwt, refresh_token: s.refreshJwt, expires_at: Date.now() + 90 * 60000, service: 'https://bsky.social' }) };
  }

  function store(platform, prof, t, extra = {}) {
    const existing = db.accounts.find(a => a.platform === platform && a.remoteId === prof.id && a.instance === extra.instance);
    const acc = existing || { id: 'acc_' + crypto.randomBytes(6).toString('hex'), platform, remoteId: prof.id, connectedAt: Date.now() };
    Object.assign(acc, { handle: prof.handle, name: prof.name, instance: extra.instance, token: auth.seal(t), status: 'ok', error: null });
    if (!existing) db.accounts.push(acc);
    save();
    return { id: acc.id, platform, handle: acc.handle };
  }

  function remove(id) {
    const a = db.accounts.find(x => x.id === id); if (!a) throw Object.assign(new Error('No such account.'), { code: 404 });
    db.accounts = db.accounts.filter(x => x.id !== id); save();
    return { ok: true, note: `Disconnected from Scavenge. You can also revoke access in your ${PLATFORMS[a.platform].label} settings.` };
  }

  /** Fresh credentials for every connected account of a platform (refreshing tokens when needed). */
  async function forPlatform(platform) {
    const out = [];
    for (const a of db.accounts.filter(x => x.platform === platform)) {
      try {
        let t = auth.open(a.token);
        if (t.expires_at && Date.now() > t.expires_at - 120000) {
          if (platform === 'bluesky') {
            const s = await call(`${t.service || 'https://bsky.social'}/xrpc/com.atproto.server.refreshSession`, { method: 'POST', headers: { Authorization: 'Bearer ' + t.refresh_token } });
            t = { access_token: s.accessJwt, refresh_token: s.refreshJwt, expires_at: Date.now() + 90 * 60000, service: t.service };
          } else if (t.refresh_token && PLATFORMS[platform].refresh) {
            const r = await PLATFORMS[platform].refresh(app(platform), t);
            t = { access_token: r.access_token, refresh_token: r.refresh_token || t.refresh_token, expires_at: r.expires_in ? Date.now() + r.expires_in * 1000 : null };
          } else if (platform !== 'facebook' && platform !== 'mastodon') throw new Error('Sign-in expired. Reconnect this account.');
          a.token = auth.seal(t);
        }
        a.lastUsed = Date.now(); a.status = 'ok'; a.error = null;
        out.push({ account: a, token: t.access_token, instance: a.instance, remoteId: a.remoteId, fail: e => { a.status = 'error'; a.error = String(e && e.message || e).slice(0, 200); save(); } });
      } catch (e) { a.status = 'error'; a.error = e.message.slice(0, 200); }
    }
    save();
    return out;
  }
  const hasAny = platform => db.accounts.some(a => a.platform === platform);

  return { list, start, callback, remove, setApp, clearApp, forPlatform, hasAny, PLATFORMS, key: name => { const a = app(name); return a ? a.id : null; } };
}

module.exports = { createAccounts, PLATFORMS };
