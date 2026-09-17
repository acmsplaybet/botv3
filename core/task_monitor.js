/**
 * ====================================================================
 * BPA V4 / TASK MONITOR & PROCESS MANAGER (core/task_monitor.js)
 * ====================================================================
 * Discovers, monitors and manages all Node.js and Chromium processes
 * belonging to the BPA bot. Provides safe emergency kill-switch.
 * ====================================================================
 */

const { execSync, exec } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Returns list of processes belonging to the bot.
 */
function getBotTasks() {
  if (process.platform !== 'win32') {
    return [{ pid: process.pid, name: 'BPA Desktop Agent', type: 'agent', memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)), status: 'Çalışıyor', isMaster: true }];
  }

  const tasks = [];
  const masterPid = process.pid;

  // 1. Master Agent (Always present)
  const masterMemMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  tasks.push({
    pid: masterPid,
    name: 'BPA Master Control Center (Port 3000)',
    type: 'agent',
    command: 'node bpa_desktop_agent.js',
    memoryMb: masterMemMb,
    status: 'Aktif / Dinliyor',
    isMaster: true
  });

  // 2. PowerShell ile Çalışan Node ve Chrome Süreçlerini Sorgula
  try {
    const psCmd = `powershell -NoProfile -Command "$ErrorActionPreference = 'SilentlyContinue'; Get-CimInstance Win32_Process -Filter \\"name = 'node.exe' or name = 'chrome.exe' or name = 'msedge.exe'\\" | Select-Object ProcessId, Name, CommandLine, WorkingSet64 | ConvertTo-Json -Compress"`;
    const rawOut = execSync(psCmd, { encoding: 'utf-8', timeout: 5000 }).trim();

    if (rawOut) {
      let items = [];
      try {
        const parsed = JSON.parse(rawOut);
        items = Array.isArray(parsed) ? parsed : [parsed];
      } catch (_) {}

      for (const item of items) {
        const pid = parseInt(item.ProcessId, 10);
        if (pid === masterPid) continue; // Zaten eklendi

        const name = String(item.Name || '').toLowerCase();
        const cmd = String(item.CommandLine || '');
        const memBytes = parseInt(item.WorkingSet64, 10) || 0;
        const memMb = Math.round(memBytes / (1024 * 1024));

        // Node.js Süreçleri
        if (name === 'node.exe') {
          if (cmd.includes('daily_pipeline') || cmd.includes('daily_crawler')) {
            tasks.push({
              pid,
              name: 'Forebet Toplu Kazıma Motoru (Crawler)',
              type: 'crawler',
              command: cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd,
              memoryMb: memMb || 45,
              status: 'Veri Kazıyor',
              isMaster: false
            });
          } else if (cmd.includes('scrape_match')) {
            tasks.push({
              pid,
              name: 'Tekil Maç Detay Kazıyıcı',
              type: 'worker',
              command: cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd,
              memoryMb: memMb || 35,
              status: 'Çalışıyor',
              isMaster: false
            });
          } else if (cmd.includes('cron_scheduler')) {
            tasks.push({
              pid,
              name: 'BPA Otomatik Zamanlayıcı Servisi (Cron)',
              type: 'cron',
              command: 'node cron_scheduler.js',
              memoryMb: memMb || 25,
              status: 'Nöbette (7/24)',
              isMaster: false
            });
          }
        }

        // Chrome / Edge Süreçleri (Puppeteer veya Bağımsız App Penceresi)
        if (name === 'chrome.exe' || name === 'msedge.exe') {
          if (cmd.includes('--remote-debugging') || cmd.includes('puppeteer_dev') || cmd.includes('stealth') || cmd.includes('about:blank')) {
            tasks.push({
              pid,
              name: `Puppeteer Stealth Chromium (${name})`,
              type: 'browser',
              command: 'Headless/Visible Browser Tab',
              memoryMb: memMb || 95,
              status: 'Sayfa Açık',
              isMaster: false
            });
          } else if (cmd.includes('--app=http://localhost:3000')) {
            tasks.push({
              pid,
              name: 'BPA Masaüstü Penceresi (App Mode)',
              type: 'app_window',
              command: `${name} --app`,
              memoryMb: memMb || 65,
              status: 'Görünür',
              isMaster: false
            });
          }
        }
      }
    }
  } catch (err) {
    // Sorgu hatası olursa en azından master agent'ı dön
  }

  return tasks;
}

/**
 * Emergency Kill Switch: Kills all child workers and puppeteer processes safely,
 * while keeping the master desktop agent alive.
 */
function killAllBotProcesses() {
  const killedPids = [];
  const masterPid = process.pid;

  if (process.platform === 'win32') {
    // 1. Crawler ve worker node süreçlerini sonlandır (Master hariç)
    try {
      const psKillNode = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = 'node.exe'\\" | Where-Object { $_.ProcessId -ne ${masterPid} -and ($_.CommandLine -like '*daily_*' -or $_.CommandLine -like '*scrape_match*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`;
      execSync(psKillNode, { timeout: 4000, stdio: 'ignore' });
    } catch (_) {}

    // 2. Puppeteer Chromium sekmelerini sonlandır
    try {
      const psKillChrome = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = 'chrome.exe' or name = 'msedge.exe'\\" | Where-Object { $_.CommandLine -like '*puppeteer*' -or $_.CommandLine -like '*remote-debugging*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`;
      execSync(psKillChrome, { timeout: 4000, stdio: 'ignore' });
    } catch (_) {}
  }

  return { success: true, message: 'Tüm kazıma motorları ve tarayıcı sekmeleri sonlandırıldı.' };
}

/**
 * Kills a specific task by PID.
 */
function killTaskByPid(pid) {
  const targetPid = parseInt(pid, 10);
  if (!targetPid) return { success: false, error: 'Geçersiz PID' };

  if (targetPid === process.pid) {
    return { success: false, error: 'Ana sunucu sürecini bu menüden kapatamazsınız. Çıkış butonunu kullanın.' };
  }

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${targetPid}`, { stdio: 'ignore', timeout: 3000 });
      return { success: true, pid: targetPid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'İşletim sistemi desteklenmiyor' };
}

module.exports = {
  getBotTasks,
  killAllBotProcesses,
  killTaskByPid
};
