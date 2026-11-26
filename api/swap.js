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

    page.on('request', r => {
      const u = r.url();
      if (u.includes('aifaceswap.io/api/') || u.includes('ezmaker') || u.includes('aliyuncs.com')) {
        netLog.push({ d: 'REQ', m: r.method(), u: u.slice(0, 100) });
      }
    });
    page.on('response', r => {
      const u = r.url();
      if (u.includes('aifaceswap.io/api/') || u.includes('ezmaker') || u.includes('aliyuncs.com')) {
        netLog.push({ d: 'RES', s: r.status(), u: u.slice(0, 100) });
      }
    });
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleLog.push(`[${msg.type()}] ${msg.text().slice(0, 150)}`);
      }
    });
    page.on('pageerror', err => {
      consoleLog.push(`[err] ${err.message.slice(0, 150)}`);
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
    await page.waitForTimeout(2500);

    debug.phase = 'analyze';
    debug.pageInfo = await page.evaluate(() => ({
      uploadZones: Array.from(document.querySelectorAll('.el-upload')).map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          visible: el.offsetParent !== null && r.width > 0,
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
      fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map((el, i) => ({
        i,
        accept: (el.accept || '').slice(0, 60),
      })),
    }));

    const buf1 = Buffer.from(img1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(img2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const previewCount = () =>
      page.evaluate(() => document.querySelectorAll('.el-upload-list__item').length);

    async function uploadZone(idx, buf, name) {
      const log = [];
      const before = await previewCount();
      const zone = page.locator('.el-upload').nth(idx);

      try {
        await zone.scrollIntoViewIfNeeded({ timeout: 2000 });
      } catch {}
      await page.waitForTimeout(300);

      // Coba klik beberapa target dalam zona upload untuk memicu file chooser
      const targets = [
        { sel: '.el-upload', desc: 'zone' },
        { sel: '.el-upload__text', desc: 'text' },
        { sel: '.el-button', desc: 'btn' },
        { sel: '.el-upload .el-icon', desc: 'icon' },
      ];

      for (const t of targets) {
        try {
          const el = zone.locator(t.sel).first();
          if ((await el.count()) === 0) continue;
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 2500 }),
            el.click({ timeout: 2500, force: true }),
          ]);
          await chooser.setFiles({ name, mimeType: 'image/jpeg', buffer: buf });
          log.push(`${t.desc}-ok`);
          await page.waitForTimeout(2500);
          const after = await previewCount();
          if (after > before) {
            log.push('preview-ok');
            return { idx, before, after, method: `chooser-${t.desc}`, log };
          }
        } catch (e) {
          log.push(`${t.desc}-f:${(e.message || '').slice(0, 30)}`);
        }
      }

      // Fallback: setInputFiles langsung
      try {
        const input = page.locator('input[type="file"]').nth(idx);
        await input.setInputFiles({ name, mimeType: 'image/jpeg', buffer: buf });
        log.push('direct-ok');
        await page.waitForTimeout(2500);
        const after = await previewCount();
        if (after > before) {
          log.push('preview-ok');
          return { idx, before, after, method: 'direct', log };
        }
      } catch (e) {
        log.push(`direct-f:${(e.message || '').slice(0, 30)}`);
      }

      const after = await previewCount();
      return { idx, before, after, method: 'failed', log };
    }

    debug.phase = 'upload';
    const up0 = await uploadZone(0, buf1, 'img1.jpg');
    const up1 = await uploadZone(1, buf2, 'img2.jpg');
    debug.uploads = [up0, up1];

    await page.waitForTimeout(3000);

    debug.phase = 'inspect_btn';
    debug.previewFinal = await previewCount();
    debug.swapBtnDisabled = null;

    const swapBtn = page.locator('button:has-text("Mulai Tukar Wajah")').first();
    if ((await swapBtn.count()) === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Tombol "Mulai Tukar Wajah" tidak ditemukan',
        netLog, consoleLog, debug,
      });
    }

    const isDisabled = await swapBtn.isDisabled();
    debug.swapBtnDisabled = isDisabled;

    if (isDisabled) {
      return res.status(500).json({
        ok: false,
        error: 'Tombol disabled setelah upload',
        netLog, consoleLog, debug,
      });
    }

    debug.phase = 'click';
    await swapBtn.click({ timeout: 10000 });

    debug.phase = 'wait_intercept';
    const dl = Date.now() + Math.min(20000, remaining());
    while ((!taskId || !nonce) && Date.now() < dl) {
      await page.waitForTimeout(400);
    }

    if (!taskId) {
      const shot = await page.screenshot({
        fullPage: false,
        type: 'jpeg',
        quality: 25,
        clip: { x: 0, y: 0, width: 412, height: 500 },
      });
      return res.status(500).json({
        ok: false,
        error: 'task_id tidak tertangkap setelah klik',
        netLog, consoleLog, debug,
        screenshot: 'data:image/jpeg;base64,' + shot.toString('base64'),
      });
    }

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    return res.status(200).json({ ok: true, taskId, nonce, keyId, netLog, consoleLog, debug });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      netLog, consoleLog, debug,
      elapsed: Date.now() - START,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
