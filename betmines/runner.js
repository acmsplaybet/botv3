/**
 * ====================================================================
 * BETMINES - MASTER RUNNER & AUTOPILOT DAEMON
 * ====================================================================
 * Bu script, Betmines botunu bağımsız ve kesintisiz çalıştırır.
 * - Tarayıcıyı görünür tutar (Cloudflare müdahalesi için)
 * - Gece Full Senkron (Dün, Bugün, Yarın, Yarından Sonra) yapar
 * - Canlı Radar moduyla 1-3 dakikada bir canlı maçları günceller
 * - Çekilen verileri receiver.php'ye post eder
 */

const { createBrowser, setupPage, bypassCloudflareIfNeeded } = require('./core/browser');
const { delay, formatDate, smartScrollAndParse, getAvailableDateTabs, clickDateTabByIndex, toggleLiveFilter } = require('./core/navigator');
const { sendMatchesToApi } = require('./sync/api_sender');
const config = require('./config');

let totalScans = 0;
let lastFullSyncTime = 0;
let isRunning = false;

function logger(msg, type = "INFO") {
  const time = new Date().toLocaleTimeString('tr-TR');
  console.log(`[${time}] [${type}] ${msg}`);
}

async function runNightFullSync(page) {
  logger(`🌙 ==================== FULL (GECE) SENKRON BAŞLADI ====================`, "NIGHT");
  let masterData = [];

  const tabInfo = await getAvailableDateTabs(page);
  if (!tabInfo || tabInfo.todayIdx === -1) {
    logger(`⚠️ Tarih sekmeleri bulunamadı, sayfa yenileniyor...`, "WARN");
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(3000);
    return [];
  }

  const today = new Date();
  const todayIdx = tabInfo.todayIdx;
  const targetTabs = [];

  // Dün, Bugün, Yarın, Yarından Sonra (toplam 4 gün)
  for (let i = todayIdx - 1; i <= todayIdx + 2; i++) {
    if (i >= 0 && i < tabInfo.total) {
      let d = new Date();
      d.setDate(today.getDate() + (i - todayIdx));
      let dateStr = formatDate(d);
      let name = i === todayIdx ? "BUGÜN" : (i < todayIdx ? "DÜN" : (i === todayIdx + 1 ? "YARIN" : "YARINDAN SONRA"));
      targetTabs.push({ idx: i, dateStr: dateStr, name: name });
    }
  }

  for (const tab of targetTabs) {
    logger(`📅 Sekme seçiliyor: ${tab.name} (${tab.dateStr})`, "NIGHT");
    await clickDateTabByIndex(page, tab.idx, logger);
    await delay(4500, 7000);

    const matches = await smartScrollAndParse(page, tab.dateStr, logger);
    logger(`✅ ${tab.name} sekmesinde ${matches.length} maç toplandı.`, "NIGHT");
    masterData = masterData.concat(matches);
    await delay(1500, 2500);
  }

  lastFullSyncTime = Date.now();
  totalScans++;

  // API'ye Gönder
  await sendMatchesToApi(masterData, 'NIGHT', logger);
  logger(`🌙 ==================== FULL SENKRON TAMAMLANDI (${masterData.length} Maç) ====================\n`, "NIGHT");
  return masterData;
}

async function runLiveSync(page) {
  logger(`⚡ ==================== CANLI (LIVE) RADAR BAŞLADI ====================`, "LIVE");
  let masterData = [];

  const now = new Date();
  const hour = now.getHours();
  const isLateNight = (hour >= 0 && hour <= 2);

  const tabInfo = await getAvailableDateTabs(page);
  if (!tabInfo || tabInfo.todayIdx === -1) {
    logger(`⚠️ Tarih sekmeleri bulunamadı, bekleniyor...`, "WARN");
    return [];
  }

  const todayIdx = tabInfo.todayIdx;
  const targets = isLateNight ? [todayIdx - 1, todayIdx] : [todayIdx];

  for (const t of targets) {
    let diff = t - todayIdx;
    let d = new Date();
    d.setDate(now.getDate() + diff);
    let dateStr = formatDate(d);
    let dayName = t === todayIdx ? "BUGÜN" : "DÜN";

    logger(`⚡ Canlı Sekme: ${dayName} (${dateStr}) kontrol ediliyor...`, "LIVE");
    await clickDateTabByIndex(page, t, logger);
    await delay(3500, 5500);

    // Live Filtresini Uygula
    await toggleLiveFilter(page, logger);
    await delay(3000, 6000);

    const matches = await smartScrollAndParse(page, dateStr, logger);
    logger(`✅ ${dayName} canlı sekmesinde ${matches.length} maç bulundu.`, "LIVE");
    masterData = masterData.concat(matches);
    await delay(1000, 2000);
  }

  totalScans++;
  await sendMatchesToApi(masterData, 'LIVE', logger);
  logger(`⚡ ==================== CANLI RADAR TAMAMLANDI (${masterData.length} Canlı Maç) ====================\n`, "LIVE");
  return masterData;
}

