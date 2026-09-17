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

    // Replace ensureMatchPageLoaded with robust version
    const oldFuncStart = "async function ensureMatchPageLoaded(page, url, workerId, maxRetries = 2) {";
    const oldFuncEnd = "return false;\n}";

    const startIdx = content.indexOf(oldFuncStart);
    if (startIdx !== -1) {
      const endIdx = content.indexOf(oldFuncEnd, startIdx);
      if (endIdx !== -1) {
        const fullOld = content.substring(startIdx, endIdx + oldFuncEnd.length);

        const newFunc = `async function ensureMatchPageLoaded(page, url, workerId, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });

      // First check if real content is already present
      const hasContent = await page.evaluate(() => {
        return !!(document.querySelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema'));
      }).catch(() => false);

      if (hasContent) {
        return true;
      }

      let title = await page.title().catch(() => '');
      let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare');

      if (isCf) {
        cfChallengeCounter++;
        log(\`  ↳ 🛡️ [Sekme \${workerId}] Cloudflare algılandı, bekleniyor (\${attempt}/\${maxRetries})...\`, COLORS.yellow);
        await new Promise(r => setTimeout(r, 4000));
        title = await page.title().catch(() => '');
        isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare');

        if (isCf) {
          log(\`  ↳ 🔄 [Sekme \${workerId}] Sayfa yenileniyor (Cloudflare Bypass)...\`, COLORS.cyan);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      await page.waitForSelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema', { timeout: 20000 }).catch(() => null);
      const finalCheck = await page.evaluate(() => {
        return !!(document.querySelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema'));
      }).catch(() => false);

      if (finalCheck) {
        if (isCf) cfBypassCounter++;
        return true;
      }
    } catch (e) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }
  return false;
}`;

        content = content.replace(fullOld, newFunc);
        fs.writeFileSync(targetPath, content, 'utf-8');
        console.log(`Successfully upgraded ensureMatchPageLoaded in ${targetPath}`);
      }
    }
  }
});
