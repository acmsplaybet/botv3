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
const { createBrowser, closeBrowser, setupPageInterception, navigateWithRetry, triggerInteractiveChallenge, loadCachedCookies } = require('./core/browser_engine');
const { scrapeMatch } = require('./scrape_match');

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
let targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
let workerCount = 4;
let headlessMode = 'new';
let onlyWithOdds = true;
let matchLimit = null;
let batchDays = null;
let startDateStr = null;
let endDateStr = null;

let isRandom = false;

for (const arg of args) {
  if (arg.startsWith('--url=')) {
    targetUrl = arg.split('=')[1];
  } else if (arg.startsWith('--date=')) {
    targetDate = arg.split('=')[1];
    targetUrl = `https://www.forebet.com/en/football-predictions/predictions-1x2/${targetDate}`;
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
  }
}

// 🎯 Ana Liste Sayfasından Maç Linklerini Çıkar (More Butonuna Tıklayarak Tüm Sayfayı Açar)
async function getMatchListing(browser, listUrl) {
  log(`📋 Günün Maç Listesi Taranıyor: ${listUrl}`, COLORS.cyan);
  const page = await browser.newPage();
  await setupPageInterception(page);

  let matches = [];
  const maxListRetries = 5;

  try {
    for (let attempt = 1; attempt <= maxListRetries; attempt++) {
      try {
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
        
        let title = await page.title().catch(() => '');
        if (title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com') {
          log(`  ↳ 🛡️ Liste sayfasında Cloudflare algılandı, bekleniyor (${attempt}/${maxListRetries})...`, COLORS.yellow);
          await new Promise(r => setTimeout(r, 4000));
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 3000));
          
          title = await page.title().catch(() => '');
          if ((title.includes('Just a moment') || title.includes('Cloudflare')) && attempt >= 2) {
            log(`  ↳ 🔔 Cloudflare otomatik geçilemedi, insan onayı penceresi tetikleniyor...`, COLORS.yellow);
            const manualOk = await triggerInteractiveChallenge(listUrl, (m) => log(`  ↳ ${m}`, COLORS.yellow));
            if (manualOk) {
              const cookies = loadCachedCookies();
              if (cookies.length > 0) await page.setCookie(...cookies).catch(() => {});
              await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            }
          }
        }

        await page.waitForSelector('.schema, .predict-tables, .rcnt', { timeout: 12000 });
        await new Promise(r => setTimeout(r, 2000));
        break;
      } catch (e) {
        if (attempt === maxListRetries) {
          log(`  ↳ ⚠️ Liste sayfası yüklenemedi: ${e.message}`, COLORS.yellow);
        } else {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

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
    matches = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.rcnt, .schema .rcnt, tr[class*="tr_"], div[class*="tr_"], .schema tr[onclick*="/matches/"]'));
      const list = [];
      const seen = new Set();

      rows.forEach(r => {
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

  const browser = await createBrowser({ headless: headlessMode, workerId: 1 });

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

    log(`⚡ İşleme Alınacak Maç Sayısı: ${matchQueue.length} (Kuyruk Başlatılıyor)`, COLORS.cyan);

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const results = [];
    let completedCount = 0;
    let errorCount = 0;

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

      while (queueIndex < matchQueue.length) {
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
        const match = matchQueue[currentIndex];
        const matchName = `${match.homeTeam || 'Home'} vs ${match.awayTeam || 'Away'}`;

        try {
          const scrapeRes = await scrapeMatch(match.url, {
            page: worker.page,
            onLog: (m) => {}
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
    console.log(`${COLORS.magenta}================================================================\n${COLORS.reset}`);

    return results.length;
  } catch (err) {
    log(`🚨 Kritik Pipeline Hatası: ${err.message}`, COLORS.red);
    return results.length;
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
    let cur = new Date(startDateStr);
    const end = new Date(endDateStr);
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
    const url = `https://www.forebet.com/en/football-predictions/predictions-1x2/${dStr}`;
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
