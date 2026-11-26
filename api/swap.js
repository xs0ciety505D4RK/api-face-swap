export const config = { runtime: 'nodejs', memory: 512, maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, faceBase64 } = req.body || {};
  if (!imageBase64 || !faceBase64) {
    return res.status(400).json({ error: 'imageBase64 & faceBase64 wajib' });
  }

  try {
    const formData = new FormData();
    const buf1 = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(faceBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    // ✅ NAMA FIELD YANG BENAR
    formData.append('target_image', new Blob([buf1], { type: 'image/jpeg' }), 'target.jpg');
    formData.append('swap_image', new Blob([buf2], { type: 'image/jpeg' }), 'face.jpg');

    const r = await fetch('https://api.remaker.ai/api/pai/v3/ai-facevary/appapi/create-job', {
      method: 'POST',
      headers: {
        'product-code': '067003',
        'product-serial': '4bc2eee53fbfd3e2439a83cbe82560e3',
        'source': 'ai_face_vary',
        'origin': 'https://remaker.ai',
        'referer': 'https://remaker.ai/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      },
      body: formData,
    });

    const data = await r.json();
    
    // Remaker sukses = code 100000
    if (data.code !== 100000) {
      return res.status(400).json({ ok: false, error: 'Gagal buat job', raw: data });
    }

    return res.status(200).json({ 
      ok: true, 
      taskId: data.result.job_id
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
