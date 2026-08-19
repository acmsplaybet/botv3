/**
 * Forebet Tahmin Doğruluk Analizi - v2 (doğru field names)
 */
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');
const matchFolders = fs.readdirSync(outputDir).filter(f => {
  const p = path.join(outputDir, f);
  return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'match_data.json'));
});

const stats = {
  total: 0,
  ft: 0, aet: 0, pen: 0, cancl: 0, postp: 0, upcoming: 0,
  onex2: { total: 0, correct: 0 },
  ou: { total: 0, correct: 0 },
  btts: { total: 0, correct: 0 },
  ht: { total: 0, correct: 0 },
  cs: { total: 0, correct: 0 },
  probBands: {},
  oddBands: {},
  leagueStats: {},
  htFtStats: { total: 0, correct: 0 },
  errors: 0
};

function getActual1X2(ftScore) {
  const m = ftScore?.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const h = parseInt(m[1]), a = parseInt(m[2]);
  return h > a ? '1' : h === a ? 'X' : '2';
}

function getGoals(ftScore) {
  const m = ftScore?.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return parseInt(m[1]) + parseInt(m[2]);
}

function getPct(str) {
  return parseFloat(str?.replace('%', '') || 0);
}

for (const folder of matchFolders) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(outputDir, folder, 'match_data.json'), 'utf8'));
    const res = data.hero?.result;
    const markets = data.markets || {};
    const hero = data.hero || {};

    if (!res) continue;
    stats.total++;

    const status = res.status;
    if (['FT','AET','PEN.'].includes(status)) {
      if (status === 'FT') stats.ft++;
      else if (status === 'AET') stats.aet++;
      else stats.pen++;
    } else {
      if (status === 'CANCL.') stats.cancl++;
      else if (status === 'POSTP.') stats.postp++;
      else stats.upcoming++;
      continue;
    }

    const ftScore = res.ftScore;
    const actual1X2 = getActual1X2(ftScore);
    const totalGoals = getGoals(ftScore);
    const league = hero.leagueName || 'Unknown';

    // 1X2
    const m1x2 = markets['1X2'];
    if (m1x2?.pick && actual1X2) {
      const correct = m1x2.status === 'win';
      const prob1 = getPct(m1x2.prob1);
      const probX = getPct(m1x2.probX);
      const prob2 = getPct(m1x2.prob2);
      const maxProb = Math.max(prob1, probX, prob2);
      const odd = parseFloat(m1x2.mainOdds || m1x2.odd || 0);

      stats.onex2.total++;
      if (correct) stats.onex2.correct++;

      // Prob bands (5% aralıklı)
      const pband = maxProb >= 90 ? '90%+' : 
                    maxProb >= 80 ? '80-89%' : 
                    maxProb >= 70 ? '70-79%' : 
                    maxProb >= 60 ? '60-69%' : 
                    maxProb >= 50 ? '50-59%' : '<50%';
      if (!stats.probBands[pband]) stats.probBands[pband] = { t: 0, c: 0 };
      stats.probBands[pband].t++;
      if (correct) stats.probBands[pband].c++;

      // Odds bands
      if (odd > 0) {
        const oband = odd <= 1.20 ? '1.00-1.20' : 
                      odd <= 1.40 ? '1.21-1.40' :
                      odd <= 1.60 ? '1.41-1.60' : 
                      odd <= 2.00 ? '1.61-2.00' : 
                      odd <= 3.00 ? '2.01-3.00' : '3.01+';
        if (!stats.oddBands[oband]) stats.oddBands[oband] = { t: 0, c: 0 };
        stats.oddBands[oband].t++;
        if (correct) stats.oddBands[oband].c++;
      }

      // League stats
      if (!stats.leagueStats[league]) stats.leagueStats[league] = { t: 0, c: 0 };
      stats.leagueStats[league].t++;
      if (correct) stats.leagueStats[league].c++;

      // Correct Score
      stats.cs.total++;
      if (m1x2.correctScore) {
        const predCS = m1x2.correctScore.replace(/\s/g, '');
        const actualCS = ftScore.replace(/\s/g, '');
        if (predCS === actualCS) stats.cs.correct++;
      }
    }

    // O/U 2.5
    const mOU = markets['UnderOver'];
    if (mOU?.pick && totalGoals !== null) {
      stats.ou.total++;
      const predOver = mOU.pick?.toString().toLowerCase().includes('o') || parseInt(mOU.pick) > 2;
      const actualOver = totalGoals > 2;
      if (predOver === actualOver || mOU.status === 'win') stats.ou.correct++;
    }

    // BTTS
    const mBTTS = markets['BTTS'];
    if (mBTTS?.pick) {
      stats.btts.total++;
      if (mBTTS.status === 'win') stats.btts.correct++;
    }

    // HT
    const mHT = markets['HT'];
    if (mHT?.pick) {
      stats.ht.total++;
      if (mHT.status === 'win') stats.ht.correct++;
    }

    // HT/FT
    const mHTFT = markets['HT_FT'];
    if (mHTFT?.pick) {
      stats.htFtStats.total++;
      if (mHTFT.status === 'win') stats.htFtStats.correct++;
    }

  } catch (e) {
    stats.errors++;
  }
}

