/**
 * ====================================================================
 * BETMINES - CONNECTION & CLOUDFLARE TEST TOOL
 * ====================================================================
 */

const { createBrowser, setupPage, bypassCloudflareIfNeeded } = require('../core/browser');
const config = require('../config');

async function testConnection() {
  console.log(`\n==================================================`);
  console.log(`🔍 BETMINES BAĞLANTI & ERİŞİM TESTİ`);
  console.log(`==================================================`);
  console.log(`Hedef URL : ${config.targetUrl}`);
  console.log(`Proxy     : ${config.proxy || 'Tanımlanmadı (Doğrudan Bağlantı)'}`);
  console.log(`Headless  : ${config.headless}`);
  console.log(`--------------------------------------------------\n`);

  let browser = null;
  try {
    console.log(`[1/3] 🌐 Chromium başlatılıyor...`);
    browser = await createBrowser();
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await setupPage(page);

    console.log(`[2/3] 📡 ${config.targetUrl} sayfasına bağlanılıyor...`);
    const res = await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    const status = res ? res.status() : 'Bilinmiyor';
    console.log(`      HTTP Yanıt Kodu: ${status}`);

    console.log(`[3/3] 🛡️ Cloudflare ve Başlık Kontrolü yapılıyor...`);
    await bypassCloudflareIfNeeded(page, console.log, 10);

    const title = await page.title();
    console.log(`      Sayfa Başlığı: "${title}"`);

    const hasMatches = await page.evaluate(() => {
      return !!document.querySelector('a[href*="/matches/"], div.tw-flex-row');
    });

    if (hasMatches) {
      console.log(`\n✅ [BAŞARILI] Betmines sayfasına ve maç listesine sorunsuz erişildi!`);
    } else {
      console.log(`\n⚠️ [UYARI] Sayfa açıldı ancak maç listesi seçicileri bulunamadı. (Cloudflare engeli veya sayfa yapısı değişmiş olabilir)`);
    }

  } catch (err) {
    console.log(`\n❌ [BAĞLANTI HATASI]: ${err.message}`);
    console.log(`💡 İpucu: Türkiye ISP engeli için betmines/config.js içindeki proxy alanını doldurabilir veya sistemde VPN/WARP açabilirsiniz.`);
  } finally {
    if (browser) {
      await new Promise(r => setTimeout(r, 4000));
      await browser.close().catch(() => {});
      console.log(`[Son] Tarayıcı kapatıldı.\n`);
    }
  }
}

testConnection();
