const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testClean() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Connect to target date URL directly
  const dateStr = '2026-09-06';
  const targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${dateStr}`;
  console.log(`Connecting directly to: ${targetUrl}...`);

  const t0 = Date.now();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log(`Loaded in ${Date.now() - t0}ms. Title: "${await page.title()}"`);

  // Wait for match table
  await page.waitForSelector('.schema, .predict-tables, .rcnt', { timeout: 15000 }).catch(() => null);
  const matchCount = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
  console.log(`Matches discovered: ${matchCount}`);

  await browser.close();
}

testClean().catch(console.error);
