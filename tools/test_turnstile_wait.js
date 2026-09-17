const { createBrowser, closeBrowser } = require('../core/browser_engine');

async function testTurnstileWait() {
  console.log('Starting Turnstile wait test...');
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();

  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});

  const t0 = Date.now();
  console.log('Waiting for Turnstile to finish verifying...');

  let passed = false;
  for (let s = 1; s <= 20; s++) {
    await new Promise(r => setTimeout(r, 1000));
    const title = await page.title();
    const curUrl = page.url();
    const hasTable = await page.$('.rcnt, .schema, .predict-tables');
    const cookies = await page.cookies();
    const hasClearance = cookies.some(c => c.name === 'cf_clearance');

    console.log(`[${s}s] Title: "${title}", Has Clearance: ${hasClearance}, Has Table: ${Boolean(hasTable)}`);

    if (!title.includes('Just a moment') && (hasTable || hasClearance)) {
      console.log(`🎉 TURNSTILE PASSED AUTOMATICALLY IN ${s} SECONDS!`);
      passed = true;
      break;
    }
  }

  if (passed) {
    const matchCount = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
    console.log(`Matches discovered: ${matchCount}`);
  } else {
    console.log('Did not pass in 20 seconds.');
  }

  await closeBrowser(browser);
}

testTurnstileWait().catch(console.error);
