const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('===============================================================');
  console.log('🔐 FOREBET CLOUDFLARE KALICI PROFİL ONAY VE ISITMA ARACI');
  console.log('===============================================================');
  console.log('ℹ️  Şimdi önünde bir Chrome penceresi açılacak.');
  console.log('ℹ️  Eğer ekranda "Ben İnsanım" kutucuğu çıkarsa lütfen tıkla.');
  console.log('ℹ️  Sayfa açıldığı an bot çerezleri kalıcı hafızaya alıp pencereyi kapatacaktır.\n');

  const dataDir = path.join(__dirname, '..', 'data');
  const profileDir = path.join(dataDir, 'stealth_profile');
  const cookieFile = path.join(dataDir, 'cf_cookies_cache.json');

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // Windows lock dosyalarını temizle
  ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'].forEach(f => {
    try { fs.unlinkSync(path.join(profileDir, f)); } catch (_) {}
  });

  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (fs.existsSync('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir: profileDir,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
      '--lang=en-US,en'
    ]
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const targetUrl = 'https://www.forebet.com/en/football-predictions/predictions-1x2';
  console.log(`🌐 Forebet Bülteni Açılıyor: ${targetUrl}`);
  
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => {
    console.log('Sayfa açılış uyarısı (bekleniyor):', e.message);
  });

  console.log('⏳ Doğrulama bekleniyor (Maksimum 60 saniye)...');

  let verified = false;
  let consecutivePasses = 0;
  for (let sec = 1; sec <= 120; sec++) {
    const title = await page.title().catch(() => '');
    const isCfTitle = title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare') || title === 'www.forebet.com' || title === '';

    const cookies = await page.cookies().catch(() => []);
    const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

    const hasTable = await page.evaluate(() => {
      return !!(document.querySelector('.schema, .predict-tables, .rcnt, #m1x2_table, .mrows, .homeTeam') ||
               (document.body && document.body.innerText.includes('Predictions 1X2')));
    }).catch(() => false);

    const hasChallengeIframe = await page.evaluate(() => {
      return !!(document.querySelector('#challenge-stage, #cf-stage, iframe[src*="cloudflare"], iframe[src*="turnstile"]'));
    }).catch(() => false);

    const isTrulyValid = (hasCfClearance || !hasChallengeIframe) && hasTable && !isCfTitle && title.length > 5;

    if (isTrulyValid) {
      consecutivePasses++;
      if (consecutivePasses >= 2) {
        verified = true;
        console.log(`\n🎉 HARİKA! CLOUDFLARE DOĞRULAMASI GEÇİLDİ!`);
        console.log(`📄 Sayfa Başlığı: "${title}"`);
        break;
      }
    } else {
      consecutivePasses = 0;
    }

    // Otomatik tıklama denemesi (Eğer görünürse)
    try {
      const iframes = await page.$$('iframe');
      for (const iframe of iframes) {
        const box = await iframe.boundingBox();
        if (box && box.width > 50 && box.height > 40) {
          await page.mouse.click(box.x + 35, box.y + (box.height / 2)).catch(() => {});
        }
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 1000));
  }

  if (verified) {
    const cookies = await page.cookies();
    fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2), 'utf-8');
    console.log(`💾 Kalıcı Profil ve ${cookies.length} adet çerez ('data/cf_cookies_cache.json') dosyasına başarıyla kaydedildi.`);
    console.log(`✅ Artık bot tüm taramaları arka planda bu profil ile kesintisiz yapacaktır.\n`);
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log(`\n⚠️ 60 saniye içinde doğrulama tamamlanamadı. Lütfen tekrar deneyin.`);
  }

  await browser.close();
  console.log('===============================================================');
})();
