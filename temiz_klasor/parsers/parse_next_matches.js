/**
 * ====================================================================
 * PARSER: STEP 9 - NEXT MATCHES & FIXTURE DIFFICULTY (FDR 1-5)
 * ====================================================================
 * Universal parser that extracts ALL upcoming fixtures (initial + view all)
 * along with League, Date and Difficulty ratings (1-5).
 * ====================================================================
 */

async function parseNextMatches(page, homeCode = '', awayCode = '') {
  return await page.evaluate((hCode, aCode) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    const homeList = [];
    const awayList = [];
    const homeAll = [];
    const awayAll = [];

    // Extract difficulty level (1-5) based on computed background color or inline style
    const getDiffLevel = (el) => {
      if (!el) return 3;
      const style = el.getAttribute('style') || '';
      const className = el.className || '';
      const bg = window.getComputedStyle(el).backgroundColor || '';

      if (bg.includes('130, 201') || bg.includes('140, 217') || style.includes('82c91e') || className.includes('diff_1')) return 1;
      if (bg.includes('102, 168') || bg.includes('85, 139') || style.includes('66a80f') || className.includes('diff_2')) return 2;
      if (bg.includes('253, 126') || bg.includes('247, 103') || style.includes('fd7e14') || className.includes('diff_3')) return 3;
      if (bg.includes('224, 49') || bg.includes('235, 87') || style.includes('e03131') || className.includes('diff_4')) return 4;
      if (bg.includes('114, 28') || bg.includes('136, 14') || bg.includes('128, 0') || style.includes('721c24') || className.includes('diff_5')) return 5;
      return 3;
    };

    const parseContainerRows = (container) => {
      if (!container) return [];
      const rows = Array.from(container.querySelectorAll('.diff_blocks_row'));
      return rows.map(r => {
        const teamLink = r.querySelector('.active-team a');
        const opponent = clean(teamLink?.innerText || r.querySelector('.active-team')?.innerText);
        const league = clean(r.querySelector('.diff_league')?.innerText);
        const date = clean(r.querySelector('.diff_date')?.innerText);
        const teamDiffEl = r.querySelector('.team_diff');
        const diff = getDiffLevel(teamDiffEl);

        return {
          opponent: opponent || '-',
          league: league || '-',
          date: date || '-',
          difficulty: diff
        };
      }).filter(item => item.opponent !== '-' || item.date !== '-');
    };

    // 1. Primary: .diff_blocks_container (Standard Forebet Desktop)
    const containers = Array.from(document.querySelectorAll('.diff_blocks_container'));
    if (containers.length >= 2) {
      const hInitial = parseContainerRows(containers[0]);
      const aInitial = parseContainerRows(containers[1]);

      homeList.push(...hInitial);
      awayList.push(...aInitial);
      homeAll.push(...hInitial);
      awayAll.push(...aInitial);

      // Hidden "View all" extra rows
      if (containers.length >= 4) {
        const hExtra = parseContainerRows(containers[2]);
        const aExtra = parseContainerRows(containers[3]);
        homeAll.push(...hExtra);
        awayAll.push(...aExtra);
      }
    }

    // 2. Secondary fallback: .moduletable or .st_row if structure differs
    if (homeList.length === 0 && awayList.length === 0) {
      const nextTables = Array.from(document.querySelectorAll('.moduletable')).filter(m => {
        const t = clean(m.querySelector('.mptlt')?.innerText).toLowerCase();
        return t.includes('next matches') || t.includes('upcoming');
      });

      nextTables.forEach((mod, idx) => {
        const rows = mod.querySelectorAll('.st_row');
        rows.forEach(r => {
          const opp = clean(r.querySelector('.st_hteam, .st_ateam')?.innerText);
          const lgs = clean(r.querySelector('.st_ltag, .st_lg')?.innerText);
          const dt = clean(r.querySelector('.st_date')?.innerText);
          if (opp && dt) {
            const item = { opponent: opp, league: lgs || '-', date: dt, difficulty: 3 };
            if (idx === 0) { homeList.push(item); homeAll.push(item); }
            else { awayList.push(item); awayAll.push(item); }
          }
        });
      });
    }

    return {
      home: homeList,
      away: awayList,
      homeAll: homeAll.length > 0 ? homeAll : homeList,
      awayAll: awayAll.length > 0 ? awayAll : awayList,
      hasMore: homeAll.length > homeList.length || awayAll.length > awayList.length
    };
  }, homeCode, awayCode);
}

module.exports = { parseNextMatches };
