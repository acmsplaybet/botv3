/**
 * ====================================================================
 * PARSER: STEP 2 - PREDICTION MARKETS (EXACT & DYNAMIC FOR ANY MATCH)
 * ====================================================================
 */

async function parseMarkets(page) {
  return await page.evaluate(() => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    const getStatusFromEl = (el) => {
      if (!el) return 'pending';
      if (el.classList.contains('predict_y') || el.closest('.predict_y') || el.querySelector('.predict_y') || el.classList.contains('exact_yes') || el.closest('.exact_yes')) {
        return 'win';
      }
      if (el.classList.contains('predict_no') || el.closest('.predict_no') || el.querySelector('.predict_no')) {
        return 'loss';
      }
      return 'pending';
    };

    const markets = {};

    // Helper to extract fields from any market schema table row
    const parseRow = (tableId) => {
      const el = document.getElementById(tableId);
      if (!el) return null;

      const row = el.querySelector('.rcnt') || el;
      const probSpans = row.querySelectorAll('.fprc span');
      const pickEl = row.querySelector('.forepr span, .forepr');
      const predWrap = row.querySelector('.predict_y, .predict_no, .predict_e, .predict');
      const status = getStatusFromEl(predWrap || pickEl);
      
      // Select exact tabonly correct score first to avoid mobile duplication
      const csEl = row.querySelector('.ex_sc.tabonly') || row.querySelector('.ex_sc');
      const avgEl = row.querySelector('.avg_sc.tabonly') || row.querySelector('.avg_sc');
      
      // Main Odds: Extract strictly the single main odds value from .lscrsp, ignoring .haodd dropdown
      const oddsEl = row.querySelector('.bigOnly.prmod .lscrsp, .prmod .lscrsp, .prmod > span, .prmod');
      let odds = '-';
      if (oddsEl) {
        const clone = oddsEl.cloneNode(true);
        const haodd = clone.querySelector('.haodd');
        if (haodd) haodd.remove();
        const textVal = clean(clone.innerText).split(/\s+/)[0];
        if (textVal && textVal !== '-') odds = textVal;
      }

      // Live Cost / Live Avg: Extract from .la_prmod
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

      return {
        exists: true,
        probs: Array.from(probSpans).map(s => clean(s.innerText)).filter(Boolean),
        pick: clean(pickEl?.innerText),
        status: status,
        correctScore: clean(csEl?.innerText),
        avgGoals: clean(avgEl?.innerText),
        odds: odds,
        liveCost: liveCost,
        ftScore: clean(ftScoreEl?.innerText),
        htScore: clean(htScoreEl?.innerText)
      };
    };

    // 1. 1X2
    const d1x2 = parseRow('m1x2_table');
    markets['1X2'] = {
      prob1: (d1x2?.probs[0] || '0').replace('%', '') + '%',
      probX: (d1x2?.probs[1] || '0').replace('%', '') + '%',
      prob2: (d1x2?.probs[2] || '0').replace('%', '') + '%',
      pick: d1x2?.pick || '-',
      status: d1x2?.status || 'pending',
      correctScore: d1x2?.correctScore || '-',
      avgGoals: d1x2?.avgGoals || '-',
      mainOdds: d1x2?.odds || '-',
      liveCost: d1x2?.liveCost || '-'
    };

    // 2. Under / Over 2.5
    const dUo = parseRow('uo_table');
    markets['UnderOver'] = {
      probUnder: (dUo?.probs[0] || '0').replace('%', '') + '%',
      probOver: (dUo?.probs[1] || '0').replace('%', '') + '%',
      pick: dUo?.pick || 'Over',
      status: dUo?.status || 'pending',
      correctScore: dUo?.correctScore || '-',
      avgGoals: dUo?.avgGoals || '-',
      mainOdds: dUo?.odds || '-',
      liveCost: dUo?.liveCost || '-'
    };

    // 3. Half Time (HT)
    const dHt = parseRow('ht_table');
    markets['HT'] = {
      prob1: (dHt?.probs[0] || '0').replace('%', '') + '%',
      probX: (dHt?.probs[1] || '0').replace('%', '') + '%',
      prob2: (dHt?.probs[2] || '0').replace('%', '') + '%',
      pick: dHt?.pick || '-',
      status: dHt?.status || 'pending',
      htScore: dHt?.htScore ? dHt.htScore.replace(/[()]/g, '') : '-',
      avgGoals: dHt?.avgGoals || '-',
      mainOdds: dHt?.odds || '-',
      liveCost: dHt?.liveCost || '-'
    };

    // 4. HT / FT (Two-half prediction e.g. "X / X", "1 / 1" with separate win/loss statuses)
    const dHtft = parseRow('htft_table');
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
        htStatus = getStatusFromEl(htPredEl);
      }

      const allPreds = Array.from(row.querySelectorAll('.predict_y, .predict_no, .predict_e, .predict'));
      const ftPredEl = allPreds.find(p => !p.classList.contains('prht') && !p.closest('.hdrtb'));
      if (ftPredEl) {
        const s = ftPredEl.querySelector('.forepr span, .forepr');
        ftPick = clean(s?.innerText) || '-';
        ftStatus = getStatusFromEl(ftPredEl);
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
      liveCost: dHtft?.liveCost || '-'
    };

    // 5. BTTS (Both Teams to Score)
    const dBts = parseRow('bts_table');
    if (dBts && dBts.pick && dBts.pick !== '-') {
      markets['BTTS'] = {
        probNo: (dBts?.probs[0] || '0').replace('%', '') + '%',
        probYes: (dBts?.probs[1] || '0').replace('%', '') + '%',
        pick: dBts?.pick || '-',
        status: dBts?.status || 'pending',
        correctScore: dBts?.correctScore || '-',
        avgGoals: dBts?.avgGoals || '-',
        mainOdds: dBts?.odds || '-',
        liveCost: dBts?.liveCost || '-'
      };
    }

    // 6. Double Chance (dbc_table) - ONLY if Forebet actually has Double Chance tab/market for this match
    const hasDoubleTab = Array.from(document.querySelectorAll('a, span, button, div')).some(el => {
      const t = (el.innerText || '').trim().toLowerCase();
      return (t === 'double' || t === 'double chance') && (
        el.getAttribute('onclick')?.includes('dbc') ||
        el.getAttribute('onclick')?.includes('schema') ||
        el.classList.contains('schema_tab') ||
        el.classList.contains('sch_btn') ||
        el.closest('.schema_menu, .tabs, .prnav') !== null
      );
    });

    const dDbc = parseRow('dbc_table');
    if (hasDoubleTab && dDbc && dDbc.pick && dDbc.pick !== '-') {
      const dbcEl = document.getElementById('dbc_table');
      let dbcProb = '-';
      if (dbcEl) {
        const fprcSpan = dbcEl.querySelector('.fprc span.fpr, .fprc span');
        if (fprcSpan) {
          const rawProb = clean(fprcSpan.innerText).replace('%', '');
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
    }

    // 7. Asian Handicap
    const dAh = parseRow('ah_table');
    if (dAh && dAh.pick && dAh.pick !== '-') {
      markets['Handicap'] = {
        prob1: (dAh?.probs[0] ? dAh.probs[0].replace('%', '') : '0') + '%',
        pick: dAh?.pick || '-',
        status: dAh?.status || 'pending',
        correctScore: dAh?.correctScore || '-',
        avgGoals: dAh?.avgGoals || '-',
        mainOdds: dAh?.odds || '-',
        liveCost: dAh?.liveCost || '-'
      };
    }

    // 8. Dynamic Scorers (Only if present with players on page)
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
      const dGscr = parseRow('gscr_table');
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
    const dCor = parseRow('corner_table');
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
    const dCard = parseRow('card_table');
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


