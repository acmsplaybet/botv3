/**
 * ====================================================================
 * PARSER: STEP 7 - RECENT MATCHES & HOME/AWAY FORMS (4 BLOCKS)
 * ====================================================================
 */

async function parseLastMatches(page, homeTeam, awayTeam) {
  return await page.evaluate((hTeam, aTeam) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // Find all moduletable elements containing match tables
    const allModules = Array.from(document.querySelectorAll('.moduletable'));

    const lastMatchesMods = allModules.filter(m => {
      const t = clean(m.querySelector('.mptlt')?.innerText).toLowerCase();
      return t.includes('last 6 matches') || t.includes('last matches');
    });

    const homeMods = allModules.filter(m => {
      const t = clean(m.querySelector('.mptlt')?.innerText).toLowerCase();
      return t.includes('home matches') && !t.includes('overall');
    });

    const awayMods = allModules.filter(m => {
      const t = clean(m.querySelector('.mptlt')?.innerText).toLowerCase();
      return t.includes('away matches') && !t.includes('overall');
    });

    const homeOverallMod = lastMatchesMods[0] || null;
    const awayOverallMod = lastMatchesMods[1] || null;
    const homeHomeMod = homeMods[0] || null;
    const awayAwayMod = awayMods[0] || null;

    const parseBlock = (mod, teamName, isHomeContext) => {
      if (!mod) {
        return {
          title: '',
          code: '',
          logo: '',
          availableLeagues: ['All'],
          matches: [],
          summary: { win: 0, winPct: '0%', draw: 0, drawPct: '0%', lost: 0, lostPct: '0%' }
        };
      }

      const title = clean(mod.querySelector('.mptlt')?.innerText);
      const code = clean(mod.querySelector('.st_logo_box div:first-child')?.innerText);
      const logo = mod.querySelector('.st_logo_box img')?.src || '';

      // Available leagues from tabs
      const leagueTabs = Array.from(mod.querySelectorAll('.tbl_head.st_lgs ul.tabs-ul li, .tabs-ul li')).map(li => {
        const btn = li.querySelector('button') || li;
        const txt = clean(btn.innerText);
        const cls = li.className || '';
        const idMatch = cls.match(/lg_(-?\d+)/);
        const lgId = idMatch ? idMatch[1] : '';
        return { name: txt, lgId };
      }).filter(l => l.name);

      const availableLeagues = leagueTabs.length > 0 ? leagueTabs : [{ name: 'All', lgId: '-1' }];

      // Parse matches
      const rows = Array.from(mod.querySelectorAll('.st_row'));
      const matches = [];

      rows.forEach(r => {
        const dateDivs = r.querySelector('.st_date')?.querySelectorAll('div') || [];
        const dateStr = Array.from(dateDivs).map(d => clean(d.innerText)).filter(Boolean).join(' ') || clean(r.querySelector('.st_date')?.innerText);

        const homeEl = r.querySelector('.st_hteam');
        const awayEl = r.querySelector('.st_ateam');
        const home = clean(homeEl?.innerText);
        const away = clean(awayEl?.innerText);

        const scoreEl = r.querySelector('.st_res');
        const htEl = r.querySelector('.st_htscr');
        const score = clean(scoreEl?.innerText);
        const htScore = clean(htEl?.innerText).replace(/[()]/g, '');
        const lgs = clean(r.querySelector('.st_ltag, .st_lg, .st_lg_code')?.innerText);

        const rCls = r.className || '';
        const stlgMatch = rCls.match(/stlg_(\d+)/);
        const leagueId = stlgMatch ? stlgMatch[1] : '';

        // Determine result badge relative to the focus team
        const targetClean = teamName ? teamName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const homeClean = home.toLowerCase().replace(/[^a-z0-9]/g, '');
        const awayClean = away.toLowerCase().replace(/[^a-z0-9]/g, '');

        const isTargetHome = homeEl?.classList.contains('active-team') || (targetClean && homeClean.includes(targetClean)) || isHomeContext;

        const parts = score.split('-').map(n => parseInt(n.trim(), 10));
        let resBadge = 'D';
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const homeG = parts[0];
          const awayG = parts[1];
          if (homeG === awayG) {
            resBadge = 'D';
          } else if (isTargetHome) {
            resBadge = homeG > awayG ? 'W' : 'L';
          } else {
            resBadge = awayG > homeG ? 'W' : 'L';
          }
        }

        if (home && away && score) {
          matches.push({
            date: dateStr,
            home,
            away,
            score,
            htScore,
            league: lgs,
            leagueId,
            resBadge,
            isTargetHome
          });
        }
      });

      // Parse summary stats
      const percStats = Array.from(mod.querySelectorAll('.st_row_perc .st_perc_stat'));
      let win = 0, winPct = '0%', draw = 0, drawPct = '0%', lost = 0, lostPct = '0%';

      percStats.forEach(ps => {
        const txt = clean(ps.innerText);
        const m = txt.match(/(Win|Draw|Lost)\s+(\d+)\s+([\d%]+)/i);
        if (m) {
          const type = m[1].toLowerCase();
          const count = parseInt(m[2], 10);
          const pct = m[3];
          if (type === 'win') { win = count; winPct = pct; }
          else if (type === 'draw') { draw = count; drawPct = pct; }
          else if (type === 'lost') { lost = count; lostPct = pct; }
        }
      });

      if (matches.length > 0 && win === 0 && draw === 0 && lost === 0) {
        const first6 = matches.slice(0, 6);
        win = first6.filter(m => m.resBadge === 'W').length;
        draw = first6.filter(m => m.resBadge === 'D').length;
        lost = first6.filter(m => m.resBadge === 'L').length;
        const total = first6.length || 1;
        winPct = `${Math.round((win / total) * 100)}%`;
        drawPct = `${Math.round((draw / total) * 100)}%`;
        lostPct = `${Math.round((lost / total) * 100)}%`;
      }

      return {
        title,
        code,
        logo,
        availableLeagues,
        matches,
        summary: {
          win,
          winPct,
          draw,
          drawPct,
          lost,
          lostPct
        }
      };
    };

    return {
      homeOverall: parseBlock(homeOverallMod, hTeam, false),
      awayOverall: parseBlock(awayOverallMod, aTeam, false),
      homeHome: parseBlock(homeHomeMod, hTeam, true),
      awayAway: parseBlock(awayAwayMod, aTeam, false)
    };
  }, homeTeam, awayTeam);
}

module.exports = { parseLastMatches };
