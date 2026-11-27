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

    // 1. Buka bypass.city
    await page.goto('https://bypass.city/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 2. TANGKAP TOKEN CAPTCHA SAAT DIKIRIM OLEH WEB
    let captchaToken = null;
    page.on('response', async (response) => {
      if (response.url().includes('acecaptcha.com/v1/ace/verify')) {
        try {
          const json = await response.json();
          if (json.token) captchaToken = json.token;
        } catch (e) {}
      }
    });

    // 3. Tunggu sampai token ketangkep (biasanya 3-5 detik)
    const startTime = Date.now();
    while (!captchaToken && Date.now() - startTime < 8000) {
      await page.waitForTimeout(500);
    }

    if (!captchaToken) throw new Error('Gagal mencuri token Captcha dari browser');
    
    // 4. Browser tugasnya selesai, langsung tutup biar cepet
    await browser.close();
    browser = null;

    // 5. Tembak API bypass pakai fetch (selesai dalam hitungan milidetik)
    const apiRes = await fetch('https://api2.bypass.city/bypass', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'token': captchaToken,
        'origin': 'https://bypass.city',
        'referer': 'https://bypass.city/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ url })
    });

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
