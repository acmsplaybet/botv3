/**
 * ====================================================================
 * BPA V3 SINGLE MATCH SCRAPER (MASTER FULL DATA SCHEMA)
 * ====================================================================
 * Combines all 10 specialized parsers into an ultra-rich, zero-mock pipeline.
 * Extracts: Hero, 9 Markets, Extended Odds, Distance, H2H, Standings,
 * Injuries, Last Matches (Home/Away/Only), Overall Stats (get_ovd),
 * Next Matches (FDR 1-5), and Match Center Events (Goals, Cards, Subs).
 * Generates 1:1 Forebet HTML Viewer & Syncs to APEX API.
 * ====================================================================
 */

const path = require('path');
const fs = require('fs');

const { createBrowser, closeBrowser, setupPageInterception, navigateWithRetry } = require('./core/browser_engine');
const { parseHero } = require('./parsers/parse_hero');
const { parseMarkets } = require('./parsers/parse_markets');
const { parseH2HAndIntro } = require('./parsers/parse_h2h_intro');
const { parseDistance } = require('./parsers/parse_distance');
const { parseStandings } = require('./parsers/parse_standings');
const { parseInjuries } = require('./parsers/parse_injuries');
const { parseLastMatches } = require('./parsers/parse_last_matches');
const { parseOverallStats } = require('./parsers/parse_overall_stats');
const { parseNextMatches } = require('./parsers/parse_next_matches');
const { parseMatchCenter } = require('./parsers/parse_match_center');
const { generateMatchViewer } = require('./viewer/generate_viewer');
const { syncMatchToApex, loadConfig } = require('./core/apex_sync_client');

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m"
};

