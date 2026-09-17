/**
 * ====================================================================
 * BPA V4 / APEX SYNC — CLI BATCH UPLOADER (tools/upload_to_apex.js)
 * ====================================================================
 * Usage:
 *   node tools/upload_to_apex.js --file=data/predictions_2026-09-17.json
 *   node tools/upload_to_apex.js --date=yesterday
 *   node tools/upload_to_apex.js --date=tomorrow
 *   node tools/upload_to_apex.js --date=2026-09-15
 *   node tools/upload_to_apex.js --test
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { uploadMatchesToApex, testApexConnection, getApexConfig } = require('../core/apex_uploader');

function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = null;
  let targetDate = null;
  let isTest = false;

  for (const arg of args) {
    if (arg === '--test' || arg === '-t') {
      isTest = true;
    } else if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    } else if (arg.startsWith('--date=')) {
      const val = arg.split('=')[1];
      if (val === 'yesterday') targetDate = getFormattedDate(-1);
      else if (val === 'today') targetDate = getFormattedDate(0);
      else if (val === 'tomorrow') targetDate = getFormattedDate(1);
      else targetDate = val;
    } else if (arg === '--yesterday') {
      targetDate = getFormattedDate(-1);
    } else if (arg === '--today') {
      targetDate = getFormattedDate(0);
    } else if (arg === '--tomorrow') {
      targetDate = getFormattedDate(1);
    }
  }

  if (isTest) {
    console.log('🔍 APEX API Bağlantı Testi Gerçekleştiriliyor...');
    const result = await testApexConnection();
    console.log('Sonuç:', result);
    process.exit(result.connected ? 0 : 1);
  }

  if (!filePath && targetDate) {
    filePath = path.resolve(__dirname, `../data/predictions_${targetDate}.json`);
    if (!fs.existsSync(filePath)) {
      const ym = targetDate.slice(0, 7);
      const archivePath = path.resolve(__dirname, `../data/archive/${ym}/predictions_${targetDate}.json`);
      if (fs.existsSync(archivePath)) filePath = archivePath;
    }
  }

  if (!filePath) {
    // Varsayılan olarak dünün dosyasını veya en son dosyayı ara
    const yesterday = getFormattedDate(-1);
    const candidate = path.resolve(__dirname, `../data/predictions_${yesterday}.json`);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      targetDate = yesterday;
    } else {
      console.log('Kullanım: node tools/upload_to_apex.js --file=data/predictions_YYYY-MM-DD.json');
      console.log('         node tools/upload_to_apex.js --date=yesterday|tomorrow|YYYY-MM-DD');
      console.log('         node tools/upload_to_apex.js --test');
      process.exit(1);
    }
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Dosya bulunamadı: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`📖 Dosya okunuyor: ${resolvedPath}`);
  let rawData = null;
  try {
    rawData = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (err) {
    console.error(`❌ JSON ayrıştırma hatası: ${err.message}`);
    process.exit(1);
  }

  let matches = [];
  if (Array.isArray(rawData)) {
    matches = rawData;
  } else if (rawData && Array.isArray(rawData.matches)) {
    matches = rawData.matches;
  } else {
    console.error(`❌ Dosya içinde maç listesi bulunamadı.`);
    process.exit(1);
  }

  console.log(`📋 Toplam ${matches.length} maç bulundu. Senkronizasyon başlatılıyor...`);

  const res = await uploadMatchesToApex(matches, {
    dateStr: targetDate || path.basename(resolvedPath).replace(/[^0-9\-]/g, ''),
    logger: console.log
  });

  if (res.success) {
    console.log(`🎉 Başarılı! Tüm ${res.sentMatches} maç APEX API'ye aktarıldı.`);
    process.exit(0);
  } else {
    console.error(`⚠️ Senkronizasyon kısmi veya hatalı tamamlandı (${res.failedChunks} paket aktarılamadı).`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Kritik Hata:', err);
  process.exit(1);
});
