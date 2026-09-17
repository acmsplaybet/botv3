const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');

async function test() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=en-US,en'
    ]
  });

  const page = await browser.newPage();
  // NO manual WebGL tampering, NO request interception!
  console.log('Navigating cleanly to Forebet...');
  const t0 = Date.now();
  await page.goto('https://www.forebet.com/en/football-predictions/predictions-1x2', { waitUntil: 'domcontentloaded', timeout: 35000 });
  
  console.log(`Loaded in ${Date.now() - t0}ms`);
  console.log('Title:', await page.title());

  const count = await page.$$eval('.rcnt', els => els.length).catch(() => 0);
  console.log('Matches found (.rcnt count):', count);

  await browser.close();
}

test().catch(console.error);
