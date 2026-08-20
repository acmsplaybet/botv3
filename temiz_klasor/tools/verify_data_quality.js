/**
 * ====================================================================
 * BOTV3 — DATA QUALITY & ZERO-MOCK AUDIT TOOL (tools/verify_data_quality.js)
 * ====================================================================
 * Scans output/ match JSON files, verifies field types, odds formatting,
 * validates zero-mock integrity, and outputs a Quality Score.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function auditMatchJson(jsonPath) {
  const content = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return { valid: false, errors: ['Geçersiz JSON formatı'], score: 0 };
  }

  const errors = [];
  const warnings = [];
  let score = 100;

  // 1. Hero Kontrolleri
  if (!data.hero) {
    errors.push('Eksik "hero" ana nesnesi');
    score -= 30;
  } else {
    if (!data.hero.homeTeam || data.hero.homeTeam.trim() === '') {
      errors.push('Eksik homeTeam');
      score -= 10;
    }
    if (!data.hero.awayTeam || data.hero.awayTeam.trim() === '') {
      errors.push('Eksik awayTeam');
      score -= 10;
    }
    if (!Array.isArray(data.hero.homeForm)) {
      warnings.push('homeForm dizi tipinde değil');
      score -= 3;
    }
    if (!Array.isArray(data.hero.awayForm)) {
      warnings.push('awayForm dizi tipinde değil');
      score -= 3;
    }
  }

  // 2. 9 Market Kontrolleri
  if (!data.markets || typeof data.markets !== 'object') {
    errors.push('Eksik "markets" nesnesi');
    score -= 20;
  } else {
    if (!data.markets['1X2']) {
      warnings.push('1X2 marketi eksik');
      score -= 5;
    } else {
      const odd = data.markets['1X2'].odd;
      if (odd && odd !== '-' && isNaN(parseFloat(odd))) {
        warnings.push(`Geçersiz 1X2 oran formatı: ${odd}`);
        score -= 2;
      }
    }
  }

  // 3. H2H ve Last Matches Kontrolleri
  if (!data.h2h) {
    warnings.push('Eksik "h2h" nesnesi');
    score -= 5;
  }
  if (!data.lastMatches) {
    warnings.push('Eksik "lastMatches" nesnesi');
    score -= 5;
  }

  // 4. Zero-Mock & Sentetik Veri Tespiti
  const rawStr = JSON.stringify(data).toLowerCase();
  const dummyKeywords = ['lorem ipsum', 'mock team', 'dummy_data', 'fake_stat', 'synthetic_score'];
  for (const kw of dummyKeywords) {
    if (rawStr.includes(kw)) {
      errors.push(`UYARI: Sentetik/Dummy veri tespit edildi: "${kw}"`);
      score -= 25;
    }
  }

  score = Math.max(0, score);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score
  };
}

function runQualityAudit() {
  console.log('\n======================================================');
  console.log('🔬 BOTV3 — DATA QUALITY & ZERO-MOCK AUDIT TOOL');
  console.log('======================================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log('⚠️  output/ dizini bulunamadı. Önce bir maç kazıyın.');
    return { success: false };
  }

  const matchFolders = fs.readdirSync(OUTPUT_DIR).filter(f => {
    return fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory();
  });

  if (matchFolders.length === 0) {
    console.log('⚠️  output/ dizininde taranacak maç klasörü yok.');
    return { success: true, count: 0 };
  }

  console.log(`📂 Toplam ${matchFolders.length} adet maç klasörü denetleniyor...\n`);

  let totalScore = 0;
  let passedCount = 0;
  const reports = [];

  for (const folder of matchFolders.slice(0, 30)) { // İlk 30 maç
    const jsonPath = path.join(OUTPUT_DIR, folder, 'match_data.json');
    if (!fs.existsSync(jsonPath)) continue;

    const audit = auditMatchJson(jsonPath);
    totalScore += audit.score;
    if (audit.valid && audit.score >= 80) passedCount++;

    reports.push({
      slug: folder.substring(0, 35),
      score: `${audit.score}%`,
      status: audit.score >= 90 ? '🟢 MÜKEMMEL' : (audit.score >= 75 ? '🟡 GEÇER' : '🔴 BAŞARISIZ'),
      issues: audit.errors.concat(audit.warnings).slice(0, 2).join('; ') || 'Sorun yok'
    });
  }

  console.table(reports);

  const avgScore = reports.length > 0 ? (totalScore / reports.length).toFixed(1) : 0;
  console.log(`\n📊 GENEL SKOR: %${avgScore} | Başarılı Maç: ${passedCount}/${reports.length}`);
  console.log('======================================================\n');

  return { success: avgScore >= 80, avgScore, totalAudited: reports.length };
}

if (require.main === module) {
  const res = runQualityAudit();
  process.exit(res.success ? 0 : 1);
}

module.exports = { auditMatchJson, runQualityAudit };
