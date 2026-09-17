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
const dns = require('dns');

// 🛡️ Node.js v24 / Puppeteer Global CDP & Unhandled Rejection Kalkanı
if (!process._bpaRejectionArmorInstalled) {
  process._bpaRejectionArmorInstalled = true;
  process.on('unhandledRejection', (reason) => {
    const msg = String(reason?.message || reason || '');
    if (
      msg.includes('ProtocolError') ||
      msg.includes('Target closed') ||
      msg.includes('Session closed') ||
      msg.includes('Target.detachFromTarget') ||
      msg.includes('setExtraHTTPHeaders') ||
      msg.includes('Execution context was destroyed')
    ) {
      // Arka plan CDP Turnstile iframe krizini sessizce absorbe et, Node.js sürecini ASLA çökertme
      return;
    }
    console.warn('[BPA Zırhı] Yakalanmamış Rejection izole edildi:', msg);
  });
}

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
    ignoreDefaultArgs: ['--enable-automation'],
    protocolTimeout: 180000,
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

    // 2. User Agent & Language (Gerçek Chromium sürümüyle %100 senkron)
    const rawUa = await page.browser().userAgent().catch(() => '');
    const cleanUa = (rawUa || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36').replace('HeadlessChrome', 'Chrome');
    const m = cleanUa.match(/Chrome\/(\d+)/);
    const majorVer = m ? m[1] : '152';

    await page.setUserAgent(cleanUa);
    // NOT: page.setExtraHTTPHeaders kaldırıldı. Çünkü Puppeteer bunu Cloudflare Turnstile
    // OOPIF (out-of-process iframes) çerçevelerine göndermeye çalışırken ProtocolError timeout fırlatıyordu.
    // Tarayıcı dili zaten Chromium launch args içindeki '--lang=en-US,en' ile native sağlanmaktadır.
  } catch (e) { }
}

async function bypassCloudflareIfNeeded(page, logger = () => { }, maxWaitSec = 15) {
  try {
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitSec * 1000) {
      const title = await page.title().catch(() => '');
      const isCfTitle = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com' || title === '';
      
      const cookies = await page.cookies().catch(() => []);
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');
      const hasTable = await page.evaluate(() => {
        return !!document.querySelector('.schema, .predict-tables, .rcnt, #m1x2_table, .mrows, .homeTeam');
      }).catch(() => false);

      if (!isCfTitle && (hasTable || hasCfClearance)) {
        try {
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
        const hasTable = await page.evaluate(() => !!document.querySelector('.schema, .predict-tables, .rcnt, #m1x2_table')).catch(() => false);
        if (!title.includes('Just a moment') && !title.includes('Cloudflare') && title !== 'www.forebet.com' && hasTable) {
          break;
        }
      }
    }

    try {
      const cookies = await page.cookies().catch(() => []);
      if (cookies && cookies.length > 0) saveCachedCookies(cookies);
    } catch (_) {}

    const finalHasTable = await page.evaluate(() => !!document.querySelector('.schema, .predict-tables, .rcnt, #m1x2_table')).catch(() => false);
    return finalHasTable;
  } catch (err) {
    return false;
  }
}

