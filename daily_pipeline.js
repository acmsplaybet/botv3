/**
 * ====================================================================
 * BPA V3 / BOTV4 - MASTER PARALLEL DAILY PIPELINE (ALTIN STANDART)
 * ====================================================================
 * 4 Eşzamanlı Sekme ile Günlük Maç Keşfi ve 10 Modüllü Eksiksiz Kazıma
 * 
 * - Tüm 10 modül (Hero, 9 Market, H2H, Mesafe, Sakatlar, Son Maçlar, OVD, FDR, Match Center)
 * - output/<slug>/match_data.json (Her maça 100KB+ Altın Standart JSON)
 * - data/predictions_YYYY-MM-DD.json (Günün toplu master arşivi)
 * - 1:1 Forebet Canlı Maç Merkezi (HTML Viewer)
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { createBrowser, closeBrowser, setupPageInterception, navigateWithRetry, triggerInteractiveChallenge, loadCachedCookies, waitForInternetConnection } = require('./core/browser_engine');
const { scrapeMatch } = require('./scrape_match');
const { uploadMatchesToApex, getApexConfig } = require('./core/apex_uploader');

// 🛡️ Node.js v24 / Puppeteer Global CDP & Unhandled Rejection Kalkanı
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
    return; // Alt-çerçeve krizini izole et, Node.js sürecini öldürme
  }
  console.warn('[Pipeline Zırhı] Yakalanmamış Rejection izole edildi:', msg);
});

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('ProtocolError') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Target.detachFromTarget')
  ) {
    return;
  }
  console.error('[Pipeline Zırhı] Beklenmeyen Hata İzole Edildi:', err);
});

// Tarih Yardımcısı (YYYY-MM-DD)
const getFormattedDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Konsol Renkleri
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function log(msg, color = COLORS.reset) {
  const t = new Date().toLocaleTimeString();
  console.log(`${color}[${t}] ${msg}${COLORS.reset}`);
}

// Argüman Ayrıştırma
const args = process.argv.slice(2);
let targetDate = getFormattedDate(0);
let explicitUrl = null;
let workerCount = 4;
let headlessMode = 'new';
let onlyWithOdds = true;
let matchLimit = null;
let batchDays = null;
let startDateStr = null;
let endDateStr = null;
let autoSyncApex = null;

let isRandom = false;
let forceRefresh = false;
let isCron = false;

for (const arg of args) {
  if (arg.startsWith('--url=')) {
    explicitUrl = arg.split('=')[1];
  } else if (arg.startsWith('--date=')) {
    targetDate = arg.split('=')[1];
  } else if (arg === '--today' || arg === '--mode=today') {
    targetDate = getFormattedDate(0);
  } else if (arg === '--tomorrow' || arg === '--mode=tomorrow') {
    targetDate = getFormattedDate(1);
  } else if (arg === '--yesterday' || arg === '--mode=yesterday') {
    targetDate = getFormattedDate(-1);
  } else if (arg === '--mode=all') {
    batchDays = 3;
  } else if (arg === '--random') {
    isRandom = true;
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
  } else if (arg === '--sync-apex' || arg === '--sync') {
    autoSyncApex = true;
  } else if (arg === '--no-sync-apex' || arg === '--no-sync') {
    autoSyncApex = false;
  } else if (arg === '--force' || arg === '--force-refresh' || arg === '--refresh-scores') {
    forceRefresh = true;
  } else if (arg === '--cron' || arg === '--scheduled') {
    isCron = true;
  }
}

// 🛡️ Otomasyon Kapalı Kontrolü: Zamanlayıcıdan tetiklenmişse ve otomasyon kapalıysa derhal çık
if (isCron && !forceRefresh) {
  try {
    const { getResolvedConfig } = require('./core/scheduler_manager');
    const liveCfg = getResolvedConfig();
    if (liveCfg.automation_active === false) {
      log(`⛔ [ZAMANLAYICI KAPALI] config.json içinde automation_active=false olduğu için otomatik görev çalıştırılmadı.`, COLORS.yellow);
      log(`💡 Görevi manuel başlatmak için Web UI'ı kullanabilir veya komuta '--force' ekleyebilirsiniz.`, COLORS.cyan);
      process.exit(0);
    }
  } catch (_) {}
}

// 🎯 Ana Liste Sayfasından Maç Linklerini Çıkar (More Butonuna Tıklayarak Tüm Sayfayı Açar)
async function getMatchListing(browser, listUrl) {
  log(`📋 Günün Maç Listesi Taranıyor: ${listUrl}`, COLORS.cyan);
  const page = await browser.newPage();
  await setupPageInterception(page);

  let matches = [];
  try {
    try {
      log(`  ↳ 🌐 Forebet ana sunucu oturumu kuruluyor...`, COLORS.cyan);
      await page.goto('https://www.forebet.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (_) {}

    const isLoaded = await navigateWithRetry(page, listUrl, (m) => log(`  ↳ ${m}`, COLORS.yellow), 3, 35000);
    if (!isLoaded) {
      log(`  ↳ ⚠️ Liste sayfası yüklenemedi (Cloudflare veya ağ engeli).`, COLORS.yellow);
      return [];
    }

    await page.waitForSelector('.schema, .predict-tables, .rcnt, table.main', { timeout: 20000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1500));

    // Otomatik "More" Tıklama (Tüm maçları aç)
    let moreClicks = 0;
    const maxClicks = 35;
    while (moreClicks < maxClicks) {
      if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;

      // Sayfa sonuna kaydır
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 400));

      const clicked = await page.evaluate(() => {
        const mrows = document.getElementById('mrows') || document.querySelector('.moreBtn, .show_more, #btnMore, .more_btn, span[onclick*="ltodrows"], .stat-more');
        if (!mrows) return false;
        const target = mrows.querySelector('span, a, button') || mrows;
        const style = window.getComputedStyle(mrows);
        if (style.display === 'none' || style.visibility === 'hidden' || mrows.offsetHeight === 0) return false;

        try {
          target.click();
          return true;
        } catch(e) {
          return false;
        }
      });

      if (!clicked) break;
      moreClicks++;
      log(`  ↳ ⏳ 'More' tıklandı (#${moreClicks}), yeni maçlar yükleniyor...`, COLORS.cyan);
      await new Promise(r => setTimeout(r, 1500));
    }

    // DOM'dan Maç URL'lerini Çıkar
    const debugInfo = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('.rcnt').length;
      const allMatches = document.querySelectorAll('a[href*="/matches/"]').length;
      const schemaDivs = document.querySelectorAll('.schema .rcnt').length;
      return { allDivs, allMatches, schemaDivs, title: document.title, url: window.location.href };
    });
    log(`  ↳ 🔍 DOM Durumu: ${JSON.stringify(debugInfo)}`, COLORS.cyan);

    matches = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.schema:not(.ftrd) tr[onclick*="/matches/"], .schema:not(.ftrd) tr.rcnt, div.schema:not(.ftrd) .rcnt, table.main tr[onclick*="/matches/"], .predict-tables tr[onclick*="/matches/"], tr.rcnt, .schema_h2h tr[onclick*="/matches/"], .rcnt'));
      const list = [];
      const seen = new Set();

      rows.forEach(r => {
        if (r.closest('.ftrd') || r.closest('.widget') || r.closest('.sidebar') || r.closest('#rightcol') || r.closest('.stat-more')) return;

        let href = '';
        const onclick = r.getAttribute('onclick');
        if (onclick && onclick.includes('/matches/')) {
          const m = onclick.match(/'([^']+)'/);
          if (m) href = m[1];
        }

        if (!href) {
          const linkEl = r.querySelector('a.tnmscn, a.tnms, a[href*="/football/matches/"], a[href*="/matches/"], a[href*="/football-predictions/"]');
          if (linkEl && linkEl.href) href = linkEl.href;
        }

        if (!href || !href.includes('/matches/')) return;
        if (!href.startsWith('http')) {
          href = 'https://www.forebet.com' + (href.startsWith('/') ? '' : '/') + href;
        }

        if (seen.has(href)) return;
        seen.add(href);

        const homeEl = r.querySelector('.homeTeam, .st_hteam, .tnms, .tnmscn, span[itemprop="homeTeam"]');
        const awayEl = r.querySelector('.awayTeam, .st_ateam, span[itemprop="awayTeam"]');
        const home = (homeEl?.innerText || '').trim();
        const away = (awayEl?.innerText || '').trim();

        // Oran (Odd) Tespiti:
        // 1. Ana Tahmin Oranı (.bigOnly.prmod .lscrsp, .prmod span, span.lscrsp, .lodd, .podd, .l_od)
        const primaryOddEl = r.querySelector('.bigOnly.prmod .lscrsp, .prmod .lscrsp, .prmod span, span.lscrsp, .lodd, .odd, .podd, .l_od');
        const primaryOddText = primaryOddEl ? (primaryOddEl.innerText || '').trim() : '';
        const primaryOddVal = parseFloat(primaryOddText);
        const hasPrimaryOdd = !isNaN(primaryOddVal) && primaryOddVal > 1.0;

        // 2. 1X2 Büro Oranları (.haodd span)
        const haoddSpans = Array.from(r.querySelectorAll('.haodd span, .haodd div, .haodd_div span'))
          .map(s => parseFloat((s.innerText || '').trim()))
          .filter(n => !isNaN(n) && n > 1.0);
        const hasHaodd = haoddSpans.length > 0;

        const hasOdd = hasPrimaryOdd || hasHaodd;
        const detectedOdd = hasPrimaryOdd ? primaryOddText : (hasHaodd ? String(haoddSpans[0]) : '-');

        list.push({
          url: href,
          homeTeam: home,
          awayTeam: away,
          odd: detectedOdd,
          hasOdd: Boolean(hasOdd)
        });
      });

      return list;
    });

    if (matches.length > 0) {
      log(`✅ Liste Taranması Başarılı: ${matches.length} Maç Keşfedildi (${moreClicks} kez "More" tıklandı).`, COLORS.green);
    }
  } catch (e) {
    log(`⚠️ Liste Taraması Hatası: ${e.message}`, COLORS.yellow);
  } finally {
    await page.close();
  }

  return matches;
}

// 🚀 Paralel Günlük Kazıma Pipeline'ı
async function runParallelPipelineForDate(dateStr, listUrl) {
  try {
    const stopFile = path.join(__dirname, 'stop_signal.txt');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  } catch (_) {}

  const pipelineStartTime = Date.now();
  log(`\n================================================================`, COLORS.magenta);
  log(`🚀 [${dateStr}] 4-SEKMELİ ALTIN STANDART KAZIMA BAŞLATILIYOR...`, COLORS.green);
  log(`================================================================\n`, COLORS.magenta);

  let results = [];
  const browser = await createBrowser({ headless: headlessMode, useTempProfile: false });

  try {
    const allMatches = await getMatchListing(browser, listUrl);

    if (!allMatches || allMatches.length === 0) {
      log(`⚠️ [${dateStr}] Hiç maç bulunamadı. Lütfen URL'yi veya tarihi kontrol edin.`, COLORS.yellow);
      return;
    }

    const totalFound = allMatches.length;
    const matchesWithOdds = allMatches.filter(m => m.hasOdd);
    const matchesWithoutOdds = allMatches.filter(m => !m.hasOdd);

    log(`📋 [BÜLTEN TARAMASI] Toplam ${totalFound} maç keşfedildi.`, COLORS.cyan);
    log(`🎯 [ORAN FİLTRESİ] ${matchesWithOdds.length} oranlı maç bulundu | ${matchesWithoutOdds.length} oransız maç elendi.`, COLORS.green);

    let matchQueue = onlyWithOdds ? matchesWithOdds : allMatches;

    if (onlyWithOdds && matchQueue.length === 0) {
      log(`⚠️ [UYARI] Bu tarihte oranlı maç bulunamadı! Tarama sonlandırılıyor.`, COLORS.yellow);
      return;
    }

    if (isRandom && matchQueue.length > 0) {
      const rndIdx = Math.floor(Math.random() * matchQueue.length);
      matchQueue = [ matchQueue[rndIdx] ];
      log(`🎲 [Rastgele Mod] Seçilen Oranlı Maç: ${matchQueue[0].homeTeam} vs ${matchQueue[0].awayTeam} (Oran: ${matchQueue[0].odd || '-'})`, COLORS.magenta);
    } else if (matchLimit && matchLimit > 0) {
      matchQueue = matchQueue.slice(0, matchLimit);
      log(`🎯 [Limit Aktif] İlk ${matchLimit} oranlı maç işleme alınıyor.`, COLORS.yellow);
    }

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    results = [];
    const pendingQueue = [];
    let completedCount = 0;
    let errorCount = 0;

    // ⏩ AKILLI DEVAM ETME / ÖNBELLEK KONTROLÜ (Resume & Skip Already Scraped Matches)
    log(`🔍 [ÖNBELLEK KONTROLÜ] Önceden kazınmış maçlar kontrol ediliyor...`, COLORS.cyan);
    for (const match of matchQueue) {
      let slug = '';
      const urlM = match.url.match(/\/matches\/(.+?)(?:[?#]|$)/);
      if (urlM) slug = urlM[1].replace(/[\/\\]+/g, '-');
      let altSlug = '';
      const urlM2 = match.url.match(/\/matches\/([^\/\?#]+)/);
      if (urlM2) altSlug = urlM2[1];

      let matchJsonPath = slug ? path.join(__dirname, 'output', slug, 'match_data.json') : null;
      if (!matchJsonPath || !fs.existsSync(matchJsonPath)) {
        if (altSlug && fs.existsSync(path.join(__dirname, 'output', altSlug, 'match_data.json'))) {
          matchJsonPath = path.join(__dirname, 'output', altSlug, 'match_data.json');
        } else if (slug) {
          try {
            const decodedSlug = decodeURIComponent(slug);
            const altPath = path.join(__dirname, 'output', decodedSlug, 'match_data.json');
            if (fs.existsSync(altPath)) matchJsonPath = altPath;
          } catch (_) {}
        }
      }

      if (!forceRefresh && matchJsonPath && fs.existsSync(matchJsonPath) && fs.statSync(matchJsonPath).size > 1000) {
        try {
          const cached = JSON.parse(fs.readFileSync(matchJsonPath, 'utf-8'));
          if (cached && cached.hero && cached.hero.homeTeam) {
            const hero = cached.hero;
            const todayDateStr = getFormattedDate(0);
            const isPastOrToday = dateStr <= todayDateStr;
            const hasFinalScore = (
              hero.status === 'FT' || 
              hero.status === 'AET' || 
              hero.status === 'Pen.' || 
              (hero.score && hero.score !== '-' && hero.score !== '?' && !hero.score.includes('?'))
            );

            // 🎯 KRİTİK İŞ MANTIĞI: Geçmiş (Dün) veya bugünün maçı çekiliyorsa ve önbellekteki maç henüz sonuçlanmamışsa (Upcoming / skorsuz):
            // Bu maç atlanamaz! Biten skorunu, golleri ve kartları almak için Forebet'ten yeniden kazınmalıdır!
            if (isPastOrToday && !hasFinalScore) {
              pendingQueue.push(match);
              continue;
            }

            results.push(cached);
            completedCount++;
            continue;
          }
        } catch (_) {}
      }
      pendingQueue.push(match);
    }

    if (completedCount > 0) {
      const cachedPct = Math.round((completedCount / matchQueue.length) * 100);
      log(`⏩ [ÖNBELLEK ANALİZİ] ${completedCount} / ${matchQueue.length} maç (%${cachedPct}) zaten KESİN BİTİŞ SKORLU (FT/Pen.) olduğu için korundu ve hafızaya yüklendi.`, COLORS.green);
      if (pendingQueue.length > 0) {
        log(`⚡ [SKOR GÜNCELLEME KUYRUĞU] Kalan ${pendingQueue.length} maç önceden skorsuz/oynanmamış kaldığı için Forebet'ten güncel bitiş skorlarıyla çekilmeye başlanıyor...`, COLORS.cyan);
      }
    }

    // Eğer bu tarihteki TÜM maçlar zaten kazınmışsa doğrudan günü bitir ve sıradakine geç!
    if (pendingQueue.length === 0) {
      log(`🎉 [${dateStr}] Tüm ${matchQueue.length} maç zaten eksiksiz kazınmış! Bu gün tamamlandı, sıradaki tarihe geçiliyor...\n`, COLORS.green);
      const finalJsonPath = path.join(dataDir, `predictions_${dateStr}.json`);
      const latestJsonPath = path.join(dataDir, `predictions_latest.json`);
      fs.writeFileSync(finalJsonPath, JSON.stringify(results, null, 2), 'utf-8');
      fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2), 'utf-8');

      // 🗄️ Yerel Arşivleme (data/archive/YYYY-MM/predictions_YYYY-MM-DD.json)
      const ym = dateStr.slice(0, 7);
      const archiveDir = path.join(dataDir, 'archive', ym);
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const archivePath = path.join(archiveDir, `predictions_${dateStr}.json`);
      fs.writeFileSync(archivePath, JSON.stringify(results, null, 2), 'utf-8');
      log(`🗄️ [ARŞİV] Günlük veri arşive kaydedildi -> ${archivePath}`, COLORS.green);

      // 🚀 Canlı APEX API Senkronizasyonu
      const shouldSync = autoSyncApex !== null ? autoSyncApex : getApexConfig().autoSyncApex;
      if (shouldSync && results.length > 0) {
        log(`\n🚀 [APEX API AKTARIMI] Önceden hazır ${results.length} maç canlı APEX API'ye aktarılıyor...`, COLORS.magenta);
        try {
          await uploadMatchesToApex(results, { dateStr, logger: (m) => log(m, COLORS.cyan) });
        } catch (uploadErr) {
          log(`❌ [APEX API HATA] Senkronizasyon hatası: ${uploadErr.message}`, COLORS.red);
        }
      }

      return results.length;
    }

    log(`⚡ Kazınacak Kalan Maç Sayısı: ${pendingQueue.length} (Kuyruk Başlatılıyor: #${completedCount + 1} - #${matchQueue.length})`, COLORS.cyan);

    // 4 İşçi Sekmesi Oluştur
    const workers = [];
    for (let w = 0; w < workerCount; w++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await setupPageInterception(page);
      workers.push({ id: w + 1, page });
    }

    let queueIndex = 0;
    const failedQueue = [];

    async function workerTask(worker) {
      await new Promise(r => setTimeout(r, (worker.id - 1) * 300));

      while (queueIndex < pendingQueue.length) {
        if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) {
          log(`⛔ [Sekme ${worker.id}] Durdurma sinyali algılandı.`, COLORS.red);
          break;
        }

        // ⏸️ Duraklatma (Pause) Kontrolü (Hassas 300ms kontrolü)
        if (fs.existsSync(path.join(__dirname, 'pause_signal.txt'))) {
          log(`⏸️ [Sekme ${worker.id}] Duraklatıldı, yeni maç alınmıyor ve bekleniyor...`, COLORS.yellow);
          while (fs.existsSync(path.join(__dirname, 'pause_signal.txt'))) {
            if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;
            await new Promise(r => setTimeout(r, 300));
          }
          if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;
          log(`▶️ [Sekme ${worker.id}] Devam emri alındı, sıradaki maça geçiliyor.`, COLORS.green);
        }
        if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;

        const currentIndex = queueIndex++;
        const match = pendingQueue[currentIndex];
        const matchName = `${match.homeTeam || 'Home'} vs ${match.awayTeam || 'Away'}`;

        // Sekme kapalıysa veya çöktüyse hemen yenisini aç
        if (!worker.page || worker.page.isClosed()) {
          try {
            log(`[Sekme ${worker.id}] 🔄 Sekme kapalı tespit edildi, yeni sekme oluşturuluyor...`, COLORS.yellow);
            worker.page = await browser.newPage();
            await worker.page.setViewport({ width: 1440, height: 900 });
            await setupPageInterception(worker.page);
          } catch (newPageErr) {
            log(`[Sekme ${worker.id}] ❌ Yeni sekme açılamadı: ${newPageErr.message}`, COLORS.red);
          }
        }

        try {
          const scrapeRes = await scrapeMatch(match.url, {
            page: worker.page,
            onLog: (m) => log(`  ↳ [Sekme ${worker.id}] ${m}`, COLORS.cyan)
          });

          if (scrapeRes && scrapeRes.matchData) {
            results.push(scrapeRes.matchData);
            completedCount++;
            log(`[Sekme ${worker.id}] [${completedCount}/${matchQueue.length}] ✅ ${scrapeRes.matchData.hero?.homeTeam} vs ${scrapeRes.matchData.hero?.awayTeam} (${scrapeRes.matchData.meta?.durationSeconds}s) -> ${scrapeRes.jsonPath}`, COLORS.green);

            // Her 5 maçta bir veya sonda günlük JSON'a kaydet
            if (completedCount % 5 === 0 || completedCount === matchQueue.length) {
              const tempPath = path.join(dataDir, `predictions_${dateStr}.json`);
              fs.writeFileSync(tempPath, JSON.stringify(results, null, 2), 'utf-8');
            }
          }
        } catch (err) {
          errorCount++;
          // Sayfa kapandıysa sekmesini yenile
          if (worker.page && (worker.page.isClosed() || String(err.message).includes('Target closed') || String(err.message).includes('Session closed'))) {
            try {
              worker.page = await browser.newPage();
              await worker.page.setViewport({ width: 1440, height: 900 });
              await setupPageInterception(worker.page);
            } catch (_) {}
          }
          failedQueue.push(match);
          log(`[Sekme ${worker.id}] ⚠️ 1. Turda Açılamadı: ${matchName} (${err.message}) -> Telafi Havuzuna Alındı.`, COLORS.yellow);
        }
      }
    }

    log(`⚡ ${workerCount} İşçi Sekmesi Başlatılıyor...`, COLORS.cyan);
    await Promise.all(workers.map(w => workerTask(w)));

    // Otomatik Telafi Turu
    if (failedQueue.length > 0 && !fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) {
      log(`\n🔄 [OTOMATİK TELAFİ] Açılamayan ${failedQueue.length} maç için 2. tur telafi taraması başlatılıyor...`, COLORS.yellow);
      let retryIdx = 0;
      async function retryTask(worker) {
        while (retryIdx < failedQueue.length) {
          if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;
          if (fs.existsSync(path.join(__dirname, 'pause_signal.txt'))) {
            while (fs.existsSync(path.join(__dirname, 'pause_signal.txt'))) {
              if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;
              await new Promise(r => setTimeout(r, 300));
            }
            if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) break;
          }

          const match = failedQueue[retryIdx++];
          try {
            await new Promise(r => setTimeout(r, 800));
            const scrapeRes = await scrapeMatch(match.url, { page: worker.page, onLog: () => {} });
            if (scrapeRes && scrapeRes.matchData) {
              results.push(scrapeRes.matchData);
              completedCount++;
              log(`[2. Tur Telafi - Sekme ${worker.id}] ✅ TELAFİ EDİLDİ: ${scrapeRes.matchData.hero?.homeTeam} vs ${scrapeRes.matchData.hero?.awayTeam}`, COLORS.green);
            }
          } catch (e) {
            log(`[2. Tur Telafi - Sekme ${worker.id}] ❌ 2. Turda da Açılamadı: ${match.url}`, COLORS.red);
          }
        }
      }
      await Promise.all(workers.map(w => retryTask(w)));
    }

    // Toplu Günlük JSON Dosyasını Kaydet
    const finalJsonPath = path.join(dataDir, `predictions_${dateStr}.json`);
    const latestJsonPath = path.join(dataDir, `predictions_latest.json`);

    fs.writeFileSync(finalJsonPath, JSON.stringify(results, null, 2), 'utf-8');
    fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2), 'utf-8');

    // 🗄️ Yerel Arşivleme (data/archive/YYYY-MM/predictions_YYYY-MM-DD.json)
    const ym = dateStr.slice(0, 7);
    const archiveDir = path.join(dataDir, 'archive', ym);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, `predictions_${dateStr}.json`);
    fs.writeFileSync(archivePath, JSON.stringify(results, null, 2), 'utf-8');
    log(`🗄️ [ARŞİV] Günlük veri arşive yedeklendi -> ${archivePath}`, COLORS.green);

    // 🚀 Canlı APEX API Senkronizasyonu (50'lik Paketler & 3 Retry)
    const shouldSync = autoSyncApex !== null ? autoSyncApex : getApexConfig().autoSyncApex;
    if (shouldSync && results.length > 0) {
      log(`\n🚀 [APEX API AKTARIMI] ${results.length} maç canlı APEX API'ye aktarılıyor...`, COLORS.magenta);
      try {
        const syncRes = await uploadMatchesToApex(results, {
          dateStr,
          logger: (m) => log(m, COLORS.cyan)
        });
        if (syncRes.success) {
          log(`✅ [APEX API] Toplam ${syncRes.sentMatches} maç sıfır kayıpla aktarıldı.`, COLORS.green);
        } else {
          log(`⚠️ [APEX API] Aktarım tamamlandı ancak ${syncRes.failedChunks} paket aktarılamadı (Yerel tampona alındı).`, COLORS.yellow);
        }
      } catch (uploadErr) {
        log(`❌ [APEX API HATA] Senkronizasyon hatası: ${uploadErr.message}`, COLORS.red);
      }
    }

    const totalDurationSec = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
    const avgSec = (totalDurationSec / (results.length || 1)).toFixed(1);

    console.log(`\n${COLORS.magenta}================================================================${COLORS.reset}`);
    console.log(`${COLORS.green}🎉 ${dateStr} ALTIN STANDART TARAMA TAMAMLANDI! 🎉${COLORS.reset}`);
    console.log(`${COLORS.magenta}================================================================${COLORS.reset}`);
    log(`📋 Bulunan Toplam Maç       : ${allMatches.length}`, COLORS.cyan);
    log(`✅ Çekilen Altın Maç        : ${results.length} / ${matchQueue.length}`, COLORS.green);
    log(`⏱️ Toplam Süre              : ${Math.floor(totalDurationSec / 60)} dk ${Math.round(totalDurationSec % 60)} sn (Ort. ${avgSec}s / maç)`, COLORS.cyan);
    log(`📁 Tekil Klasörler          : output/<slug>/match_data.json (100KB+ Tam Veri)`, COLORS.green);
    log(`💾 Günlük Master JSON       : ${finalJsonPath}`, COLORS.green);
    log(`🗄️ Aylık Arşiv Klasörü      : ${archivePath}`, COLORS.green);
    console.log(`${COLORS.magenta}================================================================\n${COLORS.reset}`);

    return results.length;
  } catch (err) {
    log(`🚨 Kritik Pipeline Hatası: ${err.message}`, COLORS.red);
    return Array.isArray(results) ? results.length : 0;
  } finally {
    await closeBrowser(browser);
  }
}

// Ana Giriş Noktası
async function main() {
  const dates = [];

  if (batchDays && batchDays > 0) {
    for (let i = batchDays - 1; i >= 0; i--) {
      dates.push(getFormattedDate(-i));
    }
  } else if (startDateStr && endDateStr) {
    let cur = new Date(startDateStr + 'T12:00:00');
    const end = new Date(endDateStr + 'T12:00:00');
    while (cur <= end) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    dates.push(targetDate);
  }

  log(`🗓️ Toplam ${dates.length} Gün İşlenecek: [${dates.join(', ')}]`, COLORS.cyan);

  let totalProcessedAllDays = 0;
  for (let i = 0; i < dates.length; i++) {
    const dStr = dates[i];
    let url = (explicitUrl && dates.length === 1) ? explicitUrl : `https://www.forebet.com/en/football-predictions/predictions-1x2/${dStr}`;
    log(`\n▶ [Gün ${i + 1}/${dates.length}] TARİH BAŞLATILIYOR: ${dStr}`, COLORS.magenta);
    const count = await runParallelPipelineForDate(dStr, url);
    totalProcessedAllDays += (count || 0);
  }

  if (totalProcessedAllDays > 0) {
    log(`\n✨ TÜM GÜNLERİN TARAMASI TAMAMLANDI! Toplam ${totalProcessedAllDays} maç kazındı. ✨`, COLORS.green);
  } else {
    log(`\n⚠️ Tarama sonlandı ancak hiçbir maç kazınamadı (Cloudflare engeli veya bültende maç yok).`, COLORS.yellow);
  }
}

main();