const pct = (c, t) => t > 0 ? `${((c/t)*100).toFixed(1)}%` : '-';
const roi = (c, t, avgOdd) => t > 0 && avgOdd > 0 ? (((c * avgOdd) / t - 1) * 100).toFixed(1) + '%' : '-';

console.log('\n' + '='.repeat(65));
console.log('📊 FOREBET TAHMİN DOĞRULUK ANALİZİ (Gerçek Veriler)');
console.log('='.repeat(65));

console.log(`\n📁 Toplam Klasör      : ${matchFolders.length}`);
console.log(`✅ Maç Durumu:`);
console.log(`   ⚽ Biten (FT)      : ${stats.ft}`);
console.log(`   ⏱️  Uzatma (AET)    : ${stats.aet}`);
console.log(`   🎯 Penaltı (PEN)   : ${stats.pen}`);
console.log(`   ❌ İptal (CANCL)   : ${stats.cancl}`);
console.log(`   ⏳ Ertelenen       : ${stats.postp}`);
console.log(`   📅 Gelecek         : ${stats.upcoming}`);

console.log('\n' + '-'.repeat(65));
console.log('🎯 MARKET BAŞARI ORANLARI');
console.log('-'.repeat(65));
console.log(`1X2 (Maç Sonucu)      : ${stats.onex2.correct}/${stats.onex2.total} = ${pct(stats.onex2.correct, stats.onex2.total)}`);
console.log(`Alt/Üst 2.5           : ${stats.ou.correct}/${stats.ou.total} = ${pct(stats.ou.correct, stats.ou.total)}`);
console.log(`KG Var/Yok (BTTS)     : ${stats.btts.correct}/${stats.btts.total} = ${pct(stats.btts.correct, stats.btts.total)}`);
console.log(`İlk Yarı (HT)         : ${stats.ht.correct}/${stats.ht.total} = ${pct(stats.ht.correct, stats.ht.total)}`);
console.log(`HT/FT Kombinasyon     : ${stats.htFtStats.correct}/${stats.htFtStats.total} = ${pct(stats.htFtStats.correct, stats.htFtStats.total)}`);
console.log(`Doğru Skor            : ${stats.cs.correct}/${stats.cs.total} = ${pct(stats.cs.correct, stats.cs.total)}`);

console.log('\n' + '-'.repeat(65));
console.log('📊 1X2 OLASlLIK BANDINA GÖRE BAŞARI (Kupon Stratejisi!)');
console.log('-'.repeat(65));
const probOrder = ['90%+', '80-89%', '70-79%', '60-69%', '50-59%', '<50%'];
for (const band of probOrder) {
  const val = stats.probBands[band];
  if (val) {
    const p = ((val.c/val.t)*100);
    const bar = '█'.repeat(Math.round(p/5));
    console.log(`  ${band.padEnd(8)}: ${pct(val.c, val.t).padEnd(7)} ${bar} (${val.c}/${val.t})`);
  }
}

console.log('\n' + '-'.repeat(65));
console.log('💰 ORA BANDINA GÖRE BAŞARI');
console.log('-'.repeat(65));
const oddOrder = ['1.00-1.20','1.21-1.40','1.41-1.60','1.61-2.00','2.01-3.00','3.01+'];
for (const band of oddOrder) {
  const val = stats.oddBands[band];
  if (val) {
    console.log(`  ${band.padEnd(12)}: ${pct(val.c, val.t).padEnd(7)} (${val.c}/${val.t})`);
  }
}

// Top/bottom leagues
const leagueArr = Object.entries(stats.leagueStats)
  .filter(([,v]) => v.t >= 8)
  .map(([l,v]) => ({ l, t: v.t, p: (v.c/v.t*100) }))
  .sort((a,b) => b.p - a.p);

console.log('\n' + '-'.repeat(65));
console.log('🏆 EN BAŞARILI LİGLER (min 8 maç)');
console.log('-'.repeat(65));
leagueArr.slice(0, 12).forEach(l => {
  console.log(`  ${l.p.toFixed(1).padEnd(6)}% (${String(l.t).padEnd(3)} maç) ${l.l}`);
});

console.log('\n🏚️ EN AZ BAŞARILI LİGLER');
[...leagueArr].sort((a,b) => a.p - b.p).slice(0, 8).forEach(l => {
  console.log(`  ${l.p.toFixed(1).padEnd(6)}% (${String(l.t).padEnd(3)} maç) ${l.l}`);
});

if (stats.errors > 0) console.log(`\n⚠️ Hata sayısı: ${stats.errors}`);
console.log('\n' + '='.repeat(65));
