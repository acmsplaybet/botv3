/**
 * ====================================================================
 * BPA V3 STEALTH BROWSER ENGINE (CLOUDFLARE & FOREBET SHIELD BYPASS)
 * ====================================================================
 * Persistent Session & Cookie Architecture:
 * - Retains warm Chromium profile, LocalStorage, and TLS state across runs
 * - Automatically loads and preserves Cloudflare cf_clearance & session cookies
 * - Ad/tracker interception for maximum speed without breaking Cloudflare challenges
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const cookieCacheFile = path.join(dataDir, 'cf_cookies_cache.json');
const persistentProfileDir = path.join(dataDir, 'stealth_profile');

function loadCachedCookies() {
  try {
    if (fs.existsSync(cookieCacheFile)) {
      const raw = fs.readFileSync(cookieCacheFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {}
  return [];
}

function saveCachedCookies(cookies) {
  try {
    if (!cookies || !cookies.length) return;
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cookieCacheFile, JSON.stringify(cookies, null, 2), 'utf-8');
  } catch (e) {}
}

async function createBrowser(options = {}) {
  const headless = options.headless !== undefined ? options.headless : 'new';
  
  // Use isolated profile per workerId to prevent Chromium Windows SingletonLock conflicts
  let userDataDir = persistentProfileDir;
  if (options.workerId) {
    userDataDir = path.join(dataDir, `worker_profile_${options.workerId}`);
  } else if (options.useTempProfile) {
    userDataDir = path.join(__dirname, '..', 'temp_profiles', 'worker_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  }

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  } else {
    // Windows Singleton Lock koruması: Eski asılı kalan kilit dosyalarını temizle
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    for (const f of lockFiles) {
      const lockPath = path.join(userDataDir, f);
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch (_) {}
      }
    }
  }

  const browser = await puppeteer.launch({
    headless: headless,
    defaultViewport: { width: 1440, height: 900 },
    userDataDir: userDataDir,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=en-US,en',
      '--disable-notifications',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  browser._userDataDir = userDataDir;
  browser._isTempProfile = Boolean(options.useTempProfile);
  return browser;
}

async function setupPageInterception(page) {
  try {
    // 1. Load and inject persistent Cloudflare & Session cookies
    const cachedCookies = loadCachedCookies();
    if (cachedCookies && cachedCookies.length > 0) {
      try {
        await page.setCookie(...cachedCookies);
      } catch (e) {}
    }

    // 2. Stealth Evasions
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // 3. User Agent & Language
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    });

    // 4. Selective Ad-blocking and Media interception
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      const rType = req.resourceType();

      // NEVER block Cloudflare challenge verification scripts
      if (u.includes('cloudflare') || u.includes('challenges.cloudflare') || u.includes('turnstile')) {
        return req.continue();
      }

      // Block heavy ad networks & analytics
      if (
        u.includes('google-analytics') ||
        u.includes('googletagmanager') ||
        u.includes('doubleclick') ||
        u.includes('criteo') ||
        u.includes('adroll') ||
        u.includes('scorecardresearch') ||
        u.includes('taboola') ||
        u.includes('outbrain') ||
        u.includes('yandex') ||
        u.includes('adnxs') ||
        u.includes('amazon-adsystem') ||
        u.includes('pubmatic') ||
        u.includes('rubiconproject')
      ) {
        return req.abort();
      }

      // Block heavy assets (images, fonts, media) to achieve instant sub-second scraping
      if (rType === 'image' || rType === 'media' || rType === 'font' || rType === 'stylesheet' || rType === 'websocket') {
        return req.abort();
      }

      req.continue();
    });
  } catch (e) {}
}

async function navigateWithRetry(page, url, logger = console.log, maxRetries = 3, timeoutMs = 12000) {
  const delays = [1000, 2000, 3500, 5000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let navError = null;
    try {
      logger(`[Ağ] (${attempt}/${maxRetries}) Sayfaya bağlanılıyor: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(err => {
        navError = err;
      });

      // Timeout olsa bile DOM'un inip inmediğini kontrol et
      const hasContent = await page.evaluate(() => {
        return !!(document.querySelector('.schema, .rcnt, #m1x2_table, .predictioncontain, h1, .stat-last-match, [itemprop="name"], .weather, .rec_stat'));
      }).catch(() => false);

      if (hasContent) {
        // DOM hazır, Cloudflare kontrolü yap
        let title = await page.title().catch(() => '');
        let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

        if (!isCf) {
          return true; // Sayfa içeriği başarıyla hazır!
        }
      }

      let title = await page.title().catch(() => '');
      let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

      if (isCf) {
        logger(`[Ağ] ⚠️ Cloudflare Challenge tespit edildi, bekleniyor (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 3000));
        title = await page.title().catch(() => '');
        isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com';

        if (isCf) {
          logger(`[Ağ] 🔄 Sayfa yenileniyor (Cloudflare Bypass)...`);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      // Ensure actual match content is present
      await page.waitForSelector('.predictioncontain, .schema, .rcnt, #m1x2_table, .mrows', { timeout: 4000 }).catch(() => null);

      // Cache fresh cookies on success to data/cf_cookies_cache.json
      try {
        const cookies = await page.cookies();
        if (cookies && cookies.length > 0) {
          saveCachedCookies(cookies);
        }
      } catch (e) {}

      await new Promise(r => setTimeout(r, 50));
      return true;
    } catch (err) {
      logger(`[Ağ] ⚠️ Bağlantı denemesi ${attempt} hatası: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delayMs = delays[attempt - 1] || 2000;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function bypassCloudflareIfNeeded(page, logger = () => {}) {
  try {
    let title = await page.title();
    let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

    if (isCf) {
      logger(`[Ağ] ⚠️ Cloudflare Challenge tespit edildi, bekleniyor...`);
      await new Promise(r => setTimeout(r, 3500));
      title = await page.title();
      isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com';

      if (isCf) {
        logger(`[Ağ] 🔄 Sayfa yenileniyor (Cloudflare Bypass)...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    try {
      const cookies = await page.cookies();
      if (cookies && cookies.length > 0) saveCachedCookies(cookies);
    } catch (e) {}

    return true;
  } catch (err) {
    return false;
  }
}

async function closeBrowser(browser) {
  if (!browser) return;
  const isTemp = browser._isTempProfile;
  const tempDir = browser._userDataDir;

  try {
    await browser.close();
  } catch (e) {}

  // Only delete isolated temporary worker folders, NEVER delete the persistent stealth_profile!
  if (isTemp && tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

module.exports = {
  createBrowser,
  initBrowser: createBrowser,
  closeBrowser,
  bypassCloudflareIfNeeded,
  setupPageInterception,
  navigateWithRetry,
  saveCachedCookies,
  loadCachedCookies
};
