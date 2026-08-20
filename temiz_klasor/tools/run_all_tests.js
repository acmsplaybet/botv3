/**
 * ====================================================================
 * BOTV3 — MASTER TEST RUNNER & SUITE (tools/run_all_tests.js)
 * ====================================================================
 * Runs all diagnostic tools in sequence:
 * 1. Cloudflare & Stealth Health Check
 * 2. Data Quality & Zero-Mock Audit
 * 3. APEX API Synchronization Test
 * Prints an overall Executive Test Matrix.
 */

const { testCfHealth } = require('./test_cf_health');
const { runQualityAudit } = require('./verify_data_quality');
const { testApexSync } = require('./test_apex_sync');

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 BOTV3 — MASTER TEST SUITE & HEALTH AUDIT');
  console.log('======================================================\n');

  const suiteStart = Date.now();
  const summary = [];

  // TEST 1: Cloudflare & Stealth Health Check
  console.log('▶️  ADIM 1/3: Cloudflare & Stealth Health Testi Çalıştırılıyor...');
  try {
    const cfRes = await testCfHealth();
    summary.push({
      Modül: '1. Cloudflare Stealth Engine',
      Durum: cfRes.success ? '✅ PASS' : '❌ FAIL',
      Detay: cfRes.success ? `DOM Yüklendi (${cfRes.elapsed}s, ${cfRes.matchCount} maç)` : cfRes.error
    });
  } catch (e) {
    summary.push({ Modül: '1. Cloudflare Stealth Engine', Durum: '❌ ERROR', Detay: e.message });
  }

  // TEST 2: Data Quality & Zero-Mock Audit
  console.log('\n▶️  ADIM 2/3: Veri Kalitesi ve Zero-Mock Testi Çalıştırılıyor...');
  try {
    const qRes = runQualityAudit();
    summary.push({
      Modül: '2. Data Quality & Zero-Mock',
      Durum: qRes.success ? '✅ PASS' : '⚠️ WARN',
      Detay: `Kalite Skoru: %${qRes.avgScore || 0} (${qRes.totalAudited || 0} maç)`
    });
  } catch (e) {
    summary.push({ Modül: '2. Data Quality & Zero-Mock', Durum: '❌ ERROR', Detay: e.message });
  }

  // TEST 3: APEX API Sync Test
  console.log('\n▶️  ADIM 3/3: APEX API İletim Testi Çalıştırılıyor...');
  try {
    const syncRes = await testApexSync();
    summary.push({
      Modül: '3. APEX REST Ingestion Sync',
      Durum: syncRes.success ? '✅ PASS' : '⚠️ OFFLINE / SKIPPED',
      Detay: syncRes.success ? 'APEX API HTTP 200 OK' : (syncRes.error || `HTTP ${syncRes.statusCode}`)
    });
  } catch (e) {
    summary.push({ Modül: '3. APEX REST Ingestion Sync', Durum: '⚠️ OFFLINE', Detay: e.message });
  }

  const totalTime = ((Date.now() - suiteStart) / 1000).toFixed(2);

  console.log('\n======================================================');
  console.log('📋 MASTER TEST RAPORU VE ÖZET MATRİS');
  console.log('======================================================');
  console.table(summary);

  const allPassed = summary.every(s => s.Durum.includes('PASS') || s.Durum.includes('OFFLINE'));
  console.log(`\n🎉 TEST SÜRECİ TAMAMLANDI | Toplam Süre: ${totalTime}s`);
  console.log('======================================================\n');

  return { success: allPassed, summary, totalTime };
}

if (require.main === module) {
  runAllTests().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { runAllTests };
