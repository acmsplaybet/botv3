const fs = require('fs');
const path = require('path');
const { discoverDailyMatches } = require('./core/daily_discovery');
const { runCrawlPool } = require('./core/crawl_pool');

async function main() {
  const dateStr = '2026-08-19';
  console.log(`\n=============================================================`);
  console.log(`🔍 10 MAÇLIK ÖRNEK KAZIMA VE HTML KARŞILAŞTIRMA BAŞLATILIYOR`);
  console.log(`📅 Tarih: ${dateStr}`);
  console.log(`=============================================================\n`);

  // 1. Keşif
  const discovery = await discoverDailyMatches(dateStr, { headless: 'new' });
  console.log(`\n✅ Keşif Tamamlandı: ${discovery.quoted_count} oranlı maç bulundu.`);

  // İlk 10 maçı seç
  const sample10 = discovery.matches.slice(0, 10);
  console.log(`\n🚀 Seçilen 10 Maç 4 Sekmeli Havuz ile Kazınıyor...\n`);

  const results = await runCrawlPool(sample10, {
    concurrency: 4,
    saveDb: false, // Yerel PC'ye kaydet
    saveLocal: true,
    headless: 'new'
  });

  console.log(`\n🎉 10 Maç Kazındı! Karşılaştırma Sayfası Hazırlanıyor...\n`);

  // 2. 10 Maçlık Karşılaştırma İndeks Sayfası Oluştur
  const outDir = path.join(__dirname, 'output');
  const items = [];

  for (const match of sample10) {
    const slug = match.url.split('/').filter(Boolean).pop().replace(/-\d+$/, '');
    // Dosyayı bul
    let matchDir = path.join(outDir, slug);
    if (!fs.existsSync(matchDir)) {
      // Find matching dir
      const subdirs = fs.readdirSync(outDir, { withFileTypes: true }).filter(d => d.isDirectory());
      const found = subdirs.find(d => slug.includes(d.name) || d.name.includes(slug));
      if (found) matchDir = path.join(outDir, found.name);
    }

    const jsonPath = path.join(matchDir, 'match_data.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        items.push({
          slug: path.basename(matchDir),
          forebetUrl: match.url,
          hero: data.hero,
          markets: data.markets,
          viewerUrl: `./${path.basename(matchDir)}/viewer.html`,
          jsonUrl: `./${path.basename(matchDir)}/match_data.json`
        });
      } catch (e) {}
    }
  }

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BPA V3 - 10 Maçlık Canlı Karşılaştırma Vitrini</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --bg-dark: #080c14;
      --card-bg: #101726;
      --card-border: #1e293b;
      --accent-green: #00e676;
      --accent-cyan: #00e5ff;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: radial-gradient(circle at top, #131c31 0%, var(--bg-dark) 100%); color: var(--text-main); padding: 30px 20px; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 900; background: linear-gradient(135deg, var(--accent-green), var(--accent-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header p { color: var(--text-muted); font-size: 14px; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transition: transform 0.2s, border-color 0.2s; }
    .card:hover { transform: translateY(-4px); border-color: var(--accent-cyan); }
    .league-badge { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .league-flag { width: 20px; height: 14px; object-fit: contain; border-radius: 2px; }
    .teams-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; font-size: 15px; font-weight: 800; }
    .team { display: flex; align-items: center; gap: 10px; }
    .team-logo { width: 28px; height: 28px; object-fit: contain; }
    .vs { color: var(--accent-cyan); font-size: 11px; font-weight: 900; padding: 4px 8px; background: rgba(0, 229, 255, 0.1); border-radius: 6px; }
    .markets-preview { background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; margin-bottom: 16px; font-size: 12px; }
    .market-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .market-row:last-child { margin-bottom: 0; }
    .market-val { font-weight: 800; color: var(--accent-green); }
    .btn-row { display: flex; gap: 8px; }
    .btn { flex: 1; text-align: center; padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s; }
    .btn-viewer { background: linear-gradient(135deg, #00c853, #00e676); color: #000; }
    .btn-viewer:hover { opacity: 0.9; box-shadow: 0 4px 15px rgba(0, 230, 118, 0.4); }
    .btn-forebet { background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid var(--card-border); }
    .btn-forebet:hover { background: rgba(255,255,255,0.1); color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><i class="fa-solid fa-flask-vial"></i> 10 Maçlık Canlı Karşılaştırma Vitrini</h1>
      <p>Aşağıdaki maçların <strong>"BPA Viewer"</strong> butonuna tıklayarak bizim ayrıştırdığımız 9 pazar/H2H/Sakatlık görünümünü açabilir, <strong>"Forebet"</strong> butonuna tıklayarak orijinal sayfayla yan yana karşılaştırabilirsiniz.</p>
    </div>

    <div class="grid">
      ${items.map(item => `
        <div class="card">
          <div class="league-badge">
            ${item.hero?.leagueFlag ? `<img src="${item.hero.leagueFlag}" class="league-flag" alt="flag">` : ''}
            <span>${item.hero?.league || 'Lig'}</span>
            ${item.hero?.leagueShort ? `<span style="color: var(--accent-cyan); margin-left: auto;">${item.hero.leagueShort}</span>` : ''}
          </div>

          <div class="teams-row">
            <div class="team">
              ${item.hero?.homeLogo ? `<img src="${item.hero.homeLogo}" class="team-logo" alt="">` : ''}
              <span>${item.hero?.homeTeam || 'Ev'}</span>
            </div>
            <div class="vs">VS</div>
            <div class="team" style="flex-direction: row-reverse;">
              ${item.hero?.awayLogo ? `<img src="${item.hero.awayLogo}" class="team-logo" alt="">` : ''}
              <span>${item.hero?.awayTeam || 'Dep'}</span>
            </div>
          </div>

          <div class="markets-preview">
            <div class="market-row">
              <span style="color: var(--text-muted);">1X2 Tahmin:</span>
              <span class="market-val">${item.markets?.['1X2']?.pick || '-'} (Oran: ${item.markets?.['1X2']?.odd || '-'})</span>
            </div>
            <div class="market-row">
              <span style="color: var(--text-muted);">Skor Tahmini:</span>
              <span class="market-val" style="color: var(--accent-cyan);">${item.markets?.['1X2']?.correctScore || '-'}</span>
            </div>
            <div class="market-row">
              <span style="color: var(--text-muted);">Alt/Üst (2.5):</span>
              <span class="market-val">${item.markets?.['UnderOver']?.pick || '-'} (Oran: ${item.markets?.['UnderOver']?.odd || '-'})</span>
            </div>
            <div class="market-row">
              <span style="color: var(--text-muted);">Karşılıklı Gol:</span>
              <span class="market-val">${item.markets?.['BTTS']?.pick || '-'}</span>
            </div>
          </div>

          <div class="btn-row">
            <a href="${item.viewerUrl}" target="_blank" class="btn btn-viewer">
              <i class="fa-solid fa-eye"></i> BPA Viewer
            </a>
            <a href="${item.forebetUrl}" target="_blank" class="btn btn-forebet">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Forebet
            </a>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

  const previewPath = path.join(outDir, 'karsilastirma.html');
  fs.writeFileSync(previewPath, html, 'utf8');
  console.log(`\n=============================================================`);
  console.log(`✅ KARŞILAŞTIRMA SAYFASI OLUŞTURULDU:`);
  console.log(`🌐 Dosya Yolu: ${previewPath}`);
  console.log(`=============================================================\n`);
}

main().catch(console.error);
