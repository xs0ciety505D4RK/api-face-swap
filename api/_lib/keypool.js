const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const HOME = 'https://aifaceswap.io/id/';

let cached = { keyId: null, at: 0 };
const TTL_MS = 5 * 60 * 1000;

export async function getKeyId(force = false) {
  if (!force && cached.keyId && Date.now() - cached.at < TTL_MS) {
    return cached.keyId;
  }
  const r = await fetch(HOME, {
    headers: { 'user-agent': UA, 'accept': 'text/html' },
    redirect: 'follow',
  });
  const setCookies = r.headers.getSetCookie?.() || [];
  const m = setCookies.map(c => c.match(/^key_id=([^;]+)/)).find(Boolean);
  if (!m) throw new Error('key_id tidak ditemukan');
  cached = { keyId: m[1], at: Date.now() };
  return cached.keyId;
}

export function invalidate() {
  cached = { keyId: null, at: 0 };
}
