// Wires everything together: searching, loading more videos, buttons and panels.
import {
  settings, saveSettings, resetSettings, postKey,
  getFavorites, isFavorite, addFavorite, removeFavorite, toggleFavorite,
  getHistory, addHistory, clearHistory, getPresets, addPreset, deletePreset,
} from './storage.js';
import { SOURCES } from './sources/index.js';
import { Feed } from './feed.js';
import { $, esc, parseList, parseBlacklist, matchesBlacklist, formatTime } from './util.js';

const src = () => SOURCES[settings.source] || SOURCES.e621;

// ---------------------------------------------------------------- state
const state = {
  gen: 0,            // bumped on every new search so old replies get ignored
  mode: 'search',    // 'search' or 'static' (playing favorites/history)
  page: 1, seed: 0, seen: new Set(),
  loading: false, exhausted: false, blockedUntil: 0,
};
let histTimer = 0;
let toastTimer = 0;

// ---------------------------------------------------------------- the feed
const feed = new Feed($('feed'), {
  getSettings: () => settings,
  onCurrentChange,
  onNearEnd: () => loadMore(),
  onProgress,
  onDoubleTap,
  onUnlock: () => { $('sound-hint').hidden = true; },
});

function onCurrentChange(post) {
  $('info-artist').textContent = post.artists && post.artists.length
    ? post.artists.slice(0, 2).join(', ') : 'unknown artist';
  const site = (SOURCES[post.source] || {}).name || post.source;
  $('info-meta').textContent = `▲ ${post.score ?? 0} · ${String(post.rating).toUpperCase()} · ${site}`;
  $('btn-open').href = post.postUrl;
  updateFavButton(post);
  clearTimeout(histTimer);                           // only count it if you stay 1.5s
  histTimer = setTimeout(() => addHistory(post), 1500);
}

function onProgress(cur, dur) {
  if (!isFinite(dur) || dur <= 0) return;
  $('time-cur').textContent = formatTime(cur);
  $('time-dur').textContent = formatTime(dur);
  $('seek').value = Math.round((cur / dur) * 1000);
}

// ---------------------------------------------------------------- searching + loading
function startSearch() {
  state.gen++;
  state.mode = 'search';
  state.page = 1;
  state.seed = Math.floor(Math.random() * 1e9);
  state.seen.clear();
  state.exhausted = false;
  state.loading = false;
  state.blockedUntil = 0;
  feed.clear();
  updateQueryLabel();
  showStatus('Loading videos…', { spinner: true });
  loadMore();
}

async function loadMore() {
  if (state.mode !== 'search' || state.loading || state.exhausted) return;
  if (Date.now() < state.blockedUntil) return;
  state.loading = true;
  const gen = state.gen;
  try {
    const blacklist = parseBlacklist(settings.blacklist);
    let added = 0;
    for (let tries = 0; added === 0 && !state.exhausted && tries < 4; tries++) {
      const res = await src().fetchPage({
        search: { tags: settings.query, blacklist: settings.blacklist, ratings: settings.ratings,
                  sort: settings.sort, seed: state.seed },
        page: state.page,
        settings,
      });
      if (gen !== state.gen) return;                 // a newer search started
      state.page++;
      if (!res.hasMore) state.exhausted = true;
      const fresh = res.posts.filter((p) => !state.seen.has(postKey(p)) && !matchesBlacklist(p, blacklist));
      fresh.forEach((p) => state.seen.add(postKey(p)));  // never show the same video twice
      if (fresh.length) { feed.add(fresh); added += fresh.length; hideStatus(); }
    }
    if (gen === state.gen && feed.count() === 0) {
      showStatus('No videos found. Try different tags, or allow more content ratings.', { edit: true });
    }
  } catch (err) {
    handleError(err, gen);
  } finally {
    if (gen === state.gen) state.loading = false;
  }
}

function handleError(err, gen) {
  if (gen !== state.gen) return;
  if (err.kind === 'end') {
    state.exhausted = true;
    if (feed.count() === 0) showStatus('No videos found for this search.', { edit: true });
    else toast('That is all the results for this search.');
    return;
  }
  state.blockedUntil = Date.now() + (err.kind === 'rate' ? 15000 : 8000);   // back off
  const msg = friendlyError(err);
  if (feed.count() === 0) showStatus(msg, { retry: true, edit: true });
  else toast(msg);
}

