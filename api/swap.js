import { launchBrowser, setupPage } from './_lib/browser.js';

export const config = { runtime: 'nodejs', memory: 2048, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64 } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 wajib' });

  let browser, ctx;
  try {
    browser = await launchBrowser();
    ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
      viewport: { width: 412, height: 915 },
    });

    const page = await setupPage(ctx);

    let nonce = null;
    let taskId = null;

    page.on('request', r => {
      if (r.url().endsWith('/api/generate_face_v1')) {
        const h = r.headers();
        if (h['nonce']) nonce = h['nonce'];
      }
    });
    page.on('response', async r => {
      if (r.url().endsWith('/api/generate_face_v1')) {
        try {
          const j = await r.json();
          taskId = j?.data?.task_id || j?.data?.data?.task_id || j?.task_id;
        } catch {}
      }
    });

    await page.goto('https://aifaceswap.io/id/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 });
    await fileInput.setInputFiles({ name: 'x.jpg', mimeType: 'image/jpeg', buffer: buf });

    await page.waitForTimeout(2000);

    const btn = page
      .locator(
        'button:has-text("Swap"), button:has-text("Generate"), button:has-text("Tukar"), button:has-text("Ganti")'
      )
      .first();
    await btn.click({ timeout: 10000 });

    const deadline = Date.now() + 20000;
    while ((!taskId || !nonce) && Date.now() < deadline) {
      await page.waitForTimeout(400);
    }
    if (!taskId) throw new Error('task_id tidak tertangkap');

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    return res.status(200).json({ ok: true, taskId, nonce, keyId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
                                 }
