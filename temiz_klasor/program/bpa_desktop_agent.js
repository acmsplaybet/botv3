/**
 * ====================================================================
 * BPA V3 / APEX-BOT DESKTOP AGENT & AUTOMATION SERVER (ENTERPRISE)
 * ====================================================================
 * Combines ultra-fast multi-worker crawling with APEX-BOT SPA Dashboard.
 * Serves port 3000 with live SSE stream & REST APIs.
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, spawn } = require('child_process');

const PORT = 3000;

// Configuration
let CONFIG = {
  webApiUrl: 'https://realmobilebet.com/bpav3/api/sync_ingest.php',
  localApiUrl: 'http://localhost/apex-api/api/import.php',
  apiToken: 'BPA_g7wXmi9oa32slLeb',
  maxProcessExecutionMinutes: 45 // Watchdog kill timer
};

try {
  const cPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(cPath)) {
    const userCfg = JSON.parse(fs.readFileSync(cPath, 'utf8'));
    if (userCfg.apexImportUrl) CONFIG.localApiUrl = userCfg.apexImportUrl;
    if (userCfg.apexSecret) CONFIG.apiToken = userCfg.apexSecret;
  }
} catch (_) {}

let activeProcess = null;
let activeProcessStartTime = null;
let activeTargetMode = null;
let liveLogs = [];
let sseClients = [];
let workerStates = {};

let localConfig = {
  automation_active: true,
  cron_yesterday: '06:00',
  cron_today: '10:00',
  cron_tomorrow: '18:00',
  scrape_detailed_stats: true,
  auto_reload_broken_logos: true,
  concurrency: 4
};

const lastTriggered = {
  yesterday: null,
  today: null,
  tomorrow: null
};

// Load saved local config if exists
const localCfgFile = path.join(__dirname, 'bpa_local_config.json');
if (fs.existsSync(localCfgFile)) {
  try {
    localConfig = Object.assign(localConfig, JSON.parse(fs.readFileSync(localCfgFile, 'utf-8')));
  } catch (e) {}
}

function saveLocalConfig() {
  try {
    fs.writeFileSync(localCfgFile, JSON.stringify(localConfig, null, 2), 'utf-8');
  } catch (e) {}
}

const ANSI_COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  white: "\x1b[37m"
};

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch (_) {}
  });
}

function logAgent(msg) {
  const time = new Date().toLocaleTimeString();
  const formattedMsg = `[${time}] ${msg}`;
  
  let color = ANSI_COLORS.white;
  let type = 'info';
  if (msg.includes('✅') || msg.includes('BAŞARILI') || msg.includes('🎉')) {
    color = ANSI_COLORS.green;
    type = 'success';
  } else if (msg.includes('⚠️') || msg.includes('⏰') || msg.includes('🛡️')) {
    color = ANSI_COLORS.yellow;
    type = 'warning';
  } else if (msg.includes('❌') || msg.includes('HATA') || msg.includes('⛔') || msg.includes('DURDUR')) {
    color = ANSI_COLORS.red;
    type = 'error';
  } else if (msg.includes('⚡') || msg.includes('📡') || msg.includes('BAŞLATILDI') || msg.includes('🚀')) {
    color = ANSI_COLORS.cyan;
    type = 'info';
  }

  console.log(color + formattedMsg + ANSI_COLORS.reset);
  
  const cleanMsg = msg.replace(/\x1B\[\d+m/g, '');
  liveLogs.push(`[${time}] ${cleanMsg}`);
  if (liveLogs.length > 600) liveLogs.shift();

  // SSE canlı log akışı
  broadcastSSE('log', {
    event: 'log',
    timeFormatted: time,
    timestamp: time,
    message: cleanMsg,
    type: type
  });

  // Sekme durumunu ayrıştır (Örn: [Sekme 2] [5/776] ✅ ID:2464948 | Oeste U20 vs União São João)
  const workerMatch = cleanMsg.match(/\[Sekme\s*#?(\d+)\]\s*(?:\[\d+\/\d+\]\s*)?(?:✅|⚠️)?\s*(?:ID:\d+\s*\|\s*)?([^(\n]+)/i);
  if (workerMatch) {
    const wId = parseInt(workerMatch[1], 10);
    const title = workerMatch[2].trim();
    workerStates[wId] = title;
    broadcastSSE('worker_update', { event: 'worker_update', workerStates });
  }

  try {
    fs.appendFileSync(path.join(__dirname, 'agent_activity.log'), `[${new Date().toISOString()}] ${cleanMsg}\n`, 'utf-8');
  } catch (e) {}
}

// Send scraped data package to Web Site API (Chunked High-Speed Uploader)
async function syncMatchesToWebServer(targetKey, matches) {
  if (!matches || !matches.length) return;
  const safeLabel = String(targetKey || 'TODAY').toUpperCase();
  const totalMatches = matches.length;

  const https = require('https');
  const http = require('http');

  let dateStr = new Date().toISOString().split('T')[0];
  if (targetKey === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = d.toISOString().split('T')[0];
  } else if (targetKey === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    dateStr = d.toISOString().split('T')[0];
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(targetKey)) {
    dateStr = targetKey;
  }

  // Split into chunks of 50
  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < totalMatches; i += chunkSize) {
    chunks.push(matches.slice(i, i + chunkSize));
  }

  logAgent(`📡 Canlı Sunucuya Aktarım Başlatılıyor (${safeLabel}: ${totalMatches} Maç, ${chunks.length} Paket)...`);

  const sendSingleChunk = (targetUrlStr, chunk) => {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(targetUrlStr);
        const client = parsed.protocol === 'https:' ? https : http;
        const payloadStr = JSON.stringify({ date: dateStr, matches: chunk });

        const req = client.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadStr),
            'X-Apex-Secret': CONFIG.apiToken,
            'X-BPA-Secret': CONFIG.apiToken,
            'User-Agent': 'APEX-BOT-Agent/3.0'
          },
          timeout: 45000
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            try {
              resolve({ ok: res.statusCode === 200, data: JSON.parse(body) });
            } catch (e) {
              resolve({ ok: res.statusCode === 200, raw: body });
            }
          });
        });

        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Zaman aşımı' }); });

        req.write(payloadStr);
        req.end();
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  };

  // 1. Canlı Sunucuya Paketler Halinde Gönder
  let liveSuccessCount = 0;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const res = await sendSingleChunk(CONFIG.webApiUrl, chunk);
    if (res.ok && res.data?.success) {
      liveSuccessCount += chunk.length;
    } else {
      logAgent(`⚠️ Canlı Paket ${c + 1}/${chunks.length} Uyarısı: ${res.data?.error || res.error || 'Yüklenemedi'}`);
    }
  }

  if (liveSuccessCount > 0) {
    logAgent(`✅ CANLI SUNUCU AKTARIMI TAMAMLANDI! (${liveSuccessCount} / ${totalMatches} Maç Veritabanına Yazıldı)`);
  }

  // 2. Localhost APEX API Varsa Aktar
  if (CONFIG.localApiUrl) {
    try {
      for (const chunk of chunks) {
        await sendSingleChunk(CONFIG.localApiUrl, chunk);
      }
    } catch (e) {}
  }
}

// Kill all lingering scraper and chrome instances
function killAllScrapers() {
  logAgent(`⛔ DURDURMA EMRİ: Tüm Chrome ve Tarama Süreçleri Kapatılıyor...`);
  if (activeProcess) {
    try { 
      exec(`powershell -Command "Stop-Process -Id ${activeProcess.pid} -Force -ErrorAction SilentlyContinue"`, () => {});
      activeProcess.kill('SIGKILL'); 
    } catch (e) {}
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;
  }
  try {
    fs.writeFileSync(path.join(__dirname, 'stop_signal.txt'), 'STOP', 'utf-8');
  } catch (e) {}

  exec(`powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*daily_pipeline*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, () => {});
  exec(`powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*worker_profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, () => {});
}

// Execute Scraper Target Mode
function runScraperMode(targetMode, customDate = null, startDate = null, endDate = null, limit = null) {
  if (targetMode === 'stop') {
    killAllScrapers();
    return;
  }

  if (activeProcess) {
    logAgent(`⚠️ Zaten aktif bir tarama süreci çalışıyor (${activeTargetMode}). Lütfen bitmesini bekleyin veya Durdur'a basın.`);
    return;
  }

  try {
    if (fs.existsSync(path.join(__dirname, 'stop_signal.txt'))) {
      fs.unlinkSync(path.join(__dirname, 'stop_signal.txt'));
    }
  } catch (e) {}

  let modeDesc = targetMode.toUpperCase();
  if (targetMode === 'custom' && customDate) modeDesc = `ÖZEL TARİH (${customDate})`;
  if (targetMode === 'range' && startDate && endDate) modeDesc = `TARİH ARALIĞI (${startDate} -> ${endDate})`;

  logAgent(`⚡ Tarama Başlatılıyor: MOD = ${modeDesc} (Zengin İstatistikler: ${localConfig.scrape_detailed_stats ? 'AÇIK' : 'KAPALI'})...`);

  let scraperArgs = ['daily_pipeline.js', `--workers=${localConfig.concurrency || 4}`];

  if (targetMode === 'yesterday') {
    scraperArgs.push('--yesterday');
  } else if (targetMode === 'today') {
    scraperArgs.push('--today');
  } else if (targetMode === 'tomorrow') {
    scraperArgs.push('--tomorrow');
  } else if (targetMode === 'all') {
    scraperArgs.push('--days=3');
  } else if (targetMode === 'custom' && customDate) {
    scraperArgs.push(`--date=${customDate}`);
  } else if (targetMode === 'range' && startDate && endDate) {
    scraperArgs.push(`--start-date=${startDate}`);
    scraperArgs.push(`--end-date=${endDate}`);
  } else if (targetMode === 'quick10') {
    scraperArgs.push('--today', '--limit=10');
  } else {
    scraperArgs.push('--today');
  }

  if (limit) {
    scraperArgs.push(`--limit=${limit}`);
  }

  activeProcessStartTime = Date.now();
  activeTargetMode = targetMode;

  const scriptPath = path.join(__dirname, 'daily_pipeline.js');
  activeProcess = spawn(process.execPath, [scriptPath, ...scraperArgs.slice(1)], {
    cwd: __dirname,
    windowsHide: true
  });

  activeProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) logAgent(line.trim());
    }
  });

  activeProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim() && !line.includes('DeprecationWarning')) {
        logAgent(`⚠️ ${line.trim()}`);
      }
    }
  });

  activeProcess.on('close', (code) => {
    const duration = Math.round((Date.now() - activeProcessStartTime) / 1000);
    const completedMode = activeTargetMode;
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;
    workerStates = {};

    broadcastSSE('job_finished', { event: 'job_finished', isRunning: false });

    if (code === 0) {
      logAgent(`🎉 [${modeDesc}] Taraması Tamamlandı! (Toplam Süre: ${Math.floor(duration / 60)} dk ${duration % 60} sn)`);
    } else {
      logAgent(`⚠️ Tarama süreci sona erdi (Çıkış Kodu: ${code}).`);
    }
  });
}

// 🛡️ WATCHDOG & ROBUST SCHEDULER (Her 15 saniyede bir kontrol)
setInterval(() => {
  const now = new Date();
  const todayDateStr = now.toISOString().split('T')[0];
  const pad = n => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (activeProcess && activeProcessStartTime) {
    const elapsedMinutes = (Date.now() - activeProcessStartTime) / (1000 * 60);
    if (elapsedMinutes > (CONFIG.maxProcessExecutionMinutes || 45)) {
      logAgent(`🚨 WATCHDOG DEVREYE GİRDİ: Süreç ${CONFIG.maxProcessExecutionMinutes} dakikayı aştı ve kilitlendi. Otomatik sonlandırılıyor...`);
      killAllScrapers();
    }
  }

  if (!localConfig.automation_active || activeProcess) return;

  if (localConfig.cron_yesterday && currentTime === localConfig.cron_yesterday) {
    if (lastTriggered.yesterday !== todayDateStr) {
      lastTriggered.yesterday = todayDateStr;
      logAgent(`⏰ LOKAL ZAMANLAYICI TETİKLENDİ: Dünün Taraması (${localConfig.cron_yesterday})`);
      runScraperMode('yesterday');
      return;
    }
  }

  if (localConfig.cron_today && currentTime === localConfig.cron_today) {
    if (lastTriggered.today !== todayDateStr) {
      lastTriggered.today = todayDateStr;
      logAgent(`⏰ LOKAL ZAMANLAYICI TETİKLENDİ: Bugünün Taraması (${localConfig.cron_today})`);
      runScraperMode('today');
      return;
    }
  }

  if (localConfig.cron_tomorrow && currentTime === localConfig.cron_tomorrow) {
    if (lastTriggered.tomorrow !== todayDateStr) {
      lastTriggered.tomorrow = todayDateStr;
      logAgent(`⏰ LOKAL ZAMANLAYICI TETİKLENDİ: Yarının Taraması (${localConfig.cron_tomorrow})`);
      runScraperMode('tomorrow');
      return;
    }
  }
}, 15000);

// Embedded Local Web Dashboard Server
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Apex-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 1. SSE Stream
  if (reqUrl.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });

    const sendEvent = (event, data) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
    };
    sendEvent('job_status', {
      isRunning: !!activeProcess,
      currentMatch: activeTargetMode,
      workerStates: workerStates,
      activeDurationMinutes: activeProcessStartTime ? Math.round((Date.now() - activeProcessStartTime) / 60000) : 0
    });
    return;
  }

  // 2. Health Metrics API
  if (reqUrl.pathname === '/api/status' || reqUrl.pathname === '/api/health-metrics' || reqUrl.pathname === '/api/system-metrics') {
    let memoryUsageMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
    let heapMb = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1);
    let uptimeSeconds = Math.round(process.uptime());

    const outDir = path.join(__dirname, 'output');
    let matchCount = 0;
    if (fs.existsSync(outDir)) {
      matchCount = fs.readdirSync(outDir).filter(f => fs.statSync(path.join(outDir, f)).isDirectory()).length;
    }

    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.startsWith('predictions_') && f.endsWith('.json'));
      for (const f of files) {
        try {
          const arr = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
          if (Array.isArray(arr) && arr.length > matchCount) matchCount = arr.length;
        } catch (_) {}
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'healthy',
      ramMb: memoryUsageMb,
      heapMb: heapMb,
      uptimeSec: uptimeSeconds,
      totalMatchesScraped: matchCount,
      activeJob: {
        isRunning: !!activeProcess,
        currentMatch: activeTargetMode,
        workerStates: workerStates
      },
      config: {
        concurrency: localConfig.concurrency || 4,
        apexImportUrl: CONFIG.localApiUrl,
        apexSecret: CONFIG.apiToken
      },
      logs: liveLogs
    }));
    return;
  }

  // 3. Recent Matches API (Son Kazınan Maçlar Kutusu)
  if (reqUrl.pathname === '/api/recent-matches') {
    const list = [];
    const dataDir = path.join(__dirname, 'data');

    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('predictions_') && f.endsWith('.json'))
        .sort((a, b) => fs.statSync(path.join(dataDir, b)).mtimeMs - fs.statSync(path.join(dataDir, a)).mtimeMs);

      for (const file of files) {
        try {
          const arr = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
          if (Array.isArray(arr)) {
            for (let i = arr.length - 1; i >= 0 && list.length < 30; i--) {
              const m = arr[i];
              list.push({
                slug: m.match_slug || `match-${m.match_id}`,
                homeTeam: m.home_team?.name || m.home_team || 'Home',
                awayTeam: m.away_team?.name || m.away_team || 'Away',
                score: m.match_outcome?.final_score || m.hero?.finalScore || m.hero?.score || '-',
                league: m.league?.name || m.league || 'Lig',
                viewerUrl: `/output/${m.match_slug || `match-${m.match_id}`}/viewer.html`,
                scrapedTime: m.scrape_meta?.scraped_at ? m.scrape_meta.scraped_at.split('T')[1]?.substring(0, 8) : '-',
                status: m.match_outcome?.status === 'FINISHED' ? 'Finished' : 'Upcoming'
              });
            }
          }
        } catch (_) {}
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(list));
  }

  // 4. Batch / Single / Range Actions
  if (reqUrl.pathname === '/api/scrape-batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const dateKey = payload.date || 'today';
        const limit = payload.limit || null;
        runScraperMode(dateKey, null, null, null, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: `Kazıma başlatıldı: ${dateKey}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (reqUrl.pathname === '/api/scrape-date-range' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        runScraperMode('range', null, payload.startDate, payload.endDate);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: `Tarih aralığı başlatıldı: ${payload.startDate} -> ${payload.endDate}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (reqUrl.pathname === '/api/scrape-test-match' && req.method === 'POST') {
    runScraperMode('today', null, null, null, 1);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Test maçı başlatıldı.' }));
  }

  if (reqUrl.pathname === '/api/stop-job' && req.method === 'POST') {
    killAllScrapers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Durduruldu.' }));
  }

  if (reqUrl.pathname === '/api/save_config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        localConfig = Object.assign(localConfig, parsed);
        saveLocalConfig();
        logAgent(`⚙️ Ayarlar ve zamanlayıcı saatleri güncellendi.`);
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, config: localConfig }));
    });
    return;
  }

  // 5. Statik Dosyalar (output/ klasörü ve viewer.html)
  if (reqUrl.pathname.startsWith('/output/') || reqUrl.pathname.startsWith('/viewer/')) {
    let rel = decodeURIComponent(reqUrl.pathname.replace(/^\/(?:output|viewer)\//, ''));
    let slug = rel.split('/')[0];
    let fPath = path.join(__dirname, 'output', rel);

    // Eğer doğrudan /viewer/:slug veya /output/:slug/viewer.html istenmişse
    if (reqUrl.pathname.startsWith('/viewer/') || rel.endsWith('viewer.html') || !path.extname(rel)) {
      if (!rel.endsWith('.html') && !rel.endsWith('.json')) {
        fPath = path.join(__dirname, 'output', slug, 'viewer.html');
      }

      // Eğer viewer.html henüz üretilmemişse anında oluştur
      if (!fs.existsSync(fPath)) {
        try {
          const matchDir = path.join(__dirname, 'output', slug);
          const jsonPath = path.join(matchDir, 'match_data.json');
          let matchData = null;

          if (fs.existsSync(jsonPath)) {
            matchData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          } else {
            // data/ klasöründen ara
            const dataDir = path.join(__dirname, 'data');
            const files = fs.readdirSync(dataDir).filter(f => f.startsWith('predictions_') && f.endsWith('.json'));
            for (const df of files) {
              const arr = JSON.parse(fs.readFileSync(path.join(dataDir, df), 'utf8'));
              if (Array.isArray(arr)) {
                const found = arr.find(m => (m.match_slug === slug || `match-${m.match_id}` === slug || m.match_id == slug));
                if (found) {
                  matchData = found;
                  break;
                }
              }
            }
          }

          if (matchData) {
            if (!fs.existsSync(matchDir)) fs.mkdirSync(matchDir, { recursive: true });
            const { generateMatchViewer } = require('./viewer/generate_viewer');
            generateMatchViewer(matchData, matchDir);
          }
        } catch (_) {}
      }
    }

    if (fs.existsSync(fPath) && fs.statSync(fPath).isFile()) {
      const ext = path.extname(fPath).toLowerCase();
      const mimeTypes = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(fPath));
    }
  }

  // Serve Modern APEX-BOT SPA Dashboard (index.html)
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(indexPath, 'utf-8'));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  logAgent(`🚀 APEX-BOT MASTER KONTROL MERKEZİ BAŞLATILDI!`);
  logAgent(`🌐 Kontrol Paneli Adresi: http://localhost:${PORT}`);
});
