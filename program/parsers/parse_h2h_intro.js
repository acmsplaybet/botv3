/**
 * ====================================================================
 * PARSER: STEP 3 - H2H, MATCH INTRO & HEAD TO HEAD MATCHES
 * ====================================================================
 * Optimized: Scoped selector evaluation without heavy full-page reflows.
 */

async function parseH2HAndIntro(page, expectedHomeTeam = '', expectedAwayTeam = '') {
  // 1. Expand "View all" / "View More" strictly inside H2H module if present
  try {
    await page.evaluate(() => {
      const h2hBtns = Array.from(document.querySelectorAll('.mod_h2h a, .mod_h2h button, .schema_mod a, .moduletable a, .moduletable button')).filter(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return t === 'view more' || t === 'view all' || t === 'all' || cls.includes('view_all') || cls.includes('view_more');
      });

      h2hBtns.forEach(btn => {
        const parentMod = btn.closest('.moduletable, .schema_mod, .mod_h2h');
        const txt = (parentMod?.innerText || '').toUpperCase();
        if (txt.includes('HEAD TO HEAD') || txt.includes('H2H') || txt.includes('DRAW')) {
          try { btn.click(); } catch(e) {}
        }
      });
    });
  } catch (e) {}

  return await page.evaluate((expHome, expAway) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    const introText = '';
    const introDate = '';

    const matches = [];
    const availableLeagues = [];
    const leagueMap = {};

    // Scoped heading lookup without querying all plain divs
    const allHeadings = Array.from(document.querySelectorAll('.mptlt, .m_title, h2, h3, h4, .mod_title, .sch_title, .schema_title'));
    const h2hHeading = allHeadings.find(el => {
      const txt = clean(el.innerText).toLowerCase();
      return txt === 'head to head' || txt === 'h2h';
    }) || allHeadings.find(el => {
      const txt = clean(el.innerText).toLowerCase();
      return txt.includes('head to head') || txt === 'h2h';
    });

    const h2hModule = h2hHeading ? (h2hHeading.closest('.moduletable') || h2hHeading.parentElement) :
                                   document.querySelector('.mod_h2h, .schema_h2h');

    if (h2hModule) {
      const tabLis = h2hModule.querySelectorAll('.tbl_head.st_lgs ul.tabs-ul li, .tbl_head.st_lgs li, .tabs-ul li');
      tabLis.forEach(li => {
        const name = clean(li.querySelector('button, a, span')?.innerText || li.innerText);
        const cls = li.className || '';
        const matchId = cls.match(/lg_(-?\d+)/);
        const id = matchId ? matchId[1] : null;
        if (name && !availableLeagues.includes(name)) {
          availableLeagues.push(name);
          if (id) leagueMap[id] = name;
        }
      });
    }

    if (availableLeagues.length === 0) availableLeagues.push('All');

    if (h2hModule) {
      const rows = h2hModule.querySelectorAll('.st_row');
      rows.forEach(r => {
        const dateDivs = r.querySelector('.st_date')?.querySelectorAll('div') || [];
        const dateStr = Array.from(dateDivs).map(d => clean(d.innerText)).filter(Boolean).join(' ') || clean(r.querySelector('.st_date')?.innerText);

        const home = clean(r.querySelector('.st_hteam')?.innerText);
        const away = clean(r.querySelector('.st_ateam')?.innerText);
        const resText = clean(r.querySelector('.st_res, .st_scr, .st_score')?.innerText);
        const htText = clean(r.querySelector('.st_htscr')?.innerText).replace(/[()]/g, '');
        const lgs = clean(r.querySelector('.st_ltag, .shortTag, .st_lgs, .st_tag')?.innerText) || 'League';

        const rCls = r.className || '';
        const matchLg = rCls.match(/stlg_(-?\d+)/);
        const lgId = matchLg ? matchLg[1] : null;
        const leagueFull = (lgId && leagueMap[lgId]) ? leagueMap[lgId] : lgs;

        let score = resText;
        let ht = htText;
        const sm = resText.match(/(\d+\s*-\s*\d+)(?:\s*\((.*?)\))?/);
        if (sm) {
          score = sm[1];
          if (!ht) ht = sm[2] || '';
        }

        if (home && away && score && !matches.some(m => m.date === dateStr && m.home === home && m.away === away)) {
          const parts = score.split('-').map(n => parseInt(n.trim(), 10));
          let resBadge = 'D';
          
          const cleanStr = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const expHomeClean = cleanStr(expHome);
          const expAwayClean = cleanStr(expAway);
          const rowHomeClean = cleanStr(home);
          const rowAwayClean = cleanStr(away);

          const isRowHomeCurrentHome = expHomeClean && (rowHomeClean.includes(expHomeClean) || expHomeClean.includes(rowHomeClean));
          const isRowAwayCurrentHome = expHomeClean && (rowAwayClean.includes(expHomeClean) || expHomeClean.includes(rowAwayClean));

          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const hGoals = parts[0];
            const aGoals = parts[1];

            if (hGoals > aGoals) {
              resBadge = isRowHomeCurrentHome ? 'W' : 'L';
            } else if (aGoals > hGoals) {
              resBadge = isRowAwayCurrentHome ? 'W' : 'L';
            } else {
              resBadge = 'D';
            }
          }

          matches.push({
            date: dateStr,
            home,
            score,
            htScore: ht,
            away,
            league: lgs,
            leagueFull,
            leagueId: lgId,
            resBadge
          });
        }
      });
    }

    // Dynamic 3-Outcome Summary (Home Wins, Draws, Away Wins)
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    const totalMatches = matches.length;

    matches.forEach(m => {
      if (m.resBadge === 'W') homeWins++;
      else if (m.resBadge === 'L') awayWins++;
      else draws++;
    });

    const calcPct = (cnt) => totalMatches > 0 ? `${Math.round((cnt / totalMatches) * 100)}%` : '0%';

    const summary = {
      total: totalMatches,
      homeTeam: expHome,
      awayTeam: expAway,
      homeWins,
      homeWinsPct: calcPct(homeWins),
      draws,
      drawsPct: calcPct(draws),
      awayWins,
      awayWinsPct: calcPct(awayWins)
    };

    return {
      intro: { introText, introDate },
      h2h: {
        availableLeagues,
        summary,
        matches
      }
    };
  }, expectedHomeTeam, expectedAwayTeam);
}

module.exports = { parseH2HAndIntro };
