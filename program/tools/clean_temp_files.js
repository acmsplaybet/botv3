/**
 * ====================================================================
 * BOTV3 — TEMPORARY FILES & CACHE CLEANER (tools/clean_temp_files.js)
 * ====================================================================
 * Safely cleans up temporary Puppeteer profiles (temp_profiles/),
 * stale test screenshots, and empties scratch files to maintain disk health.
 */

const fs = require('fs');
const path = require('path');

function removeDirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDirRecursive(curPath);
      } else {
        try { fs.unlinkSync(curPath); } catch (e) {}
      }
    });
    try { fs.rmdirSync(dirPath); } catch (e) {}
  }
}

function cleanTempFiles() {
  console.log('\n======================================================');
  console.log('🧹 BOTV3 — TEMPORARY FILES & DISK CLEANER');
  console.log('======================================================\n');

  let cleanedItems = 0;

  // 1. temp_profiles temizliği
  const tempProfilesDir = path.join(__dirname, '..', 'temp_profiles');
  if (fs.existsSync(tempProfilesDir)) {
    console.log('📂 1. temp_profiles/ taranıyor...');
    const profiles = fs.readdirSync(tempProfilesDir);
    profiles.forEach(p => {
      removeDirRecursive(path.join(tempProfilesDir, p));
      cleanedItems++;
    });
    console.log(`   ✅ ${profiles.length} adet geçici Puppeteer profili silindi.`);
  }

  // 2. Kök dizindeki geçici test png ve scratch html dosyaları
  console.log('\n📂 2. Geçici ekran görüntüleri ve scratch dosyaları temizleniyor...');
  const rootDir = path.join(__dirname, '..');
  const rootFiles = fs.readdirSync(rootDir);

  rootFiles.forEach(f => {
    if ((f.startsWith('test_') && f.endsWith('.png')) || (f.startsWith('scratch_') && f.endsWith('.html'))) {
      try {
        fs.unlinkSync(path.join(rootDir, f));
        console.log(`   🗑️  Silindi: ${f}`);
        cleanedItems++;
      } catch (e) {}
    }
  });

  console.log(`\n🎉 TEMİZLİK TAMAMLANDI! Toplam ${cleanedItems} öğe temizlendi.`);
  console.log('======================================================\n');
  return { success: true, cleanedItems };
}

if (require.main === module) {
  cleanTempFiles();
}

module.exports = { cleanTempFiles };
