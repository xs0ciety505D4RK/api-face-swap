import { chromium as pwChromium } from 'playwright-core';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Parameter "url" wajib diisi' });

  let browser;
  try {
    // Pake Browserless (sama kayak Face Swap)
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) throw new Error('BROWSERLESS_TOKEN belum diset');

    browser = await pwChromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${token}&--disable-dev-shm-usage&--disable-gpu`
    );

    const ctx = browser.contexts()[0] || (await browser.newContext());
    const page = await ctx.newPage();

    // Buka web bypass.city
    await page.goto('https://bypass.city/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Tunggu token AceCaptcha dihitung otomatis di background (kasih waktu 4 detik)
    await page.waitForTimeout(4000);

    // Cari kolom input (biasanya input text pertama)
    const input = page.locator('input[type="text"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(url);

    // Siapin penangkap response API bypass
    const responsePromise = page.waitForResponse(
      r => r.url().includes('api2.bypass.city/bypass') && r.request().method() === 'POST',
      { timeout: 30000 }
    );

    // Klik tombol Bypass (bisa dengan teks atau tipe submit)
    const btn = page.locator('button:has-text("Bypass"), button[type="submit"]').first();
    await btn.click();

    // Tunggu response dari server bypass.city
    const apiRes = await responsePromise;
    const data = await apiRes.json();

    // Rapihin output
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
