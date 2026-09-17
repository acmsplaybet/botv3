const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function checkUrls() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const urls = [
    'https://www.forebet.com/',
    'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06',
    'https://www.forebet.com/en/football-predictions'
  ];

  for (const u of urls) {
    try {
      console.log(`Trying ${u}...`);
      const t0 = Date.now();
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 });
      console.log(`OK: ${u} in ${Date.now() - t0}ms, Title: "${await page.title()}"`);
    } catch(err) {
      console.log(`FAIL: ${u} -> ${err.message}`);
    }
  }

  await browser.close();
}

checkUrls().catch(console.error);
