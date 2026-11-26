export const config = { runtime: 'nodejs', memory: 512 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ error: 'taskId wajib' });

  try {
    const r = await fetch(`https://api.remaker.ai/api/pai/v3/ai-facevary/appapi/get-job/${taskId}`, {
      method: 'GET',
      headers: {
        'product-code': '067003',
        'product-serial': '4bc2eee53fbfd3e2439a83cbe82560e3',
        'source': 'ai_face_vary',
        'origin': 'https://remaker.ai',
        'referer': 'https://remaker.ai/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      }
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ ok: false, error: 'Remaker return invalid JSON', raw_text: text });
    }
    
    // --- FUNGSI PENCARI URL OTOMATIS ---
    // Mencari string apa pun yang dimulai dengan "http" di dalam objek JSON
    function findUrl(obj) {
      if (!obj) return null;
      if (typeof obj === 'string' && obj.startsWith('http')) return obj;
      if (Array.isArray(obj)) {
        for (let item of obj) {
          const res = findUrl(item);
          if (res) return res;
        }
      } else if (typeof obj === 'object') {
        for (let key in obj) {
          const res = findUrl(obj[key]);
          if (res) return res;
        }
      }
      return null;
    }

    const output = findUrl(data.result);

    // Jika URL hasil sudah ada
    if (output) {
      return res.status(200).json({ ok: true, resultUrl: output, raw: data });
    }

    // Jika masih diproses (kode 300006 atau belum ada URL)
    if (data?.code === 300006 || data?.code === 100000 || !data?.result) {
      return res.status(200).json({ ok: false, pending: true, raw: data });
    }

    // Gagal
    return res.status(400).json({ ok: false, error: 'Job failed', raw: data });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
