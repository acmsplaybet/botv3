/**
 * ====================================================================
 * BPA V4 / NATIVE DESKTOP EXE BUILDER (tools/build_exe.js)
 * ====================================================================
 * Compiles src_launcher/BPA_Control_Center.cs into BPA_Control_Center.exe
 * using Windows built-in csc.exe compiler.
 * 
 * Result:
 *   - Completely independent Windows GUI executable (~200 KB)
 *   - Zero black command prompt windows (/target:winexe)
 *   - Tray icon, App-mode window, single instance mutex
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_FILE = path.join(ROOT_DIR, 'src_launcher', 'BPA_Control_Center.cs');
const OUTPUT_EXE = path.join(ROOT_DIR, 'BPA_Control_Center.exe');

// Windows .NET built-in csc.exe path
const CSC_PATHS = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
];

function findCsc() {
  for (const p of CSC_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildExe() {
  console.log('🔨 [BPA V4] Masaüstü Programı (.EXE) Derleniyor...');

  const cscPath = findCsc();
  if (!cscPath) {
    console.error('❌ Hata: Sistemde Windows csc.exe derleyicisi bulunamadı.');
    process.exit(1);
  }

  if (!fs.existsSync(SRC_FILE)) {
    console.error('❌ Hata: Kaynak dosya bulunamadı:', SRC_FILE);
    process.exit(1);
  }

  let targetOut = OUTPUT_EXE;
  let cmd = `"${cscPath}" /target:winexe /platform:anycpu /out:"${targetOut}" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.dll "${SRC_FILE}"`;

  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    console.warn('\n⚠️ BPA_Control_Center.exe şu an açık ve çalışıyor, alternatif dosyaya derleniyor...');
    targetOut = path.join(ROOT_DIR, 'BPA_Control_Center_updated.exe');
    cmd = `"${cscPath}" /target:winexe /platform:anycpu /out:"${targetOut}" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.dll "${SRC_FILE}"`;
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
      console.error('❌ Derleme başarısız oldu:', e.message);
      process.exit(1);
    }
  }

  if (fs.existsSync(targetOut)) {
    const stats = fs.statSync(targetOut);
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log('\n🎉 [BAŞARILI] Masaüstü Uygulaması Üretildi:');
    console.log(`   📁 Çıktı : ${targetOut}`);
    console.log(`   ⚖️ Boyut : ${sizeKb} KB`);
    console.log('   ✨ Özellikler: Tamamen sessiz arka plan, System Tray ikonu, Çerçevesiz Masaüstü Penceresi.');
  }
}

buildExe();
