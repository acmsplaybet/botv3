const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testWarmup() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // 1. Warm up session at root
  console.log('1. Warming up session at https://www.forebet.com/ ...');
  const t0 = Date.now();
  await page.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log(`Root loaded in ${Date.now() - t0}ms. Title: "${await page.title()}"`);

  // 2. Now navigate to target listing
  const targetUrl = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  console.log(`2. Navigating to listing: ${targetUrl}...`);
  const t1 = Date.now();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log(`Listing loaded in ${Date.now() - t1}ms. Title: "${await page.title()}"`);

  // 3. Extract matches
  await page.waitForSelector('.rcnt', { timeout: 15000 });
  const matches = await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('a.tnmscn, a[href*="/football/matches/"]').forEach(a => {
      if (a.href && !list.includes(a.href)) list.push(a.href);
    });
    return list;
  });

  console.log(`🎉 SUCCESS! Extracted ${matches.length} matches! Sample:`, matches.slice(0, 3));
  await browser.close();
}

testWarmup().catch(console.error);
