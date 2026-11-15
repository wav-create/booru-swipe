import { DEFAULT_CREDITS_TAGS } from './timing.js';

export const APP_NAME = 'BooruSwipe';
export const APP_VERSION = '1.0';

// Used the first time the app runs, and by "Reset settings".
export const DEFAULT_SETTINGS = {
  source: 'e621',
  query: '',
  sort: 'random',
  ratings: { s: true, q: false, e: false },   // SAFE ONLY on first launch
  minScore: 0,          // hide posts scoring below this (0 = off)
  blacklist: '',
  creditsTags: DEFAULT_CREDITS_TAGS.join(' '),
  creditsRuleOn: true,
  loop: false,          // false = auto-advance to next video when one ends
  speed: 1,
  volume: 1,
  muted: false,
  dataSaver: false,
  discover: false,        // mix in videos similar to your favorites
  discoverPercent: 20,    // roughly what % of the feed is discovery
  username: '',
  apiKey: '',
  syncFavorites: false,
  proxyUrl: '',
  pageSize: 30,         // posts fetched per request (the site allows up to 320)
};
// Tags too common to say anything about your taste. Edit this list freely.
export const DISCOVER_IGNORE_TAGS = ['solo', 'duo', 'group', 'male', 'female', 'anthro', 'feral', 'human', 'mammal'];