async function triggerInteractiveChallenge(url, logger = console.log) {
  logger(`\n🔔 ================================================================`);
  logger(`🔔 [GÜVENLİK KONTROLÜ] Cloudflare koruması devrede.`);
  logger(`🔔 Ekrana doğrulama penceresi açıldı. Lütfen 'Ben İnsanım' kutucuğuna tıklayın.`);
  logger(`🔔 (Pencere doğrulama tamamlanana kadar açık kalacaktır)`);
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
  const tempDir = path.join(dataDir, 'manual_auth_' + Date.now());
  try {
    helperBrowser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      userDataDir: tempDir,
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--start-maximized',
        '--window-size=1280,900',
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
    let consecutivePasses = 0;
    for (let s = 1; s <= 120; s++) {
      const title = await helperPage.title().catch(() => '');
      const isCfTitle = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com' || title === '';

      // 1. Çerez kontrolü: SADECE gerçek onay çerezi olan cf_clearance aranır (__cf_bm yetmez!)
      const cookies = await helperPage.cookies().catch(() => []);
      const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

      // 2. Sayfa içerik kontrolü: Gerçek maç tablosu var mı?
      const hasTable = await helperPage.evaluate(() => {
        return !!(document.querySelector('.schema, .predict-tables, .rcnt, #m1x2_table, .mrows, .homeTeam') ||
                 (document.body && document.body.innerText.includes('Predictions 1X2')));
      }).catch(() => false);

      // Cloudflare iframe kontrolü: Turnstile hala sahnede mi?
      const hasChallengeIframe = await helperPage.evaluate(() => {
        return !!(document.querySelector('#challenge-stage, #cf-stage, iframe[src*="cloudflare"], iframe[src*="turnstile"]'));
      }).catch(() => false);

      // Gerçek Başarı Kriteri:
      // (a) cf_clearance varsa VE içerik tablosu geldiyse VE başlık temizse
      // VEYA
      // (b) challenge iframe'i yoksa, tablo geldiyse ve en az 2 kontrol boyunca bu durum korunduysa
      const isTrulyValid = (hasCfClearance || !hasChallengeIframe) && hasTable && !isCfTitle && title.length > 5;

      if (isTrulyValid) {
        consecutivePasses++;
        if (consecutivePasses >= 2) {
          solved = true;
          await new Promise(r => setTimeout(r, 1500));
          const finalCookies = await helperPage.cookies().catch(() => []);
          saveCachedCookies(finalCookies);
          logger(`✅ [DOĞRULAMA BAŞARILI] İnsan kontrolü geçildi! (${finalCookies.length} çerez kaydedildi, cf_clearance: ${hasCfClearance ? 'VAR' : 'GEREKMEDİ'}) Pencere kapatılıyor ve arka plan taraması devam ediyor...`);
          break;
        }
      } else {
        consecutivePasses = 0;
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

// 🌐 İnternet Bağlantı Kontrolü ve Bekleme Mekanizması
function checkInternetConnectivity() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      if (!err) return resolve(true);
      dns.lookup('cloudflare.com', (err2) => {
        resolve(!err2);
      });
    });
  });
}

let isGlobalOfflineWaiting = false;

async function waitForInternetConnection(logger = console.log) {
  const isOnline = await checkInternetConnectivity();
  if (isOnline) return true;

  logger(`[Ağ] 🚨 İnternet bağlantısı kesildi! Bağlantının geri gelmesi bekleniyor (her 3 saniyede bir kontrol ediliyor)...`);
  isGlobalOfflineWaiting = true;

  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const backOnline = await checkInternetConnectivity();
    if (backOnline) {
      logger(`[Ağ] 🟢 İnternet bağlantısı tekrar kuruldu! İşleme kaldığı yerden devam ediliyor...`);
      await new Promise(r => setTimeout(r, 1500));
      isGlobalOfflineWaiting = false;
      return true;
    }
  }
}

function isNetworkOutageError(errMsg) {
  const m = String(errMsg || '').toLowerCase();
  return (
    m.includes('net::err_internet_disconnected') ||
    m.includes('net::err_name_not_resolved') ||
    m.includes('net::err_network_changed') ||
    m.includes('net::err_connection_reset') ||
    m.includes('net::err_address_unreachable') ||
    m.includes('net::err_connection_closed') ||
    m.includes('net::err_connection_timed_out') ||
    m.includes('econnreset') ||
    m.includes('enotfound')
  );
}

