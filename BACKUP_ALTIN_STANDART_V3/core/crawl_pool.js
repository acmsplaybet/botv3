/**
 * ====================================================================
 * BPA V3 - 4-WORKER CONCURRENT SCRAPER POOL & BATCH INGESTER
 * ====================================================================
 * Single Chromium Instance, 4 Lightweight Page Workers,
 * Request Interception, Auto-Retry Pass for Failed Matches,
 * Local Asset Downloading (Flags & Logos), Dual-Sync DB Ingestion,
 * and Graceful Stop / Cancellation Support.
 */

const fs = require('fs');
const path = require('path');
const { createBrowser, setupPageInterception, navigateWithRetry } = require('./browser_engine');
const { parseHero } = require('../parsers/parse_hero');
const { parseMarkets } = require('../parsers/parse_markets');
const { parseDistance } = require('../parsers/parse_distance');
const { parseH2HAndIntro } = require('../parsers/parse_h2h_intro');
const { parseLastMatches } = require('../parsers/parse_last_matches');
const { parseStandings } = require('../parsers/parse_standings');
const { parseInjuries } = require('../parsers/parse_injuries');
const { parseOverallStats } = require('../parsers/parse_overall_stats');
const { parseNextMatches } = require('../parsers/parse_next_matches');
const { generateMatchViewer } = require('../viewer/generate_viewer');
const { formatMatchForIngest, sendBatchToDatabase } = require('./db_ingester');
const { downloadLeagueFlag, downloadTeamLogo } = require('./asset_downloader');

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m"
};

/**
 * Runs a concurrent crawl pool with worker tabs.
 * @param {Array} matchQueue List of match discovery items
 * @param {Object} [options] Pool configurations
 * @returns {Promise<Object>} Pool execution summary
 */
