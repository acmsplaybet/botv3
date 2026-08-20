/**
 * ====================================================================
 * BPA V3 — MASTER BOT CONTROLLER SERVER & LIVE WEB DASHBOARD (server.js)
 * ====================================================================
 * Features:
 * - Real-time SSE Live Log Streaming & Progress Monitoring
 * - Automated Scheduler / Recurring Cron for Live Matches & Bülten
 * - Dynamic APEX API URL & Secret Key Configuration (.json persistent)
 * - Single Match, Batch Crawling (Today, Yesterday, Tomorrow)
 * - 1:1 Match Viewer HTTP Hosting & JSON APIs
 * ====================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { scrapeMatch } = require('./scrape_match');
const { discoverDailyMatches } = require('./core/daily_discovery');
const { syncMatchToApex, loadConfig } = require('./core/apex_sync_client');

const PORT = process.env.PORT || 3050;

// SSE Client Connections
let sseClients = [];

function broadcastEvent(eventName, data) {
  const payload = JSON.stringify({
    event: eventName,
    timestamp: new Date().toLocaleTimeString(),
    ...data
  });
  sseClients.forEach(res => {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {}
  });
}

function broadcastLog(message, type = 'info') {
  broadcastEvent('log', { message, type });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Global Job State
let activeJob = {
  isRunning: false,
  jobType: null, // 'single', 'daily', 'batch'
  targetDate: null,
  limit: null,
  totalMatches: 0,
  completedMatches: 0,
  failedMatches: 0,
  progressPct: 0,
  currentMatch: null,
  cancelRequested: false,
  startTime: null
};

// Scheduler (Saat Bazlı Çoklu Görev Zamanlayıcısı) State
let schedulerConfig = {
  enabled: true,
  tasks: [
    { id: 'yesterday', name: 'Dünün Sonuçlanan Maçları', time: '06:00', mode: 'yesterday', enabled: true, limit: null, lastRunDate: null },
    { id: 'tomorrow', name: 'Yarının Bülteni & Oranları', time: '18:00', mode: 'tomorrow', enabled: true, limit: null, lastRunDate: null },
    { id: 'today', name: 'Bugünün Canlı Bülteni', time: '12:00', mode: 'today', enabled: false, limit: 20, lastRunDate: null }
  ]
};

// Config'den zamanlayıcıyı yükle
function initSchedulerFromConfig() {
  const cfg = loadConfig();
  if (cfg.scheduler) {
    schedulerConfig = { ...schedulerConfig, ...cfg.scheduler };
  }
}
initSchedulerFromConfig();

function saveSchedulerToConfig() {
  const cfg = loadConfig();
  cfg.scheduler = schedulerConfig;
  const p = path.join(__dirname, 'config.json');
  try {
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) {}
}

// Her 10 saniyede bir saat kontrolü yapan Master Clock Engine
setInterval(async () => {
  if (!schedulerConfig.enabled) return;

  const now = new Date();
  const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const todayStr = now.toISOString().split('T')[0];

  for (const task of schedulerConfig.tasks) {
    if (task.enabled && task.time === currentHHMM && task.lastRunDate !== todayStr) {
      if (activeJob.isRunning) {
        broadcastLog(`⏰ [ZAMANLAYICI] Saat ${task.time} geldi (${task.name}), ancak aktif kazıma devam ettiği için bekleniyor...`, 'warning');
        return;
      }

      task.lastRunDate = todayStr;
      saveSchedulerToConfig();

      broadcastLog(`⏰ [OTOMASYON TETİKLENDİ] Saat ${task.time} ➔ ${task.name} otomatik kazıma başlatılıyor!`, 'success');
      broadcastEvent('scheduler_update', schedulerConfig);

      try {
        await runInternalBatchJob(task.mode, task.limit);
      } catch (err) {
        broadcastLog(`❌ [OTOMASYON HATASI] ${task.name}: ${err.message}`, 'error');
      }
    }
  }
}, 10000);

// Internal Batch Scraper
async function runInternalBatchJob(dateKeyword = 'today', limit = null) {
  if (activeJob.isRunning) {
    throw new Error('Hali hazırda çalışan bir kazıma işlemi mevcut.');
  }

  const today = new Date();
  let dateStr = today.toISOString().split('T')[0];
  if (dateKeyword === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    dateStr = y.toISOString().split('T')[0];
  } else if (dateKeyword === 'tomorrow') {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    dateStr = t.toISOString().split('T')[0];
  } else if (dateKeyword && dateKeyword.includes('-')) {
    dateStr = dateKeyword;
  }

  activeJob = {
    isRunning: true,
    jobType: 'batch',
    targetDate: dateStr,
    limit,
    totalMatches: 0,
    completedMatches: 0,
    failedMatches: 0,
    progressPct: 0,
    currentMatch: null,
    cancelRequested: false,
    startTime: Date.now()
  };

  broadcastEvent('job_started', activeJob);
  broadcastLog(`🚀 Günlük maç keşfi başlatılıyor: ${dateStr} (Limit: ${limit || 'Tümü'})...`, 'info');

  try {
    const cfg = loadConfig();
    const discovery = await discoverDailyMatches(dateStr, { headless: cfg.headless || 'new' });
    let matches = discovery.matches || [];

    if (matches.length === 0) {
      broadcastLog(`⚠️ Bu tarih için geçerli maç bulunamadı (${dateStr}).`, 'warning');
      activeJob.isRunning = false;
      broadcastEvent('job_finished', activeJob);
      return;
    }

    if (limit && limit > 0) {
      matches = matches.slice(0, limit);
    }

    activeJob.totalMatches = matches.length;
    broadcastLog(`✅ Keşif tamamlandı: Toplam ${discovery.total_matches_in_list} maçtan ${matches.length} tanesi işleme alındı.`, 'success');
    broadcastEvent('job_progress', activeJob);

    for (let i = 0; i < matches.length; i++) {
      if (activeJob.cancelRequested) {
        broadcastLog(`🛑 Kazıma işlemi kullanıcı tarafından iptal edildi.`, 'warning');
        break;
      }

      const m = matches[i];
      const matchUrl = m.url || m.link;
      const title = m.homeTeam && m.awayTeam ? `${m.homeTeam} vs ${m.awayTeam}` : `Maç #${i + 1}`;

      activeJob.currentMatch = title;
      broadcastLog(`[${i + 1}/${matches.length}] Kazınıyor: ${title}...`, 'info');

      try {
        const res = await scrapeMatch(matchUrl, {
          headless: cfg.headless || 'new',
          syncApex: cfg.autoSyncApex !== undefined ? cfg.autoSyncApex : true,
          apiUrl: cfg.apexImportUrl,
          apiKey: cfg.apexSecret
        });

        if (res && res.success) {
          activeJob.completedMatches++;
          broadcastLog(`✅ [${i + 1}/${matches.length}] Başarılı: ${title}`, 'success');
        } else {
          activeJob.failedMatches++;
          broadcastLog(`❌ [${i + 1}/${matches.length}] Başarısız: ${title}`, 'error');
        }
      } catch (err) {
        activeJob.failedMatches++;
        broadcastLog(`❌ [${i + 1}/${matches.length}] Hata: ${err.message}`, 'error');
      }

      activeJob.progressPct = Math.round(((i + 1) / matches.length) * 100);
      broadcastEvent('job_progress', activeJob);

      if (i < matches.length - 1 && !activeJob.cancelRequested) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    const elapsed = ((Date.now() - activeJob.startTime) / 1000).toFixed(1);
    broadcastLog(`🎉 Batch kazıma tamamlandı! (${activeJob.completedMatches} başarılı, ${activeJob.failedMatches} hatalı, ${elapsed}s)`, 'success');
  } catch (err) {
    broadcastLog(`❌ Kritik Batch Hatası: ${err.message}`, 'error');
  } finally {
    activeJob.isRunning = false;
    activeJob.currentMatch = null;
    broadcastEvent('job_finished', activeJob);
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Apex-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 1. SSE Stream
  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });

    // Send initial status
    broadcastEvent('job_status', activeJob);
    broadcastEvent('scheduler_update', schedulerState);
    return;
  }

  // 2. Status & Config APIs
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      activeJob,
      scheduler: schedulerState,
      config: loadConfig()
    }));
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadConfig()));
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const p = path.join(__dirname, 'config.json');
        let cfg = loadConfig();
        if (payload.apexImportUrl) cfg.apexImportUrl = payload.apexImportUrl.trim();
        if (payload.apexSecret) cfg.apexSecret = payload.apexSecret.trim();
        if (payload.headless !== undefined) cfg.headless = payload.headless;
        if (payload.autoSyncApex !== undefined) cfg.autoSyncApex = Boolean(payload.autoSyncApex);

        fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
        broadcastLog(`🌐 APEX Ayarları güncellendi: ${cfg.apexImportUrl}`, 'success');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, config: cfg }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 3. Test APEX Connection
  if (pathname === '/api/test-apex' && req.method === 'POST') {
    try {
      const cfg = loadConfig();
      // Dummy sample payload to test connection
      const sampleMatch = {
        meta: { scrapedAt: new Date().toISOString() },
        hero: { homeTeam: 'Test LDU', awayTeam: 'Test MIR', matchDate: '2026-08-20', league: 'Test League', result: { status: 'Upcoming', score: '-' } },
        markets: { '1X2': { pick: '1', prob1: '50%', probX: '25%', prob2: '25%' } }
      };

      const syncRes = await syncMatchToApex(sampleMatch, cfg.apexImportUrl, cfg.apexSecret);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(syncRes));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // 4. Trigger Batch Crawl
  if (pathname === '/api/scrape-batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const dateKey = payload.date || 'today';
        const limit = payload.limit ? parseInt(payload.limit, 10) : null;

        if (activeJob.isRunning) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Halihazırda bir kazıma devam ediyor.' }));
        }

        // Run async in background
        runInternalBatchJob(dateKey, limit).catch(console.error);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: `Kazıma başlatıldı: ${dateKey}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 5. Trigger Single Scrape
  if (pathname === '/api/scrape-single' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = payload.url;
        if (!targetUrl || !targetUrl.startsWith('http')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Geçersiz URL' }));
        }

        broadcastLog(`🔗 Tek maç kazıma başlatılıyor: ${targetUrl}`, 'info');
        const cfg = loadConfig();
        const result = await scrapeMatch(targetUrl, {
          headless: cfg.headless || 'new',
          syncApex: cfg.autoSyncApex !== undefined ? cfg.autoSyncApex : true,
          apiUrl: cfg.apexImportUrl,
          apiKey: cfg.apexSecret
        });

        broadcastLog(`🎉 Tek maç kazıma tamamlandı: ${result.slug}`, 'success');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, result }));
      } catch (e) {
        broadcastLog(`❌ Tek maç hatası: ${e.message}`, 'error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 6. Stop/Cancel Job
  if (pathname === '/api/stop-job' && req.method === 'POST') {
    activeJob.cancelRequested = true;
    broadcastLog(`🛑 Kazıma durdurma isteği iletildi...`, 'warning');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'İptal isteği alındı' }));
  }

  // 6.1 Kill All Running Processes & Reset State
  if (pathname === '/api/kill-all' && req.method === 'POST') {
    broadcastLog(`⚠️ [ACİL DURDURMA] Tüm aktif işlemler ve arka plan tarayıcıları kapatılıyor...`, 'error');
    activeJob.cancelRequested = true;
    activeJob.isRunning = false;
    activeJob.currentMatch = null;
    
    // Windows taskkill for orphan chromes
    try {
      const { exec } = require('child_process');
      exec('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq about:blank*" /T', () => {});
    } catch (_) {}

    broadcastLog(`✅ Sistem temizlendi ve boşa alındı.`, 'success');
    broadcastEvent('job_finished', activeJob);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Tüm işlemler durduruldu ve sistem sıfırlandı.' }));
  }

  // 6.2 System Health Metrics API
  if (pathname === '/api/health-metrics') {
    const mem = process.memoryUsage();
    const outDir = path.join(__dirname, 'output');
    let matchCount = 0;
    if (fs.existsSync(outDir)) {
      matchCount = fs.readdirSync(outDir).filter(f => fs.statSync(path.join(outDir, f)).isDirectory()).length;
    }

    const metrics = {
      status: 'healthy',
      uptimeSec: Math.round(process.uptime()),
      ramMb: (mem.rss / (1024 * 1024)).toFixed(1),
      heapMb: (mem.heapUsed / (1024 * 1024)).toFixed(1),
      totalMatchesScraped: matchCount,
      activeWorkers: activeJob.isRunning ? 1 : 0,
      activeJob: activeJob,
      scheduler: schedulerState
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(metrics));
  }

  // 6.3 Run 9-Tool Health Suite API
  if (pathname === '/api/run-tests' && req.method === 'POST') {
    broadcastLog(`🔬 [TEST BAŞLATILDI] 9 Master Kalite & Sağlık Aracı çalıştırılıyor...`, 'info');
    try {
      const { exec } = require('child_process');
      exec('node tools/run_all_tests.js', (err, stdout, stderr) => {
        const out = stdout || stderr || '';
        broadcastLog(`🔬 [TEST TAMAMLANDI] Sağlık test sonuçları alındı.`, 'success');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: !err, output: out }));
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7. Scheduler API (Save Clock Tasks)
  if (pathname === '/api/scheduler' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.enabled !== undefined) schedulerConfig.enabled = Boolean(payload.enabled);
        if (payload.tasks && Array.isArray(payload.tasks)) {
          schedulerConfig.tasks = payload.tasks;
        }
        saveSchedulerToConfig();
        broadcastEvent('scheduler_update', schedulerConfig);
        broadcastLog(`⏰ Otomasyon saatleri güncellendi (Aktif: ${schedulerConfig.enabled ? 'EVET' : 'HAYIR'})`, 'success');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, scheduler: schedulerConfig }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 8. Recent Matches API
  if (pathname === '/api/recent-matches') {
    try {
      const outDir = path.join(__dirname, 'output');
      const list = [];
      if (fs.existsSync(outDir)) {
        const entries = fs.readdirSync(outDir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory()) {
            const jPath = path.join(outDir, ent.name, 'match_data.json');
            const vPath = path.join(outDir, ent.name, 'viewer.html');
            if (fs.existsSync(jPath)) {
              try {
                const data = JSON.parse(fs.readFileSync(jPath, 'utf8'));
                list.push({
                  slug: ent.name,
                  homeTeam: data.hero?.homeTeam || 'Home',
                  awayTeam: data.hero?.awayTeam || 'Away',
                  homeLogo: data.hero?.homeLogo || '',
                  awayLogo: data.hero?.awayLogo || '',
                  score: data.hero?.finalScore || data.hero?.score || '-',
                  status: data.hero?.result?.status || 'Upcoming',
                  date: data.hero?.matchDate || '',
                  league: data.hero?.league || '',
                  viewerUrl: `/output/${ent.name}/viewer.html`,
                  scrapedAt: data.meta?.scrapedAt || ''
                });
              } catch (_) {}
            }
          }
        }
      }
      // Sort newest first
      list.sort((a, b) => new Date(b.scrapedAt || 0) - new Date(a.scrapedAt || 0));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(list.slice(0, 30)));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 9. Static File Serving (HTML Viewer, output, assets)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Sayfa Bulunamadı');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🌐 BPA V3 WEB DASHBOARD BAŞLATILDI!`);
  console.log(`🚀 Tarayıcıdan açın: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
