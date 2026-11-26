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
    
    // Cek jika selesai
    const output = data?.result?.output_url || data?.result?.url;
    if (output) {
      return res.status(200).json({ ok: true, resultUrl: output, raw: data });
    }

    // Masih diproses (300006)
    if (data?.code === 300006) {
      return res.status(200).json({ ok: false, pending: true, raw: data });
    }

    // Gagal
    return res.status(400).json({ ok: false, error: 'Job failed', raw: data });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
