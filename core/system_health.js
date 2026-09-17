/**
 * ====================================================================
 * BPA V4 / SYSTEM HEALTH & INTEGRITY RADAR (core/system_health.js)
 * ====================================================================
 * Diagnoses file integrity, live APEX API connectivity, Cloudflare
 * cookie validity, Windows scheduler status, and storage usage.
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

const CRITICAL_FILES = [
  { name: 'Puppeteer Stealth Tarayıcı Motoru', path: 'core/browser_engine.js', role: 'Cloudflare Bypass' },
  { name: 'APEX HTTP Uploader (50-Chunk)', path: 'core/apex_uploader.js', role: 'REST API İletimi' },
  { name: 'Eşzamanlı Worker Havuzu', path: 'core/crawl_pool.js', role: 'Worker Pool' },
  { name: 'Günlük Maç Keşif Motoru', path: 'core/daily_discovery.js', role: 'Match Discovery' },
  { name: 'Zamanlayıcı Yöneticisi', path: 'core/scheduler_manager.js', role: 'Windows Task Scheduler' },
  { name: 'Görev Yöneticisi & Acil Fren', path: 'core/task_monitor.js', role: 'Süreç Takip' },
  { name: 'Hero Skor & İhtimal Parser', path: 'parsers/parse_hero.js', role: 'Hero Parser' },
  { name: '9 Market & Oran Parser', path: 'parsers/parse_markets.js', role: 'Tahmin & Oranlar' },
  { name: 'H2H Karşılaştırma Parser', path: 'parsers/parse_h2h_intro.js', role: 'H2H Analiz' },
  { name: 'Puan Durumu Parser', path: 'parsers/parse_standings.js', role: 'Standings Parser' },
  { name: 'Takım Genel İstatistikleri', path: 'parsers/parse_overall_stats.js', role: 'Overall Stats' },
  { name: '1:1 HTML Match Viewer', path: 'viewer/generate_viewer.js', role: 'Canlı Arayüz Üretici' },
  { name: 'Sistem Konfigürasyonu', path: 'config.json', role: 'Genel Ayarlar' },
  { name: 'Forebet Turnstile Çerezi', path: 'data/cf_cookies_cache.json', role: 'Cloudflare Oturumu' }
];

/**
 * Pings APEX API endpoint and measures latency.
 */
function pingApexApi(url, secret) {
  return new Promise((resolve) => {
    const targetUrl = url || 'https://apex-api.playbettingtips.com/api/import.php';
    const client = targetUrl.startsWith('https') ? https : http;
    const start = Date.now();

    const payload = JSON.stringify({
      bot_type: 'ping_health',
      matches: []
    });

    try {
      const u = new URL(targetUrl);
      const req = client.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Apex-Secret': secret || 'apex_secret_key_2026'
        },
        timeout: 5000
      }, (res) => {
        const latencyMs = Date.now() - start;
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          // Status 200 veya 400 (boş matches dizisi nedeniyle) API'nin ayakta olduğunu gösterir
          const isOnline = res.statusCode === 200 || res.statusCode === 400;
          const isAuthOk = res.statusCode !== 401 && res.statusCode !== 403;
          resolve({
            online: isOnline,
            authorized: isAuthOk,
            statusCode: res.statusCode,
            latencyMs,
            targetUrl,
            message: isAuthOk ? (isOnline ? 'Bağlantı Aktif & Doğrulandı' : `HTTP ${res.statusCode}`) : 'Yetkilendirme Hatası (Secret Key Hatalı)'
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          online: false,
          authorized: false,
          statusCode: 0,
          latencyMs: Date.now() - start,
          targetUrl,
          message: `Bağlantı Hatası: ${err.message}`
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          online: false,
          authorized: false,
          statusCode: 408,
          latencyMs: 5000,
          targetUrl,
          message: 'Zaman Aşımı (Timeout > 5s)'
        });
      });

      req.write(payload);
      req.end();
    } catch (e) {
      resolve({
        online: false,
        authorized: false,
        statusCode: 0,
        latencyMs: 0,
        targetUrl,
        message: `Geçersiz URL: ${e.message}`
      });
    }
  });
}

/**
 * Checks integrity of critical codebase files.
 */
