/**
 * ====================================================================
 * BPA V4 / APEX SYNC — MASTER APEX API UPLOADER (core/apex_uploader.js)
 * ====================================================================
 * Sends scraped match data to the live APEX API in batches of 50 matches.
 * 
 * Target: https://apex-api.playbettingtips.com/api/import.php
 * Method: POST
 * Headers: Content-Type: application/json, X-Apex-Secret: <SECRET>
 * Batching: Chunks of 50 matches (sequential for...of with await)
 * Retry: 3 attempts with 5-second backoff on 5xx or network errors
 * Local Tampon: Saves failed batches to data/sync_failed_<date>.json
 * ====================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { formatMatchForIngest } = require('./db_ingester');

function getApexConfig() {
  let cfg = {
    apexImportUrl: 'https://apex-api.playbettingtips.com/api/import.php',
    apexSecret: 'apex_secret_key_2026',
    autoSyncApex: true
  };

  const configPath = path.resolve(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    try {
      cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(configPath, 'utf-8')));
    } catch (_) {}
  }

  const localPath = path.resolve(__dirname, '../bpa_local_config.json');
  if (fs.existsSync(localPath)) {
    try {
      cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(localPath, 'utf-8')));
    } catch (_) {}
  }

  return cfg;
}

/**
 * Sends a single chunk of matches to APEX API via HTTPS/HTTP POST.
 */
function sendSingleChunk(payload, options = {}) {
  const endpoint = options.endpoint || 'https://apex-api.playbettingtips.com/api/import.php';
  const secret = options.secret || 'apex_secret_key_2026';
  const timeoutMs = options.timeoutMs || 45000;

  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(endpoint);
      const postBody = JSON.stringify(payload);

      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postBody),
          'X-Apex-Secret': secret,
          'User-Agent': 'BPA-V4-Forebet-Uploader/4.0.0'
        },
        timeout: timeoutMs
      };

      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(reqOptions, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(resData); } catch (_) {}

          resolve({
            statusCode: res.statusCode,
            success: res.statusCode >= 200 && res.statusCode < 300,
            data: parsed,
            raw: resData,
            bodySnippet: resData ? resData.slice(0, 150) : ''
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`APEX API zaman aşımına uğradı (${timeoutMs / 1000}s)`));
      });

      req.write(postBody);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Uploads an array of match objects to APEX in sequential chunks of 50.
 * 
 * @param {Array} matches Array of scraped match objects
 * @param {Object} [options]
 * @param {string} [options.endpoint] APEX API URL
 * @param {string} [options.secret] X-Apex-Secret key
 * @param {number} [options.chunkSize=50] Batch size
 * @param {number} [options.maxRetries=3] Max retries per chunk
 * @param {number} [options.retryDelayMs=5000] Delay before retry (ms)
 * @param {Function} [options.logger] Logger function
 * @param {string} [options.dateStr] Optional date label (YYYY-MM-DD)
 * @returns {Promise<Object>} Summary of upload result
 */
