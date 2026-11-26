export const config = { runtime: 'nodejs', memory: 512, maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Parameter "url" wajib diisi' });

  try {
    // 1. Ambil halaman depan untuk dapetin Cookie & Signature (_s, _ts) terbaru
    const homeRes = await fetch('https://savefrom.co.id/', {
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      }
    });
    const html = await homeRes.text();
    
    // Auto-catch Cookie sesi (PHPSESSID, dll)
    const setCookies = homeRes.headers.getSetCookie?.() || [];
    const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

    // Auto-catch _s dan _ts dari HTML
    let _s = 'e69cd5af0515b878d933c9b89cc5b243d7a6b7f2b3a48a13d7a39d88cd419083'; // Fallback
    let _ts = '1793791194545'; // Fallback

    const sMatch = html.match(/_s\s*=\s*['"]([a-f0-9]{64})['"]/i);
    if (sMatch) _s = sMatch[1];

    const tsMatch = html.match(/_ts\s*=\s*['"]?(\d+)['"]?/);
    if (tsMatch) _ts = tsMatch[1];

    const ts = Date.now().toString();

    // 2. Tembak API Convert
    const formData = new URLSearchParams();
    formData.append('sf_url', url);
    formData.append('ts', ts);
    formData.append('_ts', _ts); 
    formData.append('_tsc', '0');
    formData.append('_s', _s);

    const apiRes = await fetch('https://api-wh.savefrom.co.id/api/convert', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'origin': 'https://savefrom.co.id',
        'referer': 'https://savefrom.co.id/',
        'cookie': cookieHeader, // <-- Sertakan cookie hasil scrape
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      },
      body: formData.toString()
    });

    const data = await apiRes.json();

    if (!data.stream) {
      return res.status(400).json({ ok: false, error: 'Gagal extract stream', raw: data });
    }

    // 3. Rapikan format output
    const result = {
      ok: true,
      title: data.meta?.title || 'Unknown',
      duration: data.meta?.duration || '0:00',
      thumbnail: data.thumb?.split('&uri=')[1] ? decodeURIComponent(data.thumb.split('&uri=')[1]) : null,
      formats: []
    };

    // Extract MP3
    if (data.stream.mp3) {
      Object.keys(data.stream.mp3).forEach(q => {
        const stream = data.stream.mp3[q];
        if (stream.streams && stream.streams[0]) {
          result.formats.push({
            type: 'audio',
            quality: q,
            url: `https://du.sf-converter.com${stream.streams[0]}`
          });
        }
      });
    }

    // Extract MP4
    if (data.stream.mp4) {
      Object.keys(data.stream.mp4).forEach(q => {
        const stream = data.stream.mp4[q];
        if (stream.streams && stream.streams[0]) {
          result.formats.push({
            type: 'video',
            quality: q,
            url: `https://du.sf-converter.com${stream.streams[0]}`
          });
        }
      });
    }

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
