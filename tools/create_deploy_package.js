/**
 * ====================================================================
 * BPA V4 / CLEAN DEPLOYMENT PACKAGE BUILDER (tools/create_deploy_package.js)
 * ====================================================================
 * Creates a pristine, production-ready .zip archive for remote deployment.
 * 
 * Included:
 *   - All source code (*.js), core/, parsers/, viewer/, tools/, docs/, .agents/
 *   - package.json, package-lock.json
 *   - config.json, bpa_local_config.json, index.html
 *   - All .bat launcher scripts and README_DEPLOY.md
 * 
 * Strictly Excluded:
 *   - node_modules/
 *   - output/ (Old thousands of match folders)
 *   - data/predictions_*.json (Old massive multi-megabyte JSONs)
 *   - data/stealth_profile/, cf_cookies_cache.json, auth sessions
 *   - .git/, .vscode/, logs, and screenshot images (*.png)
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, 'dist_temp');
const ZIP_OUTPUT = path.join(ROOT_DIR, 'BPA_V4_APEX_DEPLOY.zip');

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    const ext = path.extname(src).toLowerCase();
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.log' || ext === '.tmp') {
      return; // Hariç tut
    }
    fs.copyFileSync(src, dest);
  }
}

function buildDeployPackage() {
  console.log('🚀 [BPA V4] Temiz Dağıtım Paketi Hazırlanıyor...');

  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  if (fs.existsSync(ZIP_OUTPUT)) {
    fs.unlinkSync(ZIP_OUTPUT);
  }

  // 1. Kopyalanacak Kök Dosyalar
  const rootFiles = [
    'daily_pipeline.js',
    'scrape_match.js',
    'bpa_desktop_agent.js',
    'cron_scheduler.js',
    'daily_crawler.js',
    'server.js',
    'config.json',
    'bpa_local_config.json',
    'package.json',
    'package-lock.json',
    'index.html',
    'BPA_Control_Center.exe',
    'Masaustune_Kisayol_Olustur.bat',
    '1-TIKLA_KURULUM.bat',
    'BPA_Agent_Launcher_GUI.bat',
    'RUN_CRON_SERVICE.bat',
    'RUN_MORNING_0600.bat',
    'RUN_EVENING_1700.bat',
    'setup_windows_tasks.bat',
    'remove_windows_tasks.bat',
    'ONAYLA_VE_BASLAT.bat',
    'README_DEPLOY.md',
    'PROGRESS.md',
    'CHANGELOG.md',
    'AGENTS.md',
    'DOCS_FOREBET_SCRAPER.md',
    'PROJECT_STANDARDS.md',
    'WORKFLOW.md',
    '.gitignore'
  ];

  for (const f of rootFiles) {
    let srcPath = path.join(ROOT_DIR, f);
    if (f === 'BPA_Control_Center.exe' && fs.existsSync(path.join(ROOT_DIR, 'BPA_Control_Center_updated.exe'))) {
      srcPath = path.join(ROOT_DIR, 'BPA_Control_Center_updated.exe');
    }
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(TEMP_DIR, f));
    }
  }

  // 2. Kopyalanacak Dizinler
  const dirsToCopy = [
    'core',
    'parsers',
    'viewer',
    'tools',
    'docs',
    '.agents',
    'src_launcher'
  ];

  for (const d of dirsToCopy) {
    const srcDir = path.join(ROOT_DIR, d);
    if (fs.existsSync(srcDir)) {
      copyRecursive(srcDir, path.join(TEMP_DIR, d));
    }
  }

  // 3. Boş Dizin Şablonları (data, archive, output, logs)
  const emptyDirs = [
    path.join(TEMP_DIR, 'data', 'archive'),
    path.join(TEMP_DIR, 'output'),
    path.join(TEMP_DIR, 'logs')
  ];

  for (const ed of emptyDirs) {
    fs.mkdirSync(ed, { recursive: true });
    fs.writeFileSync(path.join(ed, '.gitkeep'), '', 'utf-8');
  }

  console.log('📦 Dosyalar geçici dizine toplandı. ZIP arşivi sıkıştırılıyor...');

  // 4. .NET ZipFile::CreateFromDirectory ile Yüksek Performanslı ve Kilitlenmesiz ZIP Oluştur
  const psCmd = `powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${TEMP_DIR}', '${ZIP_OUTPUT}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
  execSync(psCmd, { stdio: 'inherit' });

  // 5. Geçici Dizini Temizle
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (_) {}

  if (fs.existsSync(ZIP_OUTPUT)) {
    const sizeMb = (fs.statSync(ZIP_OUTPUT).size / (1024 * 1024)).toFixed(2);
    console.log(`\n🎉 [BAŞARILI] Temiz Dağıtım Paketi Üretildi:`);
    console.log(`   📁 Dosya Yolu: ${ZIP_OUTPUT}`);
    console.log(`   ⚖️ Boyut     : ${sizeMb} MB`);
    console.log(`   ✨ Hariç Tutuldu: node_modules, output klasörleri, eski test JSON'ları ve loglar.`);
  } else {
    console.error('❌ Hata: ZIP dosyası oluşturulamadı.');
  }
}

buildDeployPackage();
