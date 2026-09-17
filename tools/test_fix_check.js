const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

const { loadCachedCookies } = require('../core/browser_engine');

async function test() {
  const cookies = loadCachedCookies();
  console.log(`Loaded ${cookies.length} cleaned cookies. Has cf_clearance:`, cookies.some(c => c.name === 'cf_clearance'));

  const browser = await puppeteer.launch({
    headless: 'new',
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
  const rawUa = await browser.userAgent();
  const cleanUa = rawUa.replace('HeadlessChrome', 'Chrome');
  await page.setUserAgent(cleanUa);

  if (cookies.length > 0) {
    try {
      await page.setCookie(...cookies);
      console.log('Successfully set cookies on page!');
    } catch(err) {
      console.error('setCookie failed:', err);
    }
  }

  console.log('Navigating to predictions-1x2...');
  const t0 = Date.now();
  await page.goto('https://www.forebet.com/en/football-predictions/predictions-1x2', { waitUntil: 'domcontentloaded', timeout: 40000 });
  console.log(`Loaded in ${Date.now() - t0}ms. Title: "${await page.title()}"`);

  const info = await page.evaluate(() => {
    const matches = document.querySelectorAll('a[href*="/matches/"]').length;
    const rcnt = document.querySelectorAll('.rcnt').length;
    return { matches, rcnt, title: document.title };
  });

  console.log('Result:', JSON.stringify(info));
  await browser.close();
}

test().catch(console.error);
