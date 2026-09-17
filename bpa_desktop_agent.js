/**
 * ====================================================================
 * BPA V3 / BOTV4 - ENTERPRISE DESKTOP AGENT & MASTER CONTROL CENTER
 * ====================================================================
 * Features:
 * - Header Üzerinde Canlı Çerez (Cookie), Maç Sayısı, Klasör Boyutu & RAM Paneli
 * - Dinamik Sekme Ayarı (1, 2, 4, 6, 8 Sekme) & Arayüzde Canlı Değişen Grid
 * - Tarih Aralığı Kazıma & "Toplam Gün / İşlenen Gün" Takibi
 * - "Son Çekilen Maçı Görüntüle (Viewer + Forebet Peş Peşe Aç)"
 * - "🎲 Bugünden Rastgele Maç Çek" Modu
 * - Özel Tekil Maç URL Çekme Çubuğu
 * - Ayarlar Modalı (APEX API, Sekme Sayısı, Çıktı Klasörü, Zamanlayıcılar)
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, execSync, spawn } = require('child_process');
const { generateMatchViewer } = require('./viewer/generate_viewer');
const { getBotTasks, killAllBotProcesses, killTaskByPid } = require('./core/task_monitor');
const { getCompleteSystemHealth } = require('./core/system_health');

// 🛡️ Node.js v24 Global Unhandled Rejection Kalkanı
process.on('unhandledRejection', (reason) => {
  const msg = String(reason?.message || reason || '');
  if (
    msg.includes('ProtocolError') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Target.detachFromTarget') ||
    msg.includes('setExtraHTTPHeaders') ||
    msg.includes('Execution context was destroyed')
  ) {
    return;
  }
  console.warn('[Desktop Agent Zırhı] Yakalanmamış Rejection izole edildi:', msg);
});

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('ProtocolError') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Target.detachFromTarget')
  ) {
    return;
  }
  console.error('[Desktop Agent Zırhı] Beklenmeyen Hata İzole Edildi:', err);
});

const PORT = 3000;

// Konfigürasyon
const CONFIG = {
  webApiUrl: 'https://realmobilebet.com/bpav3/api/sync_ingest.php',
  localApiUrl: 'http://localhost/bpav3/api/sync_ingest.php',
  apiToken: 'BPA_g7wXmi9oa32slLeb',
  maxProcessExecutionMinutes: 720
};

let activeProcess = null;
let activeProcessStartTime = null;
let activeTargetMode = null;
let lastActivityTime = Date.now();
let lastRunParams = {
  mode: null,
  customDate: null,
  startDate: null,
  endDate: null,
  workers: null
};
let isManualStop = false;
let autoRetryCount = 0;
const MAX_AUTO_RETRIES = 50;
let liveLogs = [];

let localConfig = {
  automation_active: true,
  concurrency: 4,
  cron_yesterday: '06:00',
  cron_today: '10:00',
  cron_tomorrow: '18:00',
  scrape_detailed_stats: true,
  auto_reload_broken_logos: true,
  autoSyncApex: true,
  apexImportUrl: 'http://localhost/apex-api/api/import.php',
  apexSecret: 'apex_secret_key_2026',
  outputDir: path.join(__dirname, 'output')
};

// Ayarları Yükle
const localCfgFile = path.join(__dirname, 'bpa_local_config.json');
if (fs.existsSync(localCfgFile)) {
  try {
    localConfig = Object.assign(localConfig, JSON.parse(fs.readFileSync(localCfgFile, 'utf-8')));
  } catch (e) {}
}

const rootCfgFile = path.join(__dirname, 'config.json');
if (fs.existsSync(rootCfgFile)) {
  try {
    localConfig = Object.assign(localConfig, JSON.parse(fs.readFileSync(rootCfgFile, 'utf-8')));
  } catch (e) {}
}

// Canlı Takip Durumu
let liveState = {
  totalDays: 1,
  currentDay: 1,
  currentDateStr: '',
  totalMatches: 0,
  completedMatches: 0,
  failedMatches: 0,
  currentMatch: '',
  avgSecPerMatch: 0,
  elapsedSeconds: 0,
  latestScrapedSlug: null,
  latestScrapedMatch: null,
  workers: {},
  recentMatches: [],
  sessions: []
};

function initWorkers() {
  const count = parseInt(localConfig.concurrency, 10) || 4;
  liveState.workers = {};
  for (let i = 1; i <= count; i++) {
    liveState.workers[String(i)] = { id: i, status: 'idle', match: 'Beklemede', duration: '-', time: '-' };
  }
}
initWorkers();

// Seans Geçmişini Yükle
const SESSIONS_FILE = path.join(__dirname, 'data', 'scan_sessions.json');
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      liveState.sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    }
  } catch (_) {}
}
function saveSessions() {
  try {
    const d = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(liveState.sessions.slice(0, 50), null, 2), 'utf-8');
  } catch (_) {}
}
loadSessions();

// Çekilmiş Maçları Output Klasöründen Hızlı Yükle (Sadece Son Eklenenleri Alır, Event Loop'u Asla Kitlemez)
function loadRecentMatchesFromOutput() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) return;
  try {
    const allDirs = fs.readdirSync(outDir);
    cachedStorageMetrics.outputMatches = allDirs.length;

    // 16.000+ klasörün tamamını değil, en son eklenen son 100 klasörü kontrol et
    const sampleDirs = allDirs.slice(-100);
    const parsedDirs = [];

    for (const name of sampleDirs) {
      const jsonFile = path.join(outDir, name, 'match_data.json');
      if (fs.existsSync(jsonFile)) {
        try {
          const stat = fs.statSync(jsonFile);
          parsedDirs.push({
            slug: name,
            statTime: stat.mtimeMs,
            dateObj: stat.mtime,
            jsonFile
          });
        } catch (_) {}
      }
    }

    parsedDirs.sort((a, b) => b.statTime - a.statTime);
    const topDirs = parsedDirs.slice(0, 50);

    const loadedMatches = [];
    for (const d of topDirs) {
      let realDuration = '3.8s';
      let matchTitle = '';
      try {
        const raw = fs.readFileSync(d.jsonFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.meta?.durationSeconds) realDuration = `${parsed.meta.durationSeconds}s`;
        if (parsed?.hero?.homeTeam && parsed?.hero?.awayTeam) {
          matchTitle = `${parsed.hero.homeTeam} vs ${parsed.hero.awayTeam}`;
        }
      } catch (_) {}

      if (!matchTitle) {
        matchTitle = decodeURIComponent(d.slug).replace(/-/g, ' ').toUpperCase();
      }

      loadedMatches.push({
        slug: d.slug,
        title: matchTitle,
        time: d.dateObj.toLocaleTimeString('tr-TR'),
        duration: realDuration,
        workerId: (loadedMatches.length % (parseInt(localConfig.concurrency, 10) || 4)) + 1
      });
    }

    if (loadedMatches.length > 0) {
      liveState.latestScrapedSlug = loadedMatches[0].slug;
      liveState.latestScrapedMatch = {
        title: loadedMatches[0].title,
        slug: loadedMatches[0].slug,
        duration: loadedMatches[0].duration,
        time: loadedMatches[0].time
      };
      liveState.recentMatches = loadedMatches;
    }
  } catch (e) {}
}

const lastTriggered = {
  yesterday: null,
  today: null,
  tomorrow: null
};

function saveLocalConfig() {
  try {
    fs.writeFileSync(localCfgFile, JSON.stringify(localConfig, null, 2), 'utf-8');
    fs.writeFileSync(rootCfgFile, JSON.stringify(localConfig, null, 2), 'utf-8');
    initWorkers();
  } catch (e) {}
}

// Node.js Arka Plan Süreç Sayacı (15 saniyede bir hafif kontrol)
let cachedNodeProcessCount = 1;
let lastNodeCheckTime = 0;
function updateNodeProcessCount() {
  const now = Date.now();
  if (now - lastNodeCheckTime < 15000) return cachedNodeProcessCount;
  lastNodeCheckTime = now;

  exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', (err, stdout) => {
    if (!err && stdout) {
      const lines = stdout.trim().split('\n').filter(l => l.toLowerCase().includes('node.exe'));
      cachedNodeProcessCount = Math.max(1, lines.length);
    }
  });
  return cachedNodeProcessCount;
}

// 🚀 Önbellekli Depolama Metrikleri (Arka Planda Güncellenir, Event Loop'u ASLA Kitlemez)
let cachedStorageMetrics = {
  outputMb: '0.00',
  outputMatches: 0,
  dataMb: '0.00',
  cookiesKb: '0.0',
  totalMb: '0.00'
};

let isScanningStorage = false;
function refreshStorageMetricsAsync() {
  if (isScanningStorage) return;
  isScanningStorage = true;

  setImmediate(() => {
    try {
      const outDir = path.join(__dirname, 'output');
      const dataDir = path.join(__dirname, 'data');
      const cookieFile = path.join(dataDir, 'forebet_cookies.json');

      let outputMatches = 0;
      let outputMb = '0.00';
      let dataMb = '0.00';
      let cookiesKb = '0.0';

      if (fs.existsSync(outDir)) {
        const outItems = fs.readdirSync(outDir);
        outputMatches = outItems.length;
        // Ortalama maç boyutu 0.12 MB (120 KB) üzerinden anında hafif hesaplama
        outputMb = ((outputMatches * 125) / 1024).toFixed(2);
      }

      if (fs.existsSync(dataDir)) {
        let dBytes = 0;
        const dItems = fs.readdirSync(dataDir);
        for (const item of dItems) {
          if (item === 'stealth_profile') continue; // 22.000 dosyalık profil klasörünü gezme
          try {
            const st = fs.statSync(path.join(dataDir, item));
            if (!st.isDirectory()) dBytes += st.size;
          } catch (_) {}
        }
        dataMb = (dBytes / (1024 * 1024)).toFixed(2);
      }

      if (fs.existsSync(cookieFile)) {
        try {
          const cSize = fs.statSync(cookieFile).size;
          cookiesKb = (cSize / 1024).toFixed(1);
        } catch (_) {}
      }

      const totalMb = (parseFloat(outputMb) + parseFloat(dataMb) + (parseFloat(cookiesKb) / 1024)).toFixed(2);

      cachedStorageMetrics = {
        outputMb,
        outputMatches,
        dataMb,
        cookiesKb,
        totalMb
      };
    } catch (_) {}
    finally {
      isScanningStorage = false;
    }
  });
}

// Başlangıçta ve 60 saniyede bir hafif arka plan güncellemesi
loadRecentMatchesFromOutput();
refreshStorageMetricsAsync();
setInterval(refreshStorageMetricsAsync, 60000);

function logAgent(msg) {
  const time = new Date().toLocaleTimeString();
  let rawText = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  if (!rawText) return;

  // Çift zaman damgasını engelle (gelen [HH:MM:SS] temizlenir)
  rawText = rawText.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');

  const entry = `[${time}] ${rawText}`;
  liveLogs.push(entry);
  if (liveLogs.length > 600) liveLogs.shift();

  console.log(entry);
  parseLogForMetrics(rawText);
}

function parseLogForMetrics(text) {
  // Toplam Gün Sayısı
  const daysMatch = text.match(/Toplam\s*(\d+)\s*Gün İşlenecek/i);
  if (daysMatch) {
    liveState.totalDays = parseInt(daysMatch[1], 10);
    liveState.currentDay = 1;
  }

  // Aktif İşlenen Gün
  const curDayMatch = text.match(/\[Gün\s*(\d+)\/(\d+)\]\s*TARİH BAŞLATILIYOR:\s*([\d-]+)/i);
  if (curDayMatch) {
    liveState.currentDay = parseInt(curDayMatch[1], 10);
    liveState.totalDays = parseInt(curDayMatch[2], 10);
    liveState.currentDateStr = curDayMatch[3];
  }

  // Toplam Hedef Maç
  const totalMatch = text.match(/İşleme Alınacak Maç Sayısı:\s*(\d+)/i) || 
                     text.match(/🎯\s*İşleme Alınan.*?:\s*(\d+)/i) ||
                     text.match(/\[ORAN FİLTRESİ\]\s*(\d+)\s*oranlı maç/i);
  if (totalMatch) {
    liveState.totalMatches = parseInt(totalMatch[1], 10);
  }

  // Tekil Maç Başarı Satırı (📁 JSON: ... veya JSON Kaydedildi: ...)
  const singleSaved = text.match(/(?:📁\s*JSON|JSON Kaydedildi|JSON):\s*(.*)/i);
  if (singleSaved) {
    liveState.completedMatches = Math.max(liveState.completedMatches, 1);
    liveState.totalMatches = Math.max(liveState.totalMatches, 1);
    const fPath = singleSaved[1].trim();
    const matchDir = fPath.match(/output[\\\/]([^\\\/]+)/);
    if (matchDir) {
      const slug = matchDir[1];
      let realDuration = '3.8s';
      let matchTitle = decodeURIComponent(slug).replace(/-/g, ' ').toUpperCase();
      try {
        const jsonFile = path.join(__dirname, 'output', slug, 'match_data.json');
        if (fs.existsSync(jsonFile)) {
          const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
          if (parsed?.meta?.durationSeconds) {
            realDuration = `${parsed.meta.durationSeconds}s`;
          }
          if (parsed?.hero?.homeTeam && parsed?.hero?.awayTeam) {
            matchTitle = `${parsed.hero.homeTeam} vs ${parsed.hero.awayTeam}`;
          }
        }
      } catch (_) {}

      liveState.latestScrapedSlug = slug;
      liveState.latestScrapedMatch = {
        title: matchTitle,
        slug: slug,
        duration: realDuration,
        time: new Date().toLocaleTimeString()
      };
      const newItem = {
        title: matchTitle,
        slug: slug,
        duration: realDuration,
        time: new Date().toLocaleTimeString(),
        workerId: 1
      };
      liveState.recentMatches = [ newItem, ...liveState.recentMatches.filter(x => x.slug !== slug) ].slice(0, 50);
    }
  }

  // İşçi Sekme Güncellemesi
  const workerRegex = /\[Sekme\s*(\d+)\]\s*(?:\[(\d+)\/(\d+)\])?\s*(✅|⚠️|❌)\s*([^()\-]+?)(?:\s*\(([0-9\.]+)s\))?(?:\s*->\s*(.*))?$/;
  const m = text.match(workerRegex);
  if (m) {
    const wId = m[1];
    const comp = m[2] ? parseInt(m[2], 10) : null;
    const tot = m[3] ? parseInt(m[3], 10) : null;
    const statusIcon = m[4];
    const matchTitle = (m[5] || '').trim();
    const duration = m[6] ? `${m[6]}s` : '5s';
    const filePath = (m[7] || '').trim();

    if (tot) liveState.totalMatches = tot;
    if (comp) liveState.completedMatches = comp;
    else if (statusIcon === '✅') {
      liveState.completedMatches++;
      cachedStorageMetrics.outputMatches++;
      cachedStorageMetrics.outputMb = ((cachedStorageMetrics.outputMatches * 125) / 1024).toFixed(2);
      cachedStorageMetrics.totalMb = (parseFloat(cachedStorageMetrics.outputMb) + parseFloat(cachedStorageMetrics.dataMb) + (parseFloat(cachedStorageMetrics.cookiesKb) / 1024)).toFixed(2);
    }

    let slug = '';
    if (filePath) {
      const matchDir = filePath.match(/output[\\\/]([^\\\/]+)/);
      if (matchDir) slug = matchDir[1];
    }
    if (!slug && matchTitle) {
      slug = matchTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    if (liveState.workers[wId]) {
      liveState.workers[wId] = {
        id: parseInt(wId, 10),
        status: statusIcon === '✅' ? 'done' : (statusIcon === '⚠️' ? 'retry' : 'error'),
        match: matchTitle || 'Maç Tamamlandı',
        duration: duration,
        slug: slug,
        time: new Date().toLocaleTimeString()
      };
    }

    if (statusIcon === '✅' && matchTitle) {
      liveState.currentMatch = matchTitle;
      liveState.latestScrapedSlug = slug;
      liveState.latestScrapedMatch = {
        title: matchTitle,
        slug: slug,
        duration: duration,
        time: new Date().toLocaleTimeString()
      };

      const newItem = {
        title: matchTitle,
        slug: slug,
        duration: duration,
        time: new Date().toLocaleTimeString(),
        workerId: wId
      };
      liveState.recentMatches = [ newItem, ...liveState.recentMatches.filter(x => x.slug !== slug) ].slice(0, 50);
    }
  }

  // Seans Tamamlandı Raporu
  if (text.includes('ALTIN STANDART TARAMA TAMAMLANDI') || text.includes('TÜM GÜNLERİN TARAMASI BAŞARIYLA TAMAMLANDI')) {
    const elapsedSec = activeProcessStartTime ? Math.round((Date.now() - activeProcessStartTime) / 1000) : 0;
    const session = {
      id: Date.now(),
      date: new Date().toLocaleDateString('tr-TR'),
      time: new Date().toLocaleTimeString(),
      mode: activeTargetMode ? activeTargetMode.toUpperCase() : 'MANUEL',
      total: liveState.totalMatches || liveState.completedMatches,
      completed: liveState.completedMatches,
      failed: liveState.failedMatches,
      durationSec: elapsedSec,
      avgSec: (elapsedSec / (liveState.completedMatches || 1)).toFixed(1),
      status: 'Tamamlandı'
    };
    liveState.sessions.unshift(session);
    saveSessions();

    Object.keys(liveState.workers).forEach(k => {
      liveState.workers[k].status = 'idle';
      liveState.workers[k].match = 'Beklemede';
    });
  }
}

// Scraper Durdurucu (Görevi İptal Et / Durdur)
function killAllScrapers(isManual = true) {
  if (isManual) {
    isManualStop = true;
    autoRetryCount = 0;
    lastRunParams = { mode: null, customDate: null, startDate: null, endDate: null, workers: null };
    logAgent(`⏹️ GÖREV İPTAL EDİLDİ: Aktif tarama anında sonlandırılıyor...`);
  }
  
  if (activeProcess) {
    const pidToKill = activeProcess.pid;
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;

    try { 
      // Windows yerel senkron taskkill (5 milisaniyede ağaç sonlandırma)
      execSync(`taskkill /F /T /PID ${pidToKill}`, { stdio: 'ignore' });
    } catch (_) {}
  }

  try {
    const stopFile = path.join(__dirname, 'stop_signal.txt');
    const pauseFile = path.join(__dirname, 'pause_signal.txt');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
    if (fs.existsSync(pauseFile)) fs.unlinkSync(pauseFile);
  } catch (e) {}

  liveState.isPaused = false;
  liveState.currentMatch = 'Durduruldu (Hazır)';
  Object.keys(liveState.workers).forEach(k => {
    liveState.workers[k].status = 'idle';
    liveState.workers[k].match = 'Durduruldu';
    liveState.workers[k].duration = '-';
  });

  if (isManual) {
    logAgent(`✅ Sistem sıfırlandı: Yeni bir tarih veya görev başlatmaya hazır.`);
  }
}

// Scraper Duraklatıcı (Pause)
function pauseScraper() {
  if (!activeProcess) {
    logAgent(`⚠️ Duraklatılacak aktif bir tarama süreci yok.`);
    return false;
  }
  try {
    fs.writeFileSync(path.join(__dirname, 'pause_signal.txt'), 'PAUSE', 'utf-8');
  } catch (_) {}
  liveState.isPaused = true;
  logAgent(`⏸️ TARAMA DURAKLATILDI: İşçiler beklemeye alınıyor...`);
  return true;
}

// Scraper Devam Ettirici (Resume)
function resumeScraper() {
  try {
    const pauseFile = path.join(__dirname, 'pause_signal.txt');
    if (fs.existsSync(pauseFile)) fs.unlinkSync(pauseFile);
  } catch (_) {}
  liveState.isPaused = false;
  logAgent(`▶️ TARAMA DEVAM EDİYOR: İşçiler kaldığı yerden devam ediyor.`);
  return true;
}

// Tüm Sistemi ve Tarayıcıları Kapatıcı (Full Shutdown)
function shutdownSystem() {
  logAgent(`🛑 SİSTEM KAPATILIYOR: Node.js sunucusu ve bot için çalışan tüm tarayıcılar sonlandırılıyor...`);
  
  if (activeProcess) {
    const pidToKill = activeProcess.pid;
    activeProcess = null;
    try { execSync(`taskkill /F /T /PID ${pidToKill}`, { stdio: 'ignore' }); } catch (_) {}
  }

  try {
    killAllBotProcesses();
  } catch (_) {}

  try {
    const stopFile = path.join(__dirname, 'stop_signal.txt');
    const pauseFile = path.join(__dirname, 'pause_signal.txt');
    const shutdownFile = path.join(__dirname, 'shutdown_signal.txt');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
    if (fs.existsSync(pauseFile)) fs.unlinkSync(pauseFile);
    fs.writeFileSync(shutdownFile, 'SHUTDOWN', 'utf-8');
  } catch (e) {}

  logAgent(`👋 Güle güle! Sistem tamamen kapatıldı.`);
  setTimeout(() => {
    process.exit(0);
  }, 300);
}

// Tekil Maç URL Çekici
function scrapeSingleMatchUrl(matchUrl) {
  if (activeProcess) {
    logAgent(`⚠️ Aktif bir tarama zaten devam ediyor. Lütfen bitmesini bekleyin.`);
    return;
  }

  let singleSlug = '';
  const urlM = matchUrl.match(/\/matches\/([^\/\?#]+)/);
  if (urlM) singleSlug = urlM[1];

  logAgent(`🎯 Tekil Maç Kazıma Başlatılıyor: ${matchUrl}`);
  activeTargetMode = 'single_match';
  activeProcessStartTime = Date.now();
  liveState.totalDays = 1;
  liveState.currentDay = 1;
  liveState.totalMatches = 1;
  liveState.completedMatches = 0;
  liveState.workers['1'] = { id: 1, status: 'running', match: matchUrl, duration: '-', time: new Date().toLocaleTimeString() };

  activeProcess = spawn(process.execPath, [path.join(__dirname, 'scrape_match.js'), `--url=${matchUrl}`], {
    cwd: __dirname,
    env: process.env,
    shell: false
  });

  activeProcess.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(line); });
  });

  activeProcess.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(`⚠️ ${line}`); });
  });

  activeProcess.on('close', (code) => {
    const elapsedSec = activeProcessStartTime ? Math.max(1, Math.round((Date.now() - activeProcessStartTime) / 1000)) : 4;
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;
    if (liveState.workers['1']) {
      liveState.workers['1'].status = code === 0 ? 'done' : 'error';
      liveState.workers['1'].duration = `${elapsedSec}s`;
    }
    if (code === 0) {
      liveState.completedMatches = 1;
      logAgent(`✅ Tekil maç kazıma başarıyla tamamlandı (${elapsedSec}s)!`);

      if (singleSlug) {
        let realDuration = `${elapsedSec}s`;
        let matchTitle = decodeURIComponent(singleSlug).replace(/-/g, ' ').toUpperCase();
        try {
          const jsonFile = path.join(__dirname, 'output', singleSlug, 'match_data.json');
          if (fs.existsSync(jsonFile)) {
            const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
            if (parsed?.meta?.durationSeconds) realDuration = `${parsed.meta.durationSeconds}s`;
            if (parsed?.hero?.homeTeam && parsed?.hero?.awayTeam) {
              matchTitle = `${parsed.hero.homeTeam} vs ${parsed.hero.awayTeam}`;
            }
          }
        } catch (_) {}

        liveState.latestScrapedSlug = singleSlug;
        liveState.latestScrapedMatch = {
          title: matchTitle,
          slug: singleSlug,
          duration: realDuration,
          time: new Date().toLocaleTimeString()
        };

        const newItem = {
          title: matchTitle,
          slug: singleSlug,
          duration: realDuration,
          time: new Date().toLocaleTimeString(),
          workerId: 1
        };
        liveState.recentMatches = [ newItem, ...liveState.recentMatches.filter(x => x.slug !== singleSlug) ].slice(0, 50);
      }

      const session = {
        id: Date.now(),
        date: new Date().toLocaleDateString('tr-TR'),
        time: new Date().toLocaleTimeString(),
        mode: 'TEKİL MAÇ',
        total: 1,
        completed: 1,
        failed: 0,
        durationSec: elapsedSec,
        avgSec: elapsedSec.toFixed(1),
        status: 'Tamamlandı'
      };
      liveState.sessions.unshift(session);
      saveSessions();
    } else {
      liveState.failedMatches = 1;
      logAgent(`⚠️ Tekil maç kazıma hatası (${code}).`);
    }
  });
}

// Pipeline Çalıştırıcı
function runScraperMode(targetMode, customDate = null, startDate = null, endDate = null, customWorkers = null, isUserTriggered = true, forceRefresh = false) {
  if (targetMode === 'stop') {
    killAllScrapers(true);
    return;
  }

  if (isUserTriggered) {
    isManualStop = false;
    autoRetryCount = 0;
  }

  lastRunParams = {
    mode: targetMode,
    customDate,
    startDate,
    endDate,
    workers: customWorkers,
    forceRefresh
  };

  // Eğer önceki süreç asılı kaldıysa veya kullanıcı yeni bir görev verdiyse, önce eskiyi temizle
  if (activeProcess) {
    logAgent(`🔄 Yeni görev başlatılıyor: Önceki süreç sonlandırılıyor (${targetMode.toUpperCase()})...`);
    killAllScrapers(false);
  }

  try {
    const stopFile = path.join(__dirname, 'stop_signal.txt');
    const pauseFile = path.join(__dirname, 'pause_signal.txt');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
    if (fs.existsSync(pauseFile)) fs.unlinkSync(pauseFile);
  } catch (e) {}

  const workersToUse = customWorkers || localConfig.concurrency || 4;
  localConfig.concurrency = workersToUse;
  initWorkers();

  let modeDesc = targetMode.toUpperCase();
  if (targetMode === 'random') modeDesc = 'BUGÜNDEN RASTGELE MAÇ';
  if (targetMode === 'custom' && customDate) modeDesc = `ÖZEL TARİH (${customDate})`;
  if (targetMode === 'range' && startDate && endDate) modeDesc = `TARİH ARALIĞI (${startDate} -> ${endDate})`;

  logAgent(`⚡ Tarama Başlatılıyor: MOD = ${modeDesc} (${workersToUse} Sekme)...`);

  const scraperScript = path.join(__dirname, 'daily_pipeline.js');
  if (!fs.existsSync(scraperScript)) {
    logAgent(`❌ HATA: ${scraperScript} dosyası bulunamadı!`);
    return;
  }

  activeTargetMode = targetMode;
  activeProcessStartTime = Date.now();
  lastActivityTime = Date.now();
  liveState.completedMatches = 0;
  liveState.failedMatches = 0;
  liveState.totalDays = 1;
  liveState.currentDay = 1;

  Object.keys(liveState.workers).forEach(k => {
    liveState.workers[k] = { id: parseInt(k, 10), status: 'running', match: 'Sekme Başlatılıyor...', duration: '-', time: new Date().toLocaleTimeString() };
  });

  const spawnArgs = [ scraperScript, `--workers=${workersToUse}` ];

  if (forceRefresh) {
    spawnArgs.push('--force-refresh');
  }

  if (localConfig.autoSyncApex) {
    spawnArgs.push('--sync-apex');
  }

  if (targetMode === 'random') {
    spawnArgs.push('--today');
    spawnArgs.push('--random');
  } else if (targetMode === 'custom' && customDate) {
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

  activeProcess = spawn(process.execPath, spawnArgs, {
    cwd: __dirname,
    env: process.env,
    shell: false
  });

  activeProcess.stdout.on('data', (data) => {
    lastActivityTime = Date.now();
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(line); });
  });

  activeProcess.stderr.on('data', (data) => {
    lastActivityTime = Date.now();
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(`⚠️ ${line}`); });
  });

  activeProcess.on('close', (code) => {
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;

    if (code !== 0 && code !== null) {
      logAgent(`⚠️ Tarama Süreci ${code} Koduyla Sona Erdi.`);

      // 🔄 Otomatik Kurtarma Kalkanı: Kullanıcı bilerek durdurmadıysa, kaldığı yerden otomatik devam et!
      if (!isManualStop && lastRunParams.mode && autoRetryCount < MAX_AUTO_RETRIES) {
        autoRetryCount++;
        logAgent(`🔄 [OTOMATİK KURTARMA] Tarama süreci beklenmedik şekilde sonlandı (Kod: ${code}). 5 saniye içinde kaldığı maçtan otomatik olarak devam ettiriliyor (Deneme: ${autoRetryCount}/${MAX_AUTO_RETRIES})...`);
        setTimeout(() => {
          if (!activeProcess && !isManualStop && lastRunParams.mode) {
            runScraperMode(lastRunParams.mode, lastRunParams.customDate, lastRunParams.startDate, lastRunParams.endDate, lastRunParams.workers, false, lastRunParams.forceRefresh);
          }
        }, 5000);
      }
    } else {
      autoRetryCount = 0;
    }
  });
}

// 🛡️ Zamanlayıcı & Akıllı Kilitlenme İzleyici (Watchdog) Kontrolü
setInterval(() => {
  const now = new Date();
  const todayDateStr = now.toISOString().split('T')[0];
  const pad = n => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 🛡️ Watchdog: Sadece bot süreci 15 dakikadır hiçbir aktivite/log göstermediğinde (gerçek kilitlenme) tetiklenir!
  // Eğer bot düzenli olarak log üretiyor ve maç kazıyorsa, tarama 10 saat de sürse süreç asla öldürülmez!
  if (activeProcess && activeProcessStartTime) {
    const inactiveMinutes = (Date.now() - lastActivityTime) / (1000 * 60);
    if (inactiveMinutes > 15) {
      logAgent(`🛡️ WATCHDOG: Bot süreci 15 dakikadır hiçbir log veya aktivite üretmedi (kilitlendi), otomatik sıfırlanıp devam ettiriliyor...`);
      killAllScrapers(false);
    }
  }

  if (!localConfig.automation_active || activeProcess) return;

  if (localConfig.cron_yesterday && currentTime === localConfig.cron_yesterday) {
    if (lastTriggered.yesterday !== todayDateStr) {
      lastTriggered.yesterday = todayDateStr;
      runScraperMode('yesterday');
    }
  } else if (localConfig.cron_today && currentTime === localConfig.cron_today) {
    if (lastTriggered.today !== todayDateStr) {
      lastTriggered.today = todayDateStr;
      runScraperMode('today');
    }
  } else if (localConfig.cron_tomorrow && currentTime === localConfig.cron_tomorrow) {
    if (lastTriggered.tomorrow !== todayDateStr) {
      lastTriggered.tomorrow = todayDateStr;
      runScraperMode('tomorrow');
    }
  }
}, 15000);

// En Son Çekilen Maç Slug'ını Bulucu (Hafızadan Anında Döner, Sıfır Disk Gecikmesi)
function getLatestOutputSlug() {
  if (liveState.latestScrapedSlug) return liveState.latestScrapedSlug;
  if (liveState.recentMatches && liveState.recentMatches.length > 0) {
    return liveState.recentMatches[0].slug;
  }
  return null;
}

// 📊 Bülten & APEX Senkronizasyon Radarı Motoru
let cachedBulletinHistory = null;
let lastBulletinHistoryTime = 0;

// APEX Veritabanındaki Canlı Maç Sayılarını Getirir
function getApexDbCounts() {
  try {
    const phpPath = 'c:\\xampp\\php\\php.exe';
    const scriptPath = path.join(__dirname, 'core', 'get_apex_counts.php');
    if (fs.existsSync(phpPath) && fs.existsSync(scriptPath)) {
      const out = execSync(`"${phpPath}" "${scriptPath}"`, { encoding: 'utf8', timeout: 4000 });
      const parsed = JSON.parse(out);
      if (parsed && parsed.success && parsed.counts) {
        return parsed.counts;
      }
    }
  } catch (_) {}
  return {};
}

function getBulletinHistory(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedBulletinHistory && (now - lastBulletinHistoryTime < 300000)) {
    return cachedBulletinHistory;
  }

  const dataDir = path.join(__dirname, 'data');
  const archiveDir = path.join(dataDir, 'archive');
  const allFiles = new Map(); // dateStr -> filePath
  const apexCountsMap = getApexDbCounts();

  // 1. data/ altındaki dosyaları topla
  if (fs.existsSync(dataDir)) {
    try {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        const m = f.match(/^predictions_(\d{4}-\d{2}-\d{2})\.json$/);
        if (m) {
          allFiles.set(m[1], path.join(dataDir, f));
        }
      }
    } catch (_) {}
  }

  // 2. data/archive/ altındaki dosyaları topla (alt klasörler: YYYY-MM)
  if (fs.existsSync(archiveDir)) {
    try {
      const subDirs = fs.readdirSync(archiveDir);
      for (const sub of subDirs) {
        const subPath = path.join(archiveDir, sub);
        if (fs.statSync(subPath).isDirectory()) {
          const files = fs.readdirSync(subPath);
          for (const f of files) {
            const m = f.match(/^predictions_(\d{4}-\d{2}-\d{2})\.json$/);
            if (m && !allFiles.has(m[1])) {
              allFiles.set(m[1], path.join(subPath, f));
            }
          }
        }
      }
    } catch (_) {}
  }

  // 3. Tarihleri sırala (en yeniden en eskiye)
  const sortedDates = Array.from(allFiles.keys()).sort().reverse();
  const daysList = [];
  let sumTotal = 0;
  let sumFinished = 0;
  let sumPending = 0;
  let sumSyncedDays = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  for (const dateStr of sortedDates) {
    const filePath = allFiles.get(dateStr);
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = JSON.parse(content);

      if (!Array.isArray(matches)) continue;

      let finished = 0;
      let pending = 0;

      for (const match of matches) {
        const hero = match.hero;
        if (!hero) { pending++; continue; }
        const hasScore = (
          hero.status === 'FT' || 
          hero.status === 'AET' || 
          hero.status === 'Pen.' || 
          (hero.score && hero.score !== '-' && hero.score !== '?' && !hero.score.includes('?'))
        );
        if (hasScore) finished++; else pending++;
      }

      const total = matches.length;
      sumTotal += total;
      sumFinished += finished;
      sumPending += pending;

      // APEX Senkronizasyon Durumu (Session geçmişinden eşleştir)
      let apexStatus = 'synced';
      let lastSyncTime = new Date(stat.mtime).toLocaleString('tr-TR');

      if (Array.isArray(liveState.sessions)) {
        const matchedSession = liveState.sessions.find(s => s.date === dateStr || (s.date && s.date.includes(dateStr.slice(5))));
        if (matchedSession) {
          lastSyncTime = matchedSession.time ? `${matchedSession.date} ${matchedSession.time}` : lastSyncTime;
          if (matchedSession.failed > 0) apexStatus = 'partial';
        }
      }

      if (apexStatus === 'synced') sumSyncedDays++;

      let dayTag = '';
      if (dateStr === todayStr) dayTag = 'Bugün';
      else if (dateStr === yesterdayStr) dayTag = 'Dün';
      else if (dateStr === tomorrowStr) dayTag = 'Yarın';

      // APEX Veritabanı ile Karşılaştırma
      const apexTotal = apexCountsMap[dateStr] !== undefined ? apexCountsMap[dateStr] : null;
      let matchSyncStatus = 'equal';
      let matchSyncDiff = 0;

      if (apexTotal !== null) {
        matchSyncDiff = total - apexTotal;
        if (matchSyncDiff === 0) {
          matchSyncStatus = 'equal';
        } else if (matchSyncDiff < 0) {
          matchSyncStatus = 'missing_local'; // Yerelde eksik var (Örn: iptal edildiği için 130 < 189)
        } else {
          matchSyncStatus = 'more_local'; // Botta yeni/ekstra maç var (Örn: 270 > 260)
        }
      } else {
        matchSyncStatus = 'not_in_apex';
      }

      daysList.push({
        date: dateStr,
        dayTag,
        totalMatches: total,
        apexMatches: apexTotal !== null ? apexTotal : total,
        matchSyncStatus,
        matchSyncDiff,
        finishedMatches: finished,
        pendingMatches: pending,
        settledPct: total > 0 ? Math.round((finished / total) * 100) : 0,
        fileSizeMb: (stat.size / (1024 * 1024)).toFixed(2),
        lastModified: stat.mtime,
        lastSyncTime,
        apexStatus,
        filePath
      });
    } catch (_) {}
  }

  let sumApexTotal = 0;
  Object.keys(apexCountsMap).forEach(k => { sumApexTotal += apexCountsMap[k]; });

  const result = {
    summary: {
      totalDays: sortedDates.length,
      totalMatches: sumTotal,
      totalApexMatches: sumApexTotal || sumTotal,
      totalFinished: sumFinished,
      totalPending: sumPending,
      overallSettledPct: sumTotal > 0 ? Math.round((sumFinished / sumTotal) * 100) : 0,
      apexSyncPct: sortedDates.length > 0 ? Math.round((sumSyncedDays / sortedDates.length) * 100) : 100
    },
    days: daysList
  };

  cachedBulletinHistory = result;
  lastBulletinHistoryTime = now;
  return result;
}

function getBulletinMatches(dateStr) {
  if (!dateStr) return [];
  const dataDir = path.join(__dirname, 'data');
  let targetFile = path.join(dataDir, `predictions_${dateStr}.json`);

  if (!fs.existsSync(targetFile)) {
    const ym = dateStr.slice(0, 7);
    const archFile = path.join(dataDir, 'archive', ym, `predictions_${dateStr}.json`);
    if (fs.existsSync(archFile)) targetFile = archFile;
  }

  if (!fs.existsSync(targetFile)) return [];

  try {
    const content = fs.readFileSync(targetFile, 'utf-8');
    const matches = JSON.parse(content);
    if (!Array.isArray(matches)) return [];

    const now = new Date();

    return matches.map(m => {
      const hero = m.hero || {};
      const score = hero.finalScore || hero.score || '-';
      const isFinished = (
        hero.status === 'FT' || 
        hero.status === 'AET' || 
        hero.status === 'Pen.' || 
        (hero.score && hero.score !== '-' && hero.score !== '?' && !hero.score.includes('?'))
      );

      let slug = '';
      if (m.meta?.url) {
        const sm = m.meta.url.match(/\/matches\/(.+?)(?:[?#]|$)/);
        if (sm) slug = sm[1].replace(/[\/\\]+/g, '-');
      }

      // Maç saati geçmiş mi kontrolü
      let isOverdue = false;
      if (!isFinished && hero.matchDate && hero.matchTime && hero.matchTime !== '-') {
        try {
          const parts = hero.matchDate.split(/[\/\-\.]/);
          if (parts.length === 3) {
            const timeParts = hero.matchTime.split(':');
            const mDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), parseInt(timeParts[0], 10), parseInt(timeParts[1] || 0, 10));
            // 2 saat geçmişse gecikmiş/bitmesi gereken maç sayılır
            if (now.getTime() - mDate.getTime() > 2 * 60 * 60 * 1000) {
              isOverdue = true;
            }
          }
        } catch (_) {}
      }

      return {
        slug,
        homeTeam: hero.homeTeam || 'Ev Sahibi',
        awayTeam: hero.awayTeam || 'Deplasman',
        homeLogo: hero.homeLogo || '',
        awayLogo: hero.awayLogo || '',
        league: hero.league || hero.leagueName || '-',
        country: hero.country || '-',
        matchDate: hero.matchDate || dateStr,
        matchTime: hero.matchTime || '-',
        score: score,
        htScore: hero.htScore || '-',
        status: isFinished ? (hero.status || 'FT') : (hero.status || 'Upcoming'),
        isFinished,
        isOverdue,
        pick1X2: m.markets?.['1X2']?.pick || '-',
        odd1X2: m.markets?.['1X2']?.mainOdds || '-',
        pickUnderOver: m.markets?.['UnderOver']?.pick || '-',
        oddUnderOver: m.markets?.['UnderOver']?.mainOdds || '-',
        pickBTTS: m.markets?.['BTTS']?.pick || '-',
        forebetUrl: m.meta?.url || ''
      };
    });
  } catch (_) {
    return [];
  }
}

async function syncDateToApex(dateStr) {
  if (!dateStr) throw new Error('Tarih belirtilmedi.');
  const dataDir = path.join(__dirname, 'data');
  let targetFile = path.join(dataDir, `predictions_${dateStr}.json`);

  if (!fs.existsSync(targetFile)) {
    const ym = dateStr.slice(0, 7);
    const archFile = path.join(dataDir, 'archive', ym, `predictions_${dateStr}.json`);
    if (fs.existsSync(archFile)) targetFile = archFile;
  }

  if (!fs.existsSync(targetFile)) {
    throw new Error(`${dateStr} tarihine ait yerel bülten dosyası bulunamadı.`);
  }

  const { uploadMatchesToApex } = require('./core/apex_uploader');
  const content = fs.readFileSync(targetFile, 'utf-8');
  const matches = JSON.parse(content);

  logAgent(`📡 [MANUEL APEX SENKRONİZASYONU] ${dateStr} tarihli ${matches.length} maç canlı APEX API'ye aktarılıyor...`);

  const syncRes = await uploadMatchesToApex(matches, {
    dateStr,
    logger: (m) => logAgent(m)
  });

  return syncRes;
}

// HTTP Sunucu & REST API
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // 1. API: Durum ve Canlı Metrikler & Depolama & Çerezler (Sıfır Bloklama, <1ms Yanıt)
  if (reqUrl.pathname === '/api/status') {
    const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    const uptimeSeconds = Math.round(process.uptime());
    const elapsedSec = activeProcessStartTime ? Math.round((Date.now() - activeProcessStartTime) / 1000) : 0;
    const progressPct = liveState.totalMatches > 0 ? Math.min(100, Math.round((liveState.completedMatches / liveState.totalMatches) * 100)) : (activeProcess ? 5 : 0);

    const latestSlug = getLatestOutputSlug();

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: !!activeProcess,
      isPaused: Boolean(liveState.isPaused),
      activeMode: activeTargetMode,
      elapsedSeconds: elapsedSec,
      memoryMb,
      uptimeSeconds,
      nodeStatus: {
        active: true,
        processCount: updateNodeProcessCount(),
        version: process.version,
        activeBotWorkers: activeProcess ? (parseInt(localConfig.concurrency, 10) || 4) : 0
      },
      logs: liveLogs,
      config: localConfig,
      progress: {
        totalDays: liveState.totalDays,
        currentDay: liveState.currentDay,
        currentDateStr: liveState.currentDateStr,
        total: liveState.totalMatches,
        completed: liveState.completedMatches,
        failed: liveState.failedMatches,
        percent: progressPct,
        currentMatch: liveState.currentMatch
      },
      storage: {
        outputMb: cachedStorageMetrics.outputMb,
        outputMatches: cachedStorageMetrics.outputMatches,
        dataMb: cachedStorageMetrics.dataMb,
        cookiesKb: cachedStorageMetrics.cookiesKb,
        totalMb: cachedStorageMetrics.totalMb
      },
      workers: liveState.workers,
      latestMatch: liveState.latestScrapedMatch || { slug: latestSlug, forebetUrl: latestSlug ? `https://www.forebet.com/en/football/matches/${latestSlug}` : '' },
      recentMatches: liveState.recentMatches,
      sessions: liveState.sessions
    }));
    return;
  }

  // 2. API: Tarama Tetikleme (Başlat / Durdur / Duraklat / Devam Et / Kapat)
  if (reqUrl.pathname === '/api/trigger') {
    const mode = reqUrl.searchParams.get('mode');
    const customDate = reqUrl.searchParams.get('date');
    const startDate = reqUrl.searchParams.get('start');
    const endDate = reqUrl.searchParams.get('end');
    const workers = reqUrl.searchParams.get('workers') ? parseInt(reqUrl.searchParams.get('workers'), 10) : null;
    const force = reqUrl.searchParams.get('force') === 'true' || reqUrl.searchParams.get('force') === '1';

    if (mode === 'stop') {
      killAllScrapers();
    } else if (mode === 'pause') {
      pauseScraper();
    } else if (mode === 'resume') {
      resumeScraper();
    } else if (mode === 'shutdown') {
      shutdownSystem();
    } else if (mode) {
      runScraperMode(mode, customDate, startDate, endDate, workers, true, force);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, mode, isPaused: liveState.isPaused }));
    return;
  }

  // 2.5 API: Doğrudan Kısayol İşlemleri (Shutdown, Pause, Resume)
  if (reqUrl.pathname === '/api/shutdown') {
    shutdownSystem();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'Sistem kapatılıyor...' }));
    return;
  }
  if (reqUrl.pathname === '/api/pause') {
    pauseScraper();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, isPaused: true }));
    return;
  }
  if (reqUrl.pathname === '/api/resume') {
    resumeScraper();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, isPaused: false }));
    return;
  }

  // 2.6 API: Pencere Kontrolleri (Sistem Tepsisine Küçült / Geri Yükle)
  if (reqUrl.pathname === '/api/window/minimize') {
    try {
      fs.writeFileSync(path.join(__dirname, 'minimize_signal.txt'), 'MINIMIZE', 'utf-8');
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, minimized: true }));
    return;
  }

  if (reqUrl.pathname === '/api/window/restore') {
    try {
      fs.writeFileSync(path.join(__dirname, 'restore_signal.txt'), 'RESTORE', 'utf-8');
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, restored: true }));
    return;
  }

  // 2.7 API: Zamanlayıcı Aç / Kapat Toggle
  if (reqUrl.pathname === '/api/toggle_automation') {
    const forced = reqUrl.searchParams.get('active');
    if (forced !== null) {
      localConfig.automation_active = forced === 'true' || forced === '1';
    } else {
      localConfig.automation_active = !localConfig.automation_active;
    }
    saveLocalConfig();
    try {
      const { syncWindowsTasks } = require('./core/scheduler_manager');
      syncWindowsTasks(localConfig, (m) => logAgent(m));
    } catch (_) {}

    logAgent(`🕒 Zamanlayıcı otomasyonu ${localConfig.automation_active ? 'AKTİF EDİLDİ' : 'DURDURULDU (KAPATILDI)'}.`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, automation_active: localConfig.automation_active }));
    return;
  }

  // 3. API: Tekil Maç Kazıma URL
  if (reqUrl.pathname === '/api/scrape_single') {
    const matchUrl = reqUrl.searchParams.get('url');
    if (matchUrl && matchUrl.startsWith('http')) {
      scrapeSingleMatchUrl(matchUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, url: matchUrl }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'Geçersiz URL' }));
    }
    return;
  }

  // 4. API: Ayarları Kaydet
  if (reqUrl.pathname === '/api/save_config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        localConfig = Object.assign(localConfig, JSON.parse(body));
        saveLocalConfig();
        logAgent(`⚙️ Ayarlar başarıyla kaydedildi (Sekme Sayısı: ${localConfig.concurrency}).`);

        // 🕒 Windows Task Scheduler & Zamanlayıcı Senkronizasyonu
        try {
          const { syncWindowsTasks } = require('./core/scheduler_manager');
          syncWindowsTasks(localConfig, (m) => logAgent(m));
        } catch (_) {}
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, config: localConfig }));
    });
    return;
  }

  // 5. API: 1:1 Canlı HTML Viewer
  if (reqUrl.pathname === '/api/viewer' || reqUrl.pathname === '/api/latest_viewer' || reqUrl.pathname.startsWith('/viewer/')) {
    let slug = reqUrl.searchParams.get('slug') || reqUrl.pathname.replace('/viewer/', '');
    if (!slug || slug === 'latest' || reqUrl.pathname === '/api/latest_viewer') slug = getLatestOutputSlug();

    if (!slug) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>⚠️ Henüz çekilmiş maç verisi bulunamadı.</h3>`);
      return;
    }

    const jsonPath = path.join(__dirname, 'output', slug, 'match_data.json');
    if (!fs.existsSync(jsonPath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>⚠️ [${slug}] maçına ait veri bulunamadı (${jsonPath}).</h3>`);
      return;
    }

    try {
      const matchData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const html = generateMatchViewer(matchData);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>❌ Viewer Oluşturma Hatası: ${err.message}</h3>`);
    }
    return;
  }

  // 5.5 API: Ham JSON Görüntüleyici
  if (reqUrl.pathname === '/api/json' || reqUrl.pathname === '/api/latest_json' || reqUrl.pathname.startsWith('/json/')) {
    let slug = reqUrl.searchParams.get('slug') || reqUrl.pathname.replace('/json/', '');
    if (!slug || slug === 'latest' || reqUrl.pathname === '/api/latest_json') slug = getLatestOutputSlug();

    if (!slug) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Henüz çekilmiş maç verisi bulunamadı.' }));
      return;
    }

    const jsonPath = path.join(__dirname, 'output', slug, 'match_data.json');
    if (!fs.existsSync(jsonPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `[${slug}] maçına ait veri bulunamadı (${jsonPath}).` }));
      return;
    }

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(jsonContent);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. API: En Son Çekilen Maçın Forebet Orijinal Sayfasına Yönlendir
  if (reqUrl.pathname === '/api/latest_forebet') {
    const slug = getLatestOutputSlug();
    if (slug) {
      res.writeHead(302, { 'Location': `https://www.forebet.com/en/football/matches/${encodeURIComponent(slug)}` });
      res.end();
    } else {
      res.writeHead(302, { 'Location': 'https://www.forebet.com' });
      res.end();
    }
    return;
  }

  // 6. API: En Son Çekilen Maçın Bilgisi
  if (reqUrl.pathname === '/api/latest_info') {
    const slug = getLatestOutputSlug();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      slug: slug,
      viewerUrl: slug ? `/api/viewer?slug=${encodeURIComponent(slug)}` : null,
      forebetUrl: slug ? `https://www.forebet.com/en/football/matches/${slug}` : null
    }));
    return;
  }

  // 7. API: Önbellek / Çıktı Temizleme
  if (reqUrl.pathname === '/api/clean_storage' && req.method === 'POST') {
    try {
      const outDir = path.join(__dirname, 'output');
      if (fs.existsSync(outDir)) {
        const items = fs.readdirSync(outDir);
        for (const item of items) {
          fs.rmSync(path.join(outDir, item), { recursive: true, force: true });
        }
      }
      liveState.recentMatches = [];
      liveState.latestScrapedSlug = null;
      liveState.latestScrapedMatch = null;
      logAgent(`🧹 Çıktı klasörü ve önbellek tamamen temizlendi.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7.1 API: Sistem Sağlık Radarı & Teşhis
  if (reqUrl.pathname === '/api/system-health') {
    try {
      const healthData = await getCompleteSystemHealth(localConfig);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(healthData));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.2 API: Dahili Görev Yöneticisi (Bot Süreçleri Listesi)
  if (reqUrl.pathname === '/api/tasks') {
    try {
      const tasks = getBotTasks();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, tasks }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.3 API: Acil Fren (Tüm Bot ve Chromium Süreçlerini Durdur)
  if (reqUrl.pathname === '/api/tasks/kill-all') {
    try {
      killAllScrapers(true);
      const killResult = killAllBotProcesses();
      logAgent('🛑 [ACİL FREN] Kullanıcı talebiyle tüm tarayıcı ve kazıma süreçleri sonlandırıldı.');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(killResult));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.4 API: Tekil Görev Sonlandır (Kill Process by PID)
  if (reqUrl.pathname === '/api/tasks/kill') {
    const pid = reqUrl.searchParams.get('pid');
    try {
      const result = killTaskByPid(pid);
      if (result.success) {
        logAgent(`✂️ [GÖREV YÖNETİCİSİ] PID ${pid} süreci sonlandırıldı.`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.5 API: Canlı Renkli Log Akışı
  if (reqUrl.pathname === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, logs: liveLogs }));
    return;
  }

  // 7.6 API: Hızlı Manuel Zamanlayıcı Tetikleme (Sabah / Akşam / Bugün)
  if (reqUrl.pathname === '/api/scheduler/run-now') {
    const target = reqUrl.searchParams.get('target');
    const workers = parseInt(reqUrl.searchParams.get('workers'), 10) || (localConfig.concurrency || 4);
    if (target === 'morning' || target === 'yesterday') {
      logAgent('🚀 [ZAMANLAYICI TETİKLEME] Sabah Görevi (Dünün Maçları) manuel başlatıldı.');
      runScraperMode('yesterday', null, null, null, workers);
    } else if (target === 'evening' || target === 'tomorrow') {
      logAgent('🚀 [ZAMANLAYICI TETİKLEME] Akşam Görevi (Yarının Bülteni) manuel başlatıldı.');
      runScraperMode('tomorrow', null, null, null, workers);
    } else {
      logAgent('🚀 [ZAMANLAYICI TETİKLEME] Bugünün Maçları manuel başlatıldı.');
      runScraperMode('today', null, null, null, workers);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, target }));
    return;
  }

  // 7.7 API: Bülten & APEX Radarı Geçmişi (Tüm Tarihler ve İstatistikler)
  if (reqUrl.pathname === '/api/bulletin_history') {
    try {
      const isForce = reqUrl.searchParams.get('refresh') === 'true' || 
                      reqUrl.searchParams.get('force') === '1' || 
                      reqUrl.searchParams.get('force') === 'true';
      const history = getBulletinHistory(isForce);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, ...history }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.8 API: Seçilen Tarihteki Maçların Ayrıntılı Listesi (Açılır Çekmece)
  if (reqUrl.pathname === '/api/bulletin_matches') {
    const targetDate = reqUrl.searchParams.get('date');
    try {
      const matches = getBulletinMatches(targetDate);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, date: targetDate, total: matches.length, matches }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.9 API: Yerel Bülteni Doğrudan Canlı APEX API'ye Aktar (Offline Sync)
  if (reqUrl.pathname === '/api/sync_date_to_apex' && (req.method === 'POST' || req.method === 'GET')) {
    const targetDate = reqUrl.searchParams.get('date');
    try {
      const syncRes = await syncDateToApex(targetDate);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, date: targetDate, ...syncRes }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7.10 API: Bülten JSON Dosyasını İndir
  if (reqUrl.pathname === '/api/download_bulletin') {
    const targetDate = reqUrl.searchParams.get('date');
    const dataDir = path.join(__dirname, 'data');
    let targetFile = path.join(dataDir, `predictions_${targetDate}.json`);
    if (!fs.existsSync(targetFile)) {
      const ym = targetDate ? targetDate.slice(0, 7) : '';
      const archFile = path.join(dataDir, 'archive', ym, `predictions_${targetDate}.json`);
      if (fs.existsSync(archFile)) targetFile = archFile;
    }

    if (fs.existsSync(targetFile)) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="predictions_${targetDate}.json"`
      });
      res.end(fs.readFileSync(targetFile));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'Dosya bulunamadı.' }));
    }
    return;
  }

  // 8. Serve index.html
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(fs.readFileSync(indexPath, 'utf-8'));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('index.html bulunamadı.');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [HATA] Port ${PORT} şu an başka bir işlem veya arka plan servisi tarafından kullanılıyor!`);
    console.error(`👉 Çözüm: Görev Yöneticisinden veya cmd üzerinden port ${PORT}'i kullanan Node.js sürecini kapatıp tekrar başlatın.\n`);
    process.exit(1);
  } else {
    console.error(`\n❌ [HATA] Sunucu başlatılamadı:`, err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  logAgent(`🚀 BPA V4 Master Control Center Başlatıldı: http://localhost:${PORT}`);
});