async function uploadMatchesToApex(matches, options = {}) {
  const cfg = getApexConfig();
  const endpoint = options.endpoint || process.env.APEX_IMPORT_URL || cfg.apexImportUrl;
  const secret = options.secret || process.env.APEX_SECRET || cfg.apexSecret;
  const chunkSize = options.chunkSize || 50;
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
  const retryDelayMs = options.retryDelayMs !== undefined ? options.retryDelayMs : 5000;
  const logger = options.logger || console.log;
  const dateLabel = options.dateStr || new Date().toISOString().split('T')[0];

  if (!Array.isArray(matches) || matches.length === 0) {
    logger(`ℹ️ [APEX Sync] Gönderilecek maç bulunamadı (Liste boş).`);
    return { success: true, totalMatches: 0, sentMatches: 0, totalChunks: 0, failedChunks: 0 };
  }

  // Maçları APEX beklenen formatına zenginleştir
  const formattedMatches = matches.map(m => formatMatchForIngest(m));
  const totalMatches = formattedMatches.length;
  const totalChunks = Math.ceil(totalMatches / chunkSize);

  logger(`\n📡 [APEX API SENKRONİZASYONU BAŞLATILDI]`);
  logger(`   🌐 Hedef URL    : ${endpoint}`);
  logger(`   🎯 Toplam Maç   : ${totalMatches} maç`);
  logger(`   📦 Paketleme    : ${totalChunks} paket (${chunkSize}'şerli gruplar)`);
  logger(`   🔑 Kimlik Doğr. : X-Apex-Secret (Aktif)\n`);

  let totalUploaded = 0;
  const failedBatches = [];
  const startTime = Date.now();

  for (let i = 0; i < totalMatches; i += chunkSize) {
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    const chunk = formattedMatches.slice(i, i + chunkSize);
    const startIdx = i + 1;
    const endIdx = Math.min(i + chunkSize, totalMatches);

    const payload = {
      bot_type: options.botType || 'forebet_football',
      sport_type: options.sportType || 'football',
      batch_info: {
        date: dateLabel,
        chunk: chunkIndex,
        total_chunks: totalChunks,
        chunk_size: chunk.length,
        total_matches: totalMatches
      },
      matches: chunk
    };

    let chunkSuccess = false;
    let attempts = 0;
    let lastErrorMsg = '';

    while (attempts < maxRetries && !chunkSuccess) {
      attempts++;
      try {
        const res = await sendSingleChunk(payload, {
          endpoint,
          secret,
          timeoutMs: 40000
        });

        if (res.success) {
          chunkSuccess = true;
          totalUploaded += chunk.length;
          const pct = Math.round((totalUploaded / totalMatches) * 100);
          logger(`  ✅ [Paket ${chunkIndex}/${totalChunks}] ${chunk.length} Maç Aktarıldı (#${startIdx}-${endIdx}) -> HTTP ${res.statusCode} (%${pct})`);
        } else {
          lastErrorMsg = `HTTP ${res.statusCode}: ${res.bodySnippet || 'Bilinmeyen Hata'}`;
          logger(`  ⚠️ [Paket ${chunkIndex}/${totalChunks}] Sunucu Hatası (${lastErrorMsg}) - Deneme ${attempts}/${maxRetries}...`);
          if (attempts < maxRetries) {
            await new Promise(r => setTimeout(r, retryDelayMs));
          }
        }
      } catch (netErr) {
        lastErrorMsg = netErr.message;
        logger(`  ⚠️ [Paket ${chunkIndex}/${totalChunks}] Ağ/Bağlantı Hatası (${netErr.message}) - Deneme ${attempts}/${maxRetries}...`);
        if (attempts < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelayMs));
        }
      }
    }

    if (!chunkSuccess) {
      logger(`  ❌ [Paket ${chunkIndex}/${totalChunks}] ${maxRetries} deneme sonucunda BAŞARISIZ OLDU: ${lastErrorMsg}`);
      failedBatches.push({
        chunkIndex,
        startIdx,
        endIdx,
        error: lastErrorMsg,
        matches: chunk
      });
    }

    // Paketler arası kısa soluklanma (50ms)
    await new Promise(r => setTimeout(r, 50));
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Başarısız paket varsa yerel tampon dosyasına kaydet (sıfır veri kaybı garantisi)
  if (failedBatches.length > 0) {
    try {
      const dataDir = path.resolve(__dirname, '../data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const failPath = path.join(dataDir, `sync_failed_${dateLabel}.json`);
      fs.writeFileSync(failPath, JSON.stringify(failedBatches, null, 2), 'utf-8');
      logger(`⚠️ [TAMBUR YEDEĞİ] Aktarılamayan ${failedBatches.length} paket yerel tampona kaydedildi: ${failPath}`);
    } catch (_) {}
  }

  const isFullSuccess = failedBatches.length === 0;

  logger(`\n${isFullSuccess ? '🎉' : '⚠️'} [APEX SENKRONİZASYON SONUCU]`);
  logger(`   ✅ Başarıyla Gönderilen : ${totalUploaded} / ${totalMatches} maç`);
  logger(`   ❌ Başarısız Paket     : ${failedBatches.length} / ${totalChunks}`);
  logger(`   ⏱️ Toplam Süre          : ${durationSec} sn\n`);

  return {
    success: isFullSuccess,
    totalMatches,
    sentMatches: totalUploaded,
    totalChunks,
    failedChunks: failedBatches.length,
    durationSec
  };
}

/**
 * Quick diagnostic ping to check APEX API endpoint connectivity.
 */
async function testApexConnection(customEndpoint = null, customSecret = null) {
  const cfg = getApexConfig();
  const endpoint = customEndpoint || cfg.apexImportUrl;
  const secret = customSecret || cfg.apexSecret;

  const testPayload = {
    bot_type: 'forebet_football',
    sport_type: 'football',
    test_ping: true,
    matches: []
  };

  try {
    const res = await sendSingleChunk(testPayload, { endpoint, secret, timeoutMs: 10000 });
    return {
      connected: true,
      statusCode: res.statusCode,
      endpoint,
      response: res.bodySnippet
    };
  } catch (err) {
    return {
      connected: false,
      endpoint,
      error: err.message
    };
  }
}

module.exports = {
  uploadMatchesToApex,
  sendSingleChunk,
  testApexConnection,
  getApexConfig
};
