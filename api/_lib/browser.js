import { chromium as pwChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

// Matikan graphics mode & set headless minimum
chromium.setGraphicsMode = false;
chromium.setHeadlessMode = true;

export async function launchBrowser() {
  return pwChromium.launch({
    args: [
      ...chromium.args,
      // ── Hemat memori ─────────────────────────
      '--single-process',
      '--no-zygote',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--js-flags=--max-old-space-size=512',
      // ── Block resource berat ─────────────────
      '--blink-settings=imagesEnabled=true',
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
      '--disable-ipc-flooding-protection',
    ],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// Blok resource yang tidak perlu → hemat RAM & bandwidth
export async function setupPage(ctx) {
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (['font', 'media', 'stylesheet'].includes(type)) {
      return route.abort();
    }
    // Block tracker/analytics
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
