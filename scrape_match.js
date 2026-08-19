/**
 * ====================================================================
 * BPA V3 SINGLE MATCH SCRAPER RUNNER (CLI & PROGRAMMATIC ENGINE)
 * ====================================================================
 */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const { createBrowser, setupPageInterception, navigateWithRetry } = require('./core/browser_engine');
const { parseHero } = require('./parsers/parse_hero');
const { parseMarkets } = require('./parsers/parse_markets');
const { parseH2HAndIntro } = require('./parsers/parse_h2h_intro');
const { parseDistance } = require('./parsers/parse_distance');
const { parseStandings } = require('./parsers/parse_standings');
const { parseInjuries } = require('./parsers/parse_injuries');
const { parseLastMatches } = require('./parsers/parse_last_matches');
const { parseOverallStats } = require('./parsers/parse_overall_stats');
const { parseNextMatches } = require('./parsers/parse_next_matches');
const { generateMatchViewer } = require('./viewer/generate_viewer');

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

  let browser = null;
  const startTime = Date.now();

  try {
    logger(`🚀 BPA V3 Forebet Scraper başlatılıyor...`, COLORS.cyan);
    logger(`🌐 Hedef URL: ${url}`, COLORS.cyan);

    browser = await puppeteer.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Ağ direnci: Yeniden deneme döngüsü
    let loaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger(`[Ağ] (${attempt}/3) Sayfaya bağlanılıyor: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        loaded = true;
        break;
      } catch (navErr) {
        logger(`[Ağ] ⚠️ Bağlantı denemesi ${attempt} hatası: ${navErr.message}`, COLORS.yellow);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!loaded) {
      throw new Error(`Sayfa 3 denemede de yüklenemedi: ${url}`);
    }

    // Ekstra dinamik içerik beklemesi
    await new Promise(r => setTimeout(r, 2500));
    logger(`✅ Sayfaya başarıyla bağlanıldı ve DOM yüklendi.`, COLORS.green);

    // 2. ADIM 1: Hero & Takım Bilgileri
    logger(`⏳ [1/8] Hero, Takım Bilgileri, Logolar ve Formlar ayrıştırılıyor...`);
    const hero = await parseHero(page);
    logger(`  ↳ ✅ Takımlar: ${hero.homeTeam} (${hero.homeCode}) vs ${hero.awayTeam} (${hero.awayCode})`, COLORS.green);
    logger(`  ↳ ✅ Skor: ${hero.finalScore || hero.score} • Tarih: ${hero.matchDate} ${hero.matchTime}`, COLORS.green);

    // 3. ADIM 2: 9 Tahmin Pazarı
    logger(`⏳ [2/8] 9 Tahmin Pazarı (1X2, U/O, HT, HT/FT, BTTS, Handicap, Scorers, Corners, Cards) ayrıştırılıyor...`);
    const markets = await parseMarkets(page);
    logger(`  ↳ ✅ 1X2: 1(${markets['1X2']?.prob1}) X(${markets['1X2']?.probX}) 2(${markets['1X2']?.prob2}) | Tahmin: ${markets['1X2']?.pick}`, COLORS.green);
    logger(`  ↳ ✅ Alt/Üst 2.5: Alt(${markets['UnderOver']?.probUnder}) Üst(${markets['UnderOver']?.probOver}) | Tahmin: ${markets['UnderOver']?.pick}`, COLORS.green);

    // 4. ADIM 3: H2H & Match Intro
    logger(`⏳ [3/8] H2H Karşılaşmaları ve Forebet AI Analiz Metni ayrıştırılıyor...`);
    const h2hAndIntro = await parseH2HAndIntro(page, hero.homeTeam, hero.awayTeam);
    logger(`  ↳ ✅ H2H: ${h2hAndIntro.h2h?.matches?.length || 0} geçmiş maç bulundu.`, COLORS.green);

    // 5. ADIM 4: Straight Line Distance (Ayrı Modül)
    logger(`⏳ [4/8] Straight Line Distance (Kuş Uçuşu Mesafe & Stadyum Coğrafyası) ayrıştırılıyor...`);
    const distance = await parseDistance(page, hero.homeTeam, hero.awayTeam);
    logger(`  ↳ ✅ Kuş Uçuşu Mesafe: ${distance.km || '-'} (${distance.homeCity} ↔ ${distance.awayCity}) | Stadyum: ${distance.homeStadium || '-'}`, COLORS.green);

    // 6. ADIM 5: Standings (Puan Durumu)
    logger(`⏳ [5/8] Lig Puan Durumu Tablosu ayrıştırılıyor...`);
    const standings = await parseStandings(page, hero.homeTeam, hero.awayTeam);
    logger(`  ↳ ✅ Puan Durumu: ${standings.length} takım tablosu çıkarıldı.`, COLORS.green);

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

    if (!hero.homeRank && standings.length > 0) {
      const hRow = standings.find(s => s.highlight || s.team.toLowerCase().includes(hero.homeTeam.toLowerCase()));
      if (hRow) hero.homeRank = formatRankPlace(hRow.rank);
    }
    if (!hero.awayRank && standings.length > 0) {
      const aRow = standings.find(s => s.team.toLowerCase().includes(hero.awayTeam.toLowerCase()));
      if (aRow) hero.awayRank = formatRankPlace(aRow.rank);
    }

    // 7. ADIM 6: Injured & Suspended Players
    logger(`⏳ [6/9] Sakat ve Cezalı Oyuncular (Injured & Suspended) ayrıştırılıyor...`);
    const injuries = await parseInjuries(page, hero.homeTeam, hero.awayTeam);
    if (injuries.hasInjuries) {
      logger(`  ↳ ✅ Sakat/Cezalı: Ev Sahibi(${injuries.homePlayers?.length || 0}) • Deplasman(${injuries.awayPlayers?.length || 0})`, COLORS.green);
    } else {
      logger(`  ↳ ℹ️ Bu maç için sakat veya cezalı oyuncu bilgisi bulunmuyor.`, COLORS.yellow);
    }

    // 8. ADIM 7: Last 6 Matches (2x2 Grid)
    logger(`⏳ [7/9] Son 6 Maç & İç/Dış Saha Form Tabloları ayrıştırılıyor...`);
    const lastMatches = await parseLastMatches(page, hero.homeTeam, hero.awayTeam);
    logger(`  ↳ ✅ Ev Sahibi Genel: ${lastMatches.homeOverall?.matches?.length || 0} maç | Deplasman Genel: ${lastMatches.awayOverall?.matches?.length || 0} maç`, COLORS.green);

    // 9. ADIM 8: Overall Statistics
    logger(`⏳ [8/9] Overall İstatistikler (Şutlar, Paslar, Histogram, Disiplin) ayrıştırılıyor...`);
    const overallStats = await parseOverallStats(page);
    logger(`  ↳ ✅ Şutlar: ${hero.homeCode}(${overallStats.shots?.home?.total}) vs ${hero.awayCode}(${overallStats.shots?.away?.total})`, COLORS.green);
    logger(`  ↳ ✅ Paslar: ${hero.homeCode}(${overallStats.passes?.total?.home}) vs ${hero.awayCode}(${overallStats.passes?.total?.away})`, COLORS.green);

    // 10. ADIM 9: Next Matches & FDR
    logger(`⏳ [9/9] Gelecek Maçlar & Zorluk Puanları ayrıştırılıyor...`);
    const nextMatches = await parseNextMatches(page, hero.homeCode, hero.awayCode);
    logger(`  ↳ ✅ Gelecek Fikstür: ${nextMatches.home?.length || 0} ev maçı, ${nextMatches.away?.length || 0} dep maçı`, COLORS.green);

    // Bütünleştirilmiş Veri Paketi
    const matchData = {
      meta: {
        scrapedAt: new Date().toISOString(),
        url: url,
        durationSeconds: ((Date.now() - startTime) / 1000).toFixed(2)
      },
      hero,
      markets,
      intro: h2hAndIntro.intro,
      distance,
      h2h: h2hAndIntro.h2h,
      standings,
      injuries,
      lastMatches,
      overallStats,
      nextMatches
    };

    // Dosyalara Kaydetme
    const slug = (hero.homeTeam + '-' + hero.awayTeam)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || ('match-' + Date.now());

    const outDir = path.join(__dirname, 'output', slug);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const jsonPath = path.join(outDir, 'match_data.json');
    const viewerPath = path.join(outDir, 'viewer.html');

    fs.writeFileSync(jsonPath, JSON.stringify(matchData, null, 2), 'utf-8');
    generateMatchViewer(matchData, viewerPath);

    // Latest kopyalarını da güncelle (Kolay erişim için)
    const latestDir = path.join(__dirname, 'output');
    fs.writeFileSync(path.join(latestDir, 'latest_match.json'), JSON.stringify(matchData, null, 2), 'utf-8');
    generateMatchViewer(matchData, path.join(latestDir, 'latest_viewer.html'));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger(`🎉 [BAŞARILI] Kazıma tamamlandı (${elapsed} saniye)!`, COLORS.green);
    logger(`📁 JSON: ${jsonPath}`, COLORS.cyan);
    logger(`🌐 HTML Görüntüleyici: ${viewerPath}`, COLORS.cyan);

    return {
      success: true,
      slug,
      jsonPath,
      viewerPath,
      latestViewerPath: path.join(latestDir, 'latest_viewer.html'),
      matchData
    };

  } catch (err) {
    logger(`❌ [HATA] Kazıma sırasında bir hata oluştu: ${err.message}`, COLORS.red);
    throw err;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

// CLI Çalıştırıcı
if (require.main === module) {
  const args = process.argv.slice(2);
  let targetUrl = 'https://www.forebet.com/en/football/matches/besiktas-ey%C3%BCpspor-2494866';
  let headless = 'new';

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      targetUrl = arg.split('=')[1];
    } else if (arg.startsWith('--headless=')) {
      const val = arg.split('=')[1].toLowerCase();
      headless = val === 'true' || val === 'new' ? 'new' : false;
    } else if (arg.startsWith('http')) {
      targetUrl = arg;
    }
  }

  scrapeMatch(targetUrl, { headless }).catch(err => {
    console.error('Bot sonlandı (Hata ile):', err.message);
    process.exit(1);
  });
}

module.exports = { scrapeMatch };
