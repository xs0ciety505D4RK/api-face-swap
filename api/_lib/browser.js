import { chromium as pwChromium } from 'playwright-core';

export async function launchBrowser() {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error('BROWSERLESS_TOKEN belum diset di Environment Variables');

  return pwChromium.connectOverCDP(
    `wss://chrome.browserless.io?token=${token}&--disable-dev-shm-usage&--disable-gpu`
  );
}

export async function setupPage(ctx) {
  const page = await ctx.newPage();

  // Block resource berat → hemat bandwidth & waktu
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (['font', 'media'].includes(type)) return route.abort();

    const url = route.request().url();
    if (
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook.net') ||
      url.includes('cloudflareinsights') ||
      url.includes('doubleclick')
    ) {
      return route.abort();
    }
    return route.continue();
  });

  return page;
}
