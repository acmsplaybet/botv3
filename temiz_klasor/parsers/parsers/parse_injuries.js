/**
 * ====================================================================
 * PARSER: STEP 6 - INJURED AND SUSPENDED PLAYERS
 * ====================================================================
 */

async function parseInjuries(page, homeTeam, awayTeam) {
  return await page.evaluate((hTeam, aTeam) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // Find the header for injured and suspended
    const allHeaders = Array.from(document.querySelectorAll('.mptlt, h3, .mod_title, b, strong')).filter(h => {
      return clean(h.innerText).toLowerCase().includes('injured and suspended');
    });

    if (!allHeaders.length) {
      return {
        hasInjuries: false,
        homeTeam: hTeam || '',
        awayTeam: aTeam || '',
        homePlayers: [],
        awayPlayers: []
      };
    }

    const parentModule = allHeaders[0].closest('.moduletable') || allHeaders[0].closest('td') || allHeaders[0].parentElement;
    if (!parentModule) {
      return {
        hasInjuries: false,
        homeTeam: hTeam || '',
        awayTeam: aTeam || '',
        homePlayers: [],
        awayPlayers: []
      };
    }

    // Team blocks: .sdl_team
    const teamBlocks = Array.from(parentModule.querySelectorAll('.sdl_team'));

    const extractPlayers = (container) => {
      if (!container) return [];
      const rows = Array.from(container.querySelectorAll('.sdl_player'));
      const players = [];
      const seen = new Set();

      rows.forEach(p => {
        const rawName = clean(p.querySelector('.sdl_player-name')?.innerText);
        const reasonEl = p.querySelector('.sdl_injury');
        const reason = clean(reasonEl?.innerText);
        const icon = reasonEl?.querySelector('img')?.src || '';
        const until = clean(p.querySelector('.sdl_until')?.innerText) || '-';

        // Extract position from name like "L. González (F)" -> pos "F"
        let pos = '';
        const posMatch = rawName.match(/\(([A-Z]+)\)$/);
        if (posMatch) pos = posMatch[1];

        if (rawName && !seen.has(rawName)) {
          seen.add(rawName);
          players.push({
            name: rawName,
            position: pos,
            reason,
            icon,
            until
          });
        }
      });

      return players;
    };

    const homePlayers = teamBlocks.length > 0 ? extractPlayers(teamBlocks[0]) : [];
    const awayPlayers = teamBlocks.length > 1 ? extractPlayers(teamBlocks[1]) : [];

    const hasInjuries = homePlayers.length > 0 || awayPlayers.length > 0;

    return {
      hasInjuries,
      homeTeam: hTeam || '',
      awayTeam: aTeam || '',
      homePlayers,
      awayPlayers
    };
  }, homeTeam, awayTeam);
}

module.exports = { parseInjuries };
