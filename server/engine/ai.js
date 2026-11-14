// AI briefing. Uses any OpenAI-compatible chat endpoint if configured — e.g. a local Ollama
// (free, LLM_BASE_URL=http://localhost:11434/v1, LLM_MODEL=llama3.1), Groq's free tier, or OpenRouter free models.
// Without one, falls back to Scavenge's built-in statistical briefing.
'use strict';
const core = require('../../public/js/core');

const cache = new Map();

async function briefing(posts, opts = {}) {
  const base = process.env.LLM_BASE_URL;
  const fallback = core.brief(posts, opts);
  if (!base) return { engine: 'scavenge-stat', text: fallback };
  const key = (opts.country || 'world') + Math.floor(Date.now() / 300000);
  if (cache.has(key)) return cache.get(key);
  const scope = opts.country ? posts.filter(p => p.country === opts.country) : posts;
  const trends = core.trends(scope, { windowMin: 60, limit: 12 });
  const sample = scope.slice(-60).map(p => `[${p.platform}${p.country ? ' · ' + p.country : ''} · ${p.mood}] ${p.text.slice(0, 200)}`).join('\n');
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.LLM_API_KEY ? { Authorization: 'Bearer ' + process.env.LLM_API_KEY } : {}) },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'llama3.1', temperature: 0.3, max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are an open-source intelligence analyst. Write a concise situation briefing (4-6 sentences) from social-media signals. Name the top themes, sentiment, where activity is concentrated, and anything that may need attention. Do not invent facts beyond the data.' },
          { role: 'user', content: `Scope: ${opts.country || 'Global'}\nTop trends (term, count, velocity, sentiment): ${JSON.stringify(trends.map(t => [t.term, t.count, t.velocity, t.sentiment]))}\nRecent posts:\n${sample}` }
        ]
      })
    });
    const j = await r.json();
    const out = { engine: process.env.LLM_MODEL || 'llm', text: j.choices?.[0]?.message?.content?.trim() || fallback };
    cache.set(key, out);
    return out;
  } catch (e) {
    return { engine: 'scavenge-stat', text: fallback, note: 'LLM unavailable: ' + e.message };
  }
}

module.exports = { briefing };
