// Social platform connectors. Each returns raw posts in the common shape:
// { id, platform, author, text, url, ts, lang?, lat?, lon?, metrics? }
// Free/keyless sources work out of the box. X, Facebook/Instagram, LinkedIn and YouTube
// only expose search through their official APIs, so they activate when you add credentials.
'use strict';
const { getJSON, stripHtml } = require('./http');

const env = k => process.env[k] && process.env[k].trim();

const reddit = {
  id: 'reddit', label: 'Reddit', free: true,
  enabled: () => env('REDDIT_DISABLED') !== '1',
  async search(terms) {
    const q = terms.length ? terms.map(t => `"${t}"`).join(' OR ') : '';
    const url = q ? `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=50&t=day` : 'https://www.reddit.com/r/all/new.json?limit=50';
    const j = await getJSON(url);
    return (j.data?.children || []).map(({ data: d }) => ({
      id: 'rd_' + d.id, platform: 'reddit', author: 'u/' + d.author, text: [d.title, d.selftext].filter(Boolean).join(' — ').slice(0, 600),
      url: 'https://www.reddit.com' + d.permalink, ts: d.created_utc * 1000, channel: 'r/' + d.subreddit, metrics: { score: d.score, comments: d.num_comments }
    }));
  }
};

const mastodon = {
  id: 'mastodon', label: 'Mastodon', free: true,
  enabled: () => true,
  async search(terms) {
    const host = env('MASTODON_INSTANCE') || 'mastodon.social';
    const tags = terms.filter(t => /^[#\w]+$/.test(t)).map(t => t.replace(/^#/, '')).slice(0, 4);
    const urls = tags.length ? tags.map(t => `https://${host}/api/v1/timelines/tag/${encodeURIComponent(t)}?limit=30`) : [`https://${host}/api/v1/timelines/public?limit=40`];
    const lists = await Promise.allSettled(urls.map(u => getJSON(u)));
    return lists.flatMap(r => r.status === 'fulfilled' ? r.value : []).map(s => ({
      id: 'ma_' + s.id, platform: 'mastodon', author: '@' + s.account?.acct, text: stripHtml(s.content).slice(0, 600),
      url: s.url, ts: Date.parse(s.created_at), lang: s.language, metrics: { boosts: s.reblogs_count, likes: s.favourites_count }
    })).filter(p => p.text);
  }
};

let bskySession = null;
const bluesky = {
  id: 'bluesky', label: 'Bluesky', free: true,
  enabled: () => !!(env('BSKY_HANDLE') && env('BSKY_APP_PASSWORD')),
  needs: 'BSKY_HANDLE + BSKY_APP_PASSWORD (free app password from bsky.app settings)',
  async search(terms) {
    if (!bskySession || Date.now() - bskySession.at > 90 * 60000) {
      const s = await getJSON('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', body: { identifier: env('BSKY_HANDLE'), password: env('BSKY_APP_PASSWORD') } });
      bskySession = { jwt: s.accessJwt, at: Date.now() };
    }
    const qs = terms.length ? terms.slice(0, 5) : ['news'];
    const res = await Promise.allSettled(qs.map(q => getJSON(`https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=25&sort=latest`, { headers: { Authorization: 'Bearer ' + bskySession.jwt } })));
    return res.flatMap(r => r.status === 'fulfilled' ? r.value.posts || [] : []).map(p => ({
      id: 'bs_' + p.cid, platform: 'bluesky', author: '@' + p.author?.handle, text: p.record?.text || '',
      url: `https://bsky.app/profile/${p.author?.handle}/post/${p.uri.split('/').pop()}`, ts: Date.parse(p.record?.createdAt || p.indexedAt), lang: (p.record?.langs || [])[0],
      metrics: { likes: p.likeCount, reposts: p.repostCount }
    }));
  }
};

const hackernews = {
  id: 'hackernews', label: 'Hacker News', free: true,
  enabled: () => true,
  async search(terms) {
    const q = terms.length ? terms.slice(0, 5) : [''];
    const res = await Promise.allSettled(q.map(t => getJSON(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(t)}&tags=(story,comment)&hitsPerPage=30`)));
    return res.flatMap(r => r.status === 'fulfilled' ? r.value.hits : []).map(h => ({
      id: 'hn_' + h.objectID, platform: 'hackernews', author: h.author, text: stripHtml(h.title || h.comment_text || h.story_title || '').slice(0, 600),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`, ts: h.created_at_i * 1000, metrics: { points: h.points }
    })).filter(p => p.text);
  }
};

