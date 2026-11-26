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

    // ── UPLOAD FILE ──────────────────────────────────────────
    debug.phase = 'upload';
    const buf1 = Buffer.from(img1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(img2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const inputs = page.locator('input[type="file"]');
    if ((await inputs.count()) >= 2) {
      await inputs.nth(0).setInputFiles({ name: 'img1.jpg', mimeType: 'image/jpeg', buffer: buf1 });
      await page.waitForTimeout(1000);
      await inputs.nth(1).setInputFiles({ name: 'img2.jpg', mimeType: 'image/jpeg', buffer: buf2 });
      await page.waitForTimeout(1500);
    }

    // ── CENTANG CHECKBOX SYARAT & KETENTUAN ─────────────────
    debug.phase = 'checkbox';
    const checkboxes = page.locator('.el-checkbox__original');
    if ((await checkboxes.count()) > 0) {
      // Klik checkbox pertama (yang wajib)
      await checkboxes.nth(0).check({ force: true });
      await page.waitForTimeout(1000);
    }

    // ── KLIK TOMBOL MULAI ───────────────────────────────────
    debug.phase = 'click';
    const swapBtn = page.locator('button:has-text("Mulai Tukar Wajah")').first();
    
    // Coba klik dengan force jika tombol tertutup overlay
    try {
      await swapBtn.click({ timeout: 5000 });
    } catch {
      await swapBtn.click({ force: true, timeout: 5000 });
    }

    // ── TUNGGU INTERCEPT API ────────────────────────────────
    debug.phase = 'wait_intercept';
    const dl = Date.now() + Math.min(25000, remaining());
    while ((!taskId || !nonce) && Date.now() < dl) {
      await page.waitForTimeout(500);
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

    return res.status(200).json({ ok: true, taskId, nonce, keyId, netLog });
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
