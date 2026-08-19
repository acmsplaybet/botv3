#!/usr/bin/env node
/**
 * ====================================================================
 * BPA V3 DATE-RANGE HISTORICAL CRAWLER & ARCHIVER
 * ====================================================================
 * Usage:
 *   node date_range_crawler.js --days=30 --concurrency=4
 *   node date_range_crawler.js --start-date=2026-07-20 --end-date=2026-08-19
 */

const fs = require('fs');
const path = require('path');
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

function getDatesArray(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

async function main() {
  console.log(`${COLORS.cyan}${COLORS.bold}`);
  console.log(`╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║      BPA V3 - GEÇMİŞ TARİH ARALIĞI ARŞİVLEME MOTORU (30 GÜN)     ║`);
  console.log(`║      4 Sekmeli Havuz • Otomatik Resume (Kaldığı Yerden Devam)    ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  const args = process.argv.slice(2);
  let days = 30;
  let concurrency = 4;
  let saveDb = false; // PC'ye kaydet
  let startDate = null;
  let endDate = new Date().toISOString().split('T')[0];

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1], 10) || 30;
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1], 10) || 4;
    } else if (arg.startsWith('--save-db=')) {
      saveDb = arg.split('=')[1].toLowerCase() === 'true';
    } else if (arg.startsWith('--start-date=')) {
      startDate = arg.split('=')[1].trim();
    } else if (arg.startsWith('--end-date=')) {
      endDate = arg.split('=')[1].trim();
    }
  }

  if (!startDate) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    startDate = d.toISOString().split('T')[0];
  }

  const dateList = getDatesArray(startDate, endDate);
  const archiveBaseDir = path.join(__dirname, 'archive');
  if (!fs.existsSync(archiveBaseDir)) {
    fs.mkdirSync(archiveBaseDir, { recursive: true });
  }

  console.log(`${COLORS.yellow}📅 Başlangıç Tarihi:${COLORS.reset} ${startDate}`);
  console.log(`${COLORS.yellow}📅 Bitiş Tarihi:${COLORS.reset} ${endDate}`);
  console.log(`${COLORS.yellow}📊 Toplam Taranacak Gün:${COLORS.reset} ${dateList.length} Gün`);
  console.log(`${COLORS.yellow}⚡ Eşzamanlı Sekme:${COLORS.reset} ${concurrency}`);
  console.log(`${COLORS.yellow}💾 Arşiv Dizini:${COLORS.reset} ${archiveBaseDir}\n`);

  let grandTotalMatches = 0;
  let grandCompletedMatches = 0;
  const startTime = Date.now();

  for (let i = 0; i < dateList.length; i++) {
    const targetDate = dateList[i];
    const dayDir = path.join(archiveBaseDir, targetDate);
    const summaryPath = path.join(dayDir, 'summary.json');

    console.log(`${COLORS.blue}${COLORS.bold}═════════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.blue}🗓️ [${i + 1}/${dateList.length}] GÜN: ${targetDate}${COLORS.reset}`);

    // RESUME CHECK: Eğer bu gün daha önce taranmışsa atla
    if (fs.existsSync(summaryPath)) {
      try {
        const sum = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        if (sum.status === 'completed') {
          console.log(`${COLORS.green}⏩ Bu gün daha önce başarıyla taranmış (${sum.completed} maç). Atlanıyor...${COLORS.reset}`);
          grandCompletedMatches += sum.completed || 0;
          continue;
        }
      } catch (e) {}
    }

    if (!fs.existsSync(dayDir)) {
      fs.mkdirSync(dayDir, { recursive: true });
    }

    // 1. Keşif
    try {
      const discovery = await discoverDailyMatches(targetDate, { headless: 'new' });
      console.log(`  • Bulunan Oranlı Maç: ${discovery.quoted_count}`);

      if (discovery.quoted_count === 0) {
        fs.writeFileSync(summaryPath, JSON.stringify({ date: targetDate, status: 'completed', total: 0, completed: 0 }), 'utf8');
        continue;
      }

      grandTotalMatches += discovery.quoted_count;

      // 2. Havuz Kazıma
      const results = await runCrawlPool(discovery.matches, {
        concurrency,
        saveDb,
        saveLocal: true,
        headless: 'new'
      });

      grandCompletedMatches += results.completed;

      // Günlük Özeti Kaydet
      fs.writeFileSync(summaryPath, JSON.stringify({
        date: targetDate,
        status: 'completed',
        total: discovery.quoted_count,
        completed: results.completed,
        failed: results.failed,
        durationSeconds: results.durationSeconds,
        scrapedAt: new Date().toISOString()
      }, null, 2), 'utf8');

      console.log(`${COLORS.green}✅ ${targetDate} tamamlandı (${results.completed}/${discovery.quoted_count} maç).${COLORS.reset}`);

    } catch (dayErr) {
      console.error(`${COLORS.red}❌ ${targetDate} gününde hata oluştu: ${dayErr.message}${COLORS.reset}`);
    }
  }

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${COLORS.green}${COLORS.bold}╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║          🎉 TÜM TARİH ARALIĞI ARŞİVLEMESİ TAMAMLANDI!            ║`);
  console.log(`║  Toplam Gün: ${dateList.length} | Kazınan Maç: ${grandCompletedMatches} | Süre: ${totalTimeSec} sn   ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
