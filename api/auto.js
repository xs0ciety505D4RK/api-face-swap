import { chromium as pwChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { apiCall } from './_lib/http.js';

export const config = { runtime: 'nodejs20.x', memory: 3009, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, proxy = true, maxWaitMs = 45000 } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 wajib' });

  let browser, ctx;
  try {
    browser = await pwChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
    });
    const page = await ctx.newPage();

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
      timeout: 45000,
    });

    const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await (
      await page.waitForSelector('input[type="file"]', { timeout: 20000 })
    ).setInputFiles({ name: 'x.jpg', mimeType: 'image/jpeg', buffer: buf });

    await page.waitForTimeout(2500);

    await page
      .locator('button:has-text("Swap"), button:has-text("Generate"), button:has-text("Tukar")')
      .first()
      .click({ timeout: 15000 });

    const dl = Date.now() + 40000;
    while ((!taskId || !nonce) && Date.now() < dl) await page.waitForTimeout(400);
    if (!taskId) throw new Error('task_id timeout');

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    // Browser selesai — tutup dulu
    await ctx.close();
    await browser.close();
    ctx = browser = null;

    // Polling pure-fetch
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

    const finalUrl = proxy
      ? `${req.headers.origin || 'https://' + req.headers.host}/api/proxy?url=${encodeURIComponent(resultUrl)}`
      : resultUrl;

    return res.status(200).json({
      ok: true,
      resultUrl: finalUrl,
      raw: resultUrl,
      taskId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
