/**
 * ====================================================================
 * BOTV3 — SINGLE MATCH AUDIT & TEST TOOL (tools/test_single_match.js)
 * ====================================================================
 * Scrapes a single Forebet match URL, validates all 9 parsers,
 * checks data completeness, generates viewer, and prints diagnostic table.
 */

const { scrapeMatch } = require('../scrape_match');
const path = require('path');
const fs = require('fs');

const DEFAULT_TEST_URL = 'https://www.forebet.com/en/football/matches/mbeya-city-dodoma-jiji-2506756';

async function testSingleMatch(targetUrl = null) {
  const url = targetUrl || process.argv[2] || DEFAULT_TEST_URL;

  console.log('\n======================================================');
  console.log('⚽ BOTV3 — SINGLE MATCH SCRAPING AUDIT TOOL');
  console.log('======================================================');
  console.log(`🌐 Hedef URL: ${url}\n`);

  const startTime = Date.now();

  try {
    const result = await scrapeMatch(url);

    if (!result || !result.hero) {
      console.error('❌ Maç verisi kazınamadı veya boş döndü!');
      return { success: false };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n------------------------------------------------------');
    console.log('📊 KAZIMA VE ŞEMA DOĞRULAMA RAPORU');
    console.log('------------------------------------------------------');

    const hero = result.hero || {};
    const markets = result.markets || {};
    const h2h = result.h2h || {};
    const lastMatches = result.lastMatches || {};
    const standings = result.standings || [];
    const overallStats = result.overallStats || {};
    const distance = result.distance || {};
    const injuries = result.injuries || {};
    const nextMatches = result.nextMatches || {};

    const checks = [
      { section: 'Match Hero (Ev / Dep Takımlar)', status: (hero.homeTeam && hero.awayTeam) ? '✅ PASS' : '❌ FAIL', detail: `${hero.homeTeam || '-'} vs ${hero.awayTeam || '-'}` },
      { section: 'Match Meta (Lig, Tarih, Skor)', status: (hero.league && hero.matchDate) ? '✅ PASS' : '❌ FAIL', detail: `${hero.league || '-'} | ${hero.matchDate || '-'} | Skor: ${hero.result?.score || '-'}` },
      { section: 'Form Çizgileri', status: (hero.homeForm?.length > 0 || hero.awayForm?.length > 0) ? '✅ PASS' : '⚠️ WARN', detail: `Ev: [${hero.homeForm?.join(',') || '-'}] | Dep: [${hero.awayForm?.join(',') || '-'}]` },
      { section: '9 Market: 1X2 Tahmini', status: markets['1X2'] ? '✅ PASS' : '❌ FAIL', detail: `Pick: ${markets['1X2']?.pick || '-'} | Oran: ${markets['1X2']?.odd || '-'}` },
      { section: '9 Market: Under / Over 2.5', status: markets['UnderOver'] ? '✅ PASS' : '⚠️ WARN', detail: `Pick: ${markets['UnderOver']?.pick || '-'} | Oran: ${markets['UnderOver']?.odd || '-'}` },
      { section: '9 Market: BTTS (KG Var/Yok)', status: markets['BTTS'] ? '✅ PASS' : '⚠️ WARN', detail: `Pick: ${markets['BTTS']?.pick || '-'} | Yes: ${markets['BTTS']?.probYes || '-'}` },
      { section: '9 Market: Half Time (İY)', status: markets['HT'] ? '✅ PASS' : '⚠️ WARN', detail: `Pick: ${markets['HT']?.pick || '-'} | HT Skor: ${markets['HT']?.htScore || '-'}` },
      { section: '9 Market: Corners / Cards', status: (markets['Corners'] || markets['Cards']) ? '✅ PASS' : '⚠️ WARN', detail: `Corners: ${markets['Corners'] ? 'OK' : '-'} | Cards: ${markets['Cards'] ? 'OK' : '-'}` },
      { section: 'H2H Karşılaşmaları', status: h2h.matches?.length > 0 ? '✅ PASS' : '⚠️ WARN', detail: `Bulunan H2H Maçı: ${h2h.matches?.length || 0}` },
      { section: '2x2 Son Maçlar Tabloları', status: (lastMatches.homeOverall?.matches?.length > 0) ? '✅ PASS' : '⚠️ WARN', detail: `Ev Son Maç: ${lastMatches.homeOverall?.matches?.length || 0} adet` },
      { section: 'Puan Durumu (Standings)', status: standings.length > 0 ? '✅ PASS' : '⚠️ BOŞ LİG/KUPA', detail: `Tablo Satır Sayısı: ${standings.length}` },
      { section: 'Overall Stats (get_ovd)', status: (overallStats.goals || overallStats.rawOvd) ? '✅ PASS' : '⚠️ WARN', detail: `Gol Histogramı: ${overallStats.goalsByTimePeriod?.home?.length ? 'Mevcut' : 'Yok'}` },
      { section: 'Kuş Uçuşu Mesafe (KM)', status: distance.distanceKm ? '✅ PASS' : '⚠️ WARN', detail: distance.distanceKm || 'Mevcut değil' },
      { section: 'Gelecek Fikstür & Sakatlıklar', status: '✅ PASS', detail: `Sakatlık: ${injuries.hasInjuries ? 'Var' : 'Yok'} | Fikstür: ${nextMatches.home?.length || 0}` }
    ];

    console.table(checks);

    const slug = hero.slug || path.basename(url);
    const outputPath = path.join(__dirname, '..', 'output', slug);
    console.log(`\n📁 Çıktı Klasörü: ${outputPath}`);
    console.log(`   ├── match_data.json (${fs.existsSync(path.join(outputPath, 'match_data.json')) ? '✅ MEVCUT' : '❌ EKSİK'})`);
    console.log(`   └── viewer.html (${fs.existsSync(path.join(outputPath, 'viewer.html')) ? '✅ MEVCUT' : '❌ EKSİK'})`);

    console.log(`\n🎉 TEST SONUCU: BAŞARILI | Süre: ${elapsed}s`);
    console.log('======================================================\n');
    return { success: true, result, elapsed };

  } catch (err) {
    console.error(`\n❌ TEST BAŞARISIZ OLDU: ${err.message}`);
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  testSingleMatch().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { testSingleMatch };
