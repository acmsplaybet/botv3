/**
 * ====================================================================
 * BETMINES BOT - CONFIGURATION
 * ====================================================================
 */

const path = require('path');

module.exports = {
  // Hedef Web Sitesi
  targetUrl: 'https://betmines.com/',

  // Veri Alıcı API
  apiUrl: process.env.BPI_API_URL || 'https://realmobilebet.com/bpiv2/api/receiver.php',
  apiKey: process.env.BPI_API_KEY || 'bpi_master_key',

  // Proxy Yapılandırması (Örn: 'http://127.0.0.1:10808', 'socks5://127.0.0.1:10808' veya '')
  // Eğer sisteminizde WARP / ProtonVPN / GoodbyeDPI açıksa boş bırakabilirsiniz.
  proxy: process.env.BETMINES_PROXY || '',

  // Tarayıcı Görünürlüğü (Kullanıcı müdahalesi ve Cloudflare kontrolü için false = görünür)
  headless: process.env.HEADLESS === 'true' ? true : false,

  // Tarama Aralıkları (Milisaniye / Dakika)
  liveIntervalWithMatchesMs: 60 * 1000,    // Canlı maç varsa 1 dakika
  liveIntervalNoMatchesMs: 180 * 1000,     // Canlı maç yoksa 3 dakika
  nightIntervalMinutes: 60,                // Full senkron periyodu (60 dk)
  nightHours: [0, 3, 6, 9, 12, 15, 18, 21], // Gece/Gündüz planlı full senkron saatleri

  // Dizin Yolları
  paths: {
    dataDir: path.join(__dirname, 'data'),
    profileDir: path.join(__dirname, 'data', 'profile'),
    cookiesFile: path.join(__dirname, 'data', 'cf_cookies.json')
  }
};
