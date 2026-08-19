/**
 * ====================================================================
 * BOTV3 — CLOUDFLARE & STEALTH HEALTH CHECKER (tools/test_cf_health.js)
 * ====================================================================
 * Tests Puppeteer Stealth engine, Cloudflare bypass capability,
 * cookie cache integrity, and page loading speed.
 */

const { initBrowser, closeBrowser, setupPageInterception, navigateWithRetry, bypassCloudflareIfNeeded } = require('../core/browser_engine');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.forebet.com/en/football-predictions/predictions-1x2';
const COOKIE_CACHE_PATH = path.join(__dirname, '..', 'data', 'cf_cookies_cache.json');

async function testCfHealth() {
  console.log('\n======================================================');
  console.log('🛡️  BOTV3 — CLOUDFLARE & STEALTH HEALTH CHECK');
  console.log('======================================================\n');

  const startTime = Date.now();
  let browser = null;
  let page = null;

  try {
    // 1. Çerez önbelleği kontrolü
    console.log('📂 1. Çerez Önbelleği Kontrol Ediliyor...');
    if (fs.existsSync(COOKIE_CACHE_PATH)) {
      const cacheStat = fs.statSync(COOKIE_CACHE_PATH);
      const cacheAgeMin = Math.round((Date.now() - cacheStat.mtimeMs) / (1000 * 60));
      console.log(`   ✅ cf_cookies_cache.json mevcut (Yaş: ${cacheAgeMin} dakika, Boyut: ${cacheStat.size} bytes)`);
    } else {
      console.log('   ⚠️  cf_cookies_cache.json henüz yok (İlk bağlantıda oluşturulacak)');
    }

    // 2. Tarayıcı başlatma
    console.log('\n🚀 2. Stealth Puppeteer Tarayıcısı Başlatılıyor...');
    browser = await initBrowser({ headless: 'new' });
    page = await browser.newPage();
    await setupPageInterception(page);
    console.log('   ✅ Tarayıcı, çerezler ve stealth filtreleri hazırlandı');

    // 3. Forebet bağlantı ve Cloudflare bypass testi
    console.log(`\n🌐 3. Forebet Test Sayfası Yükleniyor: ${TEST_URL}...`);
    const navStart = Date.now();
    await navigateWithRetry(page, TEST_URL, console.log);
    const navTime = Date.now() - navStart;
    console.log(`   ⏱️  İlk DOM Yüklenme Süresi: ${navTime}ms`);

    // 4. Cloudflare Challenge Tespiti
    console.log('\n🔍 4. Cloudflare Challenge & Turnstile Denetleniyor...');
    const bypassed = await bypassCloudflareIfNeeded(page);
    const title = await page.title();
    console.log(`   📄 Sayfa Başlığı: "${title}"`);

    if (title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('cloudflare')) {
      console.error('\n❌ CLOUDFLARE ENGELİ AŞILAMADI!');
      return { success: false, error: 'Cloudflare challenge aktif' };
    }

    // 5. DOM İçerik Doğrulaması
    const matchCount = await page.evaluate(() => {
      return document.querySelectorAll('.schema_h2h, tr[onclick*="/matches/"], .rcnt').length;
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ DOM Başarıyla Ayrıştırıldı! Bulunan Liste Öğesi: ${matchCount}`);
    console.log(`\n🎉 SONUÇ: PASS | Toplam Süre: ${elapsed}s | Cloudflare Bypass: AKTİF & SAĞLIKLI`);
    console.log('======================================================\n');
    return { success: true, elapsed, matchCount };

  } catch (err) {
    console.error(`\n❌ HATA: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await closeBrowser(browser).catch(() => {});
  }
}

if (require.main === module) {
  testCfHealth().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { testCfHealth };
