const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('====================================================');
  console.log('🧪 TEST: TURNSTILE AKILLI TIKLAYICI TESTİ');
  console.log('====================================================');

  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=en-US,en'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const testUrl = 'https://www.forebet.com/en/football-predictions/predictions-1x2';
  console.log(`🌐 Sayfa Açılıyor: ${testUrl}`);
  
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e => console.log('Goto Log:', e.message));

  for (let sec = 1; sec <= 15; sec++) {
    const title = await page.title().catch(() => '');
    console.log(`⏱️ [${sec}s] Başlık: "${title}"`);

    const isCf = title.includes('Just a moment') || title.includes('Attention Required') || title === 'www.forebet.com';

    if (!isCf && title.length > 5) {
      console.log(`\n🎉 BAŞARILI! CLOUDFLARE GEÇİLDİ!`);
      const matchCount = await page.evaluate(() => document.querySelectorAll('.rcnt, .schema tr').length);
      console.log(`🎯 Sayfada Bulunan Maç Sayısı: ${matchCount}`);
      
      const cookies = await page.cookies();
      const cfClearance = cookies.find(c => c.name === 'cf_clearance');
      if (cfClearance) {
        console.log(`🍪 cf_clearance Çerezi Alındı: ${cfClearance.value.substring(0, 25)}...`);
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'cf_cookies_cache.json'), JSON.stringify(cookies, null, 2), 'utf-8');
      }
      break;
    }

    // Turnstile iframe tespiti ve farenin tam kutucuğa tıklaması
    try {
      const iframes = await page.$$('iframe');
      for (const iframe of iframes) {
        const box = await iframe.boundingBox();
        if (box && box.width > 50 && box.height > 40) {
          console.log(`   ↳ 🎯 Turnstile Widget bulundu (${Math.round(box.x)}, ${Math.round(box.y)}). Tıklanıyor...`);
          await page.mouse.click(box.x + 35, box.y + (box.height / 2));
          break;
        }
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
  console.log('====================================================');
})();
