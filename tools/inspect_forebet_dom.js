const { createBrowser, closeBrowser } = require('../core/browser_engine');
const fs = require('fs');

(async () => {
  console.log('🚀 Starting DOM inspector on Forebet...');
  const browser = await createBrowser(false);
  const page = await browser.newPage();
  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  
  console.log('1. Warming up root https://www.forebet.com/...');
  await page.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Warmup err:', e.message));
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('2. Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e => console.log('Nav err:', e.message));
  await new Promise(r => setTimeout(r, 4000));
  
  const domInfo = await page.evaluate(() => {
    const classes = [];
    document.querySelectorAll('*[class]').forEach(el => {
      el.classList.forEach(c => {
        if (!classes.includes(c) && classes.length < 100) classes.push(c);
      });
    });

    return {
      title: document.title,
      url: window.location.href,
      schemaCount: document.querySelectorAll('.schema').length,
      rcntCount: document.querySelectorAll('.rcnt').length,
      predictTablesCount: document.querySelectorAll('.predict-tables').length,
      tableMainCount: document.querySelectorAll('table.main').length,
      shortTagCount: document.querySelectorAll('.shortTag').length,
      matchLinks: document.querySelectorAll('a[href*="/matches/"]').length,
      sampleClasses: classes.slice(0, 40)
    };
  });

  console.log('DOM INFO:', JSON.stringify(domInfo, null, 2));

  // Screenshot
  await page.screenshot({ path: 'tools/inspect_forebet.png', fullPage: false });
  console.log('📸 Screenshot saved to tools/inspect_forebet.png');

  await closeBrowser(browser);
  process.exit(0);
})();
