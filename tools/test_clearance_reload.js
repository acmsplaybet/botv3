const { createBrowser, closeBrowser } = require('../core/browser_engine');

async function testClearanceReload() {
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();

  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});

  // Wait 3 seconds for Turnstile to compute cf_clearance:
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await page.cookies();
  const hasClearance = cookies.some(c => c.name === 'cf_clearance');
  console.log('Has cf_clearance in browser:', hasClearance);

  // Now reload with the clearance cookie:
  console.log('Navigating with warm clearance cookie...');
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log(`Loaded in ${Date.now() - t0}ms. Title: "${await page.title()}"`);

  const count = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
  console.log(`MATCHES FOUND: ${count}`);

  await closeBrowser(browser);
}

testClearanceReload().catch(console.error);