async function main() {
  logger(`🚀 Betmines Master Bot Başlatılıyor...`);
  logger(`⚙️ Hedef URL: ${config.targetUrl}`);
  logger(`⚙️ Alıcı API: ${config.apiUrl}`);
  logger(`⚙️ Proxy: ${config.proxy ? config.proxy : 'Doğrudan Bağlantı (Proxy Tanımlanmadı)'}`);
  logger(`⚙️ Görünürlük: ${config.headless ? 'Arka Plan (Headless)' : 'Pencere Açık (Headless: False)'}`);

  let browser = null;
  let page = null;

  async function startSession() {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }

    browser = await createBrowser();
    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
    await setupPage(page);

    logger(`🌐 Betmines ana sayfasına gidiliyor...`);
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
      logger(`⚠️ Sayfa yükleme uyarısı: ${e.message}`, "WARN");
    });

    // Cloudflare Bypass Kontrolü
    logger(`🛡️ Cloudflare kontrolü yapılıyor...`);
    await bypassCloudflareIfNeeded(page, logger, 12);
    await delay(3000, 5000);
  }

  await startSession();
  isRunning = true;

  // İlk Başlangıçta Full Senkron Çalıştır
  try {
    await runNightFullSync(page);
  } catch (err) {
    logger(`❌ İlk tam senkron hatası: ${err.message}`, "ERROR");
  }

  // Sürekli Otopilot Döngüsü
  while (isRunning) {
    try {
      const now = Date.now();
      const nowDate = new Date();
      const hh = nowDate.getHours();
      const mm = nowDate.getMinutes();

      // Gün Değişimi Kontrolü (00:05 ve 03:00'da sayfayı yenile)
      if ((hh === 0 && mm >= 4 && mm <= 6) || (hh === 3 && mm >= 0 && mm <= 2)) {
        logger(`🔄 Gün değişimi tespit edildi, sayfa temizlenip yenileniyor...`, "SYSTEM");
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await delay(5000);
      }

      // Full Senkron Zamanı Geldi mi?
      const timeSinceLastFull = now - lastFullSyncTime;
      const fullIntervalMs = config.nightIntervalMinutes * 60 * 1000;

      if (timeSinceLastFull >= fullIntervalMs) {
        logger(`⏰ Periyodik Full Senkron zamanı geldi (${config.nightIntervalMinutes} dk doldu).`, "SYSTEM");
        await runNightFullSync(page);
      } else {
        // Canlı Radar Çalıştır
        const liveMatches = await runLiveSync(page);

        // Uyku Süresi: Maç varsa 1 dk, maç yoksa 3 dk
        const sleepMs = liveMatches.length > 0 ? config.liveIntervalWithMatchesMs : config.liveIntervalNoMatchesMs;
        const sleepSec = Math.round(sleepMs / 1000);
        logger(`💤 Bir sonraki canlı kontrole kadar bekleniyor: ${sleepSec} saniye... (Toplam Yapılan Tarama: ${totalScans})`);
        await delay(sleepMs);
      }
    } catch (loopError) {
      logger(`⚠️ Otopilot döngü hatası: ${loopError.message}. 15 saniye içinde yeniden deneniyor...`, "ERROR");
      await delay(15000);
      try {
        await startSession();
      } catch (sessErr) {
        logger(`❌ Oturum yenileme hatası: ${sessErr.message}`, "ERROR");
      }
    }
  }
}

// Başlatıcı
if (require.main === module) {
  main().catch(err => {
    logger(`🚨 Kritik Hata: ${err.message}`, "FATAL");
  });
}

module.exports = { main };
