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

const PORT = 3000;

// Konfigürasyon
const CONFIG = {
  webApiUrl: 'https://realmobilebet.com/bpav3/api/sync_ingest.php',
  localApiUrl: 'http://localhost/bpav3/api/sync_ingest.php',
  apiToken: 'BPA_g7wXmi9oa32slLeb',
  maxProcessExecutionMinutes: 120
};

let activeProcess = null;
let activeProcessStartTime = null;
let activeTargetMode = null;
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

// Çekilmiş Maçları Output Klasöründen Yükle
function loadRecentMatchesFromOutput() {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) return;
  try {
    const dirs = fs.readdirSync(outDir)
      .map(name => {
        const full = path.join(outDir, name);
        const jsonFile = path.join(full, 'match_data.json');
        if (fs.existsSync(jsonFile)) {
          const stat = fs.statSync(jsonFile);
          let realDuration = '3.8s';
          let matchTitle = '';
          try {
            const raw = fs.readFileSync(jsonFile, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed?.meta?.durationSeconds) {
              realDuration = `${parsed.meta.durationSeconds}s`;
            }
            if (parsed?.hero?.homeTeam && parsed?.hero?.awayTeam) {
              matchTitle = `${parsed.hero.homeTeam} vs ${parsed.hero.awayTeam}`;
            }
          } catch (_) {}

          if (!matchTitle) {
            matchTitle = decodeURIComponent(name).replace(/-/g, ' ').toUpperCase();
          }

          return {
            slug: name,
            title: matchTitle,
            time: stat.mtimeMs,
            dateObj: stat.mtime,
            duration: realDuration
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.time - a.time);

    if (dirs.length > 0) {
      liveState.latestScrapedSlug = dirs[0].slug;
      liveState.latestScrapedMatch = {
        title: dirs[0].title,
        slug: dirs[0].slug,
        duration: dirs[0].duration,
        time: dirs[0].dateObj.toLocaleTimeString('tr-TR')
      };

      liveState.recentMatches = dirs.slice(0, 50).map((d, idx) => {
        return {
          title: d.title,
          slug: d.slug,
          duration: d.duration,
          time: d.dateObj.toLocaleTimeString('tr-TR'),
          workerId: (idx % (parseInt(localConfig.concurrency, 10) || 4)) + 1
        };
      });
    }
  } catch (e) {}
}
loadRecentMatchesFromOutput();

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

// Node.js Arka Plan Süreç Sayacı
let cachedNodeProcessCount = 1;
let lastNodeCheckTime = 0;
function updateNodeProcessCount() {
  const now = Date.now();
  if (now - lastNodeCheckTime < 2000) return cachedNodeProcessCount;
  lastNodeCheckTime = now;

  exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', (err, stdout) => {
    if (!err && stdout) {
      const lines = stdout.trim().split('\n').filter(l => l.toLowerCase().includes('node.exe'));
      cachedNodeProcessCount = Math.max(1, lines.length);
    }
  });
  return cachedNodeProcessCount;
}
updateNodeProcessCount();

// Klasör Boyutu Hesaplayıcı
function getFolderMetrics(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  let dirCount = 0;
  if (!fs.existsSync(dirPath)) return { bytes: 0, mb: '0.00', files: 0, dirs: 0 };

  function scan(cur) {
    try {
      const items = fs.readdirSync(cur);
      for (const item of items) {
        const full = path.join(cur, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          dirCount++;
          scan(full);
        } else {
          totalBytes += stat.size;
          fileCount++;
        }
      }
    } catch (_) {}
  }
  scan(dirPath);

  return {
    bytes: totalBytes,
    mb: (totalBytes / (1024 * 1024)).toFixed(2),
    files: fileCount,
    dirs: dirCount
  };
}

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
    else if (statusIcon === '✅') liveState.completedMatches++;

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
function killAllScrapers() {
  logAgent(`⏹️ GÖREV İPTAL EDİLDİ: Aktif tarama anında sonlandırılıyor...`);
  
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

  logAgent(`✅ Sistem sıfırlandı: Yeni bir tarih veya görev başlatmaya hazır.`);
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
    const stopFile = path.join(__dirname, 'stop_signal.txt');
    const pauseFile = path.join(__dirname, 'pause_signal.txt');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
    if (fs.existsSync(pauseFile)) fs.unlinkSync(pauseFile);
  } catch (e) {}

  logAgent(`👋 Güle güle! Sistem tamamen kapatıldı.`);
  setTimeout(() => {
    process.exit(0);
  }, 100);
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
function runScraperMode(targetMode, customDate = null, startDate = null, endDate = null, customWorkers = null) {
  if (targetMode === 'stop') {
    killAllScrapers();
    return;
  }

  // Eğer önceki süreç asılı kaldıysa veya kullanıcı yeni bir görev verdiyse, önce eskiyi temizle
  if (activeProcess) {
    logAgent(`🔄 Yeni görev başlatılıyor: Önceki süreç sonlandırılıyor (${targetMode.toUpperCase()})...`);
    killAllScrapers();
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
  liveState.completedMatches = 0;
  liveState.failedMatches = 0;
  liveState.totalDays = 1;
  liveState.currentDay = 1;

  Object.keys(liveState.workers).forEach(k => {
    liveState.workers[k] = { id: parseInt(k, 10), status: 'running', match: 'Sekme Başlatılıyor...', duration: '-', time: new Date().toLocaleTimeString() };
  });

  const spawnArgs = [ scraperScript, `--workers=${workersToUse}` ];

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
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(line); });
  });

  activeProcess.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => { if (line.trim()) logAgent(`⚠️ ${line}`); });
  });

  activeProcess.on('close', (code) => {
    activeProcess = null;
    activeProcessStartTime = null;
    activeTargetMode = null;
    if (code !== 0 && code !== null) {
      logAgent(`⚠️ Tarama Süreci ${code} Koduyla Sona Erdi.`);
    }
  });
}

