/**
 * ====================================================================
 * PARSER: STEP 5 - STANDINGS TABLE (LEAGUE TABLE)
 * ====================================================================
 */

async function parseStandings(page, homeTeam, awayTeam) {
  return await page.evaluate((hTeam, aTeam) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // 1. Check if #stand_hidden container exists (Forebet full table container)
    const hiddenCont = document.querySelector('#stand_hidden');
    let targetElement = null;

    if (hiddenCont && hiddenCont.querySelectorAll('tr').length > 3) {
      targetElement = hiddenCont;
    } else {
      // Find genuine standings table containers
      const containers = Array.from(document.querySelectorAll('.standings_table, table.standings, #standingstable, .tab_standings, .standings')).filter(el => {
        const txt = clean(el.innerText).toLowerCase();
        const hasHeader = (txt.includes('pts') && txt.includes('gp') && txt.includes('w')) || txt.includes('standings');
        return hasHeader && el.querySelectorAll('tr').length >= 3;
      });

      if (containers.length > 0) {
        // Pick the container with the most rows
        containers.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length);
        targetElement = containers[0];
      }
    }

    // If no real standings table exists on page (e.g. cup knockout matches), return empty array
    if (!targetElement) {
      return [];
    }

    const rawRows = Array.from(targetElement.querySelectorAll('tr'));
    const rows = [];
    const seenRanks = new Set();
    const seenTeams = new Set();

    rawRows.forEach(r => {
      const txt = clean(r.innerText);
      if (!txt || txt.toUpperCase().includes('APERTURA') || txt.toUpperCase().includes('STANDINGS') || txt.includes('PTS') || txt.includes('GP') || txt.includes('#')) return;

      const cells = r.querySelectorAll('td');
      if (cells.length >= 7) {
        const rankStr = clean(cells[0]?.innerText);
        const name = clean(cells[1]?.innerText);
        const pts = clean(cells[2]?.innerText);
        const gp = clean(cells[3]?.innerText);
        const w = clean(cells[4]?.innerText);
        const d = clean(cells[5]?.innerText);
        const l = clean(cells[6]?.innerText);
        const gf = cells[7] ? clean(cells[7].innerText) : '-';
        const ga = cells[8] ? clean(cells[8].innerText) : '-';
        const gd = cells[9] ? clean(cells[9].innerText) : '-';

        const rankNum = parseInt(rankStr, 10);
        const cleanNameLower = name.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Validation: rank must be valid number, name must contain at least 2 letters (not a plain date/number like '04'), and stats must be valid
        const isRealTeamName = /[a-zA-ZçğıöşüÇĞİÖŞÜ]{2,}/.test(name);
        const isValidStats = /^\d+$/.test(pts) && /^\d+$/.test(gp);

        if (!isNaN(rankNum) && rankNum > 0 && rankNum <= 50 && isRealTeamName && isValidStats && !seenRanks.has(rankNum) && !seenTeams.has(cleanNameLower)) {
          seenRanks.add(rankNum);
          seenTeams.add(cleanNameLower);

          const isHome = hTeam && name.toLowerCase().includes(hTeam.toLowerCase());
          const isAway = aTeam && name.toLowerCase().includes(aTeam.toLowerCase());

          rows.push({
            rank: rankNum,
            team: name,
            pts,
            gp,
            w,
            d,
            l,
            gf,
            ga,
            gd,
            highlight: isHome || isAway
          });
        }
      }
    });

    if (rows.length < 3) {
      return [];
    }

    // Sort by rank ascending
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }, homeTeam, awayTeam);
}

module.exports = { parseStandings };
