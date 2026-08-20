#!/usr/bin/env node
/**
 * ====================================================================
 * BPA V3 — MASTER BATCH & DAILY CRAWLER ENGINE (daily_crawler.js)
 * ====================================================================
 * Automatically crawls matches for today, yesterday, tomorrow, or any date.
 * Features:
 * - Scrapes 100% of data (Hero, 9 Markets, Extended Odds, Match Center, Distance, FDR, H2H, Standings, Injuries)
 * - Directly pushes parsed matches to APEX REST API (/api/import.php)
 * - Generates individual HTML Match Viewers (1:1 Forebet Desktop UI)
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { discoverDailyMatches } = require('./core/daily_discovery');
const { scrapeMatch } = require('./scrape_match');
const { loadConfig } = require('./core/apex_sync_client');

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
  console.log(`╔══════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║          BPA V3 — MASTER AUTOMATED CRAWLER & APEX SYNC ENGINE            ║`);
  console.log(`║             v3.3.0-GOLDEN-MASTER • Zero-Mock • Live REST POST            ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);
}

function parseDateInput(input) {
  const today = new Date();
  if (!input || input === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (input === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return y.toISOString().split('T')[0];
  }
  if (input === 'tomorrow') {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }
  return input;
}

async function runBatchCrawler() {
  printBanner();

  const cfg = loadConfig();
  const args = process.argv.slice(2);

  let dateArg = 'today';
  let limit = null;
  let concurrency = cfg.concurrency || 2;
  let syncApex = cfg.autoSyncApex !== undefined ? cfg.autoSyncApex : true;
  let apiUrl = cfg.apexImportUrl;
  let apiKey = cfg.apexSecret;
  let headless = cfg.headless || 'new';

  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      dateArg = arg.split('=')[1].trim();
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1], 10) || 2;
    } else if (arg.startsWith('--sync-apex=')) {
      syncApex = arg.split('=')[1].toLowerCase() === 'true';
    } else if (arg.startsWith('--api-url=')) {
      apiUrl = arg.split('=')[1].trim();
    } else if (arg.startsWith('--api-key=')) {
      apiKey = arg.split('=')[1].trim();
    } else if (arg.startsWith('--headless=')) {
      const val = arg.split('=')[1].toLowerCase();
      headless = val === 'true' || val === 'new' ? 'new' : false;
    }
  }

  const dateStr = parseDateInput(dateArg);

  console.log(`${COLORS.yellow}📅 Hedef Tarih:${COLORS.reset} ${dateStr} (${dateArg})`);
  console.log(`${COLORS.yellow}🎯 Limit:${COLORS.reset} ${limit ? limit + ' maç' : 'Tüm maçlar'}`);
  console.log(`${COLORS.yellow}⚡ Eşzamanlı Sekme:${COLORS.reset} ${concurrency}`);
  console.log(`${COLORS.yellow}🌐 APEX API Hedefi:${COLORS.reset} ${syncApex ? apiUrl : 'KAPALI'}\n`);

  // 1. ADIM: Günlük Maçları Keşfet
  console.log(`${COLORS.blue}🔍 1. AŞAMA: Forebet bülteni taranıyor...${COLORS.reset}`);
  const discovery = await discoverDailyMatches(dateStr, { headless });

  let matches = discovery.matches || [];
  console.log(`\n${COLORS.green}✅ Keşif Tamamlandı:${COLORS.reset}`);
  console.log(`  • Toplam Bulunan Maç: ${discovery.total_matches_in_list}`);
  console.log(`  • ${COLORS.bold}Oranı Olan / İşlenebilir Maç Sayısı: ${matches.length}${COLORS.reset}\n`);

  if (matches.length === 0) {
    console.log(`${COLORS.yellow}⚠️ Bu tarih için işlenecek maç bulunamadı.${COLORS.reset}`);
    return;
  }

  if (limit && limit > 0) {
    matches = matches.slice(0, limit);
    console.log(`${COLORS.cyan}ℹ️ Limit uygulandı: İlk ${matches.length} maç işlenecek.${COLORS.reset}\n`);
  }

  // 2. ADIM: Maçları Sırayla Kazı ve APEX'e Gönder
  console.log(`${COLORS.blue}🚀 2. AŞAMA: Detaylı kazıma ve APEX senkronizasyonu başlatılıyor...${COLORS.reset}\n`);

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const matchUrl = m.url || m.link;
    const teamTitle = m.homeTeam && m.awayTeam ? `${m.homeTeam} vs ${m.awayTeam}` : (m.teams || `Maç #${i + 1}`);

    console.log(`\n────────────────────────────────────────────────────────────────────────`);
    console.log(`${COLORS.bold}[${i + 1}/${matches.length}] ${teamTitle}${COLORS.reset}`);
    console.log(`${COLORS.cyan}🔗 URL: ${matchUrl}${COLORS.reset}`);

    try {
      const res = await scrapeMatch(matchUrl, {
        headless,
        syncApex,
        apiUrl,
        apiKey
      });

      if (res && res.success) {
        successCount++;
        console.log(`${COLORS.green}✅ [${i + 1}/${matches.length}] BAŞARILI! (JSON & Viewer Hazır)${COLORS.reset}`);
      } else {
        failCount++;
        console.log(`${COLORS.red}❌ [${i + 1}/${matches.length}] BAŞARISIZ!${COLORS.reset}`);
      }
    } catch (err) {
      failCount++;
      console.log(`${COLORS.red}❌ [${i + 1}/${matches.length}] HATA: ${err.message}${COLORS.reset}`);
    }

    // Kısa nefes alma aralığı (Cloudflare koruması)
    if (i < matches.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════════════════════════════════════════`);
  console.log(`${COLORS.bold}🏁 BATCH KAZIMA RAPORU${COLORS.reset}`);
  console.log(`  • Toplam İşlenen: ${matches.length}`);
  console.log(`  • ${COLORS.green}✅ Başarılı: ${successCount}${COLORS.reset}`);
  console.log(`  • ${failCount > 0 ? COLORS.red : COLORS.yellow}❌ Hatalı / Atlanan: ${failCount}${COLORS.reset}`);
  console.log(`  • ⏱️ Toplam Süre: ${durationSec} saniye`);
  console.log(`══════════════════════════════════════════════════════════════════════════\n`);
}

if (require.main === module) {
  runBatchCrawler().catch(err => {
    console.error(`\n${COLORS.red}❌ Kritik Batch Hatası: ${err.message}${COLORS.reset}`);
    process.exit(1);
  });
}

module.exports = { runBatchCrawler };
