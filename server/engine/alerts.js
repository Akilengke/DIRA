// Alert engine: match every incoming post against the user's rules and deliver hits.
// Delivery channels (all free): in-app live push (SSE), browser notifications (client-side),
// any webhook (Slack, Discord, Teams, Zapier…) and ntfy.sh phone push.
'use strict';
const { matchRule } = require('../../public/js/core');
const { state, save } = require('./store');

const cooldown = new Map(); // rule id → last delivered ts, avoids flooding external channels

async function deliver(rule, alert) {
  const d = rule.delivery || {};
  const last = cooldown.get(rule.id) || 0;
  if (Date.now() - last < (d.cooldownSec || 60) * 1000) return;
  cooldown.set(rule.id, Date.now());
  const text = `🛰 Scavenge · ${rule.name}\n[${alert.post.platform}] ${alert.post.text.slice(0, 280)}\n${alert.post.url || ''}`;
  const jobs = [];
  if (d.webhook) jobs.push(fetch(d.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text, rule: rule.name, post: alert.post }) }));
  if (d.ntfy) jobs.push(fetch(`https://ntfy.sh/${encodeURIComponent(d.ntfy)}`, { method: 'POST', body: text, headers: { Title: 'Scavenge alert: ' + rule.name, Tags: 'satellite', Click: alert.post.url || '' } }));
  const r = await Promise.allSettled(jobs);
  r.filter(x => x.status === 'rejected').forEach(x => console.warn('[alerts] delivery failed:', x.reason.message));
}

function check(post, broadcast) {
  for (const rule of state.rules) {
    const hits = matchRule(rule, post);
    if (!hits) continue;
    const alert = { id: 'al_' + post.id + '_' + rule.id, ruleId: rule.id, rule: rule.name, hits, post, ts: Date.now() };
    state.alerts.unshift(alert);
    rule.hits = (rule.hits || 0) + 1;
    broadcast('alert', alert);
    deliver(rule, alert).catch(() => {});
  }
  if (state.alerts.length > 500) state.alerts.length = 500;
}

let t = null;
const persist = () => { clearTimeout(t); t = setTimeout(() => { save('alerts', state.alerts); save('rules', state.rules); }, 5000); };

module.exports = { check, persist };
