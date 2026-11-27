import { chromium as pwChromium } from 'playwright-core';

export const config = { runtime: 'nodejs', memory: 1024, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Parameter "url" wajib diisi' });

  let browser;
  let page;
  try {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) throw new Error('BROWSERLESS_TOKEN belum diset di Vercel');

    browser = await pwChromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${token}&--disable-dev-shm-usage&--disable-gpu`
    );

    const ctx = browser.contexts()[0] || (await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
    }));
    
    page = await ctx.newPage();

    // Buka web bypass.city
    await page.goto('https://bypass.city/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Tunggu token AceCaptcha dihitung otomatis (kasih waktu 6 detik)
    await page.waitForTimeout(6000);

    // CARI INPUT DENGAN SELECTOR YANG LEBIH LUAS
    // Bisa jadi input type="text", type="url", textarea, atau sekadar input tanpa tipe
    const inputSelector = 'input[type="text"], input[type="url"], input:not([type="hidden"]), textarea';
    const input = page.locator(inputSelector).first();
    
    // Tunggu sampai elemen benar-benar ada di DOM (bukan cuma visible)
    await input.waitFor({ state: 'attached', timeout: 10000 });
    
    // Isi kolom input
    await input.fill(url);
    await page.waitForTimeout(500);

    // Siapin penangkap response API
    const responsePromise = page.waitForResponse(
      r => r.url().includes('api2.bypass.city/bypass') && r.request().method() === 'POST',
      { timeout: 30000 }
    );

    // Klik tombol Bypass
    const btn = page.locator('button:has-text("Bypass"), button[type="submit"]').first();
    await btn.click({ timeout: 5000 });

    // Tunggu response dari server
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
    // KALAU GAGAL, AMBIL SCREENSHOT & HTML UNTUK DEBUG
    let debugShot = null;
    let pageHtml = null;
    
    if (page) {
      try {
        const shot = await page.screenshot({ type: 'jpeg', quality: 30 });
        debugShot = 'data:image/jpeg;base64,' + shot.toString('base64');
        pageHtml = (await page.content()).slice(0, 500); // 500 huruf pertama HTML
      } catch {}
    }

    return res.status(500).json({ 
      ok: false, 
      error: e.message,
      screenshot: debugShot, // <-- Ini bakal nampilin screenshot
      html_snippet: pageHtml
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
