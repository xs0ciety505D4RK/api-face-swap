import { apiCall } from './_lib/http.js';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { taskId, nonce, maxWaitMs = 45000 } = req.body || {};
  if (!taskId || !nonce) return res.status(400).json({ error: 'taskId & nonce wajib' });

  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < maxWaitMs) {
    const { status, data } = await apiCall('/api/check_status', {
      task_id: taskId,
      nonce,
    });

    const url =
      data?.data?.result_url ||
      data?.data?.url ||
      data?.data?.output ||
      data?.result_url ||
      data?.url;

    if (url) return res.status(200).json({ ok: true, resultUrl: url, raw: data });

    if (data?.code && ![0, 200, 202].includes(data.code)) {
      return res.status(status).json({ ok: false, raw: data });
    }

    attempt++;
    await new Promise(r => setTimeout(r, Math.min(300 * attempt, 3000)));
  }

  return res.status(408).json({ ok: false, error: 'timeout polling' });
}