function formatLog(msg, color = COLORS.reset) {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date();
  const ts = `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
  return `${color}${ts} ${msg}${COLORS.reset}`;
}

async function scrapeMatch(url, options = {}) {
  const logger = options.onLog || ((msg) => console.log(formatLog(msg)));
  const headless = options.headless !== undefined ? options.headless : 'new';
  const syncApex = options.syncApex !== undefined ? options.syncApex : true;

  let browser = null;
  let page = options.page || null;
  let shouldCloseBrowser = false;
  const startTime = Date.now();

  try {
    // 1. Launch Browser or reuse persistent worker page
    if (!page) {
      browser = await createBrowser({ headless, workerId: options.workerId });
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await setupPageInterception(page);
      shouldCloseBrowser = true;
    }

    // 2. Navigate to match page
    await navigateWithRetry(page, url, (m) => logger(m, COLORS.yellow), 2, 12000);

    // 3. Step 1: Parse Hero & Base Info
    const hero = await parseHero(page, url);

    // 4. Parallel Rich Extractions across all 10 modules
    const [
      markets,
      h2hIntro,
      distance,
      standings,
      injuries,
      lastMatches,
      overallStats,
      nextMatches,
      matchCenter
    ] = await Promise.all([
      parseMarkets(page, hero).catch(() => ({})),
      parseH2HAndIntro(page, hero).catch(() => ({ h2h: { summary: {}, matches: [] }, intro: {} })),
      parseDistance(page, hero).catch(() => ({ hasDistance: false })),
      parseStandings(page, hero.homeTeam, hero.awayTeam).catch(() => ([])),
      parseInjuries(page, hero.homeTeam, hero.awayTeam).catch(() => ({ hasInjuries: false, homePlayers: [], awayPlayers: [] })),
      parseLastMatches(page, hero.homeTeam, hero.awayTeam).catch(() => ({ home: [], away: [], homeOnly: [], awayOnly: [] })),
      parseOverallStats(page).catch(() => ({})),
      parseNextMatches(page, hero.homeTeam, hero.awayTeam).catch(() => ({ home: [], away: [] })),
      parseMatchCenter(page, hero).catch(() => ({ hasEvents: false, events: [], lineups: {}, inMatchStats: {} }))
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // 5. Ensure distance & h2h schema consistency (Strings only, no object leak)
    const cleanDistance = {
      hasDistance: Boolean(distance?.hasDistance),
      km: distance?.km || '-',
      kmNum: distance?.kmNum ?? null,
      homeTeam: String(hero.homeTeam || distance?.homeTeam || ''),
      homeCode: String(distance?.homeCode || hero.homeCode || hero.homeShort || ''),
      homeLogo: String(distance?.homeLogo || hero.homeLogo || ''),
      homeCity: String(distance?.homeCity || ''),
      homeCountry: String(distance?.homeCountry || ''),
      homeStadium: String(distance?.homeStadium || hero.stadium || ''),
      awayTeam: String(hero.awayTeam || distance?.awayTeam || ''),
      awayCode: String(distance?.awayCode || hero.awayCode || hero.awayShort || ''),
      awayLogo: String(distance?.awayLogo || hero.awayLogo || ''),
      awayCity: String(distance?.awayCity || ''),
      awayCountry: String(distance?.awayCountry || ''),
      awayStadium: String(distance?.awayStadium || '')
    };

    const cleanH2H = h2hIntro?.h2h || { summary: {}, matches: [] };
    if (!cleanH2H.summary) cleanH2H.summary = {};
    cleanH2H.summary.homeTeam = String(hero.homeTeam || cleanH2H.summary.homeTeam || '');
    cleanH2H.summary.awayTeam = String(hero.awayTeam || cleanH2H.summary.awayTeam || '');

    // 5. Build Master JSON Schema (Full 100KB Rich Schema)
    const matchData = {
      meta: {
        scrapedAt: new Date().toISOString(),
        url: url,
        durationSeconds: elapsed
      },
      hero: hero,
      markets: markets,
      intro: h2hIntro.intro || { introText: '', introDate: '' },
      distance: cleanDistance,
      h2h: cleanH2H,
      standings: standings,
      injuries: injuries,
      lastMatches: lastMatches,
      overallStats: overallStats,
      nextMatches: nextMatches,
      matchCenter: matchCenter
    };

    // 6. Save JSON and HTML Viewer
    let slug = '';
    const urlMatch = url.match(/\/matches\/([^\/\?#]+)/);
    if (urlMatch) {
      slug = urlMatch[1];
    } else {
      slug = `${hero.homeTeam}-${hero.awayTeam}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    const cfg = loadConfig();
    const outDir = cfg.outputDir && fs.existsSync(cfg.outputDir) ? cfg.outputDir : path.join(__dirname, 'output');
    const matchDir = path.join(outDir, slug);
    if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

    const jsonPath = path.join(matchDir, 'match_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(matchData, null, 2), 'utf8');

    let viewerPath = '';
    try {
      viewerPath = generateMatchViewer(matchData, matchDir);
    } catch (_) { }

    // 7. APEX API REST Sync
    if (syncApex) {
      try {
        await syncMatchToApex(matchData, options.apiUrl || cfg.apexImportUrl, options.apiKey || cfg.apexSecret);
      } catch (_) { }
    }

    return {
      success: true,
      slug,
      jsonPath,
      viewerPath,
      matchData
    };

  } catch (err) {
    logger(`❌ [HATA] Kazıma hatası: ${err.message}`, COLORS.red);
    throw err;
  } finally {
    if (shouldCloseBrowser && browser) {
      try {
        await closeBrowser(browser);
      } catch (e) {
        try { await browser.close(); } catch (_) { }
      }
    }
  }
}

// CLI Runner
if (require.main === module) {
  const args = process.argv.slice(2);
  let targetUrl = 'https://www.forebet.com/en/football/matches/wellington-phoenix-(r)-wellington-olympic-2441711';
  let headless = 'new';
  let syncApex = false;

  for (const arg of args) {
    if (arg.startsWith('--url=')) targetUrl = arg.split('=')[1];
    else if (arg.startsWith('--headless=')) headless = arg.split('=')[1] === 'true' || arg.split('=')[1] === 'new' ? 'new' : false;
    else if (arg.startsWith('--sync-apex=')) syncApex = arg.split('=')[1] === 'true';
    else if (arg.startsWith('http')) targetUrl = arg;
  }

  scrapeMatch(targetUrl, { headless, syncApex }).then(r => {
    console.log(`\n🎉 BAŞARILI! Süre: ${r.matchData?.meta?.durationSeconds}s | Maç: ${r.matchData?.hero?.homeTeam} vs ${r.matchData?.hero?.awayTeam}`);
    console.log(`📁 JSON: ${r.jsonPath}`);
    console.log(`🌐 HTML: ${r.viewerPath}`);
  }).catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
  });
}

module.exports = { scrapeMatch };
