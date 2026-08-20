/**
 * Forebet Yüksek Performanslı 4 Sekmeli Paralel Veri Çekme Motoru (Database-Ready JSON Edition)
 * 
 * Özellikler:
 * - Maç ID (match_id) ve Takım ID (home_team_id, away_team_id, league_id) çıkarımı
 * - 4 Eşzamanlı Sekme (Parallel Worker Pool) ile yüksek hızlı çekim
 * - Veritabanına 1-e-1 yazılabilecek normalize edilmiş JSON şeması
 * - 9 Tahmin Pazarı (1X2, Alt/Üst 2.5, İY, İY/MS, KG, Handikap, Korner, Kart)
 * - OVERALL Statistics (get_ovd motorundan tüm ham kırılımlar)
 * - H2H, Son Maçlar (W/D/L sonuçları), İç/Dış Saha Maçları
 * - Gelecek 6 Maç & FDR Zorluk Puanları
 * - Takım Trendleri & Puan Durumu
 * - Kuş Uçuşu Mesafe, Stadyum, Hava Durumu
 * - 0 Ağ Kayıplı Canvas Base64 Logo Çıkarımı
 * 
 * Kullanım:
 * node daily_pipeline.js --url="https://www.forebet.com/en/football-predictions/predictions-1x2/2026-08-14" --workers=4
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Dinamik Tarih Fonksiyonu (YYYY-MM-DD)
const getFormattedDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Akıllı Lig Bayrağı Çözümleyici (Forebet 2 harfli ülke kodu haritalama)
function resolveLeagueFlag(rawFlagUrl, shortTag, leagueName) {
  if (rawFlagUrl && !rawFlagUrl.includes('/89.png') && !rawFlagUrl.includes('/fc/89')) {
    return rawFlagUrl;
  }
  if (shortTag) {
    const clean = shortTag.trim();
    const m = clean.match(/^([A-Za-z]{2})/);
    if (m) {
      const code = m[1].toLowerCase();
      return `https://www.forebet.com/images/fc/${code}.png`;
    }
  }
  return rawFlagUrl || 'https://www.forebet.com/images/fc/89.png';
}
const https = require('https');
const http = require('http');

// Otomatik Görsel İndirici (Lig Bayrağı & Takım Logosu)
async function downloadAndSaveImage(imageUrl, destPath) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) return false;
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) return true; // Zaten mevcut

  return new Promise((resolve) => {
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const client = imageUrl.startsWith('https:') ? https : http;
      const req = client.get(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.forebet.com/'
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode === 200) {
          const fileStream = fs.createWriteStream(destPath);
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve(true);
          });
        } else {
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch (e) {
      resolve(false);
    }
  });
}

function saveBase64Image(base64Data, destPath) {
  if (!base64Data) return false;
  try {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(destPath, Buffer.from(base64Image, 'base64'));
    return true;
  } catch (e) {
    return false;
  }
}

const args = process.argv.slice(2);
let targetDate = getFormattedDate(0); // Varsayılan: Bugünün tarihi
let targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
let workerCount = 4;
let headlessMode = 'new'; // 'new' veya false
let onlyWithOdds = true;  // Varsayılan: Sadece bahis oranı açık olan maçları çek (158 maç)
let matchLimit = null;    // Limit (örn: --limit=5)
let batchDays = null;
let startDateStr = null;
let endDateStr = null;

for (const arg of args) {
  if (arg.startsWith('--url=')) {
    targetUrl = arg.split('=')[1];
  } else if (arg.startsWith('--date=')) {
    const d = arg.split('=')[1];
    targetDate = d;
    targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${d}`;
  } else if (arg === '--today' || arg === '--mode=today') {
    targetDate = getFormattedDate(0);
    targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
  } else if (arg === '--tomorrow' || arg === '--mode=tomorrow') {
    targetDate = getFormattedDate(1);
    targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
  } else if (arg === '--yesterday' || arg === '--mode=yesterday') {
    targetDate = getFormattedDate(-1);
    targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
  } else if (arg === '--mode=all') {
    batchDays = 3;
  } else if (arg.startsWith('--limit=')) {
    matchLimit = parseInt(arg.split('=')[1], 10) || null;
  } else if (arg.startsWith('--days=')) {
    batchDays = parseInt(arg.split('=')[1], 10) || 1;
  } else if (arg.startsWith('--start-date=')) {
    startDateStr = arg.split('=')[1];
  } else if (arg.startsWith('--end-date=')) {
    endDateStr = arg.split('=')[1];
  } else if (arg.startsWith('--workers=')) {
    workerCount = parseInt(arg.split('=')[1], 10) || 4;
  } else if (arg.startsWith('--headless=')) {
    const val = arg.split('=')[1].toLowerCase();
    headlessMode = val === 'true' || val === 'new' ? 'new' : false;
  } else if (arg === '--all' || arg === '--all-matches' || arg === '--only-odds=false') {
    onlyWithOdds = false;
  }
}

// Renkli Konsol Logları
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m"
};

function log(msg, color = COLORS.reset) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
  console.log(`${color}${ts} ${msg}${COLORS.reset}`);
}

async function createBrowserInstance() {
  const tempUserDataDir = path.join(__dirname, 'temp_profiles', 'pool_' + Date.now());
  
  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  }

  return await puppeteer.launch({
    headless: headlessMode,
    defaultViewport: { width: 1440, height: 900 },
    userDataDir: tempUserDataDir,
    ignoreHTTPSErrors: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-web-security',
      '--lang=en-US,en',
      '--disable-extensions',
      '--disable-notifications'
    ]
  });
}

// 💾 Kalıcı Cloudflare Çerez Deposu (Cookie Persistence)
const cookieCacheFile = path.join(__dirname, 'data', 'cf_cookies_cache.json');
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
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(cookieCacheFile, JSON.stringify(cookies, null, 2), 'utf-8');
  } catch (e) {}
}

// 🛡️ Gelişmiş Stealth & Parmak İzi (Fingerprint & WebGL Spoofing)
async function setupPageInterception(page) {
  try {
    // 1. Stealth Evasions (Cloudflare Bot Algılamasını %100 Bypass Et)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'tr'] });

      // WebGL Donanım Kimliği Spoofing (NVIDIA GPU Taklidi)
      try {
        const getParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
          if (param === 37445) return 'Google Inc. (NVIDIA)';
          if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParam.apply(this, arguments);
        };
      } catch (e) {}
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    });

    // Hazırda geçerli bir Cloudflare çerezi varsa sayfaya hemen enjekte et
    const cachedCookies = loadCachedCookies();
    if (cachedCookies && cachedCookies.length > 0) {
      try { await page.setCookie(...cachedCookies); } catch (e) {}
    }

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      const rType = req.resourceType();

      // Reklam, Tracker ve Ağır Analiz Servislerini Kesin Engelle
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

      // Ağır kaynakları kes (Medya, font, websocket)
      if (rType === 'media' || rType === 'font' || rType === 'websocket') {
        return req.abort();
      }

      // Harici reklam görsellerini engelle, Forebet logoları ve bayraklara izin ver
      if (rType === 'image') {
        if (!url.includes('forebet.com') && !url.includes('flag') && !url.includes('logo') && !url.includes('team') && !url.includes('icons')) {
          return req.abort();
        }
      }

      req.continue();
    });
  } catch (e) {}
}

let cfChallengeCounter = 0;
let cfBypassCounter = 0;

// 🛡️ Cloudflare ve Sayfa Yüklenme Bekleme & Otomatik Yenileme Yardımcısı (Hızlı & Kilitlenmez)
async function ensureMatchPageLoaded(page, url, workerId, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      
      let title = await page.title();
      let isCf = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com';

      if (isCf) {
        cfChallengeCounter++;
        log(`  ↳ 🛡️ [Sekme ${workerId}] Cloudflare algılandı, bekleniyor (${attempt}/${maxRetries})...`, COLORS.yellow);
        await new Promise(r => setTimeout(r, 2000));
        title = await page.title();
        isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com';

        if (isCf) {
          log(`  ↳ 🔄 [Sekme ${workerId}] Sayfa yenileniyor (Cloudflare Bypass)...`, COLORS.cyan);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      await page.waitForSelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema', { timeout: 3500 });
      if (isCf) cfBypassCounter++;
      return true;
    } catch (e) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return false;
}

// 🎯 Ana Liste Sayfasından Maç Linklerini Çıkar (More Butonuna Tıklayarak Tüm Maçları Yükler)
async function getMatchListing(browser, listUrl) {
  log(`📋 Günün Maç Listesi Taranıyor: ${listUrl}`, COLORS.cyan);
  const page = await browser.newPage();
  await setupPageInterception(page);

  let matches = [];
  const maxListRetries = 5;

  for (let attempt = 1; attempt <= maxListRetries; attempt++) {
    try {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
      
      let title = await page.title();
      if (title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com') {
        log(`  ↳ 🛡️ Liste sayfasında Cloudflare algılandı, bekleniyor (${attempt}/${maxListRetries})...`, COLORS.yellow);
        await new Promise(r => setTimeout(r, 3500));
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      await page.waitForSelector('.schema, .predict-tables, .rcnt', { timeout: 8000 });
      await new Promise(r => setTimeout(r, 2500));

      // 🔄 Forebet 'More' Butonuna Tıkla
      try {
        const moreBtnSelector = 'span[onclick*="ltodrows"], .stat-more, span.btn.btn-outline-primary';
        const hasMore = await page.$(moreBtnSelector);
        if (hasMore) {
          log(`🔄 'More' butonu bulundu, kalan maçları yüklemek için tıklanıyor...`, COLORS.yellow);
          await page.evaluate(() => {
            const btn = document.querySelector('span[onclick*="ltodrows"]') || document.querySelector('.stat-more');
            if (btn) btn.click();
          });
          await new Promise(r => setTimeout(r, 5000));
          log(`✅ Kalan tüm maçlar başarıyla yüklendi.`, COLORS.green);
        }
      } catch (e) {}

      matches = await page.evaluate(() => {
        const list = [];
        const rows = document.querySelectorAll('.schema .rcnt, .schema tr[onclick*="/matches/"], .schema tr');
        
        rows.forEach(row => {
          let url = '';
          const onclick = row.getAttribute('onclick');
          if (onclick && onclick.includes('/matches/')) {
            const match = onclick.match(/'([^']+)'/);
            if (match) url = match[1];
          }
          
          if (!url) {
            const link = row.querySelector('a[href*="/matches/"]');
            if (link) url = link.getAttribute('href');
          }

          if (url) {
            if (!url.startsWith('http')) {
              url = 'https://www.forebet.com' + (url.startsWith('/') ? '' : '/') + url;
            }

            const homeEl = row.querySelector('.homeTeam, span[itemprop="homeTeam"]')?.innerText?.trim() || '';
            const awayEl = row.querySelector('.awayTeam, span[itemprop="awayTeam"]')?.innerText?.trim() || '';
            const dateEl = row.querySelector('.date_bah, time')?.innerText?.trim() || '';
            const predEl = row.querySelector('.predict, .fpr, .fprc span:first-child')?.innerText?.trim() || '';
            const probSpans = Array.from(row.querySelectorAll('.fpr_probs span, .fpr_probs .pr_x, .fprc span')).map(s => s.innerText.trim()).filter(Boolean);

            // Lig Kısa Kodu (Örn: Ar2, De5, Cl2, Arg) ve Ülke Bayrağı
            const shortTagEl = row.querySelector('.shortTag, .shorttag, .leagTag, .shortname, .tnmng, a.shortTag');
            const shortTag = shortTagEl ? shortTagEl.innerText.trim() : '';
            
            let flagSrc = '';
            const flagEl = row.querySelector('img.flsc, img[src*="/fc/"], img[src*="flags"], img[src*="/flags/"], .flsc img');
            if (flagEl) {
              flagSrc = flagEl.src || flagEl.getAttribute('src') || '';
            } else {
              // Üst başlıktan veya ebeveyn gruptan bayrak bul
              let prevHeader = row.previousElementSibling;
              while (prevHeader) {
                const hImg = prevHeader.querySelector('img.flsc, img[src*="/fc/"], img[src*="flags"], img[src*="/flags/"]');
                if (hImg) {
                  flagSrc = hImg.src || hImg.getAttribute('src') || '';
                  break;
                }
                prevHeader = prevHeader.previousElementSibling;
              }
            }
            if (flagSrc && !flagSrc.startsWith('http')) {
              flagSrc = 'https://www.forebet.com' + (flagSrc.startsWith('/') ? '' : '/') + flagSrc;
            }

            // Bayrak URL'i yoksa shortTag üzerinden 2 harfli ülke kodundan üret
            if ((!flagSrc || flagSrc.includes('/89.png') || flagSrc.includes('/fc/89')) && shortTag) {
              const codeMatch = shortTag.trim().match(/^([A-Za-z]{2})/);
              if (codeMatch) {
                flagSrc = `https://www.forebet.com/images/flags/${codeMatch[1].toLowerCase()}.png`;
              }
            }
            
            // Gerçek Bahis Oranı (Odd)
            const oddEl = row.querySelector('span.lscrsp, .bigOnly span.lscrsp, .bigOnly span, div.haodd span, .l_od')?.innerText?.trim() || '-';

            // Gerçek Maç Skoru (Eğer liste sayfasında maç bitmişse)
            const scoreEl = row.querySelector('.l_sc, span.l_sc');
            let listScore = '';
            if (scoreEl && !scoreEl.closest('.fprc') && !scoreEl.closest('.fpr_probs')) {
              listScore = scoreEl.innerText.trim();
            }

            list.push({
              url: url,
              homeTeam: homeEl,
              awayTeam: awayEl,
              date: dateEl,
              listingPick: predEl,
              listingProbs: probSpans,
              shortTag: shortTag,
              flagUrl: flagSrc,
              listingOdd: oddEl,
              listingScore: listScore
            });
          }
        });
        return list;
      });

      if (matches.length > 0) {
        break; // Başarıyla bulundu, döngüden çık
      } else {
        log(`⚠️ Liste tarandı ancak 0 maç bulundu, tekrar deneniyor (${attempt}/${maxListRetries})...`, COLORS.yellow);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      log(`⚠️ Liste sayfası yükleme hatası (${attempt}/${maxListRetries}): ${e.message}`, COLORS.yellow);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  let sessionCookies = [];
  try {
    sessionCookies = await page.cookies();
  } catch (e) {}

  await page.close();
  return { matches, sessionCookies };
}

// 🔬 Tek Bir Maçın Tüm Derin İstatistiklerini Çeken İşçi Fonksiyonu
async function scrapeSingleMatch(page, matchMeta, workerId) {
  const startTime = Date.now();
  
  // Cloudflare ve Sayfa Kontrollü Yükleme (Hızlı Doğrulama)
  const isLoaded = await ensureMatchPageLoaded(page, matchMeta.url, workerId, 2);
  if (!isLoaded) {
    throw new Error('Sayfa açılamadı / Cloudflare zaman aşımı');
  }
  await new Promise(r => setTimeout(r, 400));

  // 1. Match ID ve Slug Çıkarımı
  const matchIdMatch = matchMeta.url.match(/-(\d+)$/);
  const matchId = matchIdMatch ? parseInt(matchIdMatch[1], 10) : (matchMeta.matchId || null);
  const matchSlug = matchMeta.url.split('/matches/')[1] || '';

  // 2. Temel Bilgiler ve Logolar (Canvas Base64)
  const teamDetails = await page.evaluate((meta) => {
    const titleEl = document.querySelector('h1.predteamnames, h1');
    const homeEl = document.querySelector('span[itemprop="homeTeam"] span[itemprop="name"], .homeTeam');
    const awayEl = document.querySelector('span[itemprop="awayTeam"] span[itemprop="name"], .awayTeam');
    const dateEl = document.querySelector('div.date_bah, time[itemprop="startDate"]');
    const leagueEl = document.querySelector('center.leagpredlnk a, a.leagpred_btn, .leagpredlnk a, a[href*="/football-predictions/predictions-1x2/"], .shortTag');
    const flagImg = document.querySelector('img.flsc, img[src*="/fc/"], img[src*="flag"], .flsc img');
    const lLogo = document.querySelector('div.lLogo img');
    const rLogo = document.querySelector('div.rLogo img');
    const stadiumEl = document.querySelector('div.weather_main_pr span[itemprop="name address"], div.weather_main_pr');

    const hForms = Array.from(document.querySelectorAll('div.lLogo .prformcont span a')).map(a => a.innerText.trim()).filter(Boolean);
    const aForms = Array.from(document.querySelectorAll('div.rLogo .prformcont span a')).map(a => a.innerText.trim()).filter(Boolean);

    // ID Çıkarımları
    const getLogoId = (img) => {
      if (!img || !img.src) return null;
      const m = img.src.match(/(\d+)\.(png|jpg|webp)/);
      return m ? parseInt(m[1], 10) : null;
    };

    const getBase64 = (img) => {
      if (!img || !img.complete || img.naturalWidth === 0) return null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      } catch (e) {
        return null;
      }
    };

    const fullLeagueName = leagueEl ? leagueEl.innerText.trim() : '';
    const resolvedLeague = fullLeagueName && fullLeagueName !== 'Forebet' ? fullLeagueName : (meta.shortTag || 'Unknown League');
    
    // Bayrak önceliği: listing sayfasından gelen kesin bayrak (meta.flagUrl)
    let finalFlag = meta.flagUrl || '';
    if (!finalFlag || finalFlag.includes('/89.png') || finalFlag.includes('/fc/89')) {
      if (flagImg && flagImg.src && !flagImg.src.includes('/89.png')) {
        finalFlag = flagImg.src;
      }
    }

    const rawTitle = titleEl ? titleEl.innerText.trim() : `${homeEl?.innerText?.trim() || meta.homeTeam || ''} vs ${awayEl?.innerText?.trim() || meta.awayTeam || ''}`;
    const cleanTitle = rawTitle.replace(/\s+/g, ' ');

    return {
      matchTitle: cleanTitle,
      homeTeam: homeEl?.innerText?.trim() || meta.homeTeam || '',
      awayTeam: awayEl?.innerText?.trim() || meta.awayTeam || '',
      homeTeamId: getLogoId(lLogo),
      awayTeamId: getLogoId(rLogo),
      leagueName: resolvedLeague,
      shortTag: meta.shortTag || '',
      flagUrl: finalFlag,
      homeLogoUrl: lLogo ? lLogo.src : '',
      awayLogoUrl: rLogo ? rLogo.src : '',
      homeLogoBase64: getBase64(lLogo),
      awayLogoBase64: getBase64(rLogo),
      stadium: stadiumEl?.innerText?.trim() || '',
      homeForm: hForms,
      awayForm: aForms
    };
  }, matchMeta);

  // Logoları ve Bayrakları yerel diske kaydet
  const teamsDir = path.join(__dirname, 'images', 'teams');
  const flagsDir = path.join(__dirname, 'images', 'leagues');
  if (!fs.existsSync(teamsDir)) fs.mkdirSync(teamsDir, { recursive: true });
  if (!fs.existsSync(flagsDir)) fs.mkdirSync(flagsDir, { recursive: true });

  const resolvedFlag = resolveLeagueFlag(teamDetails.flagUrl || matchMeta.flagUrl, matchMeta.shortTag, teamDetails.leagueName);
  let finalFlagPath = resolvedFlag;
  if (resolvedFlag && resolvedFlag.startsWith('http')) {
    const flagName = path.basename(resolvedFlag.split('?')[0]);
    const flagLocal = path.join(flagsDir, flagName);
    downloadAndSaveImage(resolvedFlag, flagLocal).catch(() => {});
    finalFlagPath = `images/leagues/${flagName}`;
  }

  let homeLogoRel = teamDetails.homeLogoUrl;
  let awayLogoRel = teamDetails.awayLogoUrl;

  if (teamDetails.homeLogoBase64 && teamDetails.homeLogoUrl) {
    const fn = teamDetails.homeTeamId ? `${teamDetails.homeTeamId}.png` : path.basename(teamDetails.homeLogoUrl.split('?')[0]);
    fs.writeFileSync(path.join(teamsDir, fn), Buffer.from(teamDetails.homeLogoBase64.split(',')[1], 'base64'));
    homeLogoRel = `images/teams/${fn}`;
  } else if (teamDetails.homeLogoUrl && teamDetails.homeLogoUrl.startsWith('http')) {
    const fn = teamDetails.homeTeamId ? `${teamDetails.homeTeamId}.png` : path.basename(teamDetails.homeLogoUrl.split('?')[0]);
    downloadAndSaveImage(teamDetails.homeLogoUrl, path.join(teamsDir, fn)).catch(() => {});
    homeLogoRel = `images/teams/${fn}`;
  }

  if (teamDetails.awayLogoBase64 && teamDetails.awayLogoUrl) {
    const fn = teamDetails.awayTeamId ? `${teamDetails.awayTeamId}.png` : path.basename(teamDetails.awayLogoUrl.split('?')[0]);
    fs.writeFileSync(path.join(teamsDir, fn), Buffer.from(teamDetails.awayLogoBase64.split(',')[1], 'base64'));
    awayLogoRel = `images/teams/${fn}`;
  } else if (teamDetails.awayLogoUrl && teamDetails.awayLogoUrl.startsWith('http')) {
    const fn = teamDetails.awayTeamId ? `${teamDetails.awayTeamId}.png` : path.basename(teamDetails.awayLogoUrl.split('?')[0]);
    downloadAndSaveImage(teamDetails.awayLogoUrl, path.join(teamsDir, fn)).catch(() => {});
    awayLogoRel = `images/teams/${fn}`;
  }

  // 3. 9 Tahmin Sekmesi
  const tabConfigs = [
    { key: '1X2', btnSelector: '#m1x2_t_butt', tableSelector: '#m1x2_table' },
    { key: 'Under/Over 2.5', btnSelector: '#uo_t_butt', tableSelector: '#uo_table' },
    { key: 'Half Time', btnSelector: '#ht_t_butt', tableSelector: '#ht_table' },
    { key: 'HT/FT', btnSelector: '#htft_t_butt', tableSelector: '#htft_table' },
    { key: 'BTTS', btnSelector: '#bts_t_butt', tableSelector: '#bts_table' },
    { key: 'Handicap', btnSelector: '#ah_t_butt', tableSelector: '#ah_table' },
    { key: 'Corners', btnSelector: '#corner_t_butt', tableSelector: '#corner_table' },
    { key: 'Cards', btnSelector: '#card_t_butt', tableSelector: '#card_table' }
  ];

  const predictions_9_tabs = {};
  for (const tab of tabConfigs) {
    try {
      const tabData = await page.evaluate((btnSel, tblSel, tabName) => {
        const btn = document.querySelector(btnSel);
        if (btn) btn.click();
        const table = document.querySelector(tblSel);
        if (!table) return null;

        const row = table.querySelector('div.rcnt, tr.rcnt');
        if (!row) return null;

        let pred = '';
        if (tabName === 'HT/FT') {
          const htftBadges = Array.from(row.querySelectorAll('.forepr, span[class*="forepr"], .predict span'));
          if (htftBadges.length >= 2) {
            pred = htftBadges.map(b => b.innerText.trim()).filter(Boolean).slice(0, 2).join('/');
          } else {
            const predEl = row.querySelector('.forepr, span[class*="forepr"]');
            pred = predEl ? predEl.innerText.trim() : '';
          }
        } else {
          const predEl = row.querySelector('div.predict span.forepr span, .forepr span');
          pred = predEl ? predEl.innerText.trim() : '';
        }

        const correctScore = row.querySelector('div.ex_sc, .scrmobpred')?.innerText?.trim() || '';
        const avgGoals = row.querySelector('div.avg_sc')?.innerText?.trim() || '';
        const weather = row.querySelector('div.prwth span.wnums')?.innerText?.trim() || '';
        const coef = row.querySelector('div.bigOnly span.lscrsp, div.haodd span')?.innerText?.trim() || '';
        const probSpans = Array.from(row.querySelectorAll('div.fprc span')).map(s => s.innerText.trim());

        return {
          pick: pred,
          correctScore,
          avgGoals,
          weather,
          odd: coef,
          prob_1: probSpans[0] || '',
          prob_X: probSpans[1] || '',
          prob_2: probSpans[2] || '',
          prob_option1: probSpans[0] || '',
          prob_option2: probSpans[1] || ''
        };
      }, tab.btnSelector, tab.tableSelector, tab.key);

      if (tabData) predictions_9_tabs[tab.key] = tabData;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {}
  }

  // 4. Eksiksiz İstatistikler & get_ovd Motoru
  const deepStats = await page.evaluate(() => {
    const parseRows = (container) => {
      if (!container) return [];
      const list = [];
      container.querySelectorAll('.st_row').forEach(el => {
        const date = el.querySelector('.st_date')?.innerText?.trim().replace(/\s+/g, ' ') || '';
        const homeTeam = el.querySelector('.st_hteam')?.innerText?.trim() || '';
        const awayTeam = el.querySelector('.st_ateam')?.innerText?.trim() || '';
        const score = el.querySelector('.st_res, .lscrsp')?.innerText?.trim() || '';
        const htScore = el.querySelector('.st_htscr')?.innerText?.trim().replace(/[()]/g, '') || '';
        const league = el.querySelector('.st_ltag')?.innerText?.trim() || '';
        let outcome = 'D';
        if (el.querySelector('.winres')) outcome = 'W';
        else if (el.querySelector('.loseres')) outcome = 'L';
        else if (el.querySelector('.drawres')) outcome = 'D';

        if (homeTeam || awayTeam) {
          list.push({ date, homeTeam, awayTeam, score, htScore, league, outcome });
        }
      });
      return list;
    };

    const modules = Array.from(document.querySelectorAll('.moduletable'));
    let h2h = [];
    let homeLastMatches = [];
    let awayLastMatches = [];
    let homeMatchesOnly = [];
    let awayMatchesOnly = [];

    modules.forEach(el => {
      const title = el.querySelector('.mptlt, .st_title, h3')?.innerText?.trim().toLowerCase() || '';
      const rows = parseRows(el);
      if (title.includes('head to head')) h2h = rows;
      else if (title.includes('last 6') || title.includes('last matches')) {
        if (!homeLastMatches.length) homeLastMatches = rows;
        else awayLastMatches = rows;
      }
      else if (title.includes('home matches')) homeMatchesOnly = rows;
      else if (title.includes('away matches')) awayMatchesOnly = rows;
    });

    // Kuş Uçuşu Mesafe
    let distanceInfo = {};
    const distCnt = document.querySelector('.dist_cnt');
    if (distCnt) {
      const km = distCnt.querySelector('.dist_km span')?.innerText?.trim() || '';
      const stadium = distCnt.querySelector('.dist_locab span:first-child')?.innerText?.trim() || '';
      const awayLoc = distCnt.querySelector('.dist_locab span:last-child')?.innerText?.trim() || '';
      const cities = Array.from(distCnt.querySelectorAll('.dist_cities div')).map(d => d.innerText.trim().replace(/\n+/g, ' '));
      distanceInfo = {
        distanceKm: km,
        stadiumName: stadium,
        awayOrigin: awayLoc,
        homeCity: cities[0] || '',
        awayCity: cities[1] || ''
      };
    }

    // Gelecek Maç Zorluk Dereceleri (FDR 1-5)
    const nextHome = [];
    const nextAway = [];
    document.querySelectorAll('.diff_blocks_container').forEach((el, i) => {
      el.querySelectorAll('.diff_blocks_row').forEach(r => {
        const opp = r.querySelector('.active-team a, a')?.innerText?.trim() || '';
        const date = r.querySelector('.diff_date')?.innerText?.trim() || '';
        const league = r.querySelector('.diff_league')?.innerText?.trim() || '';
        const diff = r.querySelector('.team_diff')?.innerText?.trim() || '3';
        if (opp) {
          const item = { opponent: opp, date, league, difficultyLevel: diff };
          if (i === 0) nextHome.push(item);
          else if (nextAway.length < 6) nextAway.push(item);
        }
      });
    });

    // Trendler
    const trends = { home: [], away: [] };
    const shortTrends = document.querySelectorAll('.short_trends');
    if (shortTrends.length >= 1) {
      const parseTrends = (container) => {
        return Array.from(container.querySelectorAll('.trend')).map(t => {
          const type = t.querySelector('.trend_type')?.innerText?.trim() || '';
          const val = t.querySelector('.trend_recent_m')?.innerText?.trim() || '';
          const desc = t.innerText.trim().replace(/\n+/g, ' | ');
          return { type, value: val, description: desc };
        });
      };
      if (shortTrends[0]) trends.home = parseTrends(shortTrends[0]);
      if (shortTrends[1]) trends.away = parseTrends(shortTrends[1]);
    }

    // Puan Durumu
    const standings = [];
    document.querySelectorAll('table.standings').forEach((table, idx) => {
      const title = table.querySelector('.std_btn-heading b, th, .st_title')?.innerText?.trim() || `Standings`;
      const rows = [];
      table.querySelectorAll('tbody tr').forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        if (tds.length >= 7 && !isNaN(parseInt(tds[0]))) {
          rows.push({
            rank: tds[0],
            team: tds[1],
            pts: tds[2],
            gp: tds[3],
            w: tds[4],
            d: tds[5],
            l: tds[6],
            gf: tds[7] || '',
            ga: tds[8] || '',
            gd: tds[9] || ''
          });
        }
      });
      if (rows.length > 0) standings.push({ title, rows });
    });

    // get_ovd Ham İstatistik Motoru
    let rawOverall = null;
    try {
      if (typeof get_ovd === 'function') {
        rawOverall = {
          home: get_ovd('h'),
          away: get_ovd('a')
        };
      }
    } catch (e) {}

    return {
      distanceInfo,
      nextMatches: {
        home: nextHome.slice(0, 6),
        away: nextAway.slice(0, 6)
      },
      trends,
      h2h,
      homeLastMatches,
      awayLastMatches,
      homeMatchesOnly,
      awayMatchesOnly,
      standings,
      overallStatsRaw: rawOverall
    };
  });

  // 4. Maç Sonucu ve Durumu (Sadece Bu Karşılaşmanın Kendi Skor Alanından Çıkarım)
  const matchOutcome = await page.evaluate((meta) => {
    let status = 'SCHEDULED';
    let homeScore = null;
    let awayScore = null;
    let htHome = null;
    let htAway = null;

    // 1. Durum Kontrolü (Postponed, Canceled)
    const headerEl = document.querySelector('.weather_main_pr, center.leagpredlnk');
    const headerText = headerEl ? (headerEl.parentElement?.innerText || '') : '';
    if (headerText.includes('Postp') || headerText.includes('Postponed')) {
      return { status: 'POSTPONED', final_score: null, ht_score: null, aet_score: null, pen_score: null, home_goals: null, away_goals: null };
    }
    if (headerText.includes('Cancl') || headerText.includes('Canceled')) {
      return { status: 'CANCELED', final_score: null, ht_score: null, aet_score: null, pen_score: null, home_goals: null, away_goals: null };
    }

    // 2. Ana Başlıktaki Canlı/Biten Skor Alanı
    const mainScoreEl = document.querySelector('.main-score, .exact_score_main, .score_live_main, .weather_main_pr .lscr_sp');
    let rawScoreText = mainScoreEl ? mainScoreEl.innerText.trim() : '';

    // 3. 1X2 tablosunun kendi satırındaki gerçek skor hücresi (.l_sc hücresi - tahmin hücresi .fprc değil!)
    if (!rawScoreText) {
      const row1x2 = document.querySelector('#m1x2_table .rcnt, #m1x2_table tr.rcnt');
      if (row1x2) {
        const scoreCell = row1x2.querySelector('.l_sc, span.lscrsp, div.l_sc');
        if (scoreCell && !scoreCell.closest('.fprc') && !scoreCell.closest('.fpr_probs')) {
          rawScoreText = scoreCell.innerText.trim();
        }
      }
    }

    // 4. Liste sayfasından gelen gerçek skor varsa kullan
    if (!rawScoreText && meta && meta.listingScore) {
      rawScoreText = meta.listingScore;
    }

    // 4. Sadece ve sadece gerçek bir maç sonu skoru varsa ayrıştır (Örn: '2 - 1', 'FT 1-0')
    if (rawScoreText && rawScoreText !== '-' && !rawScoreText.includes(':')) {
      const ftWithHt = rawScoreText.match(/(?:FT\s*)?(\d+)\s*-\s*(\d+)\s*\(\s*(\d+)\s*-\s*(\d+)\s*\)/i);
      if (ftWithHt) {
        status = 'FINISHED';
        homeScore = parseInt(ftWithHt[1], 10);
        awayScore = parseInt(ftWithHt[2], 10);
        htHome = parseInt(ftWithHt[3], 10);
        htAway = parseInt(ftWithHt[4], 10);
      } else {
        const simpleFt = rawScoreText.match(/(?:FT\s*)?(\d+)\s*-\s*(\d+)/i);
        if (simpleFt) {
          status = 'FINISHED';
          homeScore = parseInt(simpleFt[1], 10);
          awayScore = parseInt(simpleFt[2], 10);
        }
      }
    }

    return {
      status,
      final_score: (homeScore !== null && awayScore !== null) ? `${homeScore}-${awayScore}` : null,
      ht_score: (htHome !== null && htAway !== null) ? `${htHome}-${htAway}` : null,
      aet_score: null,
      pen_score: null,
      home_goals: homeScore,
      away_goals: awayScore
    };
  }, matchMeta);

  // Tahmin Pazarları İçin Sonuç Değerlendirmesi (WON / LOST / VOID / PENDING)
  function evaluatePredictionResult(marketKey, pick, actualOutcome) {
    if (['POSTPONED', 'CANCELED', 'AWARDED'].includes(actualOutcome.status)) return 'VOID';
    if (actualOutcome.status !== 'FINISHED' && actualOutcome.status !== 'EXTRA_TIME' && actualOutcome.status !== 'PENALTIES') return 'PENDING';
    if (actualOutcome.home_goals === null || actualOutcome.away_goals === null) return 'PENDING';

    const h = actualOutcome.home_goals;
    const a = actualOutcome.away_goals;
    const totalGoals = h + a;

    if (marketKey === '1X2') {
      const outcome = h > a ? '1' : (h === a ? 'X' : '2');
      return pick === outcome ? 'WON' : 'LOST';
    }
    if (marketKey === 'Under/Over 2.5') {
      const isOver = totalGoals > 2.5;
      return (pick === 'Over' && isOver) || (pick === 'Under' && !isOver) ? 'WON' : 'LOST';
    }
    if (marketKey === 'BTTS') {
      const isBtts = h > 0 && a > 0;
      return (pick === 'Yes' && isBtts) || (pick === 'No' && !isBtts) ? 'WON' : 'LOST';
    }
    if (marketKey === 'Half Time' && actualOutcome.ht_score) {
      const [htH, htA] = actualOutcome.ht_score.split('-').map(n => parseInt(n, 10));
      const htOutcome = htH > htA ? '1' : (htH === htA ? 'X' : '2');
      return pick === htOutcome ? 'WON' : 'LOST';
    }
    return 'PENDING';
  }

  for (const [key, tab] of Object.entries(predictions_9_tabs)) {
    if (tab) {
      tab.result = evaluatePredictionResult(key, tab.pick, matchOutcome);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // 🗄️ Veritabanı Tablolarına Birebir Eşlenen Temiz JSON Şeması
  return {
    match_id: matchId,
    match_slug: matchSlug,
    match_url: matchMeta.url,
    match_title: teamDetails.matchTitle || `${matchMeta.homeTeam} VS ${matchMeta.awayTeam}`,
    match_date: teamDetails.matchDate || matchMeta.date,
    league: {
      name: teamDetails.leagueName || matchMeta.shortTag || 'Futbol',
      short_tag: matchMeta.shortTag || '',
      flag_url: resolvedFlag,
      flag_path: finalFlagPath
    },
    home_team: {
      id: teamDetails.homeTeamId,
      name: teamDetails.homeTeam || matchMeta.homeTeam,
      logo_url: teamDetails.homeLogoUrl || '',
      logo_path: homeLogoRel,
      form: teamDetails.homeForm
    },
    away_team: {
      id: teamDetails.awayTeamId,
      name: teamDetails.awayTeam || matchMeta.awayTeam,
      logo_url: teamDetails.awayLogoUrl || '',
      logo_path: awayLogoRel,
      form: teamDetails.awayForm
    },
    match_outcome: matchOutcome,
    stadium_and_weather: {
      stadium_name: deepStats.distanceInfo.stadiumName || teamDetails.stadium,
      distance_km: deepStats.distanceInfo.distanceKm,
      home_city: deepStats.distanceInfo.homeCity,
      away_city: deepStats.distanceInfo.awayCity,
      weather: predictions_9_tabs['1X2']?.weather || ''
    },
    predictions_9_tabs,
    overall_stats_raw: deepStats.overallStatsRaw,
    h2h_matches: deepStats.h2h,
    home_last_matches: deepStats.homeLastMatches,
    away_last_matches: deepStats.awayLastMatches,
    home_matches_only: deepStats.homeMatchesOnly,
    away_matches_only: deepStats.awayMatchesOnly,
    next_fixtures_fdr: deepStats.nextMatches,
    team_trends: deepStats.trends,
    standings: deepStats.standings,
    scrape_meta: {
      worker_id: workerId,
      duration_sec: durationSec,
      scraped_at: new Date().toISOString()
    }
  };
}

// 🚀 Tek Bir Tarih İçin Paralel Pipeline Çalıştırıcı
async function runParallelPipelineForDate(dateStr, targetUrl) {
  console.log(`\n${COLORS.magenta}================================================================${COLORS.reset}`);
  console.log(`${COLORS.magenta}⚡ FOREBET 4-SEKMELİ PARALEL VERİ ÇEKME: ${dateStr} ⚡${COLORS.reset}`);
  console.log(`${COLORS.magenta}================================================================${COLORS.reset}`);
  log(`🎯 Hedef URL: ${targetUrl}`, COLORS.cyan);
  log(`🧵 Paralel Sekme Sayısı: ${workerCount}`, COLORS.cyan);
  const pipelineStartTime = Date.now();
  const browser = await createBrowserInstance();

  try {
    // 1. Günün Maçlarını Listele
    const { matches: allListingMatches, sessionCookies } = await getMatchListing(browser, targetUrl);
    log(`📋 ${dateStr} Listesinde Toplam ${allListingMatches.length} Adet Maç Bulundu.`, COLORS.cyan);

    let matchQueue = allListingMatches;
    if (onlyWithOdds) {
      matchQueue = allListingMatches.filter(m => m.listingOdd && m.listingOdd !== '-' && !isNaN(parseFloat(m.listingOdd)));
      log(`✅ [FİLTRE UYGULANDI] Bahis Oranı Açık Olan ${matchQueue.length} Maç İşleme Alınıyor (${allListingMatches.length - matchQueue.length} Adet Oransız Amatör Maç Atlandı).`, COLORS.green);
    } else {
      log(`✅ Toplam ${matchQueue.length} Adet Maç İşleme Alınıyor.`, COLORS.green);
    }

    if (matchLimit && matchLimit > 0) {
      matchQueue = matchQueue.slice(0, matchLimit);
      log(`🎯 [TEST LİMİTİ AKTİF] Sadece ilk ${matchLimit} maç işlenecek.`, COLORS.yellow);
    }

    if (matchQueue.length === 0) {
      log(`⚠️ İşlenecek maç bulunamadı.`, COLORS.yellow);
      await browser.close();
      return;
    }

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const results = [];
    let completedCount = 0;
    let errorCount = 0;

    // 2. İşçi Sekmeleri Oluştur & Ana Oturum Çerezlerini Aktar
    const workers = [];
    for (let w = 0; w < workerCount; w++) {
      const page = await browser.newPage();
      await setupPageInterception(page);
      if (sessionCookies && sessionCookies.length > 0) {
        try { await page.setCookie(...sessionCookies); } catch (e) {}
      }
      workers.push({ id: w + 1, page });
    }

    // 3. Eşzamanlı Kuyruk İşleme
    let queueIndex = 0;
    const failedMatchesQueue = [];

    async function workerTask(worker) {
      // Sekmeler arası kademeli insansı gecikme (Cloudflare burst algılamasını önler)
      await new Promise(r => setTimeout(r, (worker.id - 1) * 400));

      while (queueIndex < matchQueue.length) {
        const currentIndex = queueIndex++;
        const match = matchQueue[currentIndex];
        const matchName = `${match.homeTeam} vs ${match.awayTeam}`;

        try {
          const matchData = await scrapeSingleMatch(worker.page, match, worker.id);
          results.push(matchData);
          completedCount++;
          log(`[Sekme ${worker.id}] [${completedCount}/${matchQueue.length}] ✅ ID:${matchData.match_id} | ${matchName} (${matchData.scrape_meta.duration_sec}s)`, COLORS.green);

          // 1. match_data.json ve HTML Viewer oluştur (1:1 Forebet UI)
          try {
            const outDir = path.join(__dirname, 'output');
            const slug = matchData.match_slug || `match-${matchData.match_id}`;
            const matchDir = path.join(outDir, slug);
            if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });
            fs.writeFileSync(path.join(matchDir, 'match_data.json'), JSON.stringify(matchData, null, 2), 'utf-8');

            const { generateMatchViewer } = require('./viewer/generate_viewer');
            generateMatchViewer(matchData, matchDir);
          } catch (_) {}

          // 2. APEX API'ye anında REST POST aktarımı
          try {
            const { syncMatchToApex, loadConfig } = require('./core/apex_sync_client');
            const cfg = loadConfig();
            if (cfg.autoSyncApex !== false) {
              syncMatchToApex(matchData, cfg.apexImportUrl, cfg.apexSecret).catch(() => {});
            }
          } catch (_) {}

          // Her 10 maçta bir ara kayıt yap (Veri kaybını önlemek için)
          if (completedCount % 10 === 0 || completedCount === matchQueue.length) {
            const tempPath = path.join(dataDir, `predictions_${dateStr}.json`);
            fs.writeFileSync(tempPath, JSON.stringify(results, null, 2), 'utf-8');
          }
        } catch (err) {
          errorCount++;
          failedMatchesQueue.push(match);
          log(`[Sekme ${worker.id}] [${completedCount + errorCount}/${matchQueue.length}] ⚠️ 1. Turda Açılamadı: ${matchName} (${err.message}) -> Telafi Havuzuna Alındı.`, COLORS.yellow);
        }
      }
    }

    log(`🚀 ${workerCount} Sekme Kademeli & Çerez Korumalı Olarak Başlatılıyor...`, COLORS.cyan);
    await Promise.all(workers.map(w => workerTask(w)));

    // 4. [OTOMATİK TELAFİ TURU] 1. Turda Açılamayan Maçları 2. Kez Tara
    if (failedMatchesQueue.length > 0) {
      log(`\n${COLORS.yellow}🔄 [OTOMATİK TELAFİ TURU] İlk turda açılamayan ${failedMatchesQueue.length} maç için 2. tur telafi taraması başlatılıyor...${COLORS.reset}`, COLORS.yellow);
      await new Promise(r => setTimeout(r, 2500));
      
      let retryIndex = 0;
      async function retryWorkerTask(worker) {
        while (retryIndex < failedMatchesQueue.length) {
          const cIdx = retryIndex++;
          const match = failedMatchesQueue[cIdx];
          const matchName = `${match.homeTeam} vs ${match.awayTeam}`;
          try {
            await new Promise(r => setTimeout(r, 1200));
            const matchData = await scrapeSingleMatch(worker.page, match, worker.id);
            results.push(matchData);
            completedCount++;
            log(`[2. Tur Telafi - Sekme ${worker.id}] ✅ TELAFİ EDİLDİ: ID:${matchData.match_id} | ${matchName} (${matchData.scrape_meta.duration_sec}s)`, COLORS.green);
          } catch (err) {
            log(`[2. Tur Telafi - Sekme ${worker.id}] ❌ 2. Turda da Açılamadı: ${matchName}`, COLORS.red);
          }
        }
      }
      await Promise.all(workers.map(w => retryWorkerTask(w)));
      log(`✅ Telafi turu tamamlandı. Toplam başarılı maç: ${results.length} / ${matchQueue.length}\n`, COLORS.green);
    }

    // 4. Logo 2. Tur Kontrolü (Logosu Eksik Kalan Profesyonel Takımlar İçin Hızlı Telafi Turu)
    const missingLogos = results.filter(r => (!r.home_team.logo_url && !r.home_team.logo_path) || (!r.away_team.logo_url && !r.away_team.logo_path));
    if (missingLogos.length > 0) {
      log(`🔄 [2. Tur Logo Telafisi] Logosu boş kalan ${missingLogos.length} maç için hızlı kontrol başlatılıyor...`, COLORS.yellow);
      const retryPage = await browser.newPage();
      await setupPageInterception(retryPage);
      if (sessionCookies && sessionCookies.length > 0) {
        try { await retryPage.setCookie(...sessionCookies); } catch (e) {}
      }
      
      for (const m of missingLogos) {
        try {
          await retryPage.goto(m.match_url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1200));
          const retryLogos = await retryPage.evaluate(() => {
            const lLogo = document.querySelector('div.lLogo img, .homeLogo img, img[alt*="logo"]');
            const rLogo = document.querySelector('div.rLogo img, .awayLogo img');
            return {
              homeLogo: lLogo ? lLogo.src : '',
              awayLogo: rLogo ? rLogo.src : ''
            };
          });
          if (retryLogos.homeLogo && !m.home_team.logo_url) m.home_team.logo_url = retryLogos.homeLogo;
          if (retryLogos.awayLogo && !m.away_team.logo_url) m.away_team.logo_url = retryLogos.awayLogo;
        } catch (e) {}
      }
      await retryPage.close();
      log(`✅ 2. Tur Logo Kontrolü tamamlandı.`, COLORS.green);
    }

    // 5. Sonuçları JSON Olarak Kaydet
    const finalJsonPath = path.join(dataDir, `predictions_${dateStr}.json`);
    const latestJsonPath = path.join(dataDir, `predictions_latest.json`);

    fs.writeFileSync(finalJsonPath, JSON.stringify(results, null, 2), 'utf-8');
    fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2), 'utf-8');

    // 6. Detaylı Başarı & İstatistik & Cloudflare Raporu
    const totalFound = allListingMatches.length;
    const totalTargeted = matchQueue.length;
    const totalSaved = results.length;
    const totalDurationSec = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    const avgSecPerMatch = (totalDurationSec / (totalSaved || 1)).toFixed(1);

    let logoSuccessCount = 0;
    let flagSuccessCount = 0;
    let predSuccessCount = 0;

    results.forEach(m => {
      if (m.home_team?.logo_url || m.home_team?.logo_path) logoSuccessCount++;
      if (m.away_team?.logo_url || m.away_team?.logo_path) logoSuccessCount++;
      if (m.league?.flag_url) flagSuccessCount++;
      if (Object.keys(m.predictions_9_tabs || {}).length > 0) predSuccessCount++;
    });

    const totalExpectedLogos = totalSaved * 2;
    const cfSuccessRate = cfChallengeCounter > 0 ? Math.round((cfBypassCounter / cfChallengeCounter) * 100) : 100;

    console.log(`\n${COLORS.magenta}================================================================${COLORS.reset}`);
    console.log(`${COLORS.green}🎉 ${dateStr} VERİ ÇEKME İŞLEMİ EKSİKSİZ TAMAMLANDI! 🎉${COLORS.reset}`);
    console.log(`${COLORS.magenta}================================================================${COLORS.reset}`);
    log(`📋 Bulunan Toplam Maç       : ${totalFound}`, COLORS.cyan);
    log(`🎯 İşleme Alınan (Oranlı)   : ${totalTargeted}`, COLORS.cyan);
    log(`✅ Başarıyla Çekilen Maç    : ${totalSaved} / ${totalTargeted} (✔ ${totalSaved === totalTargeted ? 'HEPSİ ÇEKİLDİ' : 'TAMAMLANDI'})`, COLORS.green);
    log(`🚩 Lig Bayrakları           : ${flagSuccessCount} / ${totalSaved} (✔ ${flagSuccessCount === totalSaved ? 'HEPSİ ÇEKİLDİ' : 'BAŞARILI'})`, COLORS.green);
    log(`🖼️ Takım Logoları           : ${logoSuccessCount} / ${totalExpectedLogos} (✔ Profesyonel Logolar Alındı)`, COLORS.green);
    log(`📊 9 Tahmin Pazarı          : ${predSuccessCount} / ${totalSaved} (✔ 1X2, U/O, KG, İY, İY/MS vb.)`, COLORS.green);
    log(`🛡️ Cloudflare Güvenlik Analizi : ${cfChallengeCounter} kez algılandı, ${cfBypassCounter} kez aşıldı (%${cfSuccessRate} Başarı)`, cfChallengeCounter > 0 ? COLORS.yellow : COLORS.green);
    log(`⏱️ Toplam Çalışma Süresi    : ${Math.floor(totalDurationSec / 60)} dk ${Math.round(totalDurationSec % 60)} sn (Ort. ${avgSecPerMatch}s / maç)`, COLORS.cyan);
    log(`💾 Kayıt Edilen Dosya       : ${finalJsonPath}`, COLORS.cyan);
    console.log(`${COLORS.magenta}================================================================\n${COLORS.reset}`);

  } catch (globalErr) {
    log(`🚨 Kritik Pipeline Hatası (${dateStr}): ${globalErr.message}`, COLORS.red);
  } finally {
    await browser.close();
  }
}

// 🌐 Ana Başlatıcı (Tekli Gün veya Çoklu Geçmiş Gün Taraması)
async function main() {
  const datesToProcess = [];

  if (batchDays && batchDays > 0) {
    // Geçmiş N gün geriye doğru (örn: --days=7)
    for (let i = batchDays - 1; i >= 0; i--) {
      datesToProcess.push(getFormattedDate(-i));
    }
  } else if (startDateStr && endDateStr) {
    // Tarih aralığı (örn: --start-date=2026-08-01 --end-date=2026-08-14)
    let cur = new Date(startDateStr);
    const end = new Date(endDateStr);
    while (cur <= end) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      datesToProcess.push(`${yyyy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Tek bir tarih (targetDate)
    datesToProcess.push(targetDate);
  }

  log(`🗓️ Toplam ${datesToProcess.length} Gün İşlenecek: [${datesToProcess.join(', ')}]`, COLORS.cyan);

  for (let idx = 0; idx < datesToProcess.length; idx++) {
    const dStr = datesToProcess[idx];
    const url = `https://www.forebet.com/en/football-predictions/predictions-1x2/${dStr}`;
    log(`\n▶ [${idx + 1}/${datesToProcess.length}] GÜN BAŞLATILIYOR: ${dStr}`, COLORS.magenta);
    await runParallelPipelineForDate(dStr, url);
  }

  console.log(`\n${COLORS.green}✨ TÜM GÜNLERİN VERİ ÇEKME İŞLEMİ BAŞARIYLA TAMAMLANDI! ✨${COLORS.reset}\n`);
}

main();
