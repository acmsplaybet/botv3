const { createBrowser, closeBrowser } = require('../core/browser_engine');
const path = require('path');

async function snap() {
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();
  
  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4000));

  const shotPath = path.join(__dirname, 'cf_screen.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Saved screenshot to:', shotPath);

  const frames = page.frames().map(f => f.url());
  console.log('Frames on page:', frames);

  await closeBrowser(browser);
}

snap().catch(console.error);
