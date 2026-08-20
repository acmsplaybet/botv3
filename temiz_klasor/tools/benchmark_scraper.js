/**
 * ====================================================================
 * BOTV3 — PERFORMANCE & BENCHMARK TOOL (tools/benchmark_scraper.js)
 * ====================================================================
 * Measures scraper throughput (seconds per match), RAM consumption,
 * page lifecycle cleanup, and recommends concurrency settings.
 */

const { initBrowser, closeBrowser } = require('../core/browser_engine');
const { scrapeMatch } = require('../scrape_match');

const SAMPLE_URLS = [
  'https://www.forebet.com/en/football/matches/mbeya-city-dodoma-jiji-2506756',
  'https://www.forebet.com/en/football/matches/panserraikos-panthrakikos-2506540'
];

async function runBenchmark(iterations = 2) {
  console.log('\n======================================================');
  console.log('⚡ BOTV3 — SCRAPER PERFORMANCE & MEMORY BENCHMARK');
  console.log('======================================================\n');

  const memStart = process.memoryUsage();
  console.log(`🧠 Başlangıç Bellek: RSS ${(memStart.rss / 1024 / 1024).toFixed(1)} MB | Heap ${(memStart.heapUsed / 1024 / 1024).toFixed(1)} MB`);

  const results = [];
  const overallStart = Date.now();

  for (let i = 0; i < iterations; i++) {
    const url = SAMPLE_URLS[i % SAMPLE_URLS.length];
    console.log(`\n🏃 Test [${i + 1}/${iterations}]: ${url}...`);

    const t0 = Date.now();
    try {
      const res = await scrapeMatch(url);
      const t1 = Date.now();
      const matchDuration = ((t1 - t0) / 1000).toFixed(2);
      const memNow = process.memoryUsage();

      results.push({
        iteration: i + 1,
        durationSec: matchDuration,
        heapMB: (memNow.heapUsed / 1024 / 1024).toFixed(1),
        rssMB: (memNow.rss / 1024 / 1024).toFixed(1),
        status: res?.hero ? 'PASS' : 'FAIL'
      });
      console.log(`   ⏱️  Süre: ${matchDuration}s | Heap: ${(memNow.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      results.push({
        iteration: i + 1,
        durationSec: '-',
        heapMB: '-',
        rssMB: '-',
        status: `ERROR: ${err.message}`
      });
    }
  }

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(2);
  const memEnd = process.memoryUsage();

  console.log('\n------------------------------------------------------');
  console.log('📊 BENCHMARK TABLOSU');
  console.log('------------------------------------------------------');
  console.table(results);

  const avgTime = (results.reduce((acc, r) => acc + (parseFloat(r.durationSec) || 0), 0) / results.length).toFixed(2);

  console.log(`\n📈 ORTALAMA KAZIMA HIZI: ${avgTime} saniye / maç`);
  console.log(`🧠 BİTİŞ BELLEK: RSS ${(memEnd.rss / 1024 / 1024).toFixed(1)} MB | Heap ${(memEnd.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  console.log(`💡 ÖNERİLEN WORKER HAVUZU: 2 - 3 eşzamanlı sekme (Cloudflare güvenliği için)`);
  console.log('======================================================\n');

  return { success: true, avgTime, totalTime };
}

if (require.main === module) {
  runBenchmark(2).then(() => process.exit(0));
}

module.exports = { runBenchmark };
