/**
 * ====================================================================
 * PARSER: STEP 3 - H2H, MATCH INTRO & STRAIGHT LINE DISTANCE
 * ====================================================================
 */

async function parseH2HAndIntro(page, expectedHomeTeam = '', expectedAwayTeam = '') {
  // 1. Expand "View all" / "View More" strictly inside H2H module if present
  try {
    await page.evaluate(() => {
      // Find all buttons or links with "view all" or "view more" in or around H2H
      const allBtns = Array.from(document.querySelectorAll('a, button, span, div')).filter(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return t === 'view more' || t === 'view all' || t === 'all' || cls.includes('view_all') || cls.includes('view_more') || cls.includes('st_view_all');
      });

      allBtns.forEach(btn => {
        // Only click if inside or near H2H moduletable
        const parentMod = btn.closest('.moduletable, .schema_mod, .mod_h2h, section, div');
        const txt = (parentMod?.innerText || '').toUpperCase();
        if (txt.includes('HEAD TO HEAD') || txt.includes('H2H') || txt.includes('DRAW')) {
          try { btn.click(); } catch(e) {}
        }
      });
    });
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
  } catch (e) {
    // Ignore if not present
  }

  return await page.evaluate((expHome, expAway) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // 1. Forebet AI Match Intro Text (Disabled per user request)
    const introText = '';
    const introDate = '';

    // 2. Target the SPECIFIC H2H Moduletable strictly
    const matches = [];
    const availableLeagues = [];
    const leagueMap = {}; // id -> name

    const allHeadings = Array.from(document.querySelectorAll('.mptlt, .m_title, h3, .mod_title, .sch_title, .schema_title, div, h2, h4'));
    const h2hHeading = allHeadings.find(el => {
      const txt = clean(el.innerText).toLowerCase();
      return (txt === 'head to head' || txt === 'h2h') && el.children.length === 0;
    }) || allHeadings.find(el => {
      const txt = clean(el.innerText).toLowerCase();
      return (txt.includes('head to head') || txt === 'h2h') && el.children.length <= 1;
    });

    const h2hModule = h2hHeading ? (h2hHeading.closest('.moduletable') || h2hHeading.parentElement) : null;

    if (h2hModule) {
      // Find tabs ONLY inside this H2H module in .tabs-ul or .st_lgs
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

        // Determine league name from row class (e.g. stlg_97 -> leagueMap['97'])
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
              // Row home team won
              resBadge = isRowHomeCurrentHome ? 'W' : 'L';
            } else if (aGoals > hGoals) {
              // Row away team won
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

    const homeWinsPct = totalMatches > 0 ? Math.round((homeWins / totalMatches) * 100) + '%' : '0%';
    const drawsPct = totalMatches > 0 ? Math.round((draws / totalMatches) * 100) + '%' : '0%';
    const awayWinsPct = totalMatches > 0 ? Math.round((awayWins / totalMatches) * 100) + '%' : '0%';

    const summary = {
      total: totalMatches,
      homeTeam: expHome,
      awayTeam: expAway,
      homeWins,
      homeWinsPct,
      draws,
      drawsPct,
      awayWins,
      awayWinsPct
    };

    return {
      intro: {
        text: introText,
        date: introDate
      },
      h2h: {
        availableLeagues,
        summary,
        matches
      }
    };
  }, expectedHomeTeam, expectedAwayTeam);
}

module.exports = { parseH2HAndIntro };
