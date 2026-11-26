export const config = { runtime: 'nodejs', memory: 512, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { taskId, maxWaitMs = 45000 } = req.body || {};
  if (!taskId) return res.status(400).json({ error: 'taskId wajib' });

  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < maxWaitMs) {
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
    
    // Cek jika sudah selesai (biasanya status 3 atau ada output_url)
    const output = data?.data?.output_url || data?.data?.result?.output_url;
    
    if (output) {
      return res.status(200).json({ ok: true, resultUrl: output, raw: data });
    }

    // Kalau gagal
    if (data?.code !== 100000 && data?.code !== 200) {
       // Kadang code 100000 = sukses request, tapi job masih pending
       // Kalau error beneran, hentikan
       if (data?.data?.status === 'failed' || data?.code === 400) {
           return res.status(400).json({ ok: false, error: 'Job failed', raw: data });
       }
    }

    attempt++;
    await new Promise(r => setTimeout(r, Math.min(500 * attempt, 3000)));
  }

  return res.status(408).json({ ok: false, error: 'timeout polling' });
}
