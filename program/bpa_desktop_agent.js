/**
 * ====================================================================
 * BPA V2 DESKTOP AGENT ENGINE & LOCAL DASHBOARD (ENTERPRISE EDITION)
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, spawn } = require('child_process');

const PORT = 3000;

// Configuration
const CONFIG = {
  webApiUrl: 'https://realmobilebet.com/bpav3/api/sync_ingest.php',
  localApiUrl: 'http://localhost/bpav3/api/sync_ingest.php',
  apiToken: 'BPA_g7wXmi9oa32slLeb',
  maxProcessExecutionMinutes: 45 // Watchdog kill timer
};

let activeProcess = null;
let activeProcessStartTime = null;
let activeTargetMode = null;
let liveLogs = [];

let localConfig = {
  automation_active: true,
  cron_yesterday: '06:00',
  cron_today: '10:00',
  cron_tomorrow: '18:00',
  scrape_detailed_stats: true,
  auto_reload_broken_logos: true
};

// Track trigger dates to prevent missed triggers or double executions
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

function logAgent(msg) {
  const time = new Date().toLocaleTimeString();
  const formattedMsg = `[${time}] ${msg}`;
  
  let color = ANSI_COLORS.white;
  if (msg.includes('✅') || msg.includes('BAŞARILI') || msg.includes('🎉')) color = ANSI_COLORS.green;
  else if (msg.includes('⚠️') || msg.includes('⏰') || msg.includes('🛡️')) color = ANSI_COLORS.yellow;
  else if (msg.includes('❌') || msg.includes('HATA') || msg.includes('⛔') || msg.includes('DURDUR')) color = ANSI_COLORS.red;
  else if (msg.includes('⚡') || msg.includes('📡') || msg.includes('BAŞLATILDI') || msg.includes('🚀')) color = ANSI_COLORS.cyan;

  console.log(color + formattedMsg + ANSI_COLORS.reset);
  
  liveLogs.push(formattedMsg.replace(/\x1B\[\d+m/g, ''));
  if (liveLogs.length > 600) liveLogs.shift();

  try {
    fs.appendFileSync(path.join(__dirname, 'agent_activity.log'), `[${new Date().toISOString()}] ${msg.replace(/\x1B\[\d+m/g, '')}\n`, 'utf-8');
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
            'X-BPA-Secret': CONFIG.apiToken,
            'User-Agent': 'BPA-Desktop-Agent/3.0'
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
  } else {
    logAgent(`❌ Canlı Sunucuya Aktarım Başarısız Oldu. Lütfen internet bağlantınızı kontrol edin.`);
  }

  // 2. Localhost Varsa Aktar (Yoksa Sessizce Geç)
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
  exec(`powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*temp_profiles*' -or $_.CommandLine -like '*forebet*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, () => {});
}

// Execute Scraper Target Mode
function runScraperMode(targetMode, customDate = null, startDate = null, endDate = null) {
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

  const scraperScript = path.join(__dirname, 'daily_pipeline.js');
  if (!fs.existsSync(scraperScript)) {
    logAgent(`❌ HATA: ${scraperScript} dosyası bulunamadı!`);
    return;
  }

  activeTargetMode = targetMode;
  activeProcessStartTime = Date.now();

  const spawnArgs = [ scraperScript ];

  if (targetMode === 'custom' && customDate) {
    spawnArgs.push(`--date=${customDate}`);
    spawnArgs.push(`--mode=custom`);
  } else if (targetMode === 'range' && startDate && endDate) {
    spawnArgs.push(`--start-date=${startDate}`);
    spawnArgs.push(`--end-date=${endDate}`);
    spawnArgs.push(`--mode=range`);
  } else {
    spawnArgs.push(`--${targetMode}`);
    spawnArgs.push(`--mode=${targetMode}`);
  }

  spawnArgs.push(`--stats=${localConfig.scrape_detailed_stats}`);

  activeProcess = spawn('node', spawnArgs, {
    cwd: __dirname,
    env: process.env,
    shell: true
  });

  activeProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) logAgent(text);
  });

  activeProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) logAgent(`⚠️ ${text}`);
  });

  activeProcess.on('close', (code) => {
    const completedMode = activeTargetMode;
    const completedDate = customDate;
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;

    if (code !== 0 && code !== null) {
      logAgent(`⚠️ Tarama Süreci ${code} Koduyla Sona Erdi.`);
      return;
    }
    
    logAgent(`🎉 [${modeDesc}] Taraması Tamamlandı!`);

    // Otomatik Senkronizasyon (Dual Sync)
    if (completedMode === 'custom' && completedDate) {
      const filePath = path.join(__dirname, 'data', `predictions_${completedDate}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const matchesData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          syncMatchesToWebServer(completedDate, matchesData);
        } catch (e) {
          logAgent(`⚠️ Dosya Okuma Hatası (${filePath}): ${e.message}`);
        }
      }
    } else {
      const syncTargets = completedMode === 'all' ? ['yesterday', 'today', 'tomorrow'] : [completedMode];

      for (const tgt of syncTargets) {
        let dateStr = new Date().toISOString().split('T')[0];
        if (tgt === 'yesterday') {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          dateStr = d.toISOString().split('T')[0];
        } else if (tgt === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().split('T')[0];
        }

        let filePath = path.join(__dirname, 'data', `predictions_${dateStr}.json`);
        if (!fs.existsSync(filePath)) {
          let legacyName = 'today_matches_detailed.json';
          if (tgt === 'yesterday') legacyName = 'yesterday_matches_detailed.json';
          else if (tgt === 'tomorrow') legacyName = 'tomorrow_matches_detailed.json';
          filePath = path.join(__dirname, 'data', legacyName);
        }

        if (fs.existsSync(filePath)) {
          try {
            const matchesData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            syncMatchesToWebServer(tgt, matchesData);
          } catch (e) {
            logAgent(`⚠️ Dosya Okuma Hatası (${filePath}): ${e.message}`);
          }
        }
      }
    }
  });
}

// 🛡️ WATCHDOG & ROBUST SCHEDULER (Her 15 saniyede bir kontrol)
setInterval(() => {
  const now = new Date();
  const todayDateStr = now.toISOString().split('T')[0];
  const pad = n => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 1. Process Watchdog (Kilitlenme ve sonsuz bekleme koruması)
  if (activeProcess && activeProcessStartTime) {
    const elapsedMinutes = (Date.now() - activeProcessStartTime) / (1000 * 60);
    if (elapsedMinutes > CONFIG.maxProcessExecutionMinutes) {
      logAgent(`🛡️ WATCHDOG UYARISI: Tarama ${Math.round(elapsedMinutes)} dakikadır sürüyor. Kilitlenme olasılığına karşı otomatik durdurulup sıfırlanıyor...`);
      killAllScrapers();
    }
  }

  // 2. Scheduler Trigger Check
  if (!localConfig.automation_active) return;
  if (activeProcess) return; // Zaten çalışıyorsa bekle

  // Dün Zamanlayıcısı
  if (localConfig.cron_yesterday && currentTime === localConfig.cron_yesterday) {
    if (lastTriggered.yesterday !== todayDateStr) {
      lastTriggered.yesterday = todayDateStr;
      logAgent(`⏰ LOKAL ZAMANLAYICI TETİKLENDİ: Dünün Taraması (${localConfig.cron_yesterday})`);
      runScraperMode('yesterday');
      return;
    }
  }

  // Bugün Zamanlayıcısı
  if (localConfig.cron_today && currentTime === localConfig.cron_today) {
    if (lastTriggered.today !== todayDateStr) {
      lastTriggered.today = todayDateStr;
      logAgent(`⏰ LOKAL ZAMANLAYICI TETİKLENDİ: Bugünün Taraması (${localConfig.cron_today})`);
      runScraperMode('today');
      return;
    }
  }

  // Yarın Zamanlayıcısı
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

  if (reqUrl.pathname === '/api/status') {
    let memoryUsageMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    let uptimeSeconds = Math.round(process.uptime());

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: !!activeProcess,
      activeMode: activeTargetMode,
      activeDurationMinutes: activeProcessStartTime ? Math.round((Date.now() - activeProcessStartTime) / 60000) : 0,
      memoryMb: memoryUsageMb,
      uptimeSeconds: uptimeSeconds,
      logs: liveLogs,
      config: localConfig
    }));
    return;
  }

  if (reqUrl.pathname === '/api/trigger') {
    const mode = reqUrl.searchParams.get('mode');
    const customDate = reqUrl.searchParams.get('date');
    const startDate = reqUrl.searchParams.get('start');
    const endDate = reqUrl.searchParams.get('end');
    if (mode) runScraperMode(mode, customDate, startDate, endDate);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, mode, customDate, startDate, endDate }));
    return;
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

  // Serve Modern Embedded SPA Dashboard
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BPA V2 — Enterprise Desktop Control Center</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@mdi/font@7.2.96/css/materialdesignicons.min.css" rel="stylesheet">
  <style>
    :root {
      --bg-main: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --accent: #3b82f6;
    }
    body { background: var(--bg-main); color: #f3f4f6; font-family: system-ui, -apple-system, sans-serif; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; }
    .console-box { background: #030712; border: 1px solid #1f2937; font-family: 'Consolas', 'Courier New', monospace; color: #38bdf8; height: 420px; overflow-y: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
    .stat-pill { background: #1e293b; border-radius: 8px; padding: 10px 14px; border: 1px solid #334155; }
    .btn-action { transition: all 0.2s ease; }
    .btn-action:hover { transform: translateY(-2px); }
  </style>
</head>
<body class="p-3 p-md-4">
  <div class="container-fluid max-w-7xl">
    
    <!-- Top Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary border-opacity-25">
      <div>
        <h3 class="fw-bold m-0 text-white d-flex align-items-center">
          <i class="mdi mdi-shield-check-outline text-primary me-2 fs-2"></i>
          BPA V2 Desktop Automation Engine
        </h3>
        <small class="text-white-50">Uzak Windows Sunucu & 7/24 Kesintisiz Futbol Veri Robotu</small>
      </div>
      <div class="d-flex align-items-center gap-3 mt-3 mt-md-0">
        <div class="stat-pill text-white-50 small d-none d-md-block">
          <i class="mdi mdi-memory text-info me-1"></i> RAM: <span id="stat-ram" class="text-white fw-bold">-- MB</span>
        </div>
        <div class="stat-pill text-white-50 small d-none d-md-block">
          <i class="mdi mdi-clock-check-outline text-warning me-1"></i> Uptime: <span id="stat-uptime" class="text-white fw-bold">--</span>
        </div>
        <span class="badge bg-success fs-6 px-3 py-2" id="status-badge">
          <i class="mdi mdi-check-circle me-1"></i> HAZIR
        </span>
      </div>
    </div>

    <div class="row g-4">
      
      <!-- Left Config Sidebar -->
      <div class="col-lg-4">
        
        <div class="card p-4 shadow-sm mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold m-0 text-warning d-flex align-items-center">
              <i class="mdi mdi-clock-outline me-2"></i>Zamanlayıcı (Scheduler)
            </h5>
            <div class="form-check form-switch m-0">
              <input class="form-check-input" type="checkbox" id="automation_active">
            </div>
          </div>
          
          <div class="mb-3">
            <label class="form-label small text-white-50">📅 Dün Maçları Tarama Saati:</label>
            <input type="time" id="cron_yesterday" class="form-control bg-dark text-white border-secondary">
          </div>

          <div class="mb-3">
            <label class="form-label small text-white-50">⚽ Bugün Maçları Tarama Saati:</label>
            <input type="time" id="cron_today" class="form-control bg-dark text-white border-secondary">
          </div>

          <div class="mb-3">
            <label class="form-label small text-white-50">🌆 Yarın Maçları Tarama Saati:</label>
            <input type="time" id="cron_tomorrow" class="form-control bg-dark text-white border-secondary">
          </div>

          <hr class="border-secondary opacity-25">

          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="scrape_detailed_stats">
            <label class="form-check-label text-white small fw-bold" for="scrape_detailed_stats">
              🏆 H2H & Zengin İstatistikleri Çek
            </label>
            <small class="text-white-50 d-block">Puan durumu, karşılıklı geçmiş maçlar ve form verileri dahil edilir.</small>
          </div>

          <div class="form-check form-switch mb-4">
            <input class="form-check-input" type="checkbox" id="auto_reload_broken_logos">
            <label class="form-check-label text-white small fw-bold" for="auto_reload_broken_logos">
              🖼️ Kırık Logolarda Otomatik Reload
            </label>
            <small class="text-white-50 d-block">Logo yüklenmezse sayfayı otomatik yenileyip tamamlar.</small>
          </div>

          <button class="btn btn-primary fw-bold w-100 py-2 shadow-sm" onclick="saveConfig()">
            <i class="mdi mdi-content-save me-1"></i> Ayarları Kaydet
          </button>
        </div>

        <!-- Info Card -->
        <div class="card p-3 shadow-sm text-white-50 small">
          <div class="d-flex align-items-center text-white mb-2">
            <i class="mdi mdi-information-outline text-info me-2 fs-5"></i>
            <span class="fw-bold">Watchdog & Sunucu Güvencesi</span>
          </div>
          RDP oturumunuzu kapatsanız dahi bot arka planda çalışmaya devam eder. 45 dakikayı aşan takılmalarda Watchdog otomatik devreye girer.
        </div>

      </div>

      <!-- Right Main Actions & Console -->
      <div class="col-lg-8">
        <div class="card p-4 shadow-sm">
          
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold m-0 text-info d-flex align-items-center">
              <i class="mdi mdi-play-circle-outline me-2"></i>Manuel Tarama Kontrolleri
            </h5>
            <button class="btn btn-danger btn-sm fw-bold px-3 btn-action" onclick="trigger('stop')">
              <i class="mdi mdi-stop-circle me-1"></i> TÜMÜNÜ DURDUR
            </button>
          </div>
          
          <div class="row g-2 mb-3">
            <div class="col-6 col-md-3">
              <button class="btn btn-outline-primary fw-bold w-100 py-3 btn-action" onclick="trigger('yesterday')">
                <i class="mdi mdi-history d-block fs-4 mb-1"></i> 1. Dünü Tara
              </button>
            </div>
            <div class="col-6 col-md-3">
              <button class="btn btn-outline-success fw-bold w-100 py-3 btn-action" onclick="trigger('today')">
                <i class="mdi mdi-soccer d-block fs-4 mb-1"></i> 2. Bugünü Tara
              </button>
            </div>
            <div class="col-6 col-md-3">
              <button class="btn btn-outline-info fw-bold w-100 py-3 btn-action" onclick="trigger('tomorrow')">
                <i class="mdi mdi-calendar-arrow-right d-block fs-4 mb-1"></i> 3. Yarını Tara
              </button>
            </div>
            <div class="col-6 col-md-3">
              <button class="btn btn-outline-warning fw-bold w-100 py-3 btn-action" onclick="trigger('all')">
                <i class="mdi mdi-all-inclusive d-block fs-4 mb-1"></i> 4. Tümünü Tara
              </button>
            </div>
          </div>

          <!-- Özel Tarih & Tarih Aralığı Seçici -->
          <div class="p-3 mb-4 rounded-3" style="background: #090d16; border: 1px solid #1e293b;">
            <div class="row g-3 align-items-center">
              <div class="col-12 col-md-5">
                <label class="small text-white-50 mb-1 fw-bold d-flex align-items-center">
                  <i class="mdi mdi-calendar-search text-primary me-1 fs-6"></i> Tekil Tarih Seç:
                </label>
                <div class="input-group">
                  <input type="date" id="custom_date" class="form-control form-control-sm bg-dark text-white border-secondary">
                  <button class="btn btn-sm btn-primary fw-bold px-3" onclick="triggerCustomDate()">
                    <i class="mdi mdi-play me-1"></i> Bu Tarihi Tara
                  </button>
                </div>
              </div>
              <div class="col-12 col-md-7">
                <label class="small text-white-50 mb-1 fw-bold d-flex align-items-center">
                  <i class="mdi mdi-calendar-range text-warning me-1 fs-6"></i> Tarih Aralığı Tara:
                </label>
                <div class="input-group">
                  <input type="date" id="range_start" class="form-control form-control-sm bg-dark text-white border-secondary">
                  <span class="input-group-text bg-dark text-white-50 border-secondary px-2">-</span>
                  <input type="date" id="range_end" class="form-control form-control-sm bg-dark text-white border-secondary">
                  <button class="btn btn-sm btn-warning fw-bold px-3 text-dark" onclick="triggerDateRange()">
                    <i class="mdi mdi-calendar-sync me-1"></i> Aralığı Tara
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
            <small class="fw-bold font-monospace text-info d-flex align-items-center">
              <i class="mdi mdi-console me-1"></i> CANLI MASANÜSTÜ KONSOLU
            </small>
            <button class="btn btn-xs btn-outline-secondary text-white-50" onclick="document.getElementById('console').innerText=''">
              <i class="mdi mdi-broom me-1"></i> Temizle
            </button>
          </div>
          <pre id="console" class="console-box p-3 rounded-3 m-0">Konsol yükleniyor...</pre>

        </div>
      </div>

    </div>
  </div>

  <script>
    let isConfigLoaded = false;

    function formatUptime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h + ' saat ' + m + ' dk';
    }

    function fetchStatus() {
      fetch('/api/status')
        .then(r => r.json())
        .then(d => {
          const badge = document.getElementById('status-badge');
          if (d.isRunning) {
            badge.className = 'badge bg-warning text-dark fs-6 px-3 py-2';
            badge.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> [' + (d.activeMode || 'TARAMA').toUpperCase() + '] ÇALIŞIYOR (' + d.activeDurationMinutes + ' dk)';
          } else {
            badge.className = 'badge bg-success fs-6 px-3 py-2';
            badge.innerHTML = '<i class="mdi mdi-check-circle me-1"></i> HAZIR';
          }

          document.getElementById('stat-ram').innerText = d.memoryMb + ' MB';
          document.getElementById('stat-uptime').innerText = formatUptime(d.uptimeSeconds);

          if (!isConfigLoaded && d.config) {
            document.getElementById('cron_yesterday').value = d.config.cron_yesterday || '06:00';
            document.getElementById('cron_today').value = d.config.cron_today || '10:00';
            document.getElementById('cron_tomorrow').value = d.config.cron_tomorrow || '18:00';
            document.getElementById('automation_active').checked = d.config.automation_active !== false;
            document.getElementById('scrape_detailed_stats').checked = d.config.scrape_detailed_stats !== false;
            document.getElementById('auto_reload_broken_logos').checked = d.config.auto_reload_broken_logos !== false;
            
            // Varsayılan bugünün tarihi
            const todayStr = new Date().toISOString().split('T')[0];
            if (document.getElementById('custom_date')) document.getElementById('custom_date').value = todayStr;
            if (document.getElementById('range_start')) document.getElementById('range_start').value = todayStr;
            if (document.getElementById('range_end')) document.getElementById('range_end').value = todayStr;
            
            isConfigLoaded = true;
          }

          const c = document.getElementById('console');
          const shouldScroll = c.scrollTop + c.clientHeight >= c.scrollHeight - 50;
          c.innerText = d.logs.join('\\n');
          if (shouldScroll) {
            c.scrollTop = c.scrollHeight;
          }
        })
        .catch(() => {});
    }

    function trigger(mode) {
      fetch('/api/trigger?mode=' + mode).then(() => fetchStatus());
    }

    function triggerCustomDate() {
      const dt = document.getElementById('custom_date').value;
      if (!dt) return alert('Lütfen bir tarih seçin!');
      fetch('/api/trigger?mode=custom&date=' + dt).then(() => fetchStatus());
    }

    function triggerDateRange() {
      const start = document.getElementById('range_start').value;
      const end = document.getElementById('range_end').value;
      if (!start || !end) return alert('Lütfen başlangıç ve bitiş tarihlerini seçin!');
      if (start > end) return alert('Başlangıç tarihi bitiş tarihinden büyük olamaz!');
      fetch('/api/trigger?mode=range&start=' + start + '&end=' + end).then(() => fetchStatus());
    }

    function saveConfig() {
      const payload = {
        cron_yesterday: document.getElementById('cron_yesterday').value,
        cron_today: document.getElementById('cron_today').value,
        cron_tomorrow: document.getElementById('cron_tomorrow').value,
        automation_active: document.getElementById('automation_active').checked,
        scrape_detailed_stats: document.getElementById('scrape_detailed_stats').checked,
        auto_reload_broken_logos: document.getElementById('auto_reload_broken_logos').checked
      };

      fetch('/api/save_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(d => {
        alert('Ayarlar başarıyla kaydedildi!');
      });
    }

    setInterval(fetchStatus, 2000);
    fetchStatus();
  </script>
</body>
</html>`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️ Port ${PORT} şu an başka bir Node.js süreci tarafından kullanılıyor.`);
    console.log(`💡 Görev Yöneticisi'nden eski 'Node.js' süreçlerini kapatabilir veya BPA_Agent_Launcher_GUI.bat dosyasını çalıştırabilirsiniz.\n`);
  } else {
    console.error(`🚨 Sunucu Hatası: ${err.message}`);
  }
});

server.listen(PORT, () => {
  logAgent(`🚀 BPA V3 MASAÜSTÜ KONTROL MERKEZİ BAŞLATILDI!`);
  logAgent(`🌐 Kontrol Paneli Adresi: http://localhost:${PORT}`);
  
  exec(`start http://localhost:${PORT}`);
});
