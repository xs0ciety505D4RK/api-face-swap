import { launchBrowser, setupPage } from './_lib/browser.js';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64, faceBase64 } = req.body || {};
  const img1 = imageBase64 || faceBase64;
  const img2 = faceBase64 || imageBase64;
  if (!img1) return res.status(400).json({ error: 'imageBase64 wajib' });

  const START = Date.now();
  const BUDGET = 50000;
  const remaining = () => Math.max(1000, BUDGET - (Date.now() - START));

  let browser;
  const debug = { phase: 'init' };
  const netLog = [];
  const consoleLog = [];

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

    // ── Rekam semua network ─────────────────────────
    page.on('request', r => {
      const u = r.url();
      if (u.includes('aifaceswap.io/api/') || u.includes('ezmaker')) {
        netLog.push({ dir: 'REQ', m: r.method(), url: u.slice(0, 120) });
      }
    });
    page.on('response', async r => {
      const u = r.url();
      if (u.includes('aifaceswap.io/api/') || u.includes('ezmaker')) {
        netLog.push({ dir: 'RES', s: r.status(), url: u.slice(0, 120) });
      }
    });

    // ── Rekam console error & page error ────────────
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleLog.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`);
      }
    });
    page.on('pageerror', err => {
      consoleLog.push(`[pageerror] ${err.message.slice(0, 200)}`);
    });

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
      await page.waitForTimeout(1500);
    }

    // Tunggu upload benar-benar selesai: cek tidak ada request upload pending
    await page.waitForTimeout(4000);

    // Cek state sebelum klik
    debug.beforeClick = await page.evaluate(() => ({
      url: location.href,
      imgPreviews: document.querySelectorAll('.el-upload-list__item img, .el-image img').length,
      toasts: Array.from(document.querySelectorAll('.el-message, .el-notification')).map(e =>
        (e.textContent || '').trim().slice(0, 100)
      ),
      primaryButtons: Array.from(document.querySelectorAll('button.el-button--primary')).map(b => ({
        text: (b.textContent || '').trim().slice(0, 30),
        disabled: b.disabled || b.classList.contains('is-disabled'),
      })),
    }));

    // Cari tombol primary enabled
    const enabledPrimary = page.locator(
      'button.el-button--primary:not([disabled]):not(.is-disabled)'
    );
    const enabledCount = await enabledPrimary.count();
    debug.enabledPrimaryCount = enabledCount;

    if (enabledCount === 0) {
      const shot = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 40 });
      return res.status(500).json({
        ok: false,
        error: 'Tidak ada tombol primary enabled',
        debug: { ...debug, netLog, consoleLog },
        screenshot: 'data:image/jpeg;base64,' + shot.toString('base64'),
      });
    }

    const target = enabledPrimary.first();
    debug.clickedButton = (await target.textContent())?.trim() || '';

    // Klik
    debug.phase = 'click';
    await target.click({ timeout: Math.min(10000, remaining()) });

    // Tunggu 5 detik, cek state setelah klik
    await page.waitForTimeout(5000);

    debug.afterClick = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      toasts: Array.from(document.querySelectorAll('.el-message, .el-notification')).map(e =>
        (e.textContent || '').trim().slice(0, 100)
      ),
      visibleDialogs: Array.from(document.querySelectorAll('.el-dialog')).filter(d => d.offsetParent !== null).map(d => ({
        title: (d.querySelector('.el-dialog__title')?.textContent || '').trim().slice(0, 80),
        body: (d.querySelector('.el-dialog__body')?.textContent || '').trim().slice(0, 300),
        buttons: Array.from(d.querySelectorAll('button')).map(b => ({
          text: (b.textContent || '').trim().slice(0, 30),
          disabled: b.disabled || b.classList.contains('is-disabled'),
        })),
      })),
      uploadListItems: document.querySelectorAll('.el-upload-list__item').length,
      loadingSpinners: document.querySelectorAll('.el-loading-mask, .is-loading').length,
    }));

    // Tunggu intercept task_id
    debug.phase = 'wait_intercept';
    const dl = Date.now() + Math.min(20000, remaining());
    while ((!taskId || !nonce) && Date.now() < dl) {
      await page.waitForTimeout(400);
    }

    // Screenshot kondisi akhir
    const shot = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 40 });
    debug.screenshot = 'data:image/jpeg;base64,' + shot.toString('base64');

    if (!taskId) {
      return res.status(500).json({
        ok: false,
        error: 'task_id tidak tertangkap',
        debug: { ...debug, netLog, consoleLog },
      });
    }

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    return res.status(200).json({
      ok: true,
      taskId,
      nonce,
      keyId,
      debug: { ...debug, netLog, consoleLog },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      debug: { ...debug, netLog, consoleLog },
      elapsed: Date.now() - START,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
              }
