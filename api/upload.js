import { apiCall } from './_lib/http.js';

export const config = { runtime: 'nodejs26.x' };

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, fileName } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 wajib' });

  const name = fileName || `${Date.now()}.jpg`;
  const up = await apiCall('/api/upload_file', { file_name: name, type: 'image' });
  if (up.data.code !== 200) return res.status(500).json(up.data);

  const ossUrl = up.data.data.url;
  const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

  const put = await fetch(ossUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'image/jpg',
      'x-oss-storage-class': 'Standard',
      'user-agent': UA,
    },
    body: buf,
  });
  if (!put.ok) return res.status(500).json({ error: 'PUT OSS gagal', status: put.status });

  return res.status(200).json({
    ok: true,
    fileName: name,
    keyId: up.keyId,
    ossUrl,
  });
}
