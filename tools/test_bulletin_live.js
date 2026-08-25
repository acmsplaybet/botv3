const { createBrowser, setupPageInterception } = require('../core/browser_engine');

(async () => {
  console.log('===============================================================');
  console.log('🚀 TEST: DOĞRULANMIŞ PROFİL İLE BÜLTEN KAZIMA');
  console.log('===============================================================');

  const browser = await createBrowser({ headless: 'new', useTempProfile: false });
  const page = await browser.newPage();
  await setupPageInterception(page);

  const testUrl = 'https://www.forebet.com/en/football-predictions/predictions-1x2';
  console.log(`🌐 Hedef URL Açılıyor: ${testUrl}`);

  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e => console.log('Goto Uyarısı:', e.message));

  for (let sec = 1; sec <= 10; sec++) {
    const title = await page.title().catch(() => '');
    console.log(`⏱️ [${sec}s] Başlık: "${title}"`);

    const isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com' || title === '';

    if (!isCf && title.length > 5) {
      console.log(`\n🎉 BAŞARILI! SAYFA YÜKLENDİ: "${title}"`);
      const count = await page.evaluate(() => document.querySelectorAll('.rcnt, .schema tr').length);
      console.log(`🎯 Bülten Tablosundaki Toplam Satır/Maç Sayısı: ${count}`);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
  console.log('===============================================================');
})();
