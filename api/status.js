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
    
    // 1. Cek jika job selesai & ada output_url
    const output = data?.result?.output_url || data?.result?.url;
    if (output) {
      return res.status(200).json({ ok: true, resultUrl: output, raw: data });
    }

    // 2. Code 300006 = MASIH DIPROSES (Jangan berhenti, lanjut polling)
    if (data?.code === 300006) {
      attempt++;
      await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 3000)));
      continue;
    }

    // 3. Code selain 100000 dan 300006 berarti beneran gagal
    if (data?.code !== 100000) {
      return res.status(400).json({ ok: false, error: 'Job failed', raw: data });
    }

    // 4. Kalau code 100000 tapi output_url belum muncul, tunggu sebentar
    attempt++;
    await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 3000)));
  }

  // Kalau Vercel timeout (45 detik), kasih tau Python buat nanya lagi (bukan error fatal)
  return res.status(408).json({ ok: false, error: 'timeout polling' });
}