function checkFileIntegrity() {
  const fileResults = [];
  let totalFiles = CRITICAL_FILES.length;
  let intactCount = 0;

  for (const item of CRITICAL_FILES) {
    const fullPath = path.join(ROOT_DIR, item.path);
    const exists = fs.existsSync(fullPath);
    let sizeKb = 0;
    let modifiedTime = '-';

    if (exists) {
      try {
        const stats = fs.statSync(fullPath);
        sizeKb = (stats.size / 1024).toFixed(1);
        modifiedTime = stats.mtime.toLocaleDateString('tr-TR') + ' ' + stats.mtime.toLocaleTimeString('tr-TR');
        intactCount++;
      } catch (_) {}
    }

    fileResults.push({
      name: item.name,
      relPath: item.path,
      role: item.role,
      exists,
      sizeKb,
      modifiedTime,
      status: exists ? 'ok' : 'missing'
    });
  }

  const score = Math.round((intactCount / totalFiles) * 100);
  return {
    score,
    intactCount,
    totalFiles,
    files: fileResults
  };
}

/**
 * Checks Forebet Cloudflare cookies status.
 */
function checkCookieStatus() {
  const cookiePath = path.join(ROOT_DIR, 'data', 'cf_cookies_cache.json');
  if (!fs.existsSync(cookiePath)) {
    return {
      exists: false,
      ageHours: 0,
      ageDays: 0,
      cookieCount: 0,
      status: 'missing',
      message: 'Çerez dosyası bulunamadı. İlk kazımada otomatik üretilecek.'
    };
  }

  try {
    const stats = fs.statSync(cookiePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
    const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);

    const data = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const count = Array.isArray(data) ? data.length : 0;

    let status = 'valid';
    let message = 'Çerez Aktif & Geçerli';

    // 7 gün üzeri ise uyarı ver
    if (parseFloat(ageDays) > 7) {
      status = 'warning';
      message = 'Çerez 7 günden eski. Yenilenmesi önerilir.';
    }

    return {
      exists: true,
      ageHours: parseFloat(ageHours),
      ageDays: parseFloat(ageDays),
      cookieCount: count,
      status,
      message
    };
  } catch (err) {
    return {
      exists: true,
      ageHours: 0,
      ageDays: 0,
      cookieCount: 0,
      status: 'corrupt',
      message: 'Çerez dosyası bozuk: ' + err.message
    };
  }
}

/**
 * Checks Windows Task Scheduler registration.
 */
function checkSchedulerStatus() {
  if (process.platform !== 'win32') {
    return { supported: false, morning: { active: false }, evening: { active: false } };
  }

  let morningActive = false;
  let eveningActive = false;
  let morningNextRun = '-';
  let eveningNextRun = '-';

  try {
    const outM = execSync('schtasks /query /tn "BPA_Bot_Morning" /fo CSV /nh 2>nul', { encoding: 'utf-8' });
    if (outM.includes('BPA_Bot_Morning')) {
      morningActive = true;
      const parts = outM.split(',');
      if (parts[1]) morningNextRun = parts[1].replace(/"/g, '').trim();
    }
  } catch (_) {}

  try {
    const outE = execSync('schtasks /query /tn "BPA_Bot_Evening" /fo CSV /nh 2>nul', { encoding: 'utf-8' });
    if (outE.includes('BPA_Bot_Evening')) {
      eveningActive = true;
      const parts = outE.split(',');
      if (parts[1]) eveningNextRun = parts[1].replace(/"/g, '').trim();
    }
  } catch (_) {}

  return {
    supported: true,
    morning: { active: morningActive, nextRun: morningNextRun },
    evening: { active: eveningActive, nextRun: eveningNextRun }
  };
}

/**
 * Master Health Evaluation.
 */
async function getCompleteSystemHealth(config = {}) {
  const integrity = checkFileIntegrity();
  const cookies = checkCookieStatus();
  const scheduler = checkSchedulerStatus();
  const apex = await pingApexApi(config.apexImportUrl, config.apexSecret);

  // Genel Sağlık Puanı (0 - 100)
  let overallHealth = 100;
  if (integrity.score < 100) overallHealth -= (100 - integrity.score) * 0.4;
  if (!apex.online) overallHealth -= 30;
  else if (!apex.authorized) overallHealth -= 20;
  if (!cookies.exists) overallHealth -= 15;
  else if (cookies.status === 'warning') overallHealth -= 5;
  if (!scheduler.morning.active || !scheduler.evening.active) overallHealth -= 10;

  overallHealth = Math.max(10, Math.round(overallHealth));

  return {
    timestamp: new Date().toISOString(),
    overallScore: overallHealth,
    statusText: overallHealth >= 90 ? '🟢 MÜKEMMEL' : (overallHealth >= 70 ? '🟡 İYİ' : '🔴 DİKKAT GEREKİYOR'),
    integrity,
    apex,
    cookies,
    scheduler,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeHours: (process.uptime() / 3600).toFixed(2),
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      memoryHeapMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
    }
  };
}

module.exports = {
  checkFileIntegrity,
  pingApexApi,
  checkCookieStatus,
  checkSchedulerStatus,
  getCompleteSystemHealth
};
