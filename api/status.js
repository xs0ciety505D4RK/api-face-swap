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

    const data = await r.json();
    
    // --- Ekstrak URL dengan aman ---
    let output = null;
    if (data?.result) {
      if (typeof data.result === 'string' && data.result.startsWith('http')) {
        output = data.result;
      } else if (Array.isArray(data.result)) {
        output = data.result[0]?.url || data.result[0];
      } else {
        output = data.result.output_url || data.result.url || data.result.image_url;
      }
    }

    // Jika URL hasil sudah ada
    if (output && typeof output === 'string') {
      return res.status(200).json({ ok: true, resultUrl: output, raw: data });
    }

    // Jika masih diproses (kode 300006 atau result kosong)
    if (data?.code === 300006 || !data?.result) {
      return res.status(200).json({ ok: false, pending: true, raw: data });
    }
    
    // Kadang kode 100000 tapi output belum siap
    if (data?.code === 100000) {
      return res.status(200).json({ ok: false, pending: true, raw: data });
    }

    // Gagal
    return res.status(400).json({ ok: false, error: 'Job failed', raw: data });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
