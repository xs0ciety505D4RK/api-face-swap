import { launchBrowser, setupPage } from './_lib/browser.js';
import { apiCall } from './_lib/http.js';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, faceBase64, maxWaitMs = 45000 } = req.body || {};
  const img1 = imageBase64 || faceBase64;
  const img2 = faceBase64 || imageBase64;
  if (!img1) return res.status(400).json({ error: 'imageBase64 wajib' });

  const START = Date.now();
  const BUDGET = 50000;
  const remaining = () => Math.max(1000, BUDGET - (Date.now() - START));

  let browser;
  const debug = { phase: 'init' };

  try {
    debug.phase = 'launch';
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
    page.setDefaultTimeout(Math.min(15000, remaining()));

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

    debug.phase = 'goto';
    await page.goto('https://aifaceswap.io/id/', {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(20000, remaining()),
    });

    debug.phase = 'fill_inputs';
    const buf1 = Buffer.from(img1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(img2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const inputs = page.locator('input[type="file"]');
    await inputs.first().waitFor({ state: 'attached', timeout: Math.min(10000, remaining()) });
    const count = await inputs.count();
    debug.inputCount = count;

    for (let i = 0; i < count; i++) {
      const buf = i === 0 ? buf1 : buf2;
      await inputs.nth(i).setInputFiles({
        name: `img${i + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: buf,
      });
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(3000);

    debug.phase = 'inspect_buttons';
    debug.buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b, i) => ({
        i,
        text: (b.textContent || '').trim().slice(0, 30),
        disabled: b.disabled || b.classList.contains('is-disabled'),
        primary: b.classList.contains('el-button--primary'),
      }))
    );

    const enabledPrimary = page.locator(
      'button.el-button--primary:not([disabled]):not(.is-disabled)'
    );
    const enabledCount = await enabledPrimary.count();
    debug.enabledPrimaryCount = enabledCount;

    if (enabledCount === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Semua tombol primary disabled. Lihat debug.buttons.',
        debug,
      });
    }

    const target = enabledPrimary.first();
    debug.clickedButton = (await target.textContent())?.trim() || '';

    debug.phase = 'click';
    await target.click({ timeout: Math.min(10000, remaining()) });

    debug.phase = 'wait_intercept';
    const dl = Date.now() + Math.min(15000, remaining());
    while ((!taskId || !nonce) && Date.now() < dl) {
      await page.waitForTimeout(400);
    }
    if (!taskId) {
      return res.status(500).json({
        ok: false,
        error: 'task_id timeout',
        debug,
        elapsed: Date.now() - START,
      });
    }

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    // Tutup browser DULU — bebaskan resource
    await browser.close();
    browser = null;

    debug.phase = 'polling';
    const pollStart = Date.now();
    let attempt = 0;
    let resultUrl = null;

    while (Date.now() - pollStart < maxWaitMs) {
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
      return res.status(408).json({ ok: false, error: 'result timeout', taskId, debug });
    }

    const proxyUrl = `${req.headers.origin || 'https://' + req.headers.host}/api/proxy?url=${encodeURIComponent(resultUrl)}`;

    return res.status(200).json({ ok: true, resultUrl: proxyUrl, raw: resultUrl, taskId, debug });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      debug,
      elapsed: Date.now() - START,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
