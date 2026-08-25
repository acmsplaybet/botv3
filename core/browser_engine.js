/**
 * ====================================================================
 * BPA V3 STEALTH BROWSER ENGINE (CLOUDFLARE & FOREBET SHIELD BYPASS)
 * ====================================================================
 * Persistent Session & Cookie Architecture:
 * - Retains warm Chromium profile, LocalStorage, and TLS state across runs
 * - Automatically loads and preserves Cloudflare cf_clearance & session cookies
 * - Ad/tracker interception for maximum speed without breaking Cloudflare challenges
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
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
      if (Array.isArray(parsed)) {
        return parsed.map(c => {
          const clean = {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            httpOnly: Boolean(c.httpOnly),
            secure: Boolean(c.secure)
          };
          if (c.expires && c.expires > 0) clean.expires = c.expires;
          if (c.sameSite && ['Strict', 'Lax', 'None'].includes(c.sameSite)) clean.sameSite = c.sameSite;
          return clean;
        });
      }
    }
  } catch (e) { }
  return [];
}

function saveCachedCookies(cookies) {
  try {
    if (!cookies || !cookies.length) return;
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cookieCacheFile, JSON.stringify(cookies, null, 2), 'utf-8');
  } catch (e) { }
}

async function createBrowser(options = {}) {
  // Varsayılan olarak arka planda %100 görünmez (görev çubuğunda simge çıkarmayan) 'new' headless modu kullanılır
  const headless = options.headless !== undefined ? options.headless : 'new';

  // Use isolated profile per workerId to prevent Chromium Windows SingletonLock conflicts
  let userDataDir = persistentProfileDir;
  if (options.workerId) {
    userDataDir = path.join(dataDir, `worker_profile_${options.workerId}`);
  } else if (options.useTempProfile !== false) {
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
    '--disable-web-security',
    '--lang=en-US,en',
    '--disable-extensions',
    '--disable-notifications'
  ];

  if (headless === false) {
    launchArgs.push('--window-size=1440,900');
  }

  const browser = await puppeteer.launch({
    headless: headless,
    defaultViewport: { width: 1440, height: 900 },
    userDataDir: userDataDir,
    ignoreHTTPSErrors: true,
    executablePath: chromePath,
    args: launchArgs
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
      } catch (e) { }
    }

    // 2. Stealth Evasions & WebGL GPU Spoofing
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, app: {}, csi: () => { }, loadTimes: () => { } };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'tr'] });

      // WebGL Donanım Kimliği Spoofing (NVIDIA GPU Taklidi - Cloudflare turnstile için)
      try {
        const getParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
          if (param === 37445) return 'Google Inc. (NVIDIA)';
          if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParam.apply(this, arguments);
        };
      } catch (e) {}

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // 3. User Agent & Language
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
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

      // Block heavy streaming/font assets
      if (rType === 'media' || rType === 'font' || rType === 'websocket') {
        return req.abort();
      }

      // Block external third-party tracker images only
      if (rType === 'image') {
        if (!u.includes('forebet.com') && !u.includes('cloudflare') && !u.includes('flag') && !u.includes('logo')) {
          return req.abort();
        }
      }

      req.continue();
    });
  } catch (e) { }
}

async function bypassCloudflareIfNeeded(page, logger = () => { }, maxWaitSec = 15) {
  try {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSec * 1000) {
      const title = await page.title().catch(() => '');
      const isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';
      if (!isCf) {
        try {
          const cookies = await page.cookies();
          if (cookies && cookies.length > 0) saveCachedCookies(cookies);
        } catch (_) {}
        return true;
      }

      // Turnstile iframe / checkbox otomatik tıklayıcı
      try {
        const frames = page.frames();
        for (const frame of frames) {
          const checkbox = await frame.$('input[type="checkbox"], .ctp-checkbox-label, #challenge-stage input, #cf-stage input');
          if (checkbox) {
            await checkbox.click().catch(() => {});
            break;
          }
        }
      } catch (_) {}

      await new Promise(r => setTimeout(r, 1500));
    }

    // Hala geçilemediyse 1 kez reload dene ve bekle
    let title = await page.title().catch(() => '');
    if (title.includes('Just a moment') || title.includes('Cloudflare') || title === 'www.forebet.com') {
      logger(`[Ağ] 🔄 Cloudflare Bypass için sayfa yenileniyor...`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        title = await page.title().catch(() => '');
        if (!title.includes('Just a moment') && !title.includes('Cloudflare') && title !== 'www.forebet.com') {
          break;
        }
      }
    }

    try {
      const cookies = await page.cookies();
      if (cookies && cookies.length > 0) saveCachedCookies(cookies);
    } catch (_) {}

    return true;
  } catch (err) {
    return false;
  }
}

async function triggerInteractiveChallenge(url, logger = console.log) {
  logger(`\n🔔 ================================================================`);
  logger(`🔔 [GÜVENLİK KONTROLÜ] Cloudflare otomatik geçilemedi.`);
  logger(`🔔 Ekrana doğrulama penceresi açılıyor... Lütfen 'Ben İnsanım' kutucuğuna tıklayın.`);
  logger(`🔔 ================================================================\n`);

  try {
    process.stdout.write('\x07');
  } catch (_) {}

  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  }

  let helperBrowser = null;
  try {
    helperBrowser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      userDataDir: persistentProfileDir,
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--start-maximized',
        '--lang=en-US,en'
      ]
    });

    const pages = await helperBrowser.pages();
    const helperPage = pages.length > 0 ? pages[0] : await helperBrowser.newPage();
    await helperPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    await helperPage.goto(url || 'https://www.forebet.com/en/football-predictions/predictions-1x2', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(() => {});

    let solved = false;
    for (let s = 1; s <= 60; s++) {
      const title = await helperPage.title().catch(() => '');
      const isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com' || title === '';
      if (!isCf && title.length > 5) {
        solved = true;
        const cookies = await helperPage.cookies();
        saveCachedCookies(cookies);
        logger(`✅ [DOĞRULAMA BAŞARILI] İnsan kontrolü geçildi! Pencere kapatılıyor ve arka plan taraması devam ediyor...`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    await helperBrowser.close().catch(() => {});
    return solved;
  } catch (e) {
    if (helperBrowser) await helperBrowser.close().catch(() => {});
    return false;
  }
}

async function navigateWithRetry(page, url, logger = console.log, maxRetries = 3, timeoutMs = 25000) {
  const delays = [1500, 3000, 5000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger(`[Ağ] (${attempt}/${maxRetries}) Sayfaya bağlanılıyor: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});

      let title = await page.title().catch(() => '');
      let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

      if (isCf) {
        logger(`[Ağ] ⚠️ Cloudflare Challenge tespit edildi, bekleniyor (${attempt}/${maxRetries})...`);
        const passed = await bypassCloudflareIfNeeded(page, logger, 8);
        
        // 2. denemede de geçilemediyse kullanıcıya pencereyi aç ve tıkla
        if (!passed && attempt >= 2) {
          const manualSolved = await triggerInteractiveChallenge(url, logger);
          if (manualSolved) {
            const cachedCookies = loadCachedCookies();
            if (cachedCookies.length > 0) {
              await page.setCookie(...cachedCookies).catch(() => {});
              await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
            }
          }
        }
      }

      // İçerik seçicilerini bekle
      await page.waitForSelector('.schema, .rcnt, #m1x2_table, .predictioncontain, h1.predteamnames, .homeTeam, .stat-last-match, [itemprop="name"], .weather, .rec_stat, .mrows', { timeout: 8000 }).catch(() => null);

      title = await page.title().catch(() => '');
      isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

      const hasContent = await page.evaluate(() => {
        return !!(document.querySelector('.schema, .rcnt, #m1x2_table, .predictioncontain, h1, .stat-last-match, [itemprop="name"], .weather, .rec_stat, .mrows'));
      }).catch(() => false);

      if (hasContent && !isCf) {
        try {
          const cookies = await page.cookies();
          if (cookies && cookies.length > 0) saveCachedCookies(cookies);
        } catch (_) {}
        return true;
      }

      if (attempt < maxRetries) {
        const delayMs = delays[attempt - 1] || 2500;
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err) {
      logger(`[Ağ] ⚠️ Bağlantı denemesi ${attempt} hatası: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delayMs = delays[attempt - 1] || 2500;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function closeBrowser(browser) {
  if (!browser) return;
  const isTemp = browser._isTempProfile;
  const tempDir = browser._userDataDir;

  try {
    await browser.close();
  } catch (e) { }

  // Only delete isolated temporary worker folders, NEVER delete the persistent stealth_profile!
  if (isTemp && tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) { }
  }
}

module.exports = {
  createBrowser,
  initBrowser: createBrowser,
  closeBrowser,
  bypassCloudflareIfNeeded,
  triggerInteractiveChallenge,
  setupPageInterception,
  navigateWithRetry,
  saveCachedCookies,
  loadCachedCookies
};