async function runCrawlPool(matchQueue, options = {}) {
  const concurrency = options.concurrency || 4;
  const saveDb = options.saveDb !== undefined ? options.saveDb : true;
  const saveLocal = options.saveLocal !== undefined ? options.saveLocal : true;
  const batchSize = options.batchSize || 25;
  const headless = options.headless !== undefined ? options.headless : 'new';
  const logger = options.logger || console.log;
  const onProgress = options.onProgress || (() => {});
  const onMatch = options.onMatch || (() => {});
  const shouldStop = options.shouldStop || (() => false);

  const total = matchQueue.length;
  if (total === 0) {
    return { total: 0, completed: 0, failed: 0, dbIngested: 0, durationSeconds: 0 };
  }

  const startTime = Date.now();
  const queue = [...matchQueue];
  const results = [];
  const failedMatches = [];
  let completedCount = 0;
  let failedCount = 0;
  let dbIngestedCount = 0;
  let pendingDbBatch = [];

  function logPool(msg, color = COLORS.reset) {
    const time = new Date().toLocaleTimeString();
    logger(`${color}[${time}] ${msg}${COLORS.reset}`);
  }

  logPool(`🚀 [Havuz] BPA V3 Paralel Tarayıcı Başlatılıyor...`, COLORS.cyan);
  logPool(`📊 Toplam Maç: ${total} | Eşzamanlı Sekme: ${concurrency} | DB Paket Boyutu: ${batchSize}`, COLORS.yellow);

  const browser = await createBrowser({ headless });

  // Setup Resource Optimization on a Page
  async function configureFastTab(page) {
    await setupPageInterception(page);
  }

  // Worker task function
  async function runWorker(workerId, workerQueue) {
    const page = await browser.newPage();
    await configureFastTab(page);
    logPool(`[Sekme #${workerId}] 🟢 İşçi sekmesi hazırlandı.`, COLORS.green);

    while (workerQueue.length > 0) {
      if (shouldStop()) {
        logPool(`[Sekme #${workerId}] 🛑 Kullanıcı tarafından durdurma sinyali alındı. Sekme kapatılıyor.`, COLORS.yellow);
        break;
      }

      const matchItem = workerQueue.shift();
      if (!matchItem) break;

      const currentIndex = ++completedCount;
      const matchTitle = `${matchItem.home_team} vs ${matchItem.away_team}`;
      const matchStart = Date.now();

      try {
        logPool(`[Sekme #${workerId}] [${currentIndex}/${total}] Kazınıyor: ${matchTitle}...`, COLORS.blue);

        await navigateWithRetry(page, matchItem.url, (msg) => {}, 3);

        if (shouldStop()) break;

        // 1. Parse all 9 modules using modular parsers
        const hero = await parseHero(page);
        const markets = await parseMarkets(page);
        const distance = await parseDistance(page, hero.homeTeam, hero.awayTeam);
        const h2hAndIntro = await parseH2HAndIntro(page, hero.homeTeam, hero.awayTeam);
        const lastMatches = await parseLastMatches(page, hero.homeTeam, hero.awayTeam);
        const standings = await parseStandings(page, hero.homeTeam, hero.awayTeam);
        const injuries = await parseInjuries(page, hero.homeTeam, hero.awayTeam);
        const overallStats = await parseOverallStats(page);
        const nextMatches = await parseNextMatches(page, hero.homeCode, hero.awayCode);

        // 2. Merge listing metadata
        if (!hero.homeTeam && matchItem.home_team) hero.homeTeam = matchItem.home_team;
        if (!hero.awayTeam && matchItem.away_team) hero.awayTeam = matchItem.away_team;
        if (!hero.matchDate && matchItem.date_time) hero.matchDate = matchItem.date_time;
        if (matchItem.league?.flag_url && !hero.leagueFlag) hero.leagueFlag = matchItem.league.flag_url;
        if (matchItem.league?.short_tag && !hero.leagueShort) hero.leagueShort = matchItem.league.short_tag;
        if (matchItem.league?.name_hint && !hero.league) hero.league = matchItem.league.name_hint;
        if (matchItem.prediction?.primary_odd && markets['1X2'] && !markets['1X2'].odd) {
          markets['1X2'].odd = matchItem.prediction.primary_odd;
        }

        // 3. Download & Cache Local Assets (Flags & Logos)
        try {
          if (hero.leagueFlag) {
            const localFlag = await downloadLeagueFlag(hero.leagueFlag);
            if (localFlag) hero.localLeagueFlag = localFlag;
          }
          if (hero.homeLogo) {
            const localLogo = await downloadTeamLogo(hero.homeLogo, hero.homeTeam);
            if (localLogo) hero.localHomeLogo = localLogo;
          }
          if (hero.awayLogo) {
            const localLogo = await downloadTeamLogo(hero.awayLogo, hero.awayTeam);
            if (localLogo) hero.localAwayLogo = localLogo;
          }
        } catch (assetErr) {}

        const slug = (matchItem.url.split('/').filter(Boolean).pop() || `match_${Date.now()}`).replace(/-\d+$/, '');
        const matchData = {
          meta: {
            scrapedAt: new Date().toISOString(),
            sourceUrl: matchItem.url,
            matchId: hero.matchId || matchItem.match_id,
            slug
          },
          hero,
          markets,
          distance,
          intro: h2hAndIntro.intro,
          h2h: h2hAndIntro.h2h,
          lastMatches,
          standings,
          injuries,
          overallStats,
          nextMatches
        };

        // 4. Save to Local Output Directory if enabled
        if (saveLocal) {
          const matchDir = path.join(__dirname, '..', 'output', slug);
          if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });
          fs.writeFileSync(path.join(matchDir, 'match_data.json'), JSON.stringify(matchData, null, 2), 'utf8');

          const viewerHtml = generateMatchViewer(matchData);
          fs.writeFileSync(path.join(matchDir, 'viewer.html'), viewerHtml, 'utf8');
        }

        // 5. Transform for DB Ingestion
        const dbPayload = formatMatchForIngest(matchData, matchItem);
        pendingDbBatch.push(dbPayload);
        results.push(matchData);

        const duration = ((Date.now() - matchStart) / 1000).toFixed(2);
        logPool(`[Sekme #${workerId}] ✅ [${currentIndex}/${total}] Tamamlandı (${duration}s): ${matchTitle} (Oran: ${matchItem.prediction?.primary_odd || '-'})`, COLORS.green);

        // Progress callback
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = (currentIndex / (elapsedSec || 1)).toFixed(2);
        const progressPct = Math.round((currentIndex / total) * 100);

        onProgress({
          completed: currentIndex,
          total,
          progressPct,
          speedMatchesPerSec: speed,
          lastMatch: matchTitle
        });

        onMatch({
          workerId,
          home_team: matchItem.home_team,
          away_team: matchItem.away_team,
          odd: matchItem.prediction?.primary_odd,
          duration
        });

        // 6. Flush DB Batch if threshold reached
        if (saveDb && pendingDbBatch.length >= batchSize) {
          const batchToSend = [...pendingDbBatch];
          pendingDbBatch = [];
          logPool(`[DB Dual-Sync] 💾 ${batchToSend.length} maçlık paket veritabanına aktarılıyor...`, COLORS.magenta);
          try {
            await sendBatchToDatabase(batchToSend, { logger: (m) => logPool(m, COLORS.magenta) });
            dbIngestedCount += batchToSend.length;
            logPool(`[DB Dual-Sync] ✅ ${dbIngestedCount}/${total} maç MySQL'e başarıyla işlendi.`, COLORS.green);
          } catch (dbErr) {
            logPool(`[DB Dual-Sync] ⚠️ Paket aktarım hatası: ${dbErr.message}`, COLORS.yellow);
          }
        }

      } catch (matchErr) {
        failedCount++;
        failedMatches.push(matchItem);
        logPool(`[Sekme #${workerId}] ❌ Hata (${matchTitle}): ${matchErr.message}`, COLORS.red);
      }
    }

    logPool(`[Sekme #${workerId}] 🏁 İşçi sekmesi görevini tamamladı ve kapatıldı.`, COLORS.cyan);
    try { await page.close(); } catch (e) {}
  }

  // 1. ANA TARAMA HAVUZU
  const workerPromises = [];
  for (let i = 1; i <= concurrency; i++) {
    workerPromises.push(runWorker(i, queue));
  }
  await Promise.all(workerPromises);

  // 2. OTOMATİK TEKRAR DENEME TURU (Eğer durdurulmadıysa ve hata alan maç varsa)
  if (!shouldStop() && failedMatches.length > 0) {
    logPool(`\n🔄 [Tekrar Deneme] Başarısız olan ${failedMatches.length} maç için 2. tur tarama başlatılıyor...`, COLORS.yellow);
    const retryQueue = [...failedMatches];
    failedMatches.length = 0;

    const retryPromises = [];
    const retryConcurrency = Math.min(concurrency, retryQueue.length);
    for (let i = 1; i <= retryConcurrency; i++) {
      retryPromises.push(runWorker(`Tekrar-${i}`, retryQueue));
    }
    await Promise.all(retryPromises);
  }

  // 3. Flush any remaining DB matches
  if (saveDb && pendingDbBatch.length > 0) {
    logPool(`[DB Dual-Sync] 💾 Kalan son ${pendingDbBatch.length} maç veritabanına aktarılıyor...`, COLORS.magenta);
    try {
      await sendBatchToDatabase(pendingDbBatch, { logger: (m) => logPool(m, COLORS.magenta) });
      dbIngestedCount += pendingDbBatch.length;
      logPool(`[DB Dual-Sync] ✅ Toplam ${dbIngestedCount} maç MySQL veritabanına aktarıldı.`, COLORS.green);
      pendingDbBatch = [];
    } catch (dbErr) {
      logPool(`[DB Dual-Sync] ⚠️ Son paket hatası: ${dbErr.message}`, COLORS.yellow);
    }
  }

  try { await browser.close(); } catch (e) {}

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgSpeed = (completedCount / (totalTimeSec || 1)).toFixed(2);

  logPool(`\n═════════════════════════════════════════════════════════════════`, COLORS.cyan);
  logPool(`🎉 BPA V3 TARAMA HAVUZU TAMAMLANDI!`, COLORS.bold + COLORS.green);
  logPool(`📊 Toplam: ${total} | Başarılı: ${results.length} | Hatalı: ${failedCount}`, COLORS.yellow);
  logPool(`💾 Veritabanına Yazılan: ${dbIngestedCount} | Süre: ${totalTimeSec}s (~${avgSpeed} maç/sn)`, COLORS.magenta);
  logPool(`═════════════════════════════════════════════════════════════════\n`, COLORS.cyan);

  return {
    total,
    completed: results.length,
    failed: failedCount,
    dbIngested: dbIngestedCount,
    durationSeconds: totalTimeSec,
    speedMatchesPerSec: avgSpeed
  };
}

module.exports = {
  runCrawlPool
};
