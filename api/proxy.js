export const config = { runtime: 'nodejs20.x' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('GET only');

  const url = req.query.url;
  if (!url || !url.startsWith('https://art-global.ezmaker.ai/')) {
    return res.status(400).send('url tidak valid');
  }

  const r = await fetch(url);
  if (!r.ok) return res.status(r.status).send('gagal upstream');

  res.setHeader('content-type', r.headers.get('content-type') || 'image/webp');
  res.setHeader('cache-control', 'public, max-age=86400, immutable');

  const buf = Buffer.from(await r.arrayBuffer());
  return res.send(buf);
}
