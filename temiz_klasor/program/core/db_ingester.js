/**
 * ====================================================================
 * BPA V3 - DATABASE INGESTER & DUAL-SYNC PIPELINE
 * ====================================================================
 * Formats scraped match records and ingests them into BPA V3 MySQL
 * via /api/sync_ingest.php or direct PDO connection with zero data loss.
 */

const http = require('http');
const https = require('https');

const API_ENDPOINT = process.env.APEX_IMPORT_URL || process.env.BPA_SYNC_URL || 'http://localhost/apex-api/api/import.php';
const API_SECRET = process.env.APEX_SECRET || process.env.BPA_SECRET || 'apex_secret_key_2026';

/**
 * Transforms rich scraped match data + listing metadata into the exact format
 * expected by sync_ingest.php.
 */
function formatMatchForIngest(matchData, listingMeta = {}) {
  const hero = { ...(matchData.hero || {}) };
  if (!hero.homeTeam && listingMeta.home_team) hero.homeTeam = listingMeta.home_team;
  if (!hero.awayTeam && listingMeta.away_team) hero.awayTeam = listingMeta.away_team;
  if (!hero.league && listingMeta.league?.name_hint) hero.league = listingMeta.league.name_hint;
  if (!hero.leagueFlag && listingMeta.league?.flag_url) hero.leagueFlag = listingMeta.league.flag_url;
  if (!hero.leagueShort && listingMeta.league?.short_tag) hero.leagueShort = listingMeta.league.short_tag;

  return {
    ...matchData,
    hero,
    raw_bot_json: matchData
  };
}

/**
 * Sends a batch of matches to the BPA V3 sync_ingest API.
 * @param {Array} matchesArray Array of formatted match objects
 * @param {Object} [options] Ingestion options
 * @returns {Promise<Object>} API response
 */
async function sendBatchToDatabase(matchesArray, options = {}) {
  const logger = options.logger || console.log;
  const url = options.endpoint || API_ENDPOINT;
  const secret = options.secret || API_SECRET;

  if (!matchesArray || matchesArray.length === 0) {
    return { success: true, count: 0, message: 'Gönderilecek maç yok.' };
  }

  const payload = JSON.stringify({ matches: matchesArray });
  const urlObj = new URL(url);

  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-Apex-Secret': secret,
      'X-BPA-Secret': secret
    },
    timeout: 30000
  };

  const client = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`API Hatası [${res.statusCode}]: ${json.error || responseBody}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, raw: responseBody });
          } else {
            reject(new Error(`API Yanıt Ayrıştırma Hatası [${res.statusCode}]: ${responseBody}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`DB Bağlantı Hatası: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`DB İstek Zaman Aşımı (Timeout - 30s)`));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  formatMatchForIngest,
  sendBatchToDatabase
};
