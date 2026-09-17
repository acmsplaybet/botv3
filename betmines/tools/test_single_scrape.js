/**
 * ====================================================================
 * BETMINES - SINGLE SCRAPE TEST TOOL
 * ====================================================================
 */

const { createBrowser, setupPage, bypassCloudflareIfNeeded } = require('../core/browser');
const { smartScrollAndParse, formatDate } = require('../core/navigator');
const config = require('../config');

async function testSingleScrape() {
  console.log(`\n==================================================`);
  console.log(`🎯 BETMINES TEKLİ SAYFA KAZIMA TESTİ (BUGÜN)`);
  console.log(`==================================================\n`);

  let browser = null;
  try {
    browser = await createBrowser();
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await setupPage(page);

    console.log(`🌐 Sayfaya gidiliyor...`);
    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    console.log(`🛡️ Cloudflare kontrolü...`);
    await bypassCloudflareIfNeeded(page, console.log, 10);
    await new Promise(r => setTimeout(r, 3000));

    const todayStr = formatDate(new Date());
    console.log(`📜 Bugüne (${todayStr}) ait maçlar taranıyor...`);
    const matches = await smartScrollAndParse(page, todayStr, console.log);

    console.log(`\n==================================================`);
    console.log(`📊 KAZIMA SONUÇLARI:`);
    console.log(`Toplam Bulunan Maç: ${matches.length}`);

    if (matches.length > 0) {
      console.log(`\n🔍 ÖRNEK İLK 2 MAÇ VERİSİ:`);
      console.log(JSON.stringify(matches.slice(0, 2), null, 2));
    }
    console.log(`==================================================\n`);

  } catch (err) {
    console.error(`❌ Hata: ${err.message}`);
  } finally {
    if (browser) {
      await new Promise(r => setTimeout(r, 4000));
      await browser.close().catch(() => {});
    }
  }
}

testSingleScrape();
