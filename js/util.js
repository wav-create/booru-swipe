export const $ = (id) => document.getElementById(id);

// Makes text safe to put inside innerHTML
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "a b, c" -> ["a","b","c"]
export function parseList(text) {
  return String(text || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
}

// Blacklist text -> [[tag, tag], ...]  (one inner list per line)
export function parseBlacklist(text) {
  return String(text || '').split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
}

// Flat list of every tag on a post
export function allTags(post) {
  return post.tags || Object.values(post.tagGroups || {}).flat();
}

// True if the post should be hidden by the blacklist.
// Entries containing ":" (like rating:e) can only be checked by the server.
export function matchesBlacklist(post, entries) {
  const tags = new Set(allTags(post));
  return entries.some((tokens) => {
    if (tokens.some((t) => t.includes(':'))) return false;
    if (tokens.every((t) => t.startsWith('-'))) return false;
    return tokens.every((t) => (t.startsWith('-') ? !tags.has(t.slice(1)) : tags.has(t)));
  });
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
