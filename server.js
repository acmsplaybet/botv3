/**
 * ====================================================================
 * BPA V3 BOT CONTROLLER SERVER & LIVE LOG STREAMER
 * ====================================================================
 * Supports Single Match, Daily Crawl, Date-Range Archiving, and Stop Control
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { scrapeMatch } = require('./scrape_match');
const { discoverDailyMatches } = require('./core/daily_discovery');
const { runCrawlPool } = require('./core/crawl_pool');

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

// Global State for Daily / Range Crawler
let activeJob = {
  isRunning: false,
  jobType: null, // 'daily' or 'range'
  jobId: null,
  startDate: null,
  endDate: null,
  currentDate: null,
  totalDays: 0,
  completedDays: 0,
  totalMatches: 0,
  completedMatches: 0,
  failedMatches: 0,
  dbIngested: 0,
  progressPct: 0,
  speed: 0,
  activeWorkers: {},
  cancelRequested: false
};

function getDatesArray(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 1. SSE Stream for Live Logs & Real-time Progress
  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // 2. POST /api/stop - Emergency Stop All Operations
  if (pathname === '/api/stop' && req.method === 'POST') {
    activeJob.cancelRequested = true;
    activeJob.isRunning = false;
    broadcastLog(`🛑 Kullanıcı tarafından tüm işlemler durduruldu.`, 'warning');
    broadcastEvent('job_stopped', { message: 'Tüm işlemler durduruldu.' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'İşlemler durduruldu.' }));
  }

  // 3. POST /api/scrape - Single Match Scraper
  if (pathname === '/api/scrape' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = payload.url;

        if (!targetUrl || !targetUrl.startsWith('http')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Geçersiz veya eksik URL' }));
        }

        broadcastLog(`⚡ Tekil maç kazıma tetiklendi: ${targetUrl}`, 'start');

        const result = await scrapeMatch(targetUrl, {
          onLog: (msg) => {
            console.log(msg);
            broadcastLog(msg.replace(/\x1B\[\d+m/g, ''), 'log');
          }
        });

        broadcastLog(`🎉 Kazıma başarıyla tamamlandı!`, 'success');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          slug: result.slug,
          viewerUrl: `/output/${result.slug}/viewer.html`,
          jsonUrl: `/output/${result.slug}/match_data.json`,
          latestViewerUrl: `/output/latest_viewer.html`,
          matchData: result.matchData
        }));

      } catch (err) {
        broadcastLog(`❌ Hata: ${err.message}`, 'error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. POST /api/range/start - Start Date-Range Historical Archiving
  if (pathname === '/api/range/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (activeJob.isRunning) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Zaten aktif bir tarama işlemi yürütülüyor.' }));
        }

        const payload = JSON.parse(body || '{}');
        const startDate = payload.startDate || '2026-07-25';
        const endDate = payload.endDate || '2026-08-19';
        const concurrency = parseInt(payload.concurrency, 10) || 4;
        const saveDb = payload.saveDb === true;

        const dates = getDatesArray(startDate, endDate);
        const jobId = `range_${Date.now()}`;

        activeJob = {
          isRunning: true,
          jobType: 'range',
          jobId,
          startDate,
          endDate,
          currentDate: dates[0],
          totalDays: dates.length,
          completedDays: 0,
          totalMatches: 0,
          completedMatches: 0,
          failedMatches: 0,
          dbIngested: 0,
          progressPct: 0,
          speed: 0,
          activeWorkers: {},
          cancelRequested: false
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          jobId,
          totalDays: dates.length,
          message: `${startDate} ile ${endDate} arası (${dates.length} Gün) arşivleme başlatıldı.`
        }));

        // Execute in background
        (async () => {
          try {
            broadcastLog(`🌙 [${jobId}] Tarih Aralığı Arşivleme Başlatıldı: ${startDate} ➔ ${endDate} (${dates.length} Gün)...`, 'start');

            const archiveBaseDir = path.join(__dirname, 'archive');
            if (!fs.existsSync(archiveBaseDir)) fs.mkdirSync(archiveBaseDir, { recursive: true });

            for (let i = 0; i < dates.length; i++) {
              if (activeJob.cancelRequested) {
                broadcastLog(`🛑 Arşivleme durduruldu.`, 'warning');
                break;
              }

              const targetDate = dates[i];
              activeJob.currentDate = targetDate;
              const dayDir = path.join(archiveBaseDir, targetDate);
              const summaryPath = path.join(dayDir, 'summary.json');

              broadcastLog(`🗓️ [${i + 1}/${dates.length}] Gün Taranıyor: ${targetDate}...`, 'info');

              // Resume check
              if (fs.existsSync(summaryPath)) {
                try {
                  const sum = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
                  if (sum.status === 'completed') {
                    broadcastLog(`⏩ ${targetDate} daha önce taranmış (${sum.completed} maç). Atlanıyor...`, 'success');
                    activeJob.completedDays++;
                    activeJob.completedMatches += sum.completed || 0;
                    continue;
                  }
                } catch (e) {}
              }

              if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

              const discovery = await discoverDailyMatches(targetDate, {
                logger: (m) => broadcastLog(m, 'log')
              });

              if (activeJob.cancelRequested) break;

              if (discovery.quoted_count === 0) {
                fs.writeFileSync(summaryPath, JSON.stringify({ date: targetDate, status: 'completed', total: 0, completed: 0 }), 'utf8');
                activeJob.completedDays++;
                continue;
              }

              activeJob.totalMatches += discovery.quoted_count;

              const dayResults = await runCrawlPool(discovery.matches, {
                concurrency,
                saveDb,
                saveLocal: true,
                shouldStop: () => activeJob.cancelRequested,
                logger: (m) => broadcastLog(m, 'log'),
                onProgress: (prog) => {
                  broadcastEvent('range_progress', {
                    jobId,
                    currentDate: targetDate,
                    dayIndex: i + 1,
                    totalDays: dates.length,
                    ...prog
                  });
                },
                onMatch: (matchInfo) => {
                  activeJob.activeWorkers[matchInfo.workerId] = {
                    label: `${matchInfo.home_team} vs ${matchInfo.away_team}`,
                    odd: matchInfo.odd,
                    duration: matchInfo.duration
                  };
                  broadcastEvent('daily_match', { jobId, ...matchInfo });
                }
              });

              if (activeJob.cancelRequested) break;

              activeJob.completedDays++;
              activeJob.completedMatches += dayResults.completed;
              activeJob.failedMatches += dayResults.failed;

              fs.writeFileSync(summaryPath, JSON.stringify({
                date: targetDate,
                status: 'completed',
                total: discovery.quoted_count,
                completed: dayResults.completed,
                failed: dayResults.failed,
                durationSeconds: dayResults.durationSeconds,
                scrapedAt: new Date().toISOString()
              }, null, 2), 'utf8');

              broadcastLog(`✅ [${i + 1}/${dates.length}] ${targetDate} tamamlandı (${dayResults.completed} maç).`, 'success');
            }

            activeJob.isRunning = false;
            if (!activeJob.cancelRequested) {
              broadcastLog(`🎉 [${jobId}] Tarih Aralığı Arşivleme Başarıyla Tamamlandı! Toplam ${activeJob.completedMatches} maç arşivlendi.`, 'success');
              broadcastEvent('range_complete', { jobId, completedMatches: activeJob.completedMatches });
            }

          } catch (rangeErr) {
            activeJob.isRunning = false;
            broadcastLog(`❌ [${jobId}] Arşivleme Hatası: ${rangeErr.message}`, 'error');
          }
        })();

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. POST /api/daily/start - Start Single Day Crawl
  if (pathname === '/api/daily/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (activeJob.isRunning) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Zaten aktif bir tarama işlemi yürütülüyor.' }));
        }

        const payload = JSON.parse(body || '{}');
        const dateStr = payload.date || new Date().toISOString().split('T')[0];
        const concurrency = parseInt(payload.concurrency, 10) || 4;
        const saveDb = payload.saveDb !== undefined ? payload.saveDb : false;

        const jobId = `job_${Date.now()}`;
        activeJob = {
          isRunning: true,
          jobType: 'daily',
          jobId,
          startDate: dateStr,
          endDate: dateStr,
          currentDate: dateStr,
          totalDays: 1,
          completedDays: 0,
          totalMatches: 0,
          completedMatches: 0,
          failedMatches: 0,
          dbIngested: 0,
          progressPct: 0,
          speed: 0,
          activeWorkers: {},
          cancelRequested: false
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, jobId, message: 'Günlük tarama görevi başlatıldı.' }));

        (async () => {
          try {
            broadcastLog(`🚀 [${jobId}] Günlük tarama başlatıldı (${dateStr}, ${concurrency} Sekme)...`, 'start');

            const discovery = await discoverDailyMatches(dateStr, {
              logger: (msg) => broadcastLog(msg, 'log')
            });

            if (activeJob.cancelRequested) return;

            activeJob.totalMatches = discovery.quoted_count;

            if (discovery.quoted_count === 0) {
              broadcastLog(`⚠️ Bu tarih için geçerli oran içeren maç bulunamadı.`, 'warning');
              activeJob.isRunning = false;
              return;
            }

            const crawlResults = await runCrawlPool(discovery.matches, {
              concurrency,
              saveDb,
              saveLocal: true,
              shouldStop: () => activeJob.cancelRequested,
              logger: (msg, color) => broadcastLog(msg, 'log'),
              onProgress: (prog) => {
                activeJob.completedMatches = prog.completed;
                activeJob.failedMatches = prog.failed;
                activeJob.progressPct = prog.progressPct;
                activeJob.speed = prog.speedMatchesPerSec;
                broadcastEvent('daily_progress', { jobId, ...prog });
              },
              onMatch: (matchInfo) => {
                activeJob.activeWorkers[matchInfo.workerId] = {
                  label: `${matchInfo.home_team} vs ${matchInfo.away_team}`,
                  odd: matchInfo.odd,
                  duration: matchInfo.duration
                };
                broadcastEvent('daily_match', { jobId, ...matchInfo });
              }
            });

            activeJob.dbIngested = crawlResults.dbIngested;
            activeJob.isRunning = false;
            if (!activeJob.cancelRequested) {
              broadcastLog(`🎉 [${jobId}] Günlük tarama tamamlandı!`, 'success');
              broadcastEvent('daily_complete', { jobId, ...crawlResults });
            }

          } catch (jobErr) {
            activeJob.isRunning = false;
            broadcastLog(`❌ [${jobId}] Tarama işlemi başarısız: ${jobErr.message}`, 'error');
          }
        })();

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. GET /api/status - Get Active Job Status
  if (pathname === '/api/status' || pathname === '/api/daily/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(activeJob));
  }

  // 7. GET /api/history - List past scrapes
  if (pathname === '/api/history') {
    const outDir = path.join(__dirname, 'output');
    const list = [];
    if (fs.existsSync(outDir)) {
      const items = fs.readdirSync(outDir, { withFileTypes: true });
      for (const it of items) {
        if (it.isDirectory()) {
          const jsonPath = path.join(outDir, it.name, 'match_data.json');
          if (fs.existsSync(jsonPath)) {
            try {
              const rawSlug = decodeURIComponent(it.name).replace(/-\d+$/, '');
              const slugParts = rawSlug.split('-');
              let homeName = data.hero?.homeTeam;
              let awayName = data.hero?.awayTeam;
              if (!homeName || !awayName) {
                const mid = Math.max(1, Math.floor(slugParts.length / 2));
                homeName = homeName || slugParts.slice(0, mid).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                awayName = awayName || slugParts.slice(mid).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
              }

              list.push({
                slug: it.name,
                home: homeName,
                away: awayName,
                date: data.hero?.matchDate || (data.meta?.scrapedAt ? data.meta.scrapedAt.split('T')[0] : '-'),
                score: data.hero?.finalScore || data.hero?.score,
                scrapedAt: data.meta?.scrapedAt,
                viewerUrl: `/output/${it.name}/viewer.html`
              });
            } catch (e) {}
          }
        }
      }
    }
    list.sort((a, b) => new Date(b.scrapedAt || 0) - new Date(a.scrapedAt || 0));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  // 8. Static File Serving (HTML, JS, CSS, JSON, Assets)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 BPA V3 BOT CONTROLLER & DATE-RANGE SERVER ÇALIŞIYOR`);
  console.log(`🌐 Kontrol Paneli: http://localhost:${PORT}`);
  console.log(`=============================================================\n`);
});
