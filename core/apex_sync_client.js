/**
 * ====================================================================
 * BPA V3 — APEX REST SYNC CLIENT (core/apex_sync_client.js)
 * ====================================================================
 * Transmits scraped match JSON data to APEX API (import.php)
 * Supports dynamic URL & Secret Key configuration via config.json or CLI.
 * ====================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { formatMatchForIngest } = require('./db_ingester');

function loadConfig() {
  try {
    const p = path.resolve(__dirname, '../config.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {}
  return {
    apexImportUrl: 'http://localhost/apex-api/api/import.php',
    apexSecret: 'apex_secret_key_2026'
  };
}

async function syncMatchToApex(matchData, customUrl = null, customKey = null) {
  const config = loadConfig();
  const targetUrl = customUrl || process.env.APEX_IMPORT_URL || config.apexImportUrl;
  const secretKey = customKey || process.env.APEX_SECRET || config.apexSecret;

  if (!matchData) {
    throw new Error('Geçersiz maç verisi: payload boş.');
  }

  // Format into 19-table APEX payload
  const payload = formatMatchForIngest(matchData);

  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const postData = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Apex-Secret': secretKey,
          'User-Agent': 'BotV3-Golden-Master-Client/3.3.0'
        },
        timeout: 15000
      };

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              data: json,
              targetUrl
            });
          } catch (e) {
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              raw: data,
              targetUrl
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          targetUrl
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'APEX API bağlantı zaman aşımı (15s)',
          targetUrl
        });
      });

      req.write(postData);
      req.end();
    } catch (err) {
      resolve({
        success: false,
        error: `Geçersiz APEX URL: ${err.message}`,
        targetUrl
      });
    }
  });
}

module.exports = { syncMatchToApex, loadConfig };
