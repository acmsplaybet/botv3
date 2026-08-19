/**
 * ====================================================================
 * PARSER: STEP 7 - NEXT MATCHES & FDR DIFFICULTY RATINGS (1-5)
 * ====================================================================
 * Zero-Mock Compliant: Returns only real scraped fixtures or empty arrays.
 */

async function parseNextMatches(page, homeCode = '', awayCode = '') {
  return await page.evaluate((hCode, aCode) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    const homeList = [];
    const awayList = [];

    // 1. Primary: Parse from .diff_blocks_container
    const diffContainer = document.querySelector('.diff_blocks_container');
    if (diffContainer) {
      const rows = diffContainer.querySelectorAll('.diff_blocks_row');
      rows.forEach(r => {
        const txt = clean(r.innerText);
        const m = txt.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s\-\.\(\)]+)\s+([A-Za-z0-9]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d)/);
        if (m) {
          const item = {
            opponent: m[1].trim(),
            league: m[2].trim(),
            date: m[3].trim(),
            diff: parseInt(m[4], 10) || 3
          };
          if (homeList.length < 6) homeList.push(item);
          else if (awayList.length < 6) awayList.push(item);
        }
      });
    }

    // 2. Secondary: Fallback to next fixture table rows (.st_next_matches or .mod_next_matches)
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
            const item = { opponent: opp, league: lgs || '-', date: dt, diff: 3 };
            if (idx === 0) homeList.push(item);
            else awayList.push(item);
          }
        });
      });
    }

    // Zero-Mock Rule: Return empty array if not present on page, never inject synthetic mock fixtures!
    return {
      home: homeList,
      away: awayList
    };
  }, homeCode, awayCode);
}

module.exports = { parseNextMatches };
