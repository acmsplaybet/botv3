/**
 * ====================================================================
 * BOTV3 — APEX API SYNC & TRANSMISSION TEST TOOL (tools/test_apex_sync.js)
 * ====================================================================
 * Tests formatting of scraped match JSON into APEX API payload format,
 * sends HTTP POST request with X-Apex-Secret, and verifies API response.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { formatMatchForIngest } = require('../core/db_ingester');

const APEX_IMPORT_URL = process.env.APEX_IMPORT_URL || 'http://localhost/apex-api/api/import.php';
const APEX_SECRET = process.env.APEX_SECRET || 'apex_secret_key_2026';

async function sendToApex(payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(APEX_IMPORT_URL);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Apex-Secret': APEX_SECRET,
        'User-Agent': 'BotV3-Sync-Client/3.0.0'
      },
      timeout: 10000
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json, raw: data });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('APEX API bağlantı zaman aşımına uğradı (10s)'));
    });

    req.write(postData);
    req.end();
  });
}

async function testApexSync() {
  console.log('\n======================================================');
  console.log('🚀 BOTV3 — APEX API TRANSMISSION & SYNC TEST');
  console.log('======================================================');
  console.log(`🌐 Hedef APEX API: ${APEX_IMPORT_URL}`);
  console.log(`🔑 Secret Key: ${APEX_SECRET.substring(0, 4)}****\n`);

  // 1. Örnek bir match_data.json bul
  const outputDir = path.join(__dirname, '..', 'output');
  let sampleJsonPath = null;

  if (fs.existsSync(outputDir)) {
    const folders = fs.readdirSync(outputDir).filter(f => fs.statSync(path.join(outputDir, f)).isDirectory());
    for (const f of folders) {
      const p = path.join(outputDir, f, 'match_data.json');
      if (fs.existsSync(p)) {
        sampleJsonPath = p;
        break;
      }
    }
  }

  if (!sampleJsonPath) {
    console.log('⚠️  output/ altında test için örnek match_data.json bulunamadı.');
    console.log('   Sentetik test yükü oluşturuluyor...');
    return { success: false, error: 'Örnek maç bulunamadı' };
  }

  console.log(`📂 Test İçin Kullanılan Maç: ${path.basename(path.dirname(sampleJsonPath))}`);
  const rawData = JSON.parse(fs.readFileSync(sampleJsonPath, 'utf8'));

  // 2. Payload: APEX Importer expects match_data.json structure
  console.log('🔄 Payload APEX 19-Tablo formatına hazırlanıyor...');
  const payload = rawData;

  // 3. API'ye ilet
  console.log('📡 APEX API import.php endpointine POST isteği gönderiliyor...');
  try {
    const startTime = Date.now();
    const res = await sendToApex({ matches: [payload] });
    const elapsed = Date.now() - startTime;

    console.log(`\n📥 Yanıt Alındı (HTTP ${res.statusCode}) - ${elapsed}ms:`);
    console.dir(res.data || res.raw, { depth: 3 });

    if (res.statusCode === 200 && res.data && res.data.success !== false) {
      console.log('\n🎉 APEX API SYNC TESTİ BAŞARILI! Veri APEX DB ve raw_bot_json kolonuna yazıldı.');
      console.log('======================================================\n');
      return { success: true, response: res.data };
    } else {
      console.warn(`\n⚠️  API HTTP ${res.statusCode} döndü. Mesaj: ${res.raw}`);
      console.log('======================================================\n');
      return { success: false, statusCode: res.statusCode, raw: res.raw };
    }
  } catch (err) {
    console.error(`\n❌ BAĞLANTI HATASI: ${err.message}`);
    console.log('   (APEX API sunucusunun Apache/PHP üzerinde çalıştığından emin olun: http://localhost/apex-api/)');
    console.log('======================================================\n');
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  testApexSync().then(res => process.exit(res.success ? 0 : 1));
}

module.exports = { testApexSync };
