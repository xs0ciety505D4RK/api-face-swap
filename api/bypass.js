import { chromium as pwChromium } from 'playwright-core';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Parameter "url" wajib diisi' });

  let browser;
  try {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) throw new Error('BROWSERLESS_TOKEN belum diset');

    browser = await pwChromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${token}&--disable-dev-shm-usage&--disable-gpu`
    );

    const ctx = browser.contexts()[0] || (await browser.newContext());
    const page = await ctx.newPage();

    // 1. Buka web bypass.city (tunggu sampai network selesai loading)
    await page.goto('https://bypass.city/', { waitUntil: 'domcontentloaded', timeout: 8000 });

    // 2. Tunggu elemen input pertama muncul di DOM
    await page.waitForSelector('input', { timeout: 4000 });

    // 3. Cari input yang tipenya TEXT atau URL, lalu isi
    const inputs = page.locator('input');
    const count = await inputs.count();
    let filled = false;

    for (let i = 0; i < count; i++) {
      const el = inputs.nth(i);
      const type = await el.getAttribute('type');
      
      // Lewati checkbox/radio/hidden, isi yang text/url/ga ada tipe
      if (type !== 'checkbox' && type !== 'radio' && type !== 'hidden' && type !== 'submit') {
        await el.fill(url, { force: true });
        filled = true;
        break;
      }
    }

    if (!filled) throw new Error('Gagal menemukan kolom input URL');

    // 4. Siapin penangkap response
    const responsePromise = page.waitForResponse(
      r => r.url().includes('api2.bypass.city/bypass'),
      { timeout: 4000 }
    );

    // 5. Klik tombol Bypass
    const btn = page.locator('button:has-text("Bypass"), button[type="submit"]').first();
    await btn.click({ force: true, timeout: 3000 });

    // 6. Tunggu hasil bypass
    const apiRes = await responsePromise;
    const data = await apiRes.json();

    if (!data.data) {
      return res.status(400).json({ ok: false, error: 'Gagal bypass', raw: data });
    }

    return res.status(200).json({
      ok: true,
      originalUrl: url,
      resultUrl: data.data,
      name: data.name || 'Unknown',
      embed: data.embedData || []
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
