// In-memory ring buffer for posts and events, with JSON persistence for rules, watch terms and alert history.
'use strict';
const fs = require('fs');
const path = require('path');

// SCAVENGE_DATA keeps data outside the app folder so it survives redeploys ("~/scavenge-data" works).
const FALLBACK = path.join(__dirname, '../../data');
let DATA = (process.env.SCAVENGE_DATA || '').replace(/^~(?=$|\/)/, require('os').homedir()) || FALLBACK;
try { fs.mkdirSync(DATA, { recursive: true }); fs.accessSync(DATA, fs.constants.W_OK); }
catch (e) { console.warn('Data folder ' + DATA + ' not writable (' + e.message + '); using ' + FALLBACK); DATA = FALLBACK; fs.mkdirSync(DATA, { recursive: true }); }
const file = n => path.join(DATA, n + '.json');
const load = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };
const save = (n, v) => { fs.writeFileSync(file(n) + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(file(n) + '.tmp', file(n)); };

const MAX_POSTS = +process.env.SCAVENGE_MAX_POSTS || 20000;
const state = {
  posts: load('posts', []),
  seen: new Set(),
  events: { quake: [], nature: [], news: [], weather: [], emergency: [] },
  incidents: { feeds: [], posts: [] },  // official feeds; distress calls found in posts & radio
  radioLog: [],
  rules: load('rules', [
    { id: 'r_sos', name: 'MAYDAY & distress calls', terms: ['mayday', 'pan-pan', 'sos', '7700', '"taking on water"', 'trapped'], categories: ['emergency'], platforms: [], country: '', mood: 'any', match: 'any', enabled: true, delivery: { inapp: true, sound: true } },
    { id: 'r_default', name: 'Kenya weather & floods', terms: ['flood', 'floods', 'heavy rain', 'landslide'], platforms: [], country: 'Kenya', mood: 'any', match: 'any', enabled: true, delivery: { inapp: true } }
  ]),
  watch: load('watch', ['election', 'climate', 'AI', 'earthquake', 'Nairobi']),
  alerts: load('alerts', []),
  sources: {}
};
state.posts.forEach(p => state.seen.add(p.id));

function addPost(p) {
  if (state.seen.has(p.id)) return false;
  state.seen.add(p.id);
  state.posts.push(p);
  if (state.posts.length > MAX_POSTS) state.posts.splice(0, state.posts.length - MAX_POSTS).forEach(o => state.seen.delete(o.id));
  return true;
}

let dirty = false;
const markDirty = () => (dirty = true);
setInterval(() => { if (dirty) { dirty = false; save('posts', state.posts.slice(-5000)); } }, 60000).unref();

module.exports = { state, addPost, save, markDirty, DATA };
