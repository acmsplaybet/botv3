const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

(async () => {
  console.clear();
  console.log('================================================================');
  console.log('🔐 BPA BOT V4 — FOREBET KULLANICI ONAY & ÇEREZ YAKALAYICI');
  console.log('================================================================');
  console.log('🌐 Chrome açılıyor... Lütfen bekleyin.\n');

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
  console.log(`🌐 Hedef URL Açılıyor: ${targetUrl}`);
  console.log('👉 Ekrana gelen sayfada güvenlik kontrolü ("Ben İnsanım") varsa lütfen tıkla!\n');

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => {});

  let isDone = false;
  let consecutivePasses = 0;
  while (!isDone) {
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
        console.log(`\n🎉 BÜLTEN AÇILDI VE CLOUDFLARE GEÇİLDİ!`);
        console.log(`📄 Sayfa Başlığı: "${title}"`);

        await new Promise(r => setTimeout(r, 1500));
        const finalCookies = await page.cookies().catch(() => []);
        fs.writeFileSync(cookieFile, JSON.stringify(finalCookies, null, 2), 'utf-8');
        console.log(`💾 Toplam ${finalCookies.length} adet çerez 'data/cf_cookies_cache.json' dosyasına kaydedildi (cf_clearance: ${hasCfClearance ? 'VAR' : 'GEREKMEDİ'}).`);
        console.log(`🚀 Kalıcı profil 'data/stealth_profile' dizininde hazırlandı.`);
        console.log('\n✅ İŞLEM TAMAMLANDI! Artık bot bu hafıza ile arka planda çalışacak.');
        console.log('Pencere 3 saniye sonra otomatik kapanacaktır...');
        isDone = true;
        await new Promise(r => setTimeout(r, 3000));
        break;
      }
    } else {
      consecutivePasses = 0;
    }

    // Konsolda durum yaz
    process.stdout.write(`\r⏳ Güvenlik onayı bekleniyor... (Mevcut Durum: ${title || 'Yükleniyor'} | Tablo: ${hasTable ? 'Hazır' : 'Bekleniyor'} | cf_clearance: ${hasCfClearance ? 'Var' : 'Bekleniyor'}) `);
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close().catch(() => {});
  console.log('\n================================================================');
})();
