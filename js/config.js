import { DEFAULT_CREDITS_TAGS } from './timing.js';

export const APP_NAME = 'BooruSwipe';
export const APP_VERSION = '1.0';

// Used the first time the app runs, and by "Reset settings".
export const DEFAULT_SETTINGS = {
  source: 'e621',
  query: '',
  sort: 'random',
  ratings: { s: true, q: false, e: false },   // SAFE ONLY on first launch
  blacklist: '',
  creditsTags: DEFAULT_CREDITS_TAGS.join(' '),
  creditsRuleOn: true,
  loop: false,          // false = auto-advance to next video when one ends
  speed: 1,
  volume: 1,
  muted: false,
  dataSaver: false,
  username: '',
  apiKey: '',
  syncFavorites: false,
  proxyUrl: '',
  pageSize: 30,         // posts fetched per request (the site allows up to 320)
};
