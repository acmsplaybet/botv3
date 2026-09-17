/**
 * ====================================================================
 * BETMINES - STEALTH BROWSER ENGINE & CLOUDFLARE BYPASS
 * ====================================================================
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const config = require('../config');

function loadCookies() {
  try {
    if (fs.existsSync(config.paths.cookiesFile)) {
      const raw = fs.readFileSync(config.paths.cookiesFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) { }
  return [];
}

function saveCookies(cookies) {
  try {
    if (!cookies || !cookies.length) return;
    if (!fs.existsSync(config.paths.dataDir)) {
      fs.mkdirSync(config.paths.dataDir, { recursive: true });
    }
    fs.writeFileSync(config.paths.cookiesFile, JSON.stringify(cookies, null, 2), 'utf-8');
  } catch (e) { }
}

async function createBrowser(customOptions = {}) {
  const isHeadless = customOptions.headless !== undefined ? customOptions.headless : config.headless;
  const proxy = customOptions.proxy !== undefined ? customOptions.proxy : config.proxy;

  const userDataDir = config.paths.profileDir;
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  } else {
    // Windows singleton lock temizliği
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    for (const f of lockFiles) {
      const lockPath = path.join(userDataDir, f);
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch (_) { }
      }
    }
  }

  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  }

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--lang=en-US,en',
    '--disable-notifications'
  ];

  if (!isHeadless) {
    launchArgs.push('--window-size=1440,900');
  }

  if (proxy && proxy.trim() !== '') {
    launchArgs.push(`--proxy-server=${proxy.trim()}`);
    console.log(`[Tarayıcı] 🌐 Proxy aktif edildi: ${proxy.trim()}`);
  }

  const browser = await puppeteer.launch({
    headless: isHeadless,
    defaultViewport: isHeadless ? { width: 1440, height: 900 } : null,
    userDataDir: userDataDir,
    ignoreHTTPSErrors: true,
    executablePath: chromePath,
    args: launchArgs
  });

  return browser;
}

async function setupPage(page) {
  try {
    // Çerezleri yükle
    const cachedCookies = loadCookies();
    if (cachedCookies && cachedCookies.length > 0) {
      try {
        await page.setCookie(...cachedCookies);
      } catch (_) { }
    }

    // Stealth donanım kimliği
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, app: {}, csi: () => { }, loadTimes: () => { } };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'tr'] });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8'
    });
  } catch (e) { }
}

async function bypassCloudflareIfNeeded(page, logger = console.log, maxWaitSec = 15) {
  try {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSec * 1000) {
      const title = await page.title().catch(() => '');
      const isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare');
      if (!isCf) {
        try {
          const cookies = await page.cookies();
          if (cookies && cookies.length > 0) saveCookies(cookies);
        } catch (_) { }
        return true;
      }

      // Turnstile checkbox bul ve tıkla
      try {
        const frames = page.frames();
        for (const frame of frames) {
          const checkbox = await frame.$('input[type="checkbox"], .ctp-checkbox-label, #challenge-stage input, #cf-stage input');
          if (checkbox) {
            logger(`[Cloudflare] 🤖 Turnstile kutucuğu tespit edildi, tıklanıyor...`);
            await checkbox.click().catch(() => { });
            break;
          }
        }
      } catch (_) { }

      await new Promise(r => setTimeout(r, 1500));
    }

    try {
      const cookies = await page.cookies();
      if (cookies && cookies.length > 0) saveCookies(cookies);
    } catch (_) { }

    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  createBrowser,
  setupPage,
  bypassCloudflareIfNeeded,
  loadCookies,
  saveCookies
};