function friendlyError(err) {
  switch (err.kind) {
    case 'rate': return 'The site says we are going too fast (rate limited). Wait a few seconds, then try again.';
    case 'network': return 'Could not reach the site. Check your internet. If other sites work, the browser may be blocking the request. See the troubleshooting list.';
    case 'auth': return 'The site refused the request (401/403). If you entered a username and API key in Settings, check them. Otherwise the site may be blocking requests it cannot identify.';
    case 'toomany': return err.message;
    case 'http': return `The site returned an error (${err.status}). Try again in a bit.`;
    default: return 'Something went wrong: ' + (err.message || err);
  }
}

// Play a saved list (favorites / history) in the same swipe feed
function playList(label, posts, index) {
  state.gen++;
  state.mode = 'static';
  state.loading = false;
  feed.clear();
  hideStatus();
  $('query-label').textContent = label;
  feed.add(posts);
  feed.scrollToIndex(index);
}

function updateQueryLabel() {
  const sort = (src().sorts.find((s) => s.id === settings.sort) || {}).label || '';
  $('query-label').textContent = (settings.query || 'all videos') + ' · ' + sort;
}

// ---------------------------------------------------------------- status + toast
function showStatus(text, { spinner = false, retry = false, edit = false } = {}) {
  $('status').hidden = false;
  document.body.classList.add('empty');
  $('status-text').textContent = text;
  $('status-spinner').hidden = !spinner;
  $('status-retry').hidden = !retry;
  $('status-edit').hidden = !edit;
}
function hideStatus() { $('status').hidden = true; document.body.classList.remove('empty'); }
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
$('status-retry').addEventListener('click', () => {
  state.blockedUntil = 0;
  if (feed.count() === 0) startSearch(); else loadMore();
});
$('status-edit').addEventListener('click', () => openPanel('panel-search'));

// ---------------------------------------------------------------- favorites
function updateFavButton(post) {
  const on = isFavorite(post);
  $('btn-fav').textContent = on ? '♥' : '♡';
  $('btn-fav').classList.toggle('on', on);
}
function syncFavorite(post) {
  if (!settings.syncFavorites) return;
  const s = SOURCES[post.source];
  if (s && s.favorite) s.favorite(post, settings).catch(() => toast('Saved here, but could not save to your site account.'));
}
function onDoubleTap(post) {                // double-tap only ever ADDS
  if (addFavorite(post)) syncFavorite(post);
  updateFavButton(post);
}
$('btn-fav').addEventListener('click', () => {
  const p = feed.getCurrent();
  if (!p) return;
  if (toggleFavorite(p)) syncFavorite(p);
  updateFavButton(p);
});

// ---------------------------------------------------------------- audio / speed / loop / seek buttons
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function updateAudioUI() {
  $('btn-mute').textContent = (settings.muted || settings.volume === 0) ? '🔇' : '🔊';
  $('volume').value = settings.volume;
  $('btn-speed').textContent = settings.speed + '×';
  $('btn-loop').textContent = settings.loop ? '🔁 Loop' : '⏭ Next';
}
$('btn-mute').addEventListener('click', () => {
  if (settings.volume === 0) settings.volume = 1;
  settings.muted = !settings.muted;
  saveSettings(); feed.applyAudioCurrent(); updateAudioUI();
});
$('volume').addEventListener('input', () => {
  settings.volume = Number($('volume').value);
  settings.muted = false;
  saveSettings(); feed.applyAudioCurrent(); updateAudioUI();
});
$('btn-speed').addEventListener('click', () => {
  settings.speed = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length];
  saveSettings(); feed.applySpeedCurrent(); updateAudioUI(); syncSettingsForm();
});
$('btn-loop').addEventListener('click', () => {
  settings.loop = !settings.loop;
  saveSettings(); updateAudioUI(); syncSettingsForm();
  toast(settings.loop ? 'Videos will loop' : 'Videos will move to the next one');
});

const seek = $('seek');
seek.addEventListener('pointerdown', () => feed.setScrubbing(true));
['pointerup', 'pointercancel', 'change'].forEach((ev) => seek.addEventListener(ev, () => feed.setScrubbing(false)));
seek.addEventListener('input', () => {
  feed.seekFraction(seek.value / 1000);
  const v = feed.currentVideo();
  if (v) $('time-cur').textContent = formatTime(v.currentTime);
});

