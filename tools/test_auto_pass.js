const { createBrowser, closeBrowser, setupPageInterception } = require('../core/browser_engine');

async function testAutoPass() {
  console.log('Testing auto-pass without premature reload...');
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();
  await setupPageInterception(page);

  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  console.log('Navigating to:', url);

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  console.log(`DOMContentLoaded at ${Date.now() - t0}ms. Title: "${await page.title()}"`);

  // DO NOT RELOAD! Let Cloudflare Turnstile run for up to 15 seconds:
  console.log('Waiting for Turnstile / Forebet content to render...');
  const el = await page.waitForSelector('.schema, .predict-tables, .rcnt', { timeout: 20000 }).catch(() => null);
  
  const elapsed = Date.now() - t0;
  const finalTitle = await page.title();
  console.log(`After waiting: ${elapsed}ms, Title: "${finalTitle}", Found content: ${Boolean(el)}`);

  if (el) {
    const count = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
    console.log(`🎉 SUCCESS! Automatically bypassed Cloudflare without any popup! Total matches: ${count}`);
  } else {
    console.log('Still no content after 20s wait.');
  }

  await closeBrowser(browser);
}

testAutoPass().catch(console.error);
