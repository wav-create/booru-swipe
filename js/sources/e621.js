// e621 adapter. Based on the official API page: https://e621.net/help/api
//   GET /posts.json?tags=...&limit=...&page=...   (limit max 320, page max 750)
//   GET /tags.json?search[name_matches]=...
//   POST /favorites.json  (form field post_id)
import { getJson, postForm, ApiError } from '../http.js';
import { APP_NAME, APP_VERSION } from '../config.js';
import { parseBlacklist } from '../util.js';

const BASE = 'https://e621.net';
const MAX_TAGS = 40; // the site's limit per search
const NOT_REALLY_ARTISTS = new Set([
  'conditional_dnp', 'unknown_artist', 'anonymous_artist', 'third-party_edit', 'avoid_posting',
]);

const SORTS = [
  { id: 'random',  label: 'Random',               tag: 'order:random' },
  { id: 'scatter', label: 'Random (spread out)',  tag: 'order:id_desc' },
  { id: 'new',     label: 'Newest',               tag: 'order:id_desc' },
  { id: 'score',   label: 'Highest score',        tag: 'order:score' },
  { id: 'favs',    label: 'Most favorited',       tag: 'order:favcount' },
  { id: 'hot',     label: 'Hot',                  tag: 'order:hot' },
  { id: 'long',    label: 'Longest videos',       tag: 'order:duration' },
];

// The docs ask for a descriptive User-Agent. Browsers won't let us set one,
// so the docs say to send it as the "_client" parameter instead.
function userAgent(settings) {
  return `${APP_NAME}/${APP_VERSION} (by ${settings.username || 'anonymous'} on e621)`;
}

// Parameters every request carries (User-Agent + optional login)
function baseParams(settings) {
  const p = new URLSearchParams();
  p.set('_client', userAgent(settings));
  if (settings.username && settings.apiKey) {
    p.set('login', settings.username);
    p.set('api_key', settings.apiKey);
  }
  return p;
}

// Safe / Questionable / Explicit checkboxes -> search tags
// (uses "-rating:x" instead of OR-ing, which is simpler and always valid)
function ratingTokens(r) {
  const on = ['s', 'q', 'e'].filter((k) => r[k]);
  if (on.length === 3) return [];
  if (on.length === 0) return ['rating:s'];
  if (on.length === 1) return ['rating:' + on[0]];
  return ['-rating:' + ['s', 'q', 'e'].find((k) => !r[k])];
}

// Turns everything the user chose into the site's tag string.
function buildQuery({ tags, blacklist, ratings, sort, seed, minScore, idBefore }) {
  const user = String(tags || '').trim().split(/\s+/).filter(Boolean);
  const has = (re) => user.some((t) => re.test(t));
  const fixed = [];

  // Videos only. "~" means "either of these". If YOU use ~ in your own search,
  // the two would get mixed together, so then we exclude other file types instead.
  if (has(/^~/)) fixed.push('-type:jpg', '-type:png', '-type:gif', '-type:swf', '-type:webp');
  else fixed.push('~type:webm', '~type:mp4');

  if (!has(/^-?rating:/)) fixed.push(...ratingTokens(ratings));

  // Minimum score. ">" means "greater than", so for whole numbers ">2999" means "3000 or more".
  // (If you type your own score: tag in the search box, yours wins.)
  if (minScore > 0 && !has(/^-?score:/)) fixed.push('score:>' + (minScore - 1));

  // Used by "spread out" random: only look at posts with an id lower than this number
  if (idBefore && !has(/^-?id:/)) fixed.push('id:<' + idBefore);

  let wantsRandom;
  if (has(/^-?order:/)) {
    wantsRandom = has(/^order:random$/);
  } else {
    const s = SORTS.find((x) => x.id === sort) || SORTS[0];
    fixed.push(s.tag);
    wantsRandom = s.id === 'random';
  }
  // A "seed" makes random order consistent across pages, so no repeats
  if (wantsRandom && !has(/^randseed:/)) fixed.push('randseed:' + seed);

  const used = user.length + fixed.length;
  if (used > MAX_TAGS) {
    throw new ApiError('toomany',
      `Too many tags: the site allows ${MAX_TAGS} per search and this one needs ${used}. Remove a few tags.`);
  }

  // Single-tag blacklist lines are sent to the server (as -tag) while there is room.
  // Everything else is filtered on the phone after the posts arrive.
  const negs = parseBlacklist(blacklist)
    .filter((e) => e.length === 1 && !/^[-~]/.test(e[0]))
    .slice(0, MAX_TAGS - used)
    .map((e) => '-' + e[0]);

  return [...user, ...fixed, ...negs].join(' ');
}

// Finds a smaller video version, if the post has one.
// NOTE: this field is not on the written API page, so we look defensively
// and simply return null (= use the full file) if it isn't there.
function findSaverUrl(p) {
  try {
    const alt = p.sample && p.sample.alternates;
    if (!alt) return null;
    const group = alt.samples || alt;
    for (const key of ['480p', '720p']) {
      const c = group[key];
      if (!c) continue;
      if (typeof c.url === 'string') return c.url;
      if (Array.isArray(c.urls)) { const u = c.urls.find(Boolean); if (u) return u; }
    }
  } catch { /* ignore */ }
  return null;
}

