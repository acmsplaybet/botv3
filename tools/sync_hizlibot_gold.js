const fs = require('fs');
const path = require('path');

const targets = [
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot',
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot2'
];

targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const targetPath = path.join(dir, 'daily_pipeline.js');
  if (fs.existsSync(targetPath)) {
    let content = fs.readFileSync(targetPath, 'utf-8');

    // 1. Remove request interception if present
    content = content.replace(/await\s+page\.setRequestInterception\(true\);[\s\S]*?page\.on\('request'[\s\S]*?req\.continue\(\);\s*\}\);/g, '// Request interception removed for HTTP/2 stability');

    // 2. Add root domain warmup in getMatchListing
    if (!content.includes("await page.goto('https://www.forebet.com/'")) {
      content = content.replace(
        "async function getMatchListing(browser, listUrl) {",
        `async function getMatchListing(browser, listUrl) {\n  try {\n    const warmPage = await browser.newPage();\n    await warmPage.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});\n    await new Promise(r => setTimeout(r, 1000));\n    await warmPage.close().catch(() => {});\n  } catch (_) {}`
      );
    }

    // 3. Ensure targetUrl always includes the date
    content = content.replace(
      "url = `https://www.forebet.com/en/football-predictions/predictions-1x2`;",
      "url = `https://www.forebet.com/en/football-predictions/predictions-1x2/${dStr}`;"
    );

    // 4. Remove --disable-web-security
    content = content.replace(/'--disable-web-security',?\n?/g, '');

    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log(`Updated ${targetPath}`);
  }

  // Clean stale profiles and cookies
  const dataDir = path.join(dir, 'data');
  if (fs.existsSync(dataDir)) {
    try {
      const files = ['cf_cookies_cache.json', 'stealth_profile'];
      files.forEach(f => {
        const fp = path.join(dataDir, f);
        if (fs.existsSync(fp)) {
          fs.rmSync(fp, { recursive: true, force: true });
        }
      });
      console.log(`Cleaned stale data in ${dataDir}`);
    } catch (_) {}
  }
});
