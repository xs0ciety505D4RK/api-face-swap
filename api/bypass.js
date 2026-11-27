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

    // 1. Buka web bypass.city
    await page.goto('https://bypass.city/', { waitUntil: 'domcontentloaded', timeout: 8000 });

    // 2. Cari kolom input (pakai selector yang lebih luas)
    const input = page.locator('input[type="text"], input:not([type="hidden"]), textarea').first();
    
    // Paksa tunggu elemennya nempel di DOM (nggak harus kelihatan sempurna)
    await input.waitFor({ state: 'attached', timeout: 3000 });
    await input.fill(url, { force: true });

    // 3. Siapin penangkap response sebelum tombol diklik
    const responsePromise = page.waitForResponse(
      r => r.url().includes('api2.bypass.city/bypass'),
      { timeout: 8000 }
    );

    // 4. Klik tombol Bypass
    const btn = page.locator('button:has-text("Bypass"), button[type="submit"]').first();
    await btn.click({ force: true, timeout: 3000 });

    // 5. Tunggu hasil bypass dari server
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
