// =====================================================================
//  VIDEO TIMING RULES  — change the numbers in this file to taste
// =====================================================================

export const RULES = {
  // RULE 1: a video LONGER than this many seconds counts as "long"...
  longVideoSeconds: 60,
  // ...and a long video starts playing at this fraction of its length (0.15 = 15%).
  longVideoStartAt: 0.15,

  // RULE 2: a video with a "credits-like" tag is treated as ending here.
  // 0.90 = 90% of the length, so the last 10% is skipped.
  creditsEndAt: 0.90,
};

// RULE 3: starting list of "credits-like" tags. This is only the FIRST-RUN
// default; after that, edit the list in the app's Settings screen.
// These are educated guesses: use Settings -> "Find" to look up real tag names.
// A * works as a wildcard.
export const DEFAULT_CREDITS_TAGS = [
  'credits', 'end_credits', 'ending_credits', 'end_card', 'end_screen', 'outro',
];

// ---------------------------------------------------------------------
//  The code below applies the rules. You normally don't need to edit it.
// ---------------------------------------------------------------------
import { parseList, allTags } from './util.js';

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

export function hasCreditsTag(postTags, creditsText) {
  const regexes = parseList(creditsText).map(patternToRegex);
  return postTags.some((tag) => regexes.some((re) => re.test(tag.toLowerCase())));
}

// Given a video's length (seconds), returns { start, end } in seconds.
export function getPlayWindow(duration, post, settings) {
  let start = 0;
  let end = duration;
  if (duration > RULES.longVideoSeconds) start = duration * RULES.longVideoStartAt;
  if (settings.creditsRuleOn && hasCreditsTag(allTags(post), settings.creditsTags)) {
    end = duration * RULES.creditsEndAt;
  }
  if (end - start < 1) { start = 0; end = duration; } // safety net for odd cases
  return { start, end };
}