async function navigateWithRetry(page, url, logger = console.log, maxRetries = 3, timeoutMs = 35000) {
  const delays = [2000, 3500, 5000];
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Eğer başka bir sekme şu an internetin geri gelmesini bekliyorsa önce bekle
      if (isGlobalOfflineWaiting) {
        await waitForInternetConnection(logger);
      }

      logger(`[Ağ] (${attempt}/${maxRetries}) Sayfaya bağlanılıyor: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      } catch (gotoErr) {
        if (isNetworkOutageError(gotoErr.message)) {
          await waitForInternetConnection(logger);
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        await new Promise(r => setTimeout(r, 2000));
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        } catch (gotoErr2) {
          if (isNetworkOutageError(gotoErr2.message)) {
            await waitForInternetConnection(logger);
            attempt = Math.max(0, attempt - 1);
            continue;
          }
        }
      }

      let title = await page.title().catch(() => '');
      let curUrl = page.url();
      let isNetError = curUrl.startsWith('chrome-error:') || title === 'www.forebet.com';
      let isCf = !isNetError && (title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || curUrl.includes('cloudflare'));

      if (isNetError) {
        // chrome-error genelde internet kopmasında da çıkar
        const hasNet = await checkInternetConnectivity();
        if (!hasNet) {
          await waitForInternetConnection(logger);
          attempt = Math.max(0, attempt - 1);
          continue;
        }

        logger(`[Ağ] 🔄 Bağlantı tazeleniyor (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 2500));
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
        title = await page.title().catch(() => '');
        curUrl = page.url();
        isNetError = curUrl.startsWith('chrome-error:') || title === 'www.forebet.com';
        isCf = !isNetError && (title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare'));
      }

      if (isCf) {
        logger(`[Ağ] ⚠️ Cloudflare Challenge tespit edildi, bekleniyor (${attempt}/${maxRetries})...`);
        const passed = await bypassCloudflareIfNeeded(page, logger, 10);
        
        // 2. denemede de geçilemediyse kullanıcıya pencereyi aç ve tıkla
        if (!passed && attempt >= 2) {
          const manualSolved = await triggerInteractiveChallenge(url, logger);
          if (manualSolved) {
            const cachedCookies = loadCachedCookies();
            if (cachedCookies.length > 0) {
              try { await page.setCookie(...cachedCookies); } catch (_) {}
            }
            await new Promise(r => setTimeout(r, 1500));
            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
            } catch (retryErr) {
              await new Promise(r => setTimeout(r, 2000));
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
            }
            await page.waitForSelector('.schema, .rcnt, #m1x2_table, .predict-tables, .predictioncontain, h1.predteamnames, .homeTeam, .stat-last-match, [itemprop="name"]', { timeout: 20000 }).catch(() => null);
            const titleAfterSolve = await page.title().catch(() => '');
            const isCfAfterSolve = titleAfterSolve.includes('Just a moment') || titleAfterSolve.includes('Attention Required') || titleAfterSolve.includes('Cloudflare');
            const hasAfterSolve = !isCfAfterSolve && await page.evaluate(() => {
              return !!(document.querySelector('.schema, .rcnt, #m1x2_table, .predict-tables, .predictioncontain, h1.predteamnames, .homeTeam, .stat-last-match, [itemprop="name"]'));
            }).catch(() => false);
            if (hasAfterSolve) {
              return true;
            }
          }
        }
      }

      // İçerik seçicilerini bekle (Forebet yavaş yanıt verebilir, 20s bekle)
      await page.waitForSelector('.schema, .rcnt, #m1x2_table, .predict-tables, .predictioncontain, h1.predteamnames, .homeTeam, .stat-last-match, [itemprop="name"], .weather, .rec_stat, .mrows', { timeout: 20000 }).catch(() => null);

      title = await page.title().catch(() => '');
      curUrl = page.url();
      isCf = !curUrl.startsWith('chrome-error:') && (title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare'));

      const hasContent = !isCf && await page.evaluate(() => {
        return !!(document.querySelector('.schema, .rcnt, #m1x2_table, .predict-tables, .predictioncontain, h1.predteamnames, .homeTeam, .stat-last-match, [itemprop="name"], .weather, .rec_stat, .mrows'));
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
      if (isNetworkOutageError(err.message)) {
        await waitForInternetConnection(logger);
        attempt = Math.max(0, attempt - 1);
        continue;
      }
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
  loadCachedCookies,
  checkInternetConnectivity,
  waitForInternetConnection,
  isNetworkOutageError
};
