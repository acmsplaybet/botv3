const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Testing extraction with hizlibot logic...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=en-US,en']
  });

  const page = await browser.newPage();
  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  
  await page.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 3000));

  const countHizlibot = await page.evaluate(() => {
    const rows = document.querySelectorAll('.schema:not(.ftrd) .rcnt, .schema:not(.ftrd) tr[onclick*="/matches/"], .predict-tables tr, div.schema .rcnt, .rcnt');
    let extracted = 0;
    const sample = [];
    rows.forEach(row => {
      let matchUrl = '';
      const onclick = row.getAttribute('onclick');
      if (onclick && onclick.includes('/matches/')) {
        const m = onclick.match(/'([^']+)'/);
        if (m) matchUrl = m[1];
      }
      if (!matchUrl) {
        const link = row.querySelector('a[href*="/matches/"]');
        if (link) matchUrl = link.getAttribute('href');
      }
      if (matchUrl) {
        extracted++;
        if (sample.length < 3) sample.push(matchUrl);
      }
    });
    return { rowCount: rows.length, extracted, sample };
  });

  console.log('Extraction Result:', countHizlibot);
  await browser.close();
})();