// News articles from 65+ languages via the GDELT DOC API (free, no key).
const news = {
  id: 'news', label: 'World news (GDELT)', free: true,
  enabled: () => true,
  async search(terms) {
    const q = terms.length ? '(' + terms.slice(0, 6).map(t => t.includes(' ') ? `"${t}"` : t.replace(/^#/, '')).join(' OR ') + ')' : 'sourcelang:english';
    const j = await getJSON(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=60&sort=datedesc&timespan=1d`);
    return (j.articles || []).map(a => ({
      id: 'gd_' + Buffer.from(a.url).toString('base64').slice(-24), platform: 'news', author: a.domain, text: a.title, url: a.url,
      ts: parseGdeltDate(a.seendate), lang: (a.language || '').slice(0, 2).toLowerCase(), sourceCountry: a.sourcecountry
    }));
  }
};
function parseGdeltDate(s) { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)/.exec(s || ''); return m ? Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) : Date.now(); }

// ---- Credentialed platforms -------------------------------------------------------------
const x = {
  id: 'x', label: 'X (Twitter)', free: false,
  enabled: () => !!env('X_BEARER_TOKEN'),
  needs: 'X_BEARER_TOKEN (X API plan with recent-search access)',
  async search(terms) {
    const q = (terms.length ? '(' + terms.slice(0, 10).map(t => t.includes(' ') ? `"${t}"` : t).join(' OR ') + ')' : 'news') + ' -is:retweet';
    const j = await getJSON(`https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=50&tweet.fields=created_at,lang,public_metrics,geo&expansions=author_id&user.fields=username`, { headers: { Authorization: 'Bearer ' + env('X_BEARER_TOKEN') } });
    const users = Object.fromEntries((j.includes?.users || []).map(u => [u.id, u.username]));
    return (j.data || []).map(t => ({ id: 'x_' + t.id, platform: 'x', author: '@' + (users[t.author_id] || t.author_id), text: t.text, url: `https://x.com/i/status/${t.id}`, ts: Date.parse(t.created_at), lang: t.lang, metrics: t.public_metrics }));
  }
};

const facebook = {
  id: 'facebook', label: 'Facebook / Instagram', free: false,
  enabled: () => !!(env('FB_ACCESS_TOKEN') && env('FB_PAGE_IDS')),
  needs: 'FB_ACCESS_TOKEN + FB_PAGE_IDS (Meta Graph API; public pages you manage or have access to)',
  async search(terms) {
    const pages = env('FB_PAGE_IDS').split(',').map(s => s.trim()).filter(Boolean);
    const res = await Promise.allSettled(pages.map(p => getJSON(`https://graph.facebook.com/v21.0/${p}/posts?fields=id,message,created_time,permalink_url,from&limit=25&access_token=${env('FB_ACCESS_TOKEN')}`)));
    const rows = res.flatMap(r => r.status === 'fulfilled' ? r.value.data || [] : []).filter(p => p.message);
    const want = terms.map(t => t.toLowerCase());
    return rows.filter(p => !want.length || want.some(t => p.message.toLowerCase().includes(t.replace(/^#/, ''))))
      .map(p => ({ id: 'fb_' + p.id, platform: 'facebook', author: p.from?.name || 'Page', text: p.message.slice(0, 600), url: p.permalink_url, ts: Date.parse(p.created_time) }));
  }
};

const linkedin = {
  id: 'linkedin', label: 'LinkedIn', free: false,
  enabled: () => !!(env('LINKEDIN_TOKEN') && env('LINKEDIN_ORG_URNS')),
  needs: 'LINKEDIN_TOKEN + LINKEDIN_ORG_URNS (Community Management API; organisation pages only — LinkedIn has no public post search)',
  async search(terms) {
    const orgs = env('LINKEDIN_ORG_URNS').split(',').map(s => s.trim());
    const res = await Promise.allSettled(orgs.map(o => getJSON(`https://api.linkedin.com/rest/posts?author=${encodeURIComponent(o)}&q=author&count=20`, { headers: { Authorization: 'Bearer ' + env('LINKEDIN_TOKEN'), 'LinkedIn-Version': '202410', 'X-Restli-Protocol-Version': '2.0.0' } })));
    const want = terms.map(t => t.toLowerCase());
    return res.flatMap(r => r.status === 'fulfilled' ? r.value.elements || [] : []).filter(p => p.commentary)
      .filter(p => !want.length || want.some(t => p.commentary.toLowerCase().includes(t)))
      .map(p => ({ id: 'li_' + p.id, platform: 'linkedin', author: p.author, text: p.commentary.slice(0, 600), url: `https://www.linkedin.com/feed/update/${p.id}`, ts: p.publishedAt || p.createdAt }));
  }
};

const youtube = {
  id: 'youtube', label: 'YouTube', free: true,
  enabled: () => !!env('YOUTUBE_API_KEY'),
  needs: 'YOUTUBE_API_KEY (free Google Cloud key, 10k units/day)',
  async search(terms) {
    const q = terms.length ? terms.slice(0, 4).join('|') : 'news';
    const j = await getJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&q=${encodeURIComponent(q)}&key=${env('YOUTUBE_API_KEY')}`);
    return (j.items || []).map(v => ({ id: 'yt_' + v.id.videoId, platform: 'youtube', author: v.snippet.channelTitle, text: `${v.snippet.title} — ${v.snippet.description}`.slice(0, 600), url: `https://www.youtube.com/watch?v=${v.id.videoId}`, ts: Date.parse(v.snippet.publishedAt) }));
  }
};

module.exports = [x, facebook, linkedin, reddit, mastodon, bluesky, hackernews, youtube, news];
