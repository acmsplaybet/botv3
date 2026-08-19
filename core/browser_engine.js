/**
 * ====================================================================
 * BPA V3 STEALTH BROWSER ENGINE (CLOUDFLARE & FOREBET SHIELD BYPASS)
 * ====================================================================
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const cookieCacheFile = path.join(__dirname, '..', 'data', 'cf_cookies_cache.json');

function loadCachedCookies() {
  try {
    if (fs.existsSync(cookieCacheFile)) {
      return JSON.parse(fs.readFileSync(cookieCacheFile, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveCachedCookies(cookies) {
  try {
    if (!cookies || !cookies.length) return;
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cookieCacheFile, JSON.stringify(cookies, null, 2), 'utf-8');
  } catch (e) {}
}

async function createBrowser(options = {}) {
  const headless = options.headless !== undefined ? options.headless : 'new';
  const tempUserDataDir = path.join(__dirname, '..', 'temp_profiles', 'bot_' + Date.now());

  const browser = await puppeteer.launch({
    headless: headless,
    defaultViewport: { width: 1440, height: 900 },
    userDataDir: tempUserDataDir,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=en-US,en',
      '--disable-notifications',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  return browser;
}

async function setupPageInterception(page) {
  try {
    // 1. Stealth Evasions
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Inject cached cookies if available
    const cachedCookies = loadCachedCookies();
    if (cachedCookies && cachedCookies.length > 0) {
      try { await page.setCookie(...cachedCookies); } catch (e) {}
    }

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      const rType = req.resourceType();

      // Block Ads & Trackers
      const adDomains = [
        'googleads', 'doubleclick', 'criteo', 'googlesyndication', 'adsystem', 'adnxs',
        'analytics', 'facebook', 'taboola', 'outbrain', 'pubmatic', 'rubiconproject',
        'openx', 'amazon-adsystem', 'clarity.ms', 'hotjar', 'onesignal', 'popcash',
        'exoclick', 'adroll', 'smartadserver', 'casalemedia', 'scorecardresearch',
        'quantserve', 'bidswitch', 'lijit', 'sovrn', 'moatads', 'adsafeprotected',
        'adservice', 'pagead2'
      ];

      if (adDomains.some(d => url.includes(d))) {
        return req.abort();
      }

      // Block non-essential media & fonts
      if (rType === 'media' || rType === 'font' || rType === 'websocket') {
        return req.abort();
      }

      req.continue();
    });
  } catch (e) {}
}

async function navigateWithRetry(page, url, logger = console.log, maxRetries = 5) {
  const delays = [1000, 2500, 4500, 7000, 10000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger(`[Ağ] (${attempt}/${maxRetries}) Sayfaya bağlanılıyor: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      let title = await page.title();
      let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

      if (isCf) {
        logger(`[Ağ] ⚠️ Cloudflare Challenge tespit edildi, bekleniyor (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 3500));
        title = await page.title();
        isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com';

        if (isCf) {
          logger(`[Ağ] 🔄 Sayfa yenileniyor (Cloudflare Bypass)...`);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Cache cookies on success
      try {
        const cookies = await page.cookies();
        if (cookies && cookies.length > 0) saveCachedCookies(cookies);
      } catch (e) {}

      await new Promise(r => setTimeout(r, 1000));
      return true;
    } catch (err) {
      logger(`[Ağ] ⚠️ Bağlantı denemesi ${attempt} hatası: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delayMs = delays[attempt - 1] || 3000;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}

module.exports = {
  createBrowser,
  setupPageInterception,
  navigateWithRetry,
  saveCachedCookies,
  loadCachedCookies
};
