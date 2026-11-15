import { DEFAULT_SETTINGS } from './config.js';

const PREFIX = 'bsf.';
const read = (key, fallback) => {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
  catch (e) { console.warn('Could not save', key, e); }
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ----- Settings -----
export const settings = Object.assign(clone(DEFAULT_SETTINGS), read('settings', {}));
settings.ratings = Object.assign({}, DEFAULT_SETTINGS.ratings, settings.ratings);
export const saveSettings = () => write('settings', settings);
export function resetSettings() { Object.assign(settings, clone(DEFAULT_SETTINGS)); saveSettings(); }

// ----- Favorites + history (newest first) -----
export const postKey = (p) => p.source + ':' + p.id;

// Keep only what we need so we don't fill up the browser's storage
function slim(p) {
  return {
    id: p.id, source: p.source, url: p.url, saverUrl: p.saverUrl, posterUrl: p.posterUrl,
    ext: p.ext, artists: p.artists, score: p.score, rating: p.rating,
    postUrl: p.postUrl, tagGroups: p.tagGroups,
  };
}

let favs = read('favorites', []);
let hist = read('history', []);

export const getFavorites = () => favs;
export const isFavorite = (p) => favs.some((f) => postKey(f) === postKey(p));
export function addFavorite(p) {
  if (isFavorite(p)) return false;
  favs.unshift(slim(p)); write('favorites', favs); return true;
}
export function removeFavorite(p) {
  favs = favs.filter((f) => postKey(f) !== postKey(p)); write('favorites', favs);
}
export function toggleFavorite(p) {
  if (isFavorite(p)) { removeFavorite(p); return false; }
  addFavorite(p); return true;
}

export const getHistory = () => hist;
export function addHistory(p) {
  hist = hist.filter((h) => postKey(h) !== postKey(p));
  hist.unshift(slim(p));
  hist = hist.slice(0, 150);
  write('history', hist);
}
export function clearHistory() { hist = []; write('history', hist); }

// ----- Saved searches (presets) -----
export const getPresets = () => read('presets', []);
export function addPreset(preset) {
  const list = getPresets().filter((p) => p.name !== preset.name);
  list.push(preset); write('presets', list);
}
export function deletePreset(name) { write('presets', getPresets().filter((p) => p.name !== name)); }