// Convert the site's JSON into the simple shape the app uses
function normalize(p) {
  const t = p.tags || {};
  const g = (k) => (Array.isArray(t[k]) ? t[k] : []);
  return {
    source: 'e621',
    id: p.id,
    url: p.file.url,
    saverUrl: findSaverUrl(p),
    posterUrl: (p.sample && p.sample.url) || (p.preview && p.preview.url) || '',
    ext: p.file.ext,
    score: p.score ? p.score.total : 0,
    favCount: p.fav_count || 0,
    rating: p.rating || '?',
    artists: g('artist').filter((a) => !NOT_REALLY_ARTISTS.has(a)),
    tagGroups: {
      artist: g('artist'), copyright: g('copyright'), character: g('character'),
      species: g('species'), general: g('general'), lore: g('lore'), meta: g('meta'),
    },
    postUrl: `${BASE}/posts/${p.id}`,
  };
}

// Keeps only real, playable videos and converts them to the app's format
function toVideoPosts(raw) {
  return raw
    .filter((p) => p.file && p.file.url
      && ['webm', 'mp4'].includes(p.file.ext)
      && !(p.flags && p.flags.deleted))
    .map(normalize);
}

// "Spread out" random: jump to random points in the site's history, take the few
// matching videos just below each point, then shuffle them all together.
// To tune it, change the two numbers: DRAWS jumps, PER_DRAW videos from each jump.
let newestId = 0;   // remembered for this session

async function getNewestId(settings) {
  if (newestId) return newestId;
  const params = baseParams(settings);
  params.set('limit', '1');
  const data = await getJson(`${BASE}/posts.json?${params}`, settings.proxyUrl);
  const raw = Array.isArray(data) ? data : (data.posts || []);
  newestId = raw.length ? raw[0].id : 0;
  return newestId;
}

async function scatterPage(search, settings) {
  const DRAWS = 3, PER_DRAW = 10;
  const top = await getNewestId(settings);
  if (!top) throw new ApiError('http', "Could not work out where the site's newest post is");
  const byId = new Map();
  for (let d = 0; d < DRAWS; d++) {
    const before = 1 + Math.floor(Math.random() * top);
    const params = baseParams(settings);
    params.set('tags', buildQuery({ ...search, idBefore: before }));
    params.set('limit', String(PER_DRAW));
    const data = await getJson(`${BASE}/posts.json?${params}`, settings.proxyUrl);
    const raw = Array.isArray(data) ? data : (data.posts || []);
    toVideoPosts(raw).forEach((p) => byId.set(p.id, p));
  }
  const posts = [...byId.values()];
  for (let i = posts.length - 1; i > 0; i--) {          // shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [posts[i], posts[j]] = [posts[j], posts[i]];
  }
  return { posts, hasMore: true };   // there is always another random jump to make
}

export default {
  id: 'e621',
  name: 'e621',
  sorts: SORTS,

  async fetchPage({ search, page, settings }) {
    if (search.sort === 'scatter') return scatterPage(search, settings);
    const params = baseParams(settings);
    params.set('tags', buildQuery(search));
    params.set('limit', String(settings.pageSize));
    params.set('page', String(page));
    const data = await getJson(`${BASE}/posts.json?${params}`, settings.proxyUrl);
    const raw = Array.isArray(data) ? data : (data.posts || []);
    return { posts: toVideoPosts(raw), hasMore: raw.length >= settings.pageSize };
  },

  // Look up real tag names (used by the credits-tag finder in Settings)
  async searchTags(query, settings) {
    const params = baseParams(settings);
    params.set('search[name_matches]', query.includes('*') ? query : `*${query}*`);
    params.set('search[order]', 'count');
    params.set('limit', '15');
    const data = await getJson(`${BASE}/tags.json?${params}`, settings.proxyUrl);
    return (Array.isArray(data) ? data : []).map((t) => ({ name: t.name, count: t.post_count }));
  },
  // "Discovery": videos with ALL of the given tags that are NOT in this user's favorites
  async fetchDiscover({ tags, excludeUser, search, limit, settings }) {
    const params = baseParams(settings);
    params.set('tags', buildQuery({
      ...search,
      tags: `${tags.join(' ')} -fav:${excludeUser}`,
      sort: 'random',
      seed: Math.floor(Math.random() * 1e9),
    }));
    params.set('limit', String(limit));
    params.set('page', '1');
    const data = await getJson(`${BASE}/posts.json?${params}`, settings.proxyUrl);
    const raw = Array.isArray(data) ? data : (data.posts || []);
    return raw
      .filter((p) => p.file && p.file.url && ['webm', 'mp4'].includes(p.file.ext) && !(p.flags && p.flags.deleted))
      .map(normalize);
  },
  // Optional: add to your site account's favorites
  async favorite(post, settings) {
    if (!settings.username || !settings.apiKey) return;
    await postForm(`${BASE}/favorites.json?${baseParams(settings)}`,
      new URLSearchParams({ post_id: String(post.id) }), settings.proxyUrl);
  },
};
