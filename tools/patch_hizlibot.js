const fs = require('fs');
const path = require('path');

const targets = [
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot',
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot2'
];

const sourceCookies = path.join(__dirname, '..', 'data', 'cf_cookies_cache.json');

targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const targetPath = path.join(dir, 'daily_pipeline.js');
  if (fs.existsSync(targetPath)) {
    let content = fs.readFileSync(targetPath, 'utf-8');

    // 1. Add ignoreDefaultArgs to createBrowser
    if (!content.includes("ignoreDefaultArgs: ['--enable-automation'],\n    executablePath: chromePath")) {
      content = content.replace(
        "    executablePath: chromePath,",
        "    ignoreDefaultArgs: ['--enable-automation'],\n    executablePath: chromePath,"
      );
    }

    // 2. Add selector support for div.rcnt and .schema:not(.ftrd)
    if (content.includes("const rows = document.querySelectorAll('.schema .rcnt, .schema tr[onclick*=\"/matches/\"], .schema tr');")) {
      content = content.replace(
        "const rows = document.querySelectorAll('.schema .rcnt, .schema tr[onclick*=\"/matches/\"], .schema tr');",
        "const rows = document.querySelectorAll('.schema:not(.ftrd) .rcnt, .schema:not(.ftrd) tr[onclick*=\"/matches/\"], .predict-tables tr, div.schema .rcnt, .rcnt');"
      );
    }

    // 3. Fix dates is not defined bug if present
    if (content.includes("for (let i = 0; i < dates.length; i++)")) {
      content = content.replace(
        "for (let i = 0; i < dates.length; i++)",
        "for (let i = 0; i < datesToProcess.length; i++)"
      );
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log(`Patched ${targetPath}`);
  }

  // Copy warm cookies
  if (fs.existsSync(sourceCookies)) {
    const dataDir = path.join(dir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(sourceCookies, path.join(dataDir, 'cf_cookies_cache.json'));
    console.log(`Copied cookies to ${path.join(dataDir, 'cf_cookies_cache.json')}`);
  }
});
