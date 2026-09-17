const fs = require('fs');
const path = require('path');

const targetPaths = [
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot\\daily_pipeline.js',
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot2\\daily_pipeline.js'
];

targetPaths.forEach(targetFile => {
  if (!fs.existsSync(targetFile)) return;

  console.log(`Processing: ${targetFile}`);
  // Create backup
  fs.copyFileSync(targetFile, targetFile + '.bak_' + Date.now());

  let content = fs.readFileSync(targetFile, 'utf-8');

  // 1. Puppeteer import with stealth fallback
  const oldImport = "const puppeteer = require('puppeteer');";
  const newImport = `let puppeteer;
try {
  puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
} catch (e) {
  puppeteer = require('puppeteer');
}`;
  if (content.includes(oldImport)) {
    content = content.replace(oldImport, newImport);
    console.log('  -> Updated puppeteer import with stealth');
  }

  // 2. Remove prototype tampering in setupPageInterception
  const oldStealthBlockStart = "// 1. Stealth Evasions (Cloudflare Bot Algılamasını %100 Bypass Et)";
  const oldStealthBlockEnd = "// Request interception removed for HTTP/2 stability";
  
  if (content.includes(oldStealthBlockStart) && content.includes(oldStealthBlockEnd)) {
    const p1 = content.indexOf(oldStealthBlockStart);
    const p2 = content.indexOf(oldStealthBlockEnd);
    const before = content.substring(0, p1);
    const after = content.substring(p2 + oldStealthBlockEnd.length);

    const cleanSetup = `let chromeMajor = '131';
    let dynamicUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    try {
      const b = page.browser();
      const rawVer = await b.version();
      const match = rawVer.match(/Chrome\\/(\\d+)\\./);
      if (match) chromeMajor = match[1];
      const rawUa = await b.userAgent();
      if (rawUa) dynamicUa = rawUa.replace('HeadlessChrome', 'Chrome');
    } catch (e) {}

    await page.setUserAgent(dynamicUa);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': \`"Chromium";v="\${chromeMajor}", "Google Chrome";v="\${chromeMajor}", "Not-A.Brand";v="99"\`,
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    });

    const cachedCookies = loadCachedCookies();
    if (cachedCookies && cachedCookies.length > 0) {
      try { await page.setCookie(...cachedCookies); } catch (e) {}
    }`;

    content = before + cleanSetup + after;
    console.log('  -> Removed WebGL & navigator prototype tampering');
  }

  // 3. Root Warmup in getMatchListing
  const getMatchListingMarker = "async function getMatchListing(browser, listUrl) {";
  if (content.includes(getMatchListingMarker) && !content.includes("Forebet ana sunucu oturumu kuruluyor")) {
    const idx = content.indexOf(getMatchListingMarker);
    const insertPoint = content.indexOf("let matches = [];", idx);
    if (insertPoint !== -1) {
      const warmupCode = `try {
    log(\`  ↳ 🌐 Forebet ana sunucu oturumu kuruluyor...\`, COLORS.cyan);
    await page.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
  } catch (_) {}

  `;
      content = content.substring(0, insertPoint) + warmupCode + content.substring(insertPoint);
      console.log('  -> Added root domain warmup in getMatchListing');
    }
  }

  // 4. Update selector wait in getMatchListing
  const oldSelector = "await page.waitForSelector('.schema, .predict-tables, .rcnt', { timeout: 15000 });";
  const newSelector = "await page.waitForSelector('.schema, .rcnt, table.main', { timeout: 20000 }).catch(() => null);";
  if (content.includes(oldSelector)) {
    content = content.replace(oldSelector, newSelector);
    console.log('  -> Updated table selector wait');
  }

  // 5. Update Turnstile wait before reload in getMatchListing
  const oldCfCheck = `      if (isCf) {
        log(\`  ↳ 🛡️ Liste sayfasında Cloudflare algılandı (\${attempt}/\${maxListRetries})...\`, COLORS.yellow);
        if (attempt >= 2) {
          log(\`  ↳ 🔓 Doğrulama ekranı açılıyor, lütfen 'Ben İnsanım' kutucuğuna tıklayın...\`, COLORS.yellow);
          await triggerInteractiveChallenge(listUrl, log);
          const newCookies = loadCachedCookies();
          if (newCookies && newCookies.length > 0) {
            try { await page.setCookie(...newCookies); } catch (_) {}
          }
        }
        await new Promise(r => setTimeout(r, 2500));
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
      }`;

  const newCfCheck = `      if (isCf) {
        log(\`  ↳ 🛡️ Liste sayfasında Cloudflare algılandı, Turnstile bekleniyor (\${attempt}/\${maxListRetries})...\`, COLORS.yellow);
        // Turnstile arka planda kriptografik hesaplama yapar (3-5 saniye)
        for (let w = 0; w < 6; w++) {
          await new Promise(r => setTimeout(r, 1000));
          title = await page.title().catch(() => '');
          if (!title.includes('Just a moment') && !title.includes('Attention Required') && !title.includes('Cloudflare') && title !== 'www.forebet.com') {
            isCf = false;
            break;
          }
        }

        if (isCf && attempt >= 2) {
          log(\`  ↳ 🔓 Doğrulama ekranı açılıyor, lütfen 'Ben İnsanım' kutucuğuna tıklayın...\`, COLORS.yellow);
          await triggerInteractiveChallenge(listUrl, log);
          const newCookies = loadCachedCookies();
          if (newCookies && newCookies.length > 0) {
            try { await page.setCookie(...newCookies); } catch (_) {}
          }
          await new Promise(r => setTimeout(r, 1500));
          await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        } else if (isCf) {
          await new Promise(r => setTimeout(r, 1500));
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
        }
      }`;

  if (content.includes(oldCfCheck)) {
    content = content.replace(oldCfCheck, newCfCheck);
    console.log('  -> Updated Turnstile waiting logic in getMatchListing');
  }

  // 6. Fix ensureMatchPageLoaded Turnstile wait
  const oldEnsureCf = `      if (isCf) {
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
      }`;

  const newEnsureCf = `      if (isCf) {
        cfChallengeCounter++;
        log(\`  ↳ 🛡️ [Sekme \${workerId}] Cloudflare algılandı, Turnstile bekleniyor (\${attempt}/\${maxRetries})...\`, COLORS.yellow);
        for (let w = 0; w < 5; w++) {
          await new Promise(r => setTimeout(r, 1000));
          title = await page.title().catch(() => '');
          if (!title.includes('Just a moment') && !title.includes('Attention Required') && !title.includes('Cloudflare')) {
            isCf = false;
            break;
          }
        }
        if (isCf) {
          log(\`  ↳ 🔄 [Sekme \${workerId}] Sayfa yenileniyor (Cloudflare Bypass)...\`, COLORS.cyan);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
        }
      }`;

  if (content.includes(oldEnsureCf)) {
    content = content.replace(oldEnsureCf, newEnsureCf);
    console.log('  -> Updated Turnstile waiting logic in ensureMatchPageLoaded');
  }

  fs.writeFileSync(targetFile, content, 'utf-8');
  console.log(`Successfully patched: ${targetFile}`);
});
