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
  const syncApex = options.syncApex !== undefined ? options.syncApex : false;

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

    // 2. Navigate to match page with network resilience
    await navigateWithRetry(page, url, (m) => logger(m, COLORS.yellow), 2, 12000);

    // 3. Step 1: Parse Hero & Base Info
    const hero = await parseHero(page, url);

    // 4. Step 2: 9 Prediction Markets & Extended Odds
    let markets = {};
    try {
      markets = await parseMarkets(page);
    } catch (_) {
      markets = {};
    }

    // 5. Step 3: H2H & Forebet Match Intro
    let h2hIntro = { h2h: { summary: {}, matches: [] }, intro: { introText: '', introDate: '' } };
    try {
      h2hIntro = await parseH2HAndIntro(page, hero.homeTeam, hero.awayTeam);
    } catch (_) {
      h2hIntro = { h2h: { summary: {}, matches: [] }, intro: { introText: '', introDate: '' } };
    }

    // 6. Step 4: Straight Line Distance & Stadium Geo
    let distance = { hasDistance: false };
    try {
      distance = await parseDistance(page, hero.homeTeam, hero.awayTeam);
    } catch (_) {
      distance = { hasDistance: false };
    }

    // 7. Step 5: League Standings Table
    let standings = [];
    try {
      standings = await parseStandings(page, hero.homeTeam, hero.awayTeam);
      function formatRankPlace(rank) {
        if (!rank) return '';
        const n = parseInt(rank, 10);
        if (isNaN(n)) return String(rank);
        const j = n % 10, k = n % 100;
        if (j === 1 && k !== 11) return `${n}st place`;
        if (j === 2 && k !== 12) return `${n}nd place`;
        if (j === 3 && k !== 13) return `${n}rd place`;
        return `${n}th place`;
      }
      if ((!hero.homeRank || hero.homeRank === '-') && Array.isArray(standings) && standings.length > 0) {
        const hRow = standings.find(s => s.highlight || (s.team && hero.homeTeam && s.team.toLowerCase().includes(hero.homeTeam.toLowerCase())));
        if (hRow) hero.homeRank = formatRankPlace(hRow.rank);
      }
      if ((!hero.awayRank || hero.awayRank === '-') && Array.isArray(standings) && standings.length > 0) {
        const aRow = standings.find(s => s.team && hero.awayTeam && s.team.toLowerCase().includes(hero.awayTeam.toLowerCase()));
        if (aRow) hero.awayRank = formatRankPlace(aRow.rank);
      }
    } catch (_) {
      standings = [];
    }

    // 8. Step 6: Injured & Suspended Players
    let injuries = { hasInjuries: false, homePlayers: [], awayPlayers: [] };
    try {
      injuries = await parseInjuries(page, hero.homeTeam, hero.awayTeam);
    } catch (_) {
      injuries = { hasInjuries: false, homePlayers: [], awayPlayers: [] };
    }

    // 9. Step 7: Last Matches & Form Tables (4 blocks)
    let lastMatches = { homeOverall: { matches: [] }, awayOverall: { matches: [] }, homeHome: { matches: [] }, awayAway: { matches: [] } };
    try {
      lastMatches = await parseLastMatches(page, hero.homeTeam, hero.awayTeam);
    } catch (_) {
      lastMatches = { homeOverall: { matches: [] }, awayOverall: { matches: [] }, homeHome: { matches: [] }, awayAway: { matches: [] } };
    }

    // 10. Step 8: Overall Statistics (Forebet get_ovd Live Engine)
    let overallStats = {};
    try {
      overallStats = await parseOverallStats(page);
    } catch (_) {
      overallStats = {};
    }

    // 11. Step 9: Next Matches & Fixture Difficulty Rating (FDR 1-5)
    let nextMatches = { home: [], away: [] };
    try {
      nextMatches = await parseNextMatches(page, hero.homeCode || hero.homeTeam, hero.awayCode || hero.awayTeam);
    } catch (_) {
      nextMatches = { home: [], away: [] };
    }

    // 12. Step 10: Match Center (Events, Line-ups, In-Match Stats)
    let matchCenter = { hasEvents: false, events: [], periods: { ht: '', ft: '', aet: '', penalties: null }, lineups: {}, inMatchStats: {} };
    try {
      matchCenter = await parseMatchCenter(page, hero);
    } catch (_) {
      matchCenter = { hasEvents: false, events: [], periods: { ht: '', ft: '', aet: '', penalties: null }, lineups: {}, inMatchStats: {} };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // 13. Build Master JSON Schema (Full 100KB Rich Schema)
    const matchData = {
      meta: {
        scrapedAt: new Date().toISOString(),
        url: url,
        durationSeconds: elapsed
      },
      hero: hero,
      markets: markets,
      intro: h2hIntro.intro || { introText: '', introDate: '' },
      distance: distance,
      h2h: h2hIntro.h2h || { summary: {}, matches: [] },
      standings: standings,
      injuries: injuries,
      lastMatches: lastMatches,
      overallStats: overallStats,
      nextMatches: nextMatches,
      matchCenter: matchCenter
    };

    // 14. Save JSON and HTML Viewer
    let slug = '';
    const urlMatch = url.match(/\/matches\/([^\/\?#]+)/);
    if (urlMatch) {
      slug = decodeURIComponent(urlMatch[1]).toLowerCase().replace(/[^a-z0-9\-]+/g, '-').replace(/^-+|-+$/g, '');
    } else {
      slug = `${hero.homeTeam}-${hero.awayTeam}`.toLowerCase().replace(/[^a-z0-9\-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    if (!slug) slug = 'match-' + Date.now();

    const cfg = loadConfig();
    const outDir = cfg.outputDir && fs.existsSync(cfg.outputDir) ? cfg.outputDir : path.join(__dirname, 'output');
    const matchDir = path.join(outDir, slug);
    if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });

    const jsonPath = path.join(matchDir, 'match_data.json');
    const viewerPath = path.join(matchDir, 'viewer.html');

    fs.writeFileSync(jsonPath, JSON.stringify(matchData, null, 2), 'utf8');

    try {
      generateMatchViewer(matchData, viewerPath);
    } catch (_) {}

    // Latest copies for easy inspection
    try {
      const latestDir = path.join(__dirname, 'output');
      if (fs.existsSync(latestDir)) {
        fs.writeFileSync(path.join(latestDir, 'latest_match.json'), JSON.stringify(matchData, null, 2), 'utf8');
        generateMatchViewer(matchData, path.join(latestDir, 'latest_viewer.html'));
      }
    } catch (_) {}

    // 15. APEX API REST Sync
    const shouldSync = options.syncApex !== undefined ? options.syncApex : cfg.autoSyncApex;
    if (shouldSync) {
      try {
        await syncMatchToApex(matchData, options.apiUrl || cfg.apexImportUrl, options.apiKey || cfg.apexSecret);
      } catch (_) {}
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
        try { await browser.close(); } catch (_) {}
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
