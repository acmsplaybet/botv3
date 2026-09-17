/**
 * ====================================================================
 * BPA V4 / 24-7 CRON SCHEDULER DAEMON (cron_scheduler.js)
 * ====================================================================
 * Continuous 24/7 background scheduler for headless servers / PCs.
 * 
 * Scheduled Jobs:
 *   1. Morning 06:00 (Yesterday's finished matches & final score sync to APEX)
 *   2. Evening 17:00 (Tomorrow's predictions, odds & preview sync to APEX)
 * 
 * Features:
 *   - Live config auto-reload: When config.json is edited, applies new times instantly!
 *   - Auto-syncs Windows Task Scheduler on config changes.
 *   - In-flight execution lock: Prevents overlapping jobs.
 *   - Auto-retry on failure: Retries up to 3 times after 10 minutes.
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { syncWindowsTasks, getResolvedConfig } = require('./core/scheduler_manager');

const pad = n => String(n).padStart(2, '0');

function getTimestamp() {
  const d = new Date();
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

function log(msg) {
  console.log(`${getTimestamp()} ${msg}`);
}

let currentConfig = getResolvedConfig();
let activeJobProcess = null;
let activeJobName = null;

// Hangi tarihlerde hangi görevlerin çalıştığı kaydı (aynı gün mükerrer çalışmayı önler)
const executedToday = {
  yesterday: null,
  tomorrow: null
};

// Başarısızlık durumunda telafi sayacı
const retryAttempts = {
  yesterday: 0,
  tomorrow: 0
};

// 1. Ayarları Dinle (Canlı Değişiklik Yakalama)
function reloadConfigIfChanged() {
  const latest = getResolvedConfig();
  if (
    latest.cron_yesterday !== currentConfig.cron_yesterday ||
    latest.cron_tomorrow !== currentConfig.cron_tomorrow ||
    latest.automation_active !== currentConfig.automation_active
  ) {
    log(`🔄 [AYAR GÜNCELLENDİ] Zamanlayıcı saatleri değiştirildi:`);
    log(`   Sabah (Dün)   : ${currentConfig.cron_yesterday} -> ${latest.cron_yesterday}`);
    log(`   Akşam (Yarın) : ${currentConfig.cron_tomorrow} -> ${latest.cron_tomorrow}`);
    currentConfig = latest;
    
    // Windows Görev Zamanlayıcısını da anında senkronize et
    try {
      syncWindowsTasks(currentConfig, log);
    } catch (_) {}
  }
}

// 2. İş Çalıştırıcı
function executePipelineJob(jobType, isRetry = false) {
  if (activeJobProcess) {
    log(`⚠️ [ÇAKIŞMA ÖNLENDİ] '${activeJobName}' görevi zaten çalışıyor. Yeni görev beklemeye alındı.`);
    return;
  }

  activeJobName = jobType;
  const targetFlag = jobType === 'yesterday' ? '--yesterday' : '--tomorrow';
  const jobTitle = jobType === 'yesterday' 
    ? '🌅 SABAH GÖREVİ: Dünün Maçları & Biten Skorlar (Kupon Sonuçlandırma)'
    : '🌆 AKŞAM GÖREVİ: Yarının Bülteni & Oranlar (VIP Kupon Hazırlığı)';

  log(`\n================================================================`);
  log(`🚀 ${jobTitle} BAŞLATILIYOR ${isRetry ? '(OTOMATİK TELAFİ)' : ''}...`);
  log(`================================================================`);

  const pipelineScript = path.resolve(__dirname, 'daily_pipeline.js');
  const spawnArgs = [
    pipelineScript,
    targetFlag,
    '--sync-apex',
    `--workers=${currentConfig.concurrency || 4}`
  ];

  activeJobProcess = spawn(process.execPath, spawnArgs, {
    cwd: __dirname,
    env: process.env,
    shell: false
  });

  activeJobProcess.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.log(`   ${line}`);
    });
  });

  activeJobProcess.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.error(`   ⚠️ ${line}`);
    });
  });

  activeJobProcess.on('close', (code) => {
    activeJobProcess = null;
    activeJobName = null;

    if (code === 0) {
      log(`✅ [GÖREV BAŞARILI] '${jobType.toUpperCase()}' görevi ve APEX senkronizasyonu eksiksiz tamamlandı.\n`);
      retryAttempts[jobType] = 0;
    } else {
      log(`⚠️ [GÖREV HATASI] '${jobType.toUpperCase()}' süreci ${code} koduyla kapandı.`);
      
      // Hata durumunda 10 dakika sonra otomatik yeniden deneme (3 defa)
      if (retryAttempts[jobType] < 3) {
        retryAttempts[jobType]++;
        log(`🔄 [OTOMATİK TELAFİ] 10 dakika sonra otomatik olarak yeniden denenecek (Deneme: ${retryAttempts[jobType]}/3)...`);
        setTimeout(() => {
          executePipelineJob(jobType, true);
        }, 10 * 60 * 1000);
      } else {
        log(`❌ [TELAFİ TÜKENDİ] '${jobType.toUpperCase()}' görevi 3 telafi denemesine rağmen tamamlanamadı.`);
        retryAttempts[jobType] = 0;
      }
    }
  });
}

// 3. Ana Kontrol Döngüsü (Her 15 saniyede bir kontrol eder)
log(`🤖 BPA V4 Otomatik Zamanlayıcı Servisi Başlatıldı.`);
log(`   ⏰ Sabah Görevi (Dün - Skorlar)       : Her gün ${currentConfig.cron_yesterday}`);
log(`   ⏰ Akşam Görevi (Yarın - Tahminler)   : Her gün ${currentConfig.cron_tomorrow}`);
log(`   📡 Canlı APEX API                     : ${currentConfig.apexImportUrl}`);
log(`   💡 Ayarları değiştirmek için 'config.json' dosyasını güncellemeniz yeterlidir.\n`);

// Başlangıçta Windows Görev Zamanlayıcısı senkronizasyonunu tetikle
try {
  syncWindowsTasks(currentConfig, log);
} catch (_) {}

setInterval(() => {
  reloadConfigIfChanged();

  if (!currentConfig.automation_active) return;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 06:00 Dünün Maçları
  if (currentConfig.cron_yesterday && currentTime === currentConfig.cron_yesterday) {
    if (executedToday.yesterday !== todayStr) {
      executedToday.yesterday = todayStr;
      executePipelineJob('yesterday');
    }
  }

  // 17:00 Yarının Maçları
  if (currentConfig.cron_tomorrow && currentTime === currentConfig.cron_tomorrow) {
    if (executedToday.tomorrow !== todayStr) {
      executedToday.tomorrow = todayStr;
      executePipelineJob('tomorrow');
    }
  }
}, 15000);
