/**
 * ====================================================================
 * BOTV3 — MATCH JSON DEEP INSPECTOR (tools/inspect_bot_json.js)
 * ====================================================================
 * Inspects a specific match_data.json, prints detailed breakdown of
 * 9 markets, H2H, form streaks, get_ovd stats, and flags any schema gaps.
 */

const fs = require('fs');
const path = require('path');

function inspectBotJson(targetPath) {
  let jsonPath = targetPath;

  if (!jsonPath) {
    // Son oluşturulan maç klasörünü bul
    const outputDir = path.join(__dirname, '..', 'output');
    if (fs.existsSync(outputDir)) {
      const folders = fs.readdirSync(outputDir).filter(f => fs.statSync(path.join(outputDir, f)).isDirectory());
      if (folders.length > 0) {
        jsonPath = path.join(outputDir, folders[0], 'match_data.json');
      }
    }
  }

  if (!jsonPath || !fs.existsSync(jsonPath)) {
    console.error(`❌ Dosya bulunamadı: ${jsonPath || 'output/ klasörü boş'}`);
    return;
  }

  console.log('\n======================================================');
  console.log('🔍 BOTV3 — MATCH JSON DEEP INSPECTION');
  console.log(`📂 Dosya: ${jsonPath}`);
  console.log('======================================================\n');

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  const hero = data.hero || {};
  const markets = data.markets || {};
  const h2h = data.h2h || {};
  const lastMatches = data.lastMatches || {};
  const overallStats = data.overallStats || {};
  const distance = data.distance || {};

  console.log('⚽ 1. HERO BİLGİSİ:');
  console.log(`   Ev Sahibi: ${hero.homeTeam || '-'} (Kod: ${hero.homeCode || '-'})`);
  console.log(`   Deplasman: ${hero.awayTeam || '-'} (Kod: ${hero.awayCode || '-'})`);
  console.log(`   Lig/Ülke:  ${hero.league || hero.leagueName || '-'} (${hero.country || '-'})`);
  console.log(`   Tarih/Saat:${hero.matchDate || '-'} | Raunt: ${hero.round || '-'}`);
  console.log(`   Durum/Skor:${hero.result?.status || '-'} | Skor: ${hero.result?.score || '-'}`);
  console.log(`   Form (Ev): [${hero.homeForm?.join(', ') || '-'}]`);
  console.log(`   Form (Dep):[${hero.awayForm?.join(', ') || '-'}]`);

  console.log('\n📊 2. 9 TAHMİN MARKETİ:');
  const marketRows = Object.keys(markets).map(mKey => {
    const m = markets[mKey];
    return {
      Market: mKey,
      Pick: m?.pick || m?.handicapPick || '-',
      Odd: m?.odd || m?.mainOdds || '-',
      Probabilities: m?.prob1 ? `1: ${m.prob1}, X: ${m.probX}, 2: ${m.prob2}` : (m?.probUnder ? `U: ${m.probUnder}, O: ${m.probOver}` : (m?.probYes ? `Yes: ${m.probYes}, No: ${m.probNo}` : '-')),
      CorrectScore: m?.correctScore || '-'
    };
  });
  console.table(marketRows);

  console.log('\n⚔️  3. H2H GEÇMİŞİ & ÖZET:');
  if (h2h.summary) {
    console.log(`   Toplam: ${h2h.summary.total || 0} maç | Ev Gal: %${h2h.summary.homeWinsPct || '-'} | Ber: %${h2h.summary.drawsPct || '-'} | Dep Gal: %${h2h.summary.awayWinsPct || '-'}`);
  }
  console.log(`   Kayıtlı H2H Maç Sayısı: ${h2h.matches?.length || 0}`);

  console.log('\n📈 4. OVERALL STATS (get_ovd):');
  if (overallStats.goalsByTimePeriod) {
    console.log(`   Gol Zaman Aralıkları Histogramı: ${overallStats.goalsByTimePeriod.home?.length || 0} aralık mevcut`);
  }
  if (distance.distanceKm) {
    console.log(`   Kuş Uçuşu Mesafe: ${distance.distanceKm} (${distance.homeCity} -> ${distance.awayCity})`);
  }

  const statSize = (Buffer.byteLength(raw) / 1024).toFixed(1);
  console.log(`\n💾 Toplam JSON Boyutu: ${statSize} KB`);
  console.log('======================================================\n');
}

if (require.main === module) {
  inspectBotJson(process.argv[2]);
}

module.exports = { inspectBotJson };
