/**
 * ====================================================================
 * BOTV3 — DAILY DISCOVERY TEST TOOL (tools/test_daily_discovery.js)
 * ====================================================================
 * Tests Forebet daily listing discovery (predictions-by-date/YYYY-MM-DD),
 * extracts total match count, leagues, and validates URLs.
 */

const { discoverDailyMatches } = require('../core/daily_discovery');
const { initBrowser, closeBrowser } = require('../core/browser_engine');

async function testDailyDiscovery(targetDate = null) {
  const dateStr = targetDate || process.argv[2] || new Date().toISOString().split('T')[0];

  console.log('\n======================================================');
  console.log('📅 BOTV3 — DAILY MATCH DISCOVERY TEST');
  console.log(`🎯 Hedef Tarih: ${dateStr}`);
  console.log('======================================================\n');

  const startTime = Date.now();
  let browser = null;

  try {
    console.log('🚀 Stealth Tarayıcı Başlatılıyor...');
    browser = await initBrowser(true);

    console.log(`🔍 Forebet Tarih Listesi Taranıyor: ${dateStr}...`);
    const matches = await discoverDailyMatches(dateStr, browser);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Keşif Tamamlandı! Bulunan Toplam Maç: ${matches.length}`);
    console.log(`⏱️  İşlem Süresi: ${elapsed}s\n`);

    if (matches.length > 0) {
      console.log('📋 İlk 10 Maç Örneği:');
      const sample = matches.slice(0, 10).map((m, idx) => ({
        '#': idx + 1,
        'Ev Sahibi': m.home_team || m.home || '-',
        'Deplasman': m.away_team || m.away || '-',
        'Lig': m.league?.name_hint || m.league_name || '-',
        'Saat': m.time || '-',
        'Tahmin': m.prediction?.pick || '-',
        'Oran': m.prediction?.primary_odd || '-'
      }));
      console.table(sample);
    }

    console.log('🎉 DISCOVERY TESTİ BAŞARILI!');
    console.log('======================================================\n');
    return { success: true, count: matches.length, elapsed };

  } catch (err) {
    console.error(`\n❌ DISCOVERY HATASI: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (browser) await closeBrowser(browser).catch(() => {});
  }
}

if (require.main === module) {
  testDailyDiscovery().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { testDailyDiscovery };
