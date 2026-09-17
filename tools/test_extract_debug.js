const { initBrowser, closeBrowser, setupPageInterception, navigateWithRetry } = require('../core/browser_engine');

(async () => {
  const browser = await initBrowser({ headless: 'new' });
  const page = await browser.newPage();
  await setupPageInterception(page);
  await navigateWithRetry(page, 'https://www.forebet.com/en/football-predictions/predictions-1x2', console.log);
  
  const testExtract = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.schema:not(.ftrd) tr[onclick*="/matches/"], .schema:not(.ftrd) tr.rcnt, div.schema:not(.ftrd) .rcnt, table.main tr[onclick*="/matches/"], .predict-tables tr[onclick*="/matches/"], tr.rcnt, .schema_h2h tr[onclick*="/matches/"]'));
    
    const logs = [];
    const list = [];
    const seen = new Set();
    logs.push('Total rows found by selector: ' + rows.length);

    rows.forEach((r, idx) => {
      if (r.closest('.ftrd') || r.closest('.widget') || r.closest('.sidebar') || r.closest('#rightcol') || r.closest('.stat-more')) {
        if (idx < 5) logs.push('Row ' + idx + ' skipped by closest check');
        return;
      }

      let href = '';
      const onclick = r.getAttribute('onclick');
      if (onclick && onclick.includes('/matches/')) {
        const m = onclick.match(/'([^']+)'/);
        if (m) href = m[1];
      }

      if (!href) {
        const linkEl = r.querySelector('a.tnmscn, a.tnms, a[href*="/football/matches/"], a[href*="/matches/"], a[href*="/football-predictions/"]');
        if (linkEl && linkEl.href) href = linkEl.href;
      }

      if (!href || !href.includes('/matches/')) {
        if (idx < 5) logs.push('Row ' + idx + ' skipped because no href: ' + href);
        return;
      }

      if (!href.startsWith('http')) {
        href = 'https://www.forebet.com' + (href.startsWith('/') ? '' : '/') + href;
      }

      if (seen.has(href)) return;
      seen.add(href);

      list.push(href);
    });

    return { logs, extractedCount: list.length, sampleList: list.slice(0, 3) };
  });

  console.log('EXTRACT RESULT:\n', JSON.stringify(testExtract, null, 2));
  await closeBrowser(browser);
})();
