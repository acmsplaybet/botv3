const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testCfBypass() {
  console.log('--- Cloudflare Bypass Test Başlatılıyor ---');
  
  let chromePath = undefined;
  if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  const browser = await puppeteer.launch({
    headless: false, // Gerçek pencere ile 1 kere challenge çözülür
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280x800'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  console.log('Forebet ana sayfasına gidiliyor...');
  try {
    await page.goto('https://www.forebet.com/en/football-predictions', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch(e) {
    console.log('İlk deneme, bekleniyor...', e.message);
  }

  // 4 saniye Cloudflare'in çözülmesi için bekle
  console.log('Challenge çözülmesi bekleniyor...');
  await new Promise(r => setTimeout(r, 4000));

  console.log('Başlık:', await page.title());
  console.log('URL:', page.url());

  const cookies = await page.cookies();
  const cfCookie = cookies.find(c => c.name === 'cf_clearance');
  console.log('CF Clearance Çerezi Alındı mı?:', !!cfCookie);

  if (cookies.length > 0) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'cf_cookies_cache.json'), JSON.stringify(cookies, null, 2), 'utf8');
    console.log('✅ Çerezler data/cf_cookies_cache.json dosyasına kaydedildi!');
  }

  await browser.close();
}

testCfBypass().catch(console.error);
