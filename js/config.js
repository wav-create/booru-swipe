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
  discoverPercent: 25,    // roughly what % of the feed is discovery
  username: '',
  apiKey: '',
  syncFavorites: false,
  proxyUrl: '',
  pageSize: 30,         // posts fetched per request (the site allows up to 320)
};

// Tags too common to say anything about your taste. Edit this list freely.
// Anything that shows up in nearly every video belongs here.
export const DISCOVER_IGNORE_TAGS = [
  'animated', 'video', 'sound', 'no_sound', 'sound_warning', 'loop', 'hi_res', 'absurd_res',
  'high_framerate', 'short_playtime', 'long_playtime', '3d_animation', '2d_animation',
  '3d_(artwork)', 'digital_media_(artwork)', 'conditional_dnp', 'unknown_artist',
  'solo', 'duo', 'group', 'male', 'female', 'anthro', 'feral', 'human', 'mammal',
  'clothed', 'clothing', 'ambiguous_gender',
];
