import { getKeyId, invalidate } from './keypool.js';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const THEME = 'REJJFMkthpSkxAXumh7Q0xOmsWKvH3DXxCqU5InfYVI=';

export async function apiCall(path, body, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const keyId = await getKeyId(attempt > 0);
    const r = await fetch(`https://aifaceswap.io${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://aifaceswap.io',
        'referer': 'https://aifaceswap.io/id/',
        'user-agent': UA,
        'x-code': String(Date.now()),
        'theme-version': THEME,
        'cookie': `key_id=${keyId}`,
      },
      body: JSON.stringify(body),
    });

    if ([401, 403, 452].includes(r.status) && attempt < retries) {
      invalidate();
      await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
      continue;
    }

    const data = await r.json().catch(() => ({}));
    return { status: r.status, data, keyId };
  }
}