// ---------------------------------------------------------------- panels
const PANELS = ['panel-search', 'panel-settings', 'panel-favs', 'panel-history', 'panel-tags'];
let openId = null;
const RENDER = {
  'panel-search': () => { fillSearchForm(); renderPresets(); },
  'panel-favs': renderFavs,
  'panel-history': renderHistory,
  'panel-tags': renderTags,
};
function openPanel(id) {
  PANELS.forEach((p) => { $(p).hidden = p !== id; });
  $(id).scrollTop = 0;
  if (!openId) history.pushState({ panel: id }, '');   // so the phone's Back button closes the panel
  openId = id;
  if (RENDER[id]) RENDER[id]();
}
function closePanel() { if (openId) history.back(); }
window.addEventListener('popstate', () => {
  PANELS.forEach((p) => { $(p).hidden = true; });
  openId = null;
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanel));
$('btn-search').addEventListener('click', () => openPanel('panel-search'));
$('btn-favs').addEventListener('click', () => openPanel('panel-favs'));
$('btn-history').addEventListener('click', () => openPanel('panel-history'));
$('btn-settings').addEventListener('click', () => openPanel('panel-settings'));
$('btn-tags').addEventListener('click', () => { if (feed.getCurrent()) openPanel('panel-tags'); });

// ---------------------------------------------------------------- search panel
function fillSearchForm() {
  $('search-input').value = settings.query;
  const sel = $('search-sort');
  sel.innerHTML = src().sorts.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  sel.value = settings.sort;
  $('rate-s').checked = settings.ratings.s;
  $('rate-q').checked = settings.ratings.q;
  $('rate-e').checked = settings.ratings.e;
}
function readSearchForm() {
  settings.query = $('search-input').value.trim();
  settings.sort = $('search-sort').value;
  settings.ratings = { s: $('rate-s').checked, q: $('rate-q').checked, e: $('rate-e').checked };
  if (!settings.ratings.s && !settings.ratings.q && !settings.ratings.e) settings.ratings.s = true;
  saveSettings();
}
$('rate-e').addEventListener('change', (e) => {
  if (e.target.checked && !settings.ratings.e &&
      !confirm('Explicit content can include adult material. Turn it on?')) e.target.checked = false;
});
function runSearchFromForm() { readSearchForm(); closePanel(); startSearch(); }
$('search-go').addEventListener('click', runSearchFromForm);
$('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearchFromForm(); });

function searchForTag(tag) { settings.query = tag; saveSettings(); closePanel(); startSearch(); }

// Saved searches
function renderPresets() {
  const ps = getPresets();
  $('preset-list').innerHTML = ps.length
    ? ps.map((p, i) => `<span class="chip"><button data-apply="${i}">${esc(p.name)}</button>` +
        `<button class="x" data-del="${i}" aria-label="Delete">✕</button></span>`).join('')
    : '<span class="muted">None yet. Fill in a search above and press "Save as preset".</span>';
}
$('preset-save').addEventListener('click', () => {
  readSearchForm();
  const name = (prompt('Name for this saved search:', settings.query || 'My search') || '').trim();
  if (!name) return;
  addPreset({ name, query: settings.query, sort: settings.sort, ratings: { ...settings.ratings } });
  renderPresets();
});
$('preset-list').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const ps = getPresets();
  if (b.dataset.del !== undefined) { deletePreset(ps[Number(b.dataset.del)].name); renderPresets(); }
  else if (b.dataset.apply !== undefined) {
    const p = ps[Number(b.dataset.apply)];
    settings.query = p.query; settings.sort = p.sort; settings.ratings = { ...p.ratings };
    saveSettings(); closePanel(); startSearch();
  }
});

// ---------------------------------------------------------------- settings panel
const boundWriters = [];
function bind(id, key, kind = 'text') {
  const el = $(id);
  const writeToForm = () => { if (kind === 'checkbox') el.checked = !!settings[key]; else el.value = settings[key]; };
  el.addEventListener('input', () => {
    settings[key] = kind === 'checkbox' ? el.checked : kind === 'number' ? Number(el.value) : el.value;
    saveSettings();
  });
  boundWriters.push(writeToForm);
  writeToForm();
}
function syncSettingsForm() { boundWriters.forEach((f) => f()); }

$('set-source').innerHTML = Object.values(SOURCES).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
bind('set-source', 'source');
bind('set-loop', 'loop', 'checkbox');
bind('set-speed', 'speed', 'number');
bind('set-datasaver', 'dataSaver', 'checkbox');
bind('set-credits-on', 'creditsRuleOn', 'checkbox');
bind('set-credits', 'creditsTags');
bind('set-blacklist', 'blacklist');
bind('set-user', 'username');
bind('set-key', 'apiKey');
bind('set-sync', 'syncFavorites', 'checkbox');
bind('set-proxy', 'proxyUrl');

