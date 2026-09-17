const { createBrowser, closeBrowser, setupPageInterception, navigateWithRetry } = require('../core/browser_engine');

async function testHeadlessFalse() {
  console.log('Testing with headless: false...');
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();
  await setupPageInterception(page);

  console.log('Navigating to Forebet...');
  const t0 = Date.now();
  const ok = await navigateWithRetry(page, 'https://www.forebet.com/en/football-predictions/predictions-1x2', console.log, 3, 30000);
  console.log(`Navigation result: ${ok}, elapsed: ${Date.now() - t0}ms`);
  console.log(`Page title: "${await page.title()}"`);

  const matchCount = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
  console.log(`Found .rcnt count: ${matchCount}`);

  await closeBrowser(browser);
}

testHeadlessFalse().catch(console.error);
