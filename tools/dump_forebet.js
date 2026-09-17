const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

async function dump() {
  const browser = await puppeteer.launch({
    headless: false, // let's launch visible or headless to see
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  
  console.log('Navigating...');
  await page.goto('https://www.forebet.com/en/football-predictions/predictions-1x2', { waitUntil: 'networkidle2', timeout: 60000 });
  
  const title = await page.title();
  const url = page.url();
  console.log('Final URL:', url);
  console.log('Final Title:', title);

  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, 'dump_page.html'), html, 'utf-8');
  console.log('Dumped HTML, size:', html.length);

  const selectors = ['.schema', '.predict-tables', '.rcnt', 'table.main', '#m1x2_table', '.schema_h2h', 'div.schema', 'a[href*="/matches/"]'];
  for (const s of selectors) {
    const count = await page.$$eval(s, els => els.length).catch(() => 0);
    console.log(`Selector "${s}": ${count}`);
  }

  await browser.close();
}

dump().catch(console.error);
