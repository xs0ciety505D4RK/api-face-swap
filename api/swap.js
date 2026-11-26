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

  try {
    debug.phase = 'launch';
    browser = await launchBrowser();

    const ctx =
      browser.contexts()[0] ||
      (await browser.newContext({
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
        locale: 'id-ID',
        viewport: { width: 412, height: 915 },
      }));

    const page = await setupPage(ctx);
    page.setDefaultTimeout(Math.min(15000, remaining()));

    page.on('request', r => {
      const u = r.url();
      if (u.includes('/api/generate_face_v1') || u.includes('aliyuncs.com')) {
        netLog.push({ m: r.method(), u: u.slice(0, 80) });
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
          taskId = j?.data?.task_id || j?.task_id;
        } catch {}
      }
    });

    debug.phase = 'goto';
    await page.goto('https://aifaceswap.io/id/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 1. UPLOAD GAMBAR
    debug.phase = 'upload';
    const buf1 = Buffer.from(img1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const buf2 = Buffer.from(img2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const inputs = page.locator('input[type="file"]');
    if ((await inputs.count()) >= 2) {
      await inputs.nth(0).setInputFiles({ name: 'img1.jpg', mimeType: 'image/jpeg', buffer: buf1 });
      await page.waitForTimeout(1000);
      await inputs.nth(1).setInputFiles({ name: 'img2.jpg', mimeType: 'image/jpeg', buffer: buf2 });
      await page.waitForTimeout(2000);
    }

    // 2. CENTANG CHECKBOX (Berdasarkan Teks "I confirm")
    debug.phase = 'checkbox';
    const checkboxLabel = page.locator('label.el-checkbox').filter({ hasText: 'I confirm' }).first();
    
    if ((await checkboxLabel.count()) > 0) {
      // Klik paksa bagian kotak visual
      await checkboxLabel.locator('.el-checkbox__inner').click({ force: true });
      await page.waitForTimeout(500);
      
      // Paksa via JS kalau masih belum tercentang
      debug.checkboxChecked = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label.el-checkbox'));
        const target = labels.find(l => l.textContent.includes('I confirm'));
        if (target && !target.classList.contains('is-checked')) {
          const input = target.querySelector('input[type="checkbox"]');
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          target.classList.add('is-checked');
          return true;
        }
        return target ? target.classList.contains('is-checked') : false;
      });
    }

    await page.waitForTimeout(1000);

    // 3. KLIK TOMBOL MULAI
    debug.phase = 'click';
    const swapBtn = page.locator('button:has-text("Mulai Tukar Wajah")').first();
    
    // Scroll ke tombol & klik paksa
    await swapBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await swapBtn.click({ force: true });

    // 4. TUNGGU API TERPanggil
    debug.phase = 'wait_intercept';
    const dl = Date.now() + Math.min(20000, remaining());
    while ((!taskId || !nonce) && Date.now() < dl) {
      await page.waitForTimeout(500);
    }

    if (!taskId) {
      return res.status(500).json({
        ok: false,
        error: 'API tidak terpanggil (cek screenshot).',
        netLog, debug,
        screenshot: 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 20 })).toString('base64')
      });
    }

    const cookies = await ctx.cookies('https://aifaceswap.io');
    const keyId = cookies.find(c => c.name === 'key_id')?.value;

    return res.status(200).json({ ok: true, taskId, nonce, keyId, netLog });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, netLog, debug });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