// 🛡️ Zamanlayıcı Kontrolü
setInterval(() => {
  const now = new Date();
  const todayDateStr = now.toISOString().split('T')[0];
  const pad = n => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (activeProcess && activeProcessStartTime) {
    const elapsedMinutes = (Date.now() - activeProcessStartTime) / (1000 * 60);
    if (elapsedMinutes > CONFIG.maxProcessExecutionMinutes) {
      logAgent(`🛡️ WATCHDOG: Süreç zaman aşımına uğradı, sıfırlanıyor...`);
      killAllScrapers();
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

// En Son Çekilen Maç Slug'ını Bulucu
function getLatestOutputSlug() {
  if (liveState.latestScrapedSlug) return liveState.latestScrapedSlug;
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) return null;

  try {
    const dirs = fs.readdirSync(outDir)
      .map(name => ({ name, time: fs.statSync(path.join(outDir, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    for (const d of dirs) {
      const jsonFile = path.join(outDir, d.name, 'match_data.json');
      if (fs.existsSync(jsonFile)) return d.name;
    }
  } catch (_) {}
  return null;
}

// HTTP Sunucu & REST API
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // 1. API: Durum ve Canlı Metrikler & Depolama & Çerezler
  if (reqUrl.pathname === '/api/status') {
    const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    const uptimeSeconds = Math.round(process.uptime());
    const elapsedSec = activeProcessStartTime ? Math.round((Date.now() - activeProcessStartTime) / 1000) : 0;
    const progressPct = liveState.totalMatches > 0 ? Math.min(100, Math.round((liveState.completedMatches / liveState.totalMatches) * 100)) : (activeProcess ? 5 : 0);

    const outMetrics = getFolderMetrics(path.join(__dirname, 'output'));
    const dataMetrics = getFolderMetrics(path.join(__dirname, 'data'));
    
    // Çerez / Profil Boyutları
    const cookieFile = path.join(__dirname, 'data', 'forebet_cookies.json');
    let cookieBytes = 0;
    if (fs.existsSync(cookieFile)) {
      try { cookieBytes = fs.statSync(cookieFile).size; } catch (_) {}
    }
    const profileMetrics = getFolderMetrics(path.join(__dirname, 'data', 'stealth_profile'));
    const totalCookieBytes = cookieBytes + profileMetrics.bytes;
    const cookieKb = (totalCookieBytes / 1024).toFixed(1);

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
        outputMb: outMetrics.mb,
        outputMatches: outMetrics.dirs,
        dataMb: dataMetrics.mb,
        cookiesKb: cookieKb,
        totalMb: (parseFloat(outMetrics.mb) + parseFloat(dataMetrics.mb) + (totalCookieBytes / (1024 * 1024))).toFixed(2)
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

    if (mode === 'stop') {
      killAllScrapers();
    } else if (mode === 'pause') {
      pauseScraper();
    } else if (mode === 'resume') {
      resumeScraper();
    } else if (mode === 'shutdown') {
      shutdownSystem();
    } else if (mode) {
      runScraperMode(mode, customDate, startDate, endDate, workers);
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

server.listen(PORT, () => {
  logAgent(`🚀 BPA V4 Master Control Center Başlatıldı: http://localhost:${PORT}`);
  try {
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
  } catch (_) {}
});