$('set-loop').addEventListener('input', updateAudioUI);
$('set-speed').addEventListener('input', () => { feed.applySpeedCurrent(); updateAudioUI(); });
$('set-source').addEventListener('input', () => {
  settings.sort = src().sorts[0].id; saveSettings(); toast('Source changed. Run a new search.');
});

$('btn-clear-history').addEventListener('click', () => {
  if (confirm('Clear your watch history?')) { clearHistory(); toast('History cleared'); }
});
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset all settings to the defaults? (Favorites and saved searches are kept.)')) return;
  resetSettings(); syncSettingsForm(); updateAudioUI(); toast('Settings reset');
});

// Credits tag finder: asks the site what tags really exist
$('tagfind-go').addEventListener('click', async () => {
  const q = $('tagfind-q').value.trim();
  if (!q) return;
  const box = $('tagfind-results');
  box.textContent = 'Searching…';
  try {
    const tags = await src().searchTags(q, settings);
    box.innerHTML = tags.length
      ? tags.map((t) => `<span class="chip"><button data-tag="${esc(t.name)}">${esc(t.name)} <small>(${t.count})</small></button></span>`).join('')
      : 'No matching tags.';
  } catch (err) { box.textContent = friendlyError(err); }
});
$('tagfind-results').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tag]');
  if (!b) return;
  const ta = $('set-credits');
  if (!parseList(ta.value).includes(b.dataset.tag)) {
    ta.value = (ta.value.trim() + ' ' + b.dataset.tag).trim();
    ta.dispatchEvent(new Event('input'));
    toast('Added ' + b.dataset.tag);
  }
});

// ---------------------------------------------------------------- favorites / history / tags panels
function renderFavs() {
  const favs = getFavorites();
  $('fav-label').textContent = favs.length ? `${favs.length} saved. Tap one to watch it.` : '';
  $('fav-grid').innerHTML = favs.length
    ? favs.map((p, i) => `<div class="grid-item"><button class="thumb" data-i="${i}">` +
        `<img src="${esc(p.posterUrl)}" alt="" loading="lazy"></button>` +
        `<button class="rm" data-rm="${i}" aria-label="Remove">✕</button></div>`).join('')
    : '<p class="muted">Nothing here yet. Double-tap a video or press ♥ to save it.</p>';
}
$('fav-grid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const favs = getFavorites();
  if (b.dataset.rm !== undefined) { removeFavorite(favs[Number(b.dataset.rm)]); renderFavs(); const c = feed.getCurrent(); if (c) updateFavButton(c); }
  else if (b.dataset.i !== undefined) { const list = [...favs]; closePanel(); playList('Favorites', list, Number(b.dataset.i)); }
});

function renderHistory() {
  const h = getHistory();
  $('history-list').innerHTML = h.length
    ? h.map((p, i) => `<button class="list-item" data-i="${i}"><img src="${esc(p.posterUrl)}" alt="" loading="lazy">` +
        `<span>${esc((p.artists && p.artists[0]) || 'unknown artist')}<br><small class="muted">▲ ${p.score ?? 0} · #${p.id}</small></span></button>`).join('')
    : '<p class="muted">Nothing watched yet.</p>';
}
$('history-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (b) { const list = [...getHistory()]; closePanel(); playList('History', list, Number(b.dataset.i)); }
});

const TAG_GROUPS = { artist: 'Artist', copyright: 'Copyright', character: 'Character',
                     species: 'Species', general: 'General', lore: 'Lore', meta: 'Meta' };
function renderTags() {
  const p = feed.getCurrent();
  const box = $('tags-body');
  if (!p) { box.textContent = 'No video selected.'; return; }
  box.innerHTML = Object.entries(TAG_GROUPS).map(([k, label]) => {
    const tags = (p.tagGroups || {})[k] || [];
    if (!tags.length) return '';
    return `<h3>${label}</h3><div class="chips">` +
      tags.map((t) => `<span class="chip"><button data-tag="${esc(t)}">${esc(t)}</button></span>`).join('') + '</div>';
  }).join('');
}
$('tags-body').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tag]');
  if (b) searchForTag(b.dataset.tag);
});

// ---------------------------------------------------------------- go!
updateAudioUI();
$('sound-hint').hidden = settings.muted;
startSearch();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed:', err));
}
