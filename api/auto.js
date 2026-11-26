import { launchBrowser, setupPage } from './_lib/browser.js';
import { apiCall } from './_lib/http.js';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, faceBase64, maxWaitMs = 45000 } = req.body || {};
  const img1 = imageBase64 || faceBase64;
  const img2 = faceBase64 || imageBase64;
  if (!img1) return res.status(400).json({ error: 'imageBase64 wajib' });

  let browser;
  try {
    browser = await launchBrowser();

    const ctx =
      browser.contexts()[0] ||
      (await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
        locale: 'id-ID',
        timezoneId: 'Asia/Jakarta',
        viewport: { width: 412, height: 915 },
      }));

    const page = await setupPage(ctx);

    let nonce = null;
    let taskId = null;

    page.on('request', r => {
      if (r.url().endsWith('/api/generate_face_v1')) {
        if (r.headers()['nonce']) nonce = r.headers()['nonce'];
      }
    });
    page.on('response', async r => {
      if (r.url().endsWith('/api/generate_face_v1')) {
        try {
          const j = await r.json();
          taskId = j?.data?.task_id || j?.task_id;
        } catch {}
      }
    });

    await page.goto('https://aifaceswap.io/id/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const buf1 = Buffer.from(img1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(img2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const inputs = page.locator('input[type="file"]');
    await inputs.first().waitFor({ state: 'attached', timeout: 15000 });
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const buf = i === 0 ? buf1 : buf2;
      await inputs.nth(i).setInputFiles({
        name: `img${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: buf,
      });
      await page.waitForTimeout(800);
    }

    // Tunggu tombol enabled
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button.el-button--primary.w-100');
        return btn && !btn.disabled && !btn.classList.contains('is-disabled');
      },
      { timeout: 45000 }
    );

    await page.locator('button.el-button--primary.w-100').first().click({ timeout: 15000 });

    const dl = Date.now() + 25000;
    while ((!taskId || !nonce) && Date.now() < dl) await page.waitForTimeout(400);
    if (!taskId) throw new Error('task_id timeout');

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    // Tutup browser DULU sebelum polling
    await browser.close();
    browser = null;

    const started = Date.now();
    let attempt = 0;
    let resultUrl = null;

    while (Date.now() - started < maxWaitMs) {
      const { data } = await apiCall('/api/check_status', {
        task_id: taskId,
        nonce,
      });
      resultUrl =
        data?.data?.result_url ||
        data?.data?.url ||
        data?.data?.output ||
        data?.url ||
        data?.result_url;
      if (resultUrl) break;
      if (data?.code && ![0, 200, 202].includes(data.code)) break;
      await new Promise(r => setTimeout(r, Math.min(300 * ++attempt, 3000)));
    }

    if (!resultUrl) {
      return res.status(408).json({ ok: false, error: 'result timeout', taskId });
    }

    const proxyUrl = `${req.headers.origin || 'https://' + req.headers.host}/api/proxy?url=${encodeURIComponent(resultUrl)}`;

    return res.status(200).json({ ok: true, resultUrl: proxyUrl, raw: resultUrl, taskId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
