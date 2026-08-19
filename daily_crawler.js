#!/usr/bin/env node
/**
 * ====================================================================
 * BPA V3 DAILY FOREBET CRAWLER & INGESTION CLI RUNNER
 * ====================================================================
 * Usage:
 *   node daily_crawler.js --date=2026-08-19 --concurrency=4 --save-db
 *   node daily_crawler.js --discovery-only --date=2026-08-19
 */

const { discoverDailyMatches } = require('./core/daily_discovery');
const { runCrawlPool } = require('./core/crawl_pool');

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

function printBanner() {
  console.log(`${COLORS.cyan}${COLORS.bold}`);
  console.log(`╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║           BPA V3 - FOREBET DAILY MATCH CRAWLER ENGINE            ║`);
  console.log(`║      High-Speed 4-Worker Concurrency • Dynamic Filter • MySQL     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);
}

async function main() {
  printBanner();

  const args = process.argv.slice(2);
  let dateStr = new Date().toISOString().split('T')[0]; // Default: today
  let concurrency = 4;
  let saveDb = true;
  let batchSize = 25;
  let discoveryOnly = false;
  let headless = 'new';

  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      dateStr = arg.split('=')[1].trim();
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1], 10) || 4;
    } else if (arg.startsWith('--save-db=')) {
      saveDb = arg.split('=')[1].toLowerCase() === 'true';
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || 25;
    } else if (arg === '--discovery-only') {
      discoveryOnly = true;
    } else if (arg.startsWith('--headless=')) {
      const val = arg.split('=')[1].toLowerCase();
      headless = val === 'true' || val === 'new' ? 'new' : false;
    }
  }

  console.log(`${COLORS.yellow}📅 Hedef Tarih:${COLORS.reset} ${dateStr}`);
  console.log(`${COLORS.yellow}⚡ Eşzamanlı Sekme:${COLORS.reset} ${concurrency}`);
  console.log(`${COLORS.yellow}💾 Veritabanı Kaydı:${COLORS.reset} ${saveDb ? 'AKTİF (MySQL sync_ingest)' : 'KAPALI'}\n`);

  // 1. ADIM: Keşif & Oranlı Maç Filtreleme
  console.log(`${COLORS.blue}🔍 1. AŞAMA: Günlük maçlar ve oranlar taranıyor...${COLORS.reset}`);
  const discovery = await discoverDailyMatches(dateStr, { headless });

  console.log(`\n${COLORS.green}✅ Keşif Özeti:${COLORS.reset}`);
  console.log(`  • Toplam Bulunan Maç: ${discovery.total_matches_in_list}`);
  console.log(`  • ${COLORS.bold}Oranı Olan Maç Sayısı (Kuyruk): ${discovery.quoted_count}${COLORS.reset}`);
  console.log(`  • Oransız / Elenen Maç Sayısı: ${discovery.unquoted_count}\n`);

  if (discovery.quoted_count === 0) {
    console.log(`${COLORS.yellow}⚠️ Bu tarih için geçerli oran içeren maç bulunamadı.${COLORS.reset}`);
    process.exit(0);
  }

  if (discoveryOnly) {
    console.log(`${COLORS.cyan}ℹ️ --discovery-only parametresi belirtildiği için kazıma başlatılmadı.${COLORS.reset}`);
    process.exit(0);
  }

  // 2. ADIM: 4 Sekmeli Paralel Havuz ile Kazıma & DB Ingest
  console.log(`${COLORS.blue}🚀 2. AŞAMA: 4 Sekmeli Paralel Havuz ile kazıma ve DB aktarımı başlatılıyor...${COLORS.reset}\n`);

  const results = await runCrawlPool(discovery.matches, {
    concurrency,
    batchSize,
    saveDb,
    headless,
    saveLocal: true
  });

  process.exit(results.failed > 0 && results.completed === 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\n${COLORS.red}❌ Kritik Hata: ${err.message}${COLORS.reset}`);
    process.exit(1);
  });
}

module.exports = { main };
