// Every request to a booru site goes through here, so we are polite:
//  - at least 1.1 seconds between requests (e621 asks for about 1 per second)
//  - NO custom headers (that keeps requests "simple", so browsers allow them cross-site)

export class ApiError extends Error {
  constructor(kind, message, status) { super(message || kind); this.kind = kind; this.status = status; }
}

const MIN_GAP_MS = 1100;
let lastStart = 0;
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttled(task) {
  const run = chain.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
}

// Optional proxy: https://your-worker.workers.dev/?url=<the real address>
function viaProxy(url, proxy) {
  const p = (proxy || '').trim();
  return p ? p + (p.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url) : url;
}

async function send(url, init, proxy) {
  let res;
  try { res = await throttled(() => fetch(viaProxy(url, proxy), init)); }
  catch { throw new ApiError('network', 'Network error'); }
  if (res.status === 429 || res.status === 503) throw new ApiError('rate', 'Rate limited', res.status);
  if (res.status === 410) throw new ApiError('end', 'No more pages', 410);
  if (res.status === 401 || res.status === 403) throw new ApiError('auth', 'Not allowed', res.status);
  if (!res.ok) throw new ApiError('http', 'HTTP ' + res.status, res.status);
  return res;
}

export async function getJson(url, proxy) {
  const res = await send(url, {}, proxy);
  try { return await res.json(); }
  catch { throw new ApiError('http', 'Unreadable response', res.status); }
}

export function postForm(url, params, proxy) {
  return send(url, { method: 'POST', body: params }, proxy);
}
