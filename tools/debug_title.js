const { createBrowser, closeBrowser, setupPageInterception } = require('../core/browser_engine');

async function debugTitle() {
  const browser = await createBrowser({ headless: false, useTempProfile: false });
  const page = await browser.newPage();
  await setupPageInterception(page);

  const url = 'https://www.forebet.com/en/football-predictions/predictions-1x2/2026-09-06';
  console.log('Navigating to:', url);

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('Frame navigated to:', frame.url());
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log('domcontentloaded fired!');
  console.log('Current URL:', page.url());
  console.log('Current Title:', `"${await page.title()}"`);

  const cookies = await page.cookies();
  console.log('Cookie names:', cookies.map(c => c.name));

  const contentCheck = await page.evaluate(() => {
    return {
      h1: Array.from(document.querySelectorAll('h1')).map(h => h.innerText),
      rcnt: document.querySelectorAll('.rcnt').length,
      bodyTextSnippet: (document.body?.innerText || '').substring(0, 150)
    };
  });
  console.log('Content check:', JSON.stringify(contentCheck, null, 2));

  await closeBrowser(browser);
}

debugTitle().catch(console.error);
