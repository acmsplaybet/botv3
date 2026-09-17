/**
 * ====================================================================
 * BPA V4 / SCHEDULER MANAGER (core/scheduler_manager.js)
 * ====================================================================
 * Manages dynamic synchronization between config.json and:
 * 1. In-memory cron timers
 * 2. Windows Task Scheduler (schtasks.exe)
 * 3. Standalone cron daemon (cron_scheduler.js)
 * 
 * When user updates cron_yesterday or cron_tomorrow, this module
 * instantly syncs the OS tasks without requiring system reboot.
 * ====================================================================
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function getResolvedConfig() {
  let cfg = {
    cron_yesterday: '06:00',
    cron_tomorrow: '17:00',
    automation_active: true
  };

  const cPath = path.resolve(__dirname, '../config.json');
  if (fs.existsSync(cPath)) {
    try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(cPath, 'utf-8'))); } catch (_) {}
  }

  const lPath = path.resolve(__dirname, '../bpa_local_config.json');
  if (fs.existsSync(lPath)) {
    try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(lPath, 'utf-8'))); } catch (_) {}
  }

  return cfg;
}

/**
 * Deletes BPA scheduled tasks from Windows Task Scheduler.
 */
function removeWindowsTasks(logger = console.log) {
  if (process.platform !== 'win32') {
    return { success: true, message: 'Windows dışı ortam: Görev silme atlandı.' };
  }

  let morningDeleted = false;
  let eveningDeleted = false;

  try {
    execSync('schtasks /delete /tn "BPA_Bot_Morning" /f', { stdio: 'ignore' });
    logger("  🗑️ [Zamanlayıcı] Windows 'BPA_Bot_Morning' görevi başarıyla silindi.");
    morningDeleted = true;
  } catch (_) {}

  try {
    execSync('schtasks /delete /tn "BPA_Bot_Evening" /f', { stdio: 'ignore' });
    logger("  🗑️ [Zamanlayıcı] Windows 'BPA_Bot_Evening' görevi başarıyla silindi.");
    eveningDeleted = true;
  } catch (_) {}

  return {
    success: true,
    deleted: morningDeleted || eveningDeleted,
    morning: morningDeleted,
    evening: eveningDeleted
  };
}

/**
 * Updates Windows Task Scheduler trigger times to match current config.
 * If automation_active is false, automatically removes scheduled tasks.
 */
function syncWindowsTasks(config = null, logger = console.log) {
  if (process.platform !== 'win32') {
    return { success: true, message: 'Windows dışı ortam: Görev zamanlayıcı atlandı.' };
  }

  const cfg = config || getResolvedConfig();

  // 🛡️ Otomasyon Kapalıysa: Windows Görev Zamanlayıcısından Görevleri Sil!
  if (cfg.automation_active === false) {
    logger('  ℹ️ [Zamanlayıcı] Otomasyon kapalı (automation_active: false). Windows görevleri siliniyor...');
    const delRes = removeWindowsTasks(logger);
    return {
      success: true,
      active: false,
      deleted: delRes.deleted,
      message: 'Otomasyon kapalı, Windows görevleri silindi.'
    };
  }

  const morningTime = cfg.cron_yesterday || '06:00';
  const eveningTime = cfg.cron_tomorrow || '17:00';

  const rootDir = path.resolve(__dirname, '..');
  const morningBat = path.join(rootDir, 'RUN_MORNING_0600.bat');
  const eveningBat = path.join(rootDir, 'RUN_EVENING_1700.bat');

  let morningUpdated = false;
  let eveningUpdated = false;

  // 1. Sabah Görevi (Morning Task)
  try {
    const checkMorning = execSync('schtasks /query /tn "BPA_Bot_Morning" 2>nul', { encoding: 'utf-8' });
    if (checkMorning.includes('BPA_Bot_Morning')) {
      execSync(`schtasks /change /tn "BPA_Bot_Morning" /st ${morningTime}`, { stdio: 'ignore' });
      logger(`  🕒 [Zamanlayıcı] Windows 'BPA_Bot_Morning' görevi saati güncellendi -> ${morningTime}`);
      morningUpdated = true;
    }
  } catch (_) {
    // Görev henüz yoksa, otomatik oluşturalım
    try {
      execSync(`schtasks /create /tn "BPA_Bot_Morning" /tr "\"${morningBat}\"" /sc daily /st ${morningTime} /f /rl HIGHEST`, { stdio: 'ignore' });
      logger(`  ✅ [Zamanlayıcı] Windows 'BPA_Bot_Morning' görevi otomatik oluşturuldu -> Her gün ${morningTime}`);
      morningUpdated = true;
    } catch (createErr) {
      logger(`  ℹ️ [Zamanlayıcı] Windows sabah görevi kaydı (Yönetici yetkisi gerekebilir): ${createErr.message}`);
    }
  }

  // 2. Akşam Görevi (Evening Task)
  try {
    const checkEvening = execSync('schtasks /query /tn "BPA_Bot_Evening" 2>nul', { encoding: 'utf-8' });
    if (checkEvening.includes('BPA_Bot_Evening')) {
      execSync(`schtasks /change /tn "BPA_Bot_Evening" /st ${eveningTime}`, { stdio: 'ignore' });
      logger(`  🕒 [Zamanlayıcı] Windows 'BPA_Bot_Evening' görevi saati güncellendi -> ${eveningTime}`);
      eveningUpdated = true;
    }
  } catch (_) {
    // Görev henüz yoksa, otomatik oluşturalım
    try {
      execSync(`schtasks /create /tn "BPA_Bot_Evening" /tr "\"${eveningBat}\"" /sc daily /st ${eveningTime} /f /rl HIGHEST`, { stdio: 'ignore' });
      logger(`  ✅ [Zamanlayıcı] Windows 'BPA_Bot_Evening' görevi otomatik oluşturuldu -> Her gün ${eveningTime}`);
      eveningUpdated = true;
    } catch (createErr) {
      logger(`  ℹ️ [Zamanlayıcı] Windows akşam görevi kaydı (Yönetici yetkisi gerekebilir): ${createErr.message}`);
    }
  }

  return {
    success: true,
    active: true,
    morning: { time: morningTime, updated: morningUpdated },
    evening: { time: eveningTime, updated: eveningUpdated }
  };
}

module.exports = {
  syncWindowsTasks,
  removeWindowsTasks,
  getResolvedConfig
};
