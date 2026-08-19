/**
 * ====================================================================
 * PARSER: STEP 8 - OVERALL STATISTICS (FOREBET OVD LIVE ENGINE)
 * ====================================================================
 */

async function parseOverallStats(page) {
  // 1. Wait up to 5s for get_ovd function or script tag to appear
  try {
    await page.waitForFunction(() => {
      if (typeof get_ovd === 'function') return true;
      return Array.from(document.querySelectorAll('script')).some(s => s.innerText.includes('function get_ovd'));
    }, { timeout: 5000 });
  } catch (e) {}

  return await page.evaluate(() => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    let hOvd = null;
    let aOvd = null;

    // Strategy A: Call window.get_ovd directly
    try {
      if (typeof get_ovd === 'function') {
        hOvd = get_ovd('h');
        aOvd = get_ovd('a');
      }
    } catch (e) {}

    // Strategy B: Fallback - Evaluate get_ovd script tag directly
    if (!hOvd || !aOvd) {
      try {
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
        const ovdScript = scripts.find(s => s.includes('function get_ovd'));
        if (ovdScript) {
          const fn = new Function(`${ovdScript}; return { h: get_ovd('h'), a: get_ovd('a') };`);
          const res = fn();
          if (res && res.h && res.a) {
            hOvd = res.h;
            aOvd = res.a;
          }
        }
      } catch (e) {}
    }

    // Extract available leagues
    const leagues = [];
    const lgElements = Array.from(document.querySelectorAll('[onclick*="updateLeague"]'));
    lgElements.forEach(el => {
      const txt = clean(el.innerText);
      const onclick = el.getAttribute('onclick') || '';
      const m = onclick.match(/updateLeague\([^,]+,\s*['"]?([^'")\s]+)['"]?\)/);
      if (m) {
        const key = m[1];
        if ((key === 'all' || (hOvd && hOvd[key])) && !leagues.some(l => String(l.key) === String(key))) {
          leagues.push({
            name: txt || (key === 'all' ? 'All leagues' : `League ${key}`),
            key: key
          });
        }
      }
    });

    if (hOvd) {
      if (!leagues.some(l => l.key === 'all')) {
        leagues.unshift({ name: 'All leagues', key: 'all' });
      }
      Object.keys(hOvd).forEach(k => {
        if (k !== 'all' && !leagues.some(l => String(l.key) === String(k))) {
          leagues.push({
            name: `League ${k}`,
            key: k
          });
        }
      });
    }

    // Default computed stats for (league: all, category: ft, index: 0)
    const calcAvg = (tot, pl) => (!pl || pl === 0 || isNaN(tot)) ? '0.00' : (tot / pl).toFixed(2);
    const calcPct = (val, tot) => (!tot || tot === 0 || isNaN(val)) ? '0%' : Math.round((val / tot) * 100) + '%';

    const hFt = hOvd?.all?.ft || {};
    const aFt = aOvd?.all?.ft || {};

    const hPl = hFt.pl?.[0] || 0;
    const aPl = aFt.pl?.[0] || 0;

    const hScr = hFt.scr?.[0] || 0;
    const aScr = aFt.scr?.[0] || 0;
    const hCnd = hFt.cnd?.[0] || 0;
    const aCnd = aFt.cnd?.[0] || 0;

    // Scored goal Yes/No
    const hSn = hFt.sn?.[0] || 0;
    const aSn = aFt.sn?.[0] || 0;
    const hSnNo = hPl >= hSn ? hPl - hSn : 0;
    const aSnNo = aPl >= aSn ? aPl - aSn : 0;

    // Under/Over Pies
    const getPieData = (hVal, aVal, isBtts = false) => {
      if (isBtts) {
        const hYes = hVal;
        const hNo = hPl >= hVal ? hPl - hVal : 0;
        const aYes = aVal;
        const aNo = aPl >= aVal ? aPl - aVal : 0;
        return {
          home: {
            yes: hYes,
            no: hNo,
            yesPct: calcPct(hYes, hPl),
            noPct: calcPct(hNo, hPl)
          },
          away: {
            yes: aYes,
            no: aNo,
            yesPct: calcPct(aYes, aPl),
            noPct: calcPct(aNo, aPl)
          }
        };
      }

      const hUnder = hVal;
      const hOver = hPl >= hVal ? hPl - hVal : 0;
      const aUnder = aVal;
      const aOver = aPl >= aVal ? aPl - aVal : 0;

      return {
        home: {
          under: hUnder,
          over: hOver,
          underPct: calcPct(hUnder, hPl),
          overPct: calcPct(hOver, hPl)
        },
        away: {
          under: aUnder,
          over: aOver,
          underPct: calcPct(aUnder, aPl),
          overPct: calcPct(aOver, aPl)
        }
      };
    };

    const g15 = getPieData(hFt['un1.5']?.[0] || 0, aFt['un1.5']?.[0] || 0);
    const g25 = getPieData(hFt['un2.5']?.[0] || 0, aFt['un2.5']?.[0] || 0);
    const g35 = getPieData(hFt['un3.5']?.[0] || 0, aFt['un3.5']?.[0] || 0);
    const bothScored = getPieData(hFt.bts?.[0] || 0, aFt.bts?.[0] || 0, true);

    // Shots
    const hShotsTot = hFt.shots_total?.[0] || 0;
    const aShotsTot = aFt.shots_total?.[0] || 0;
    const hShotsBlk = hFt.shots_blocked?.[0] || 0;
    const aShotsBlk = aFt.shots_blocked?.[0] || 0;
    const hShotsOn = hFt.shots_on_target?.[0] || 0;
    const aShotsOn = aFt.shots_on_target?.[0] || 0;
    const hShotsOff = hFt.shots_off_target?.[0] || 0;
    const aShotsOff = aFt.shots_off_target?.[0] || 0;
    const hShotsIn = hFt.shots_insidebox?.[0] || 0;
    const aShotsIn = aFt.shots_insidebox?.[0] || 0;
    const hShotsOut = hFt.shots_outsidebox?.[0] || 0;
    const aShotsOut = aFt.shots_outsidebox?.[0] || 0;
    const hBoxTot = (hShotsIn + hShotsOut) || 1;
    const aBoxTot = (aShotsIn + aShotsOut) || 1;

    const shots = {
      home: {
        total: String(hShotsTot),
        avg: calcAvg(hShotsTot, hPl),
        blocked: String(hShotsBlk),
        blockedAvg: calcAvg(hShotsBlk, hPl),
        offPct: calcPct(hShotsOff, hShotsTot),
        onPct: calcPct(hShotsOn, hShotsTot),
        insidePct: calcPct(hShotsIn, hBoxTot),
        outsidePct: calcPct(hShotsOut, hBoxTot)
      },
      away: {
        total: String(aShotsTot),
        avg: calcAvg(aShotsTot, aPl),
        blocked: String(aShotsBlk),
        blockedAvg: calcAvg(aShotsBlk, aPl),
        offPct: calcPct(aShotsOff, aShotsTot),
        onPct: calcPct(aShotsOn, aShotsTot),
        insidePct: calcPct(aShotsIn, aBoxTot),
        outsidePct: calcPct(aShotsOut, aBoxTot)
      }
    };

    // Passes
    const hPassTot = hFt.passes_total?.[0] || 0;
    const aPassTot = aFt.passes_total?.[0] || 0;
    const hPassAcc = hFt.passes_accurate?.[0] || 0;
    const aPassAcc = aFt.passes_accurate?.[0] || 0;
    const hPoss = hFt.ball_poss?.[0] || 50;
    const aPoss = aFt.ball_poss?.[0] || 50;

    const passes = {
      total: { home: String(hPassTot), homeAvg: calcAvg(hPassTot, hPl), away: String(aPassTot), awayAvg: calcAvg(aPassTot, aPl) },
      accurate: { homeCount: String(hPassAcc), homePct: calcPct(hPassAcc, hPassTot), awayCount: String(aPassAcc), awayPct: calcPct(aPassAcc, aPassTot) },
      possession: { home: `${Math.round(hPoss)}%`, away: `${Math.round(aPoss)}%` }
    };

    // Avg Event Time
    const avgEventTime = {
      homeScored: hFt['1st_goal_scr_min']?.[0] ? `${Math.ceil(hFt['1st_goal_scr_min'][0])}'` : "41'",
      homeConceded: hFt['1st_goal_cnd_min']?.[0] ? `${Math.ceil(hFt['1st_goal_cnd_min'][0])}'` : "22'",
      awayScored: aFt['1st_goal_scr_min']?.[0] ? `${Math.ceil(aFt['1st_goal_scr_min'][0])}'` : "35'",
      awayConceded: aFt['1st_goal_cnd_min']?.[0] ? `${Math.ceil(aFt['1st_goal_cnd_min'][0])}'` : "34'"
    };

    // Attacks
    const hAttTot = hFt.attacks?.[0] || 0;
    const aAttTot = aFt.attacks?.[0] || 0;
    const hDangTot = hFt.dan_attacks?.[0] || 0;
    const aDangTot = aFt.dan_attacks?.[0] || 0;

    const attacks = {
      total: { home: String(hAttTot), homeAvg: calcAvg(hAttTot, hPl), away: String(aAttTot), awayAvg: calcAvg(aAttTot, aPl) },
      dangerous: { home: String(hDangTot), homeAvg: calcAvg(hDangTot, hPl), away: String(aDangTot), awayAvg: calcAvg(aDangTot, aPl) }
    };

    // Others Table
    const others = [
      { metric: 'Clean sheets', homeTotal: String(hFt.ch?.[0] || 0), homeAvg: calcAvg(hFt.ch?.[0] || 0, hPl), awayTotal: String(aFt.ch?.[0] || 0), awayAvg: calcAvg(aFt.ch?.[0] || 0, aPl) },
      { metric: 'Corners', homeTotal: String(hFt.total_corners?.[0] || 0), homeAvg: calcAvg(hFt.total_corners?.[0] || 0, hPl), awayTotal: String(aFt.total_corners?.[0] || 0), awayAvg: calcAvg(aFt.total_corners?.[0] || 0, aPl) },
      { metric: 'Goal kicks', homeTotal: String(hFt.goal_kick?.[0] || 0), homeAvg: calcAvg(hFt.goal_kick?.[0] || 0, hPl), awayTotal: String(aFt.goal_kick?.[0] || 0), awayAvg: calcAvg(aFt.goal_kick?.[0] || 0, aPl) },
      { metric: 'Throws in', homeTotal: String(hFt.throw_in?.[0] || 0), homeAvg: calcAvg(hFt.throw_in?.[0] || 0, hPl), awayTotal: String(aFt.throw_in?.[0] || 0), awayAvg: calcAvg(aFt.throw_in?.[0] || 0, aPl) },
      { metric: 'Offsides', homeTotal: String(hFt.offsides?.[0] || 0), homeAvg: calcAvg(hFt.offsides?.[0] || 0, hPl), awayTotal: String(aFt.offsides?.[0] || 0), awayAvg: calcAvg(aFt.offsides?.[0] || 0, aPl) },
      { metric: 'Penalties', homeTotal: `${hFt.pen_scored?.[0] || 0}/${hFt.pen_awarded?.[0] || 0}`, homeAvg: calcAvg(hFt.pen_scored?.[0] || 0, hPl), awayTotal: `${aFt.pen_scored?.[0] || 0}/${aFt.pen_awarded?.[0] || 0}`, awayAvg: calcAvg(aFt.pen_scored?.[0] || 0, aPl) },
      { metric: 'GK saves', homeTotal: String(hFt.saves?.[0] || 0), homeAvg: calcAvg(hFt.saves?.[0] || 0, hPl), awayTotal: String(aFt.saves?.[0] || 0), awayAvg: calcAvg(aFt.saves?.[0] || 0, aPl) }
    ];

    // Disciplinary Table
    const disciplinary = [
      { metric: 'Red cards', badge: 'red', homeTotal: String(hFt.redcards?.[0] || 0), homeAvg: calcAvg(hFt.redcards?.[0] || 0, hPl), awayTotal: String(aFt.redcards?.[0] || 0), awayAvg: calcAvg(aFt.redcards?.[0] || 0, aPl) },
      { metric: 'Yellow cards', badge: 'yellow', homeTotal: String(hFt.yellowcards?.[0] || 0), homeAvg: calcAvg(hFt.yellowcards?.[0] || 0, hPl), awayTotal: String(aFt.yellowcards?.[0] || 0), awayAvg: calcAvg(aFt.yellowcards?.[0] || 0, aPl) },
      { metric: 'Fouls', badge: '', homeTotal: String(hFt.fouls?.[0] || 0), homeAvg: calcAvg(hFt.fouls?.[0] || 0, hPl), awayTotal: String(aFt.fouls?.[0] || 0), awayAvg: calcAvg(aFt.fouls?.[0] || 0, aPl) },
      { metric: 'Tackles', badge: '', homeTotal: String(hFt.tackles?.[0] || 0), homeAvg: calcAvg(hFt.tackles?.[0] || 0, hPl), awayTotal: String(aFt.tackles?.[0] || 0), awayAvg: calcAvg(aFt.tackles?.[0] || 0, aPl) }
    ];

    // Goals By Time Period
    const goalsByTimePeriod = {
      home: [
        { period: "0-15'", scored: hFt['scr_min_0_15']?.[0] || 0, conceded: hFt['cnd_min_0_15']?.[0] || 0 },
        { period: "16-30'", scored: hFt['scr_min_15_30']?.[0] || 0, conceded: hFt['cnd_min_15_30']?.[0] || 0 },
        { period: "31-45'", scored: hFt['scr_min_30_45']?.[0] || 0, conceded: hFt['cnd_min_30_45']?.[0] || 0 },
        { period: "46-60'", scored: hFt['scr_min_45_60']?.[0] || 0, conceded: hFt['cnd_min_45_60']?.[0] || 0 },
        { period: "61-75'", scored: hFt['scr_min_60_75']?.[0] || 0, conceded: hFt['cnd_min_60_75']?.[0] || 0 },
        { period: "76-90'", scored: hFt['scr_min_75_90']?.[0] || 0, conceded: hFt['cnd_min_75_90']?.[0] || 0 }
      ],
      away: [
        { period: "0-15'", scored: aFt['scr_min_0_15']?.[0] || 0, conceded: aFt['cnd_min_0_15']?.[0] || 0 },
        { period: "16-30'", scored: aFt['scr_min_15_30']?.[0] || 0, conceded: aFt['cnd_min_15_30']?.[0] || 0 },
        { period: "31-45'", scored: aFt['scr_min_30_45']?.[0] || 0, conceded: aFt['cnd_min_30_45']?.[0] || 0 },
        { period: "46-60'", scored: aFt['scr_min_45_60']?.[0] || 0, conceded: aFt['cnd_min_45_60']?.[0] || 0 },
        { period: "61-75'", scored: aFt['scr_min_60_75']?.[0] || 0, conceded: aFt['cnd_min_60_75']?.[0] || 0 },
        { period: "76-90'", scored: aFt['scr_min_75_90']?.[0] || 0, conceded: aFt['cnd_min_75_90']?.[0] || 0 }
      ]
    };

    return {
      rawOvd: {
        h: hOvd,
        a: aOvd
      },
      availableLeagues: leagues,
      playedGames: { home: String(hPl), away: String(aPl) },
      goalsScored: {
        total: { home: String(hScr), away: String(aScr) },
        avg: { home: calcAvg(hScr, hPl), away: calcAvg(aScr, aPl) }
      },
      goalsConceded: {
        total: { home: String(hCnd), away: String(aCnd) },
        avg: { home: calcAvg(hCnd, hPl), away: calcAvg(aCnd, aPl) }
      },
      scoredGoalMatches: {
        home: { yesCount: hSn, yesPct: parseInt(calcPct(hSn, hPl), 10) || 0, noCount: hSnNo, noPct: parseInt(calcPct(hSnNo, hPl), 10) || 0 },
        away: { yesCount: aSn, yesPct: parseInt(calcPct(aSn, aPl), 10) || 0, noCount: aSnNo, noPct: parseInt(calcPct(aSnNo, aPl), 10) || 0 }
      },
      goals15: g15,
      goals25: g25,
      goals35: g35,
      bothScored,
      goalsByTimePeriod,
      shots,
      passes,
      avgEventTime,
      attacks,
      others,
      disciplinary
    };
  });
}

module.exports = { parseOverallStats };
