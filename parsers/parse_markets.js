/**
 * ====================================================================
 * PARSER: STEP 2 - PREDICTION MARKETS (EXACT & DYNAMIC FOR ANY MATCH)
 * ====================================================================
 */

async function parseMarkets(page) {
  return await page.evaluate(() => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    const markets = {};

    // Determine match final and half-time scores for automatic win/loss validation if FT
    const heroScoreEl = document.getElementById('evhdbte') || document.querySelector('.lscrsp') || document.querySelector('.match_res');
    const heroScoreText = clean(heroScoreEl?.innerText);
    let matchFtHome = null;
    let matchFtAway = null;
    if (heroScoreText && heroScoreText.includes('-')) {
      const parts = heroScoreText.split('-').map(p => parseInt(clean(p), 10));
      if (!isNaN(parts[0]) && !isNaN(parts[1])) {
        matchFtHome = parts[0];
        matchFtAway = parts[1];
      }
    }

    // Helper to evaluate win/loss status from DOM classes or score calculation
    const evaluateStatus = (predWrap, pick, marketType) => {
      // 1. Direct prediction container class check
      if (predWrap) {
        if (predWrap.classList.contains('predict_y')) return 'win';
        if (predWrap.classList.contains('predict_no')) return 'loss';
      }

      // 2. Calculation fallback if match is completed (FT)
      const ftH = matchFtHome;
      const ftA = matchFtAway;

      if (ftH !== null && ftA !== null) {
        if (marketType === '1X2') {
          const actualResult = ftH > ftA ? '1' : (ftH < ftA ? '2' : 'X');
          if (pick === actualResult) return 'win';
          if (pick === '1' || pick === 'X' || pick === '2') return 'loss';
        } else if (marketType === 'UnderOver') {
          const totalGoals = ftH + ftA;
          const isUnder = totalGoals < 2.5;
          const pickLower = (pick || '').toLowerCase();
          if (pickLower.includes('under') || pickLower === 'alt') {
            return isUnder ? 'win' : 'loss';
          }
          if (pickLower.includes('over') || pickLower === 'üst') {
            return !isUnder ? 'win' : 'loss';
          }
        } else if (marketType === 'BTTS') {
          const bothScored = ftH > 0 && ftA > 0;
          const pickLower = (pick || '').toLowerCase();
          if (pickLower.includes('yes') || pickLower.includes('evet')) {
            return bothScored ? 'win' : 'loss';
          }
          if (pickLower.includes('no') || pickLower.includes('hayır')) {
            return !bothScored ? 'win' : 'loss';
          }
        } else if (marketType === 'Double') {
          const actualResult = ftH > ftA ? '1' : (ftH < ftA ? '2' : 'X');
          if (pick.includes(actualResult)) return 'win';
          return 'loss';
        }
      }

      return 'pending';
    };

    // Helper to extract fields from any market schema table row
    const parseRow = (tableId, marketType) => {
      const el = document.getElementById(tableId);
      if (!el) return null;

      const row = el.querySelector('.rcnt') || el;
      const probSpans = row.querySelectorAll('.fprc span');
      const pickEl = row.querySelector('.forepr span, .forepr');
      const pickText = clean(pickEl?.innerText);

      // Select exact tabonly correct score first to avoid mobile duplication
      const csEl = row.querySelector('.ex_sc.tabonly') || row.querySelector('.ex_sc');
      const avgEl = row.querySelector('.avg_sc.tabonly') || row.querySelector('.avg_sc');
      
      // Main Odds
      const oddsEl = row.querySelector('.bigOnly.prmod .lscrsp, .prmod .lscrsp, .prmod > span, .prmod');
      let odds = '-';
      if (oddsEl) {
        const clone = oddsEl.cloneNode(true);
        const haodd = clone.querySelector('.haodd');
        if (haodd) haodd.remove();
        const textVal = clean(clone.innerText).split(/\s+/)[0];
        if (textVal && textVal !== '-') odds = textVal;
      }

      // Extended Odds from .haodd
      const haoddEl = row.querySelector('.haodd');
      const haoddSpans = haoddEl ? Array.from(haoddEl.querySelectorAll('span')).map(s => clean(s.innerText)).filter(Boolean) : [];
      const haoddNumbers = haoddSpans.filter(s => /^\d+(\.\d+)?$/.test(s));

      // Live Cost / Live Avg
      const liveEl = row.querySelector('.la_prmod .lscrsp, .la_prmod > span, .la_prmod');
      let liveCost = '-';
      if (liveEl) {
        const clone = liveEl.cloneNode(true);
        const haodd = clone.querySelector('.haodd');
        if (haodd) haodd.remove();
        const textVal = clean(clone.innerText).split(/\s+/)[0];
        if (textVal && textVal !== '-') liveCost = textVal;
      }

      const ftScoreEl = row.querySelector('.lscr_td .l_scr');
      const htScoreEl = row.querySelector('.lscr_td .ht_scr');
      const ftScoreVal = clean(ftScoreEl?.innerText);
      const htScoreVal = clean(htScoreEl?.innerText);

      const predWrap = row.querySelector('.predict_y, .predict_no, .predict, .predict_e');
      const status = evaluateStatus(predWrap, pickText, marketType);

      return {
        exists: true,
        probs: Array.from(probSpans).map(s => clean(s.innerText)).filter(Boolean),
        pick: pickText,
        status: status,
        correctScore: clean(csEl?.innerText),
        avgGoals: clean(avgEl?.innerText),
        odds: odds,
        haoddNumbers,
        liveCost: liveCost,
        ftScore: ftScoreVal,
        htScore: htScoreVal
      };
    };

    // 1. 1X2
    const d1x2 = parseRow('m1x2_table', '1X2');
    let ext1x2 = null;
    if (d1x2?.haoddNumbers && d1x2.haoddNumbers.length >= 3) {
      ext1x2 = {
        "1": d1x2.haoddNumbers[0],
        "X": d1x2.haoddNumbers[1],
        "2": d1x2.haoddNumbers[2]
      };
    }

    markets['1X2'] = {
      prob1: (d1x2?.probs[0] || '0').replace('%', '') + '%',
      probX: (d1x2?.probs[1] || '0').replace('%', '') + '%',
      prob2: (d1x2?.probs[2] || '0').replace('%', '') + '%',
      pick: d1x2?.pick || '-',
      status: d1x2?.status || 'pending',
      correctScore: d1x2?.correctScore || '-',
      avgGoals: d1x2?.avgGoals || '-',
      mainOdds: d1x2?.odds || '-',
      extendedOdds: ext1x2,
      liveCost: d1x2?.liveCost || '-'
    };

    // 2. Under / Over 2.5
    const dUo = parseRow('uo_table', 'UnderOver');
    let extUo = null;
    if (dUo?.haoddNumbers && dUo.haoddNumbers.length >= 2) {
      extUo = {
        "under": dUo.haoddNumbers[0],
        "over": dUo.haoddNumbers[1]
      };
    }

    markets['UnderOver'] = {
      probUnder: (dUo?.probs[0] || '0').replace('%', '') + '%',
      probOver: (dUo?.probs[1] || '0').replace('%', '') + '%',
      pick: dUo?.pick || 'Under',
      status: dUo?.status || 'pending',
      correctScore: dUo?.correctScore || '-',
      avgGoals: dUo?.avgGoals || '-',
      mainOdds: dUo?.odds || '-',
      extendedOdds: extUo,
      liveCost: dUo?.liveCost || '-'
    };

    // 3. Half Time (HT)
    const dHt = parseRow('ht_table', 'HT');
    let extHt = null;
    if (dHt?.haoddNumbers && dHt.haoddNumbers.length >= 3) {
      extHt = {
        "1": dHt.haoddNumbers[0],
        "X": dHt.haoddNumbers[1],
        "2": dHt.haoddNumbers[2]
      };
    }

    markets['HT'] = {
      prob1: (dHt?.probs[0] || '0').replace('%', '') + '%',
      probX: (dHt?.probs[1] || '0').replace('%', '') + '%',
      prob2: (dHt?.probs[2] || '0').replace('%', '') + '%',
      pick: dHt?.pick || '-',
      status: dHt?.status || 'pending',
      htScore: dHt?.htScore ? dHt.htScore.replace(/[()]/g, '') : '-',
      avgGoals: dHt?.avgGoals || '-',
      mainOdds: dHt?.odds || '-',
      extendedOdds: extHt,
      liveCost: dHt?.liveCost || '-'
    };

    // 4. HT / FT
    const dHtft = parseRow('htft_table', 'HT_FT');
    const htftEl = document.getElementById('htft_table');
    let htftProb = '-';
    let htPick = '-';
    let htStatus = 'pending';
    let ftPick = '-';
    let ftStatus = 'pending';

    if (htftEl) {
      const row = htftEl.querySelector('.rcnt') || htftEl;
      const fprcSpan = row.querySelector('.fprc span.fpr, .fprc span');
      if (fprcSpan) {
        const rawProb = clean(fprcSpan.innerText).replace('%', '');
        if (rawProb) htftProb = rawProb + '%';
      }
      
      const htPredEl = row.querySelector('.prht');
      if (htPredEl) {
        const s = htPredEl.querySelector('.forepr span, .forepr');
        htPick = clean(s?.innerText) || '-';
        htStatus = htPredEl.classList.contains('predict_y') ? 'win' : (htPredEl.classList.contains('predict_no') ? 'loss' : 'pending');
      }

      const allPreds = Array.from(row.querySelectorAll('.predict_y, .predict_no, .predict_e, .predict'));
      const ftPredEl = allPreds.find(p => !p.classList.contains('prht') && !p.closest('.hdrtb'));
      if (ftPredEl) {
        const s = ftPredEl.querySelector('.forepr span, .forepr');
        ftPick = clean(s?.innerText) || '-';
        ftStatus = ftPredEl.classList.contains('predict_y') ? 'win' : (ftPredEl.classList.contains('predict_no') ? 'loss' : 'pending');
      }
    }

    markets['HT_FT'] = {
      prob11: htftProb !== '-' ? htftProb : ((dHtft?.probs[0] || '0').replace('%', '') + '%'),
      pick: htPick && ftPick && htPick !== '-' && ftPick !== '-' ? `${htPick} / ${ftPick}` : (dHtft?.pick || '-'),
      htPick: htPick,
      htStatus: htStatus,
      ftPick: ftPick,
      ftStatus: ftStatus,
      correctScore: dHtft?.correctScore || '-',
      mainOdds: dHtft?.odds || '-',
      extendedOdds: dHtft?.haoddNumbers?.length ? { oddsList: dHtft.haoddNumbers } : null,
      liveCost: dHtft?.liveCost || '-'
    };

    // 5. Both Teams to Score (BTTS)
    const dBtts = parseRow('bts_table', 'BTTS');
    const btsEl = document.getElementById('bts_table');
    let btsProb = '-';
    if (btsEl) {
      const row = btsEl.querySelector('.rcnt') || btsEl;
      const btsFprcSpan = row.querySelector('.fprc span.fpr, .fprc span');
      if (btsFprcSpan) {
        const rawProb = clean(btsFprcSpan.innerText).replace('%', '');
        if (rawProb) btsProb = rawProb + '%';
      }
    }

    let extBtts = null;
    if (dBtts?.haoddNumbers && dBtts.haoddNumbers.length >= 2) {
      extBtts = {
        "yes": dBtts.haoddNumbers[0],
        "no": dBtts.haoddNumbers[1]
      };
    }

    markets['BTTS'] = {
      probYes: btsProb !== '-' ? btsProb : ((dBtts?.probs[0] || '0').replace('%', '') + '%'),
      probNo: ((100 - parseInt(btsProb !== '-' ? btsProb : (dBtts?.probs[0] || '0'), 10)) || 0) + '%',
      pick: dBtts?.pick || 'Yes',
      status: dBtts?.status || 'pending',
      correctScore: dBtts?.correctScore || '-',
      avgGoals: dBtts?.avgGoals || '-',
      mainOdds: dBtts?.odds || '-',
      extendedOdds: extBtts,
      liveCost: dBtts?.liveCost || '-'
    };

    // 6. Double Chance
    const dDbc = parseRow('dbc_table', 'Double');
    const dbcEl = document.getElementById('dbc_table');
    let dbcProb = '-';
    if (dbcEl) {
      const row = dbcEl.querySelector('.rcnt') || dbcEl;
      const dbcFprcSpan = row.querySelector('.fprc span.fpr, .fprc span');
      if (dbcFprcSpan) {
        const rawProb = clean(dbcFprcSpan.innerText).replace('%', '');
        if (rawProb) dbcProb = rawProb + '%';
      }
    }
    markets['Double'] = {
      prob: dbcProb !== '-' ? dbcProb : ((dDbc?.probs[0] || '0').replace('%', '') + '%'),
      pick: dDbc?.pick || '-',
      status: dDbc?.status || 'pending',
      correctScore: dDbc?.correctScore || '-',
      avgGoals: dDbc?.avgGoals || '-',
      mainOdds: dDbc?.odds || '-',
      liveCost: dDbc?.liveCost || '-'
    };

    // 7. Asian Handicap
    const dAh = parseRow('ah_table', 'Handicap');
    if (dAh && dAh.pick && dAh.pick !== '-') {
      markets['Handicap'] = {
        prob1: (dAh?.probs[0] ? dAh.probs[0].replace('%', '') : '0') + '%',
        pick: dAh?.pick || '-',
        status: dAh?.status || 'pending',
        correctScore: dAh?.correctScore || '-',
        avgGoals: dAh?.avgGoals || '-',
        mainOdds: dAh?.odds || '-',
        extendedOdds: dAh?.haoddNumbers?.length ? { oddsList: dAh.haoddNumbers } : null,
        liveCost: dAh?.liveCost || '-'
      };
    }

    // 8. Dynamic Scorers
    const gscrEl = document.getElementById('gscr_table');
    const scorersList = [];
    if (gscrEl) {
      const probItems = Array.from(gscrEl.querySelectorAll('.fprc .playerPred')).map(e => clean(e.innerText)).filter(Boolean);
      const nameItems = Array.from(gscrEl.querySelectorAll('.predict_e .playerPred, .frpr .playerPred')).map(e => clean(e.innerText)).filter(Boolean);
      const oddItems = Array.from(gscrEl.querySelectorAll('.bigOnly.prmod .lscrsp, .prmod span')).map(e => clean(e.innerText)).filter(Boolean);

      const count = Math.max(probItems.length, nameItems.length);
      for (let i = 0; i < count; i++) {
        if (nameItems[i]) {
          scorersList.push({
            player: nameItems[i],
            team: '',
            prob: (probItems[i] ? probItems[i].replace('%', '') : '') + '%',
            odds: oddItems[i] || '-'
          });
        }
      }
    }

    if (scorersList.length > 0) {
      const dGscr = parseRow('gscr_table', 'Scorers');
      markets['Scorers'] = {
        hasScorers: true,
        predictedScorers: scorersList,
        correctScore: dGscr?.correctScore || '-',
        avgGoals: dGscr?.avgGoals || '-',
        mainOdds: scorersList[0]?.odds || dGscr?.odds || '-',
        liveCost: dGscr?.liveCost || '-'
      };
    }

    // 9. Corners
    const dCor = parseRow('corner_table', 'Corners');
    if (dCor && dCor.pick && dCor.pick !== '-') {
      markets['Corners'] = {
        probUnder: (dCor?.probs[0] || '0').replace('%', '') + '%',
        probOver: (dCor?.probs[1] || '0').replace('%', '') + '%',
        pick: dCor?.pick || 'Under',
        status: dCor?.status || 'pending',
        correctScore: dCor?.correctScore || '-',
        avgGoals: dCor?.avgGoals || '-',
        ftResult: dCor?.ftScore || '-',
        mainOdds: dCor?.odds || '-',
        liveCost: dCor?.liveCost || '-'
      };
    }

    // 10. Cards
    const dCard = parseRow('card_table', 'Cards');
    if (dCard && dCard.pick && dCard.pick !== '-') {
      markets['Cards'] = {
        probUnder: (dCard?.probs[0] || '0').replace('%', '') + '%',
        probOver: (dCard?.probs[1] || '0').replace('%', '') + '%',
        pick: dCard?.pick || 'Under',
        status: dCard?.status || 'pending',
        correctScore: dCard?.correctScore || '-',
        avgGoals: dCard?.avgGoals || '-',
        ftResult: dCard?.ftScore || '-',
        mainOdds: dCard?.odds || '-',
        liveCost: dCard?.liveCost || '-'
      };
    }

    return markets;
  });
}

module.exports = { parseMarkets };
