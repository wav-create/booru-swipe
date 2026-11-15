// List of supported sites. To add one: create js/sources/yoursite.js,
// export an object shaped like e621.js, import it here, add it to SOURCES,
// and add './js/sources/yoursite.js' to the SHELL list in sw.js.
//
// An adapter object needs:
//   id, name
//   sorts: [{ id, label, tag }]
//   fetchPage({ search, page, settings }) -> { posts: [...], hasMore }
//       search = { tags, blacklist, ratings: {s,q,e}, sort, seed }
//       each post = { source, id, url, saverUrl, posterUrl, ext, score, rating,
//                     artists: [], tagGroups: { artist: [], general: [], ... }, postUrl }
//   searchTags(query, settings)   (optional)  -> [{ name, count }]
//   favorite(post, settings)      (optional)
import e621 from './e621.js';

export const SOURCES = { e621 };
