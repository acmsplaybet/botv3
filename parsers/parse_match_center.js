/**
 * ====================================================================
 * PARSER: STEP 10 - MATCH CENTER (EVENTS, LINE-UPS, IN-MATCH STATS)
 * ====================================================================
 * Extracts complete live & finished match center overlay data:
 * 1. Events: Goals, Cards, Subs, HT/FT/AET/Penalty shootouts
 * 2. Line-ups: Formations, Coaches, Referee, Starting XI, Substitutes
 * 3. Stats: Real in-match metrics (Shots, Passes, Possession, Attacks, Cards)
 * ====================================================================
 */

async function parseMatchCenter(page, hero = {}) {
  const matchCenter = {
    hasEvents: false,
    events: [],
    periods: {
      ht: '',
      ft: '',
      aet: '',
      penalties: null
    },
    lineups: {
      venue: '',
      capacity: '',
      referee: '',
      home: { formation: '', coach: '', startingXI: [], substitutes: [] },
      away: { formation: '', coach: '', startingXI: [], substitutes: [] }
    },
    inMatchStats: {}
  };

  try {
    // 1. Trigger match center popup by clicking score element
    const clicked = await page.evaluate(() => {
      const el = document.getElementById('evhdbte') || 
                 document.querySelector('.lscrsp[onclick*="getFTEvents"]') || 
                 document.querySelector('.match_res .lscrsp, .match_res');
      if (el) {
        el.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      return matchCenter;
    }

    // Wait specifically for event rows or scoreboard
    const eventsAppeared = await page.waitForSelector('.match-events__row, .match-events__scoreboard, .ft-events', { timeout: 6000 }).then(() => true).catch(() => false);
    if (!eventsAppeared) {
      return matchCenter;
    }

    await new Promise(r => setTimeout(r, 1200));

    // 2. PARSE EVENTS TAB
    const eventsData = await page.evaluate(() => {
      const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';
      const eventsList = [];
      const periods = { ht: '', ft: '', aet: '', penalties: null };

      const rows = Array.from(document.querySelectorAll('.match-events__row, .match-events__scoreboard'));

      let inPenaltyShootout = false;

      rows.forEach(r => {
        if (r.classList.contains('match-events__scoreboard')) {
          const time = clean(r.querySelector('.match-events__scoreboard--time')?.innerText).toUpperCase();
          const score = clean(r.querySelector('.match-events__scoreboard--score')?.innerText);
          if (time.includes('HT')) periods.ht = score;
          else if (time.includes('FT')) periods.ft = score;
          else if (time.includes('AET')) periods.aet = score;
          else if (time.includes('PEN')) {
            inPenaltyShootout = true;
            const parts = score.split('-').map(n => parseInt(n.trim(), 10));
            periods.penalties = {
              home: !isNaN(parts[0]) ? parts[0] : null,
              away: !isNaN(parts[1]) ? parts[1] : null,
              scoreStr: score
            };
          }
          return;
        }

        const minStr = clean(r.querySelector('.match-events__event-min')?.innerText).replace(/['\s]/g, '');
        if (minStr.toLowerCase().includes('pen')) {
          inPenaltyShootout = true;
        }

        const hostEl = r.querySelector('.match-events__row--host');
        const guestEl = r.querySelector('.match-events__row--guest');
        const team = hostEl ? 'home' : (guestEl ? 'away' : 'unknown');
        const targetSide = hostEl || guestEl;
        if (!targetSide) return;

        const playerSpan = targetSide.querySelector('.match-events__player span');
        const playerItalic = targetSide.querySelector('.match-events__player i');
        const playerName = clean(playerSpan?.innerText);
        const secondPlayer = clean(playerItalic?.innerText);

        const html = targetSide.innerHTML || '';
        const text = clean(targetSide.innerText);

        const isGoal = html.includes('goal.png') || html.includes('football ball') || text.includes('0 -') || text.includes('1 -') || text.includes('2 -') || text.includes('3 -') || text.includes('4 -') || text.includes('5 -') || text.includes('0-1') || text.includes('1-1') || text.includes('2-1') || text.includes('2-2') || text.includes('2-3') || text.includes('3-3') || text.includes('3-4') || text.includes('4-4') || text.includes('4-5');
        const isYellowCard = html.includes('ycard_img') || html.includes('ycard') || targetSide.querySelector('.ycard_img');
        const isYellowRed = html.includes('yred_img') || targetSide.querySelector('.yred_img');
        const isRedCard = html.includes('rcard_img') || targetSide.querySelector('.rcard_img');
        const isSub = html.includes('subs-arrows') || targetSide.querySelector('img[src*="subs"]');

        let scoreMatch = text.match(/(\d+\s*[-–]\s*\d+)/);
        let scoreAtTime = scoreMatch ? scoreMatch[1].replace(/\s+/g, '') : null;

        if (inPenaltyShootout) {
          const isScored = isGoal || (html.includes('goal') || text.includes('(pen.)') && scoreAtTime);
          eventsList.push({
            type: 'penalty_kick',
            minute: minStr || 'Pen',
            player: playerName || secondPlayer,
            scored: isScored,
            score: scoreAtTime,
            team
          });
        } else if (isGoal) {
          let isPen = text.toLowerCase().includes('(pen.)') || text.toLowerCase().includes('pen');
          let isOwn = text.toLowerCase().includes('(o.g.)') || text.toLowerCase().includes('own goal');
          let assist = '';
          const assistMatch = text.match(/Assists?:\s*([^\n\r]+)/i);
          if (assistMatch) assist = assistMatch[1].trim();

          eventsList.push({
            type: 'goal',
            minute: minStr,
            scorer: playerName || secondPlayer,
            assist: assist || (secondPlayer && !secondPlayer.includes('pen') && !secondPlayer.includes('o.g.') ? secondPlayer : null),
            isPenalty: isPen,
            isOwnGoal: isOwn,
            score: scoreAtTime,
            team
          });
        } else if (isYellowRed) {
          eventsList.push({
            type: 'card',
            card: 'yellow_red',
            minute: minStr,
            player: playerName || secondPlayer,
            team
          });
        } else if (isRedCard) {
          eventsList.push({
            type: 'card',
            card: 'red',
            minute: minStr,
            player: playerName || secondPlayer,
            team
          });
        } else if (isYellowCard) {
          eventsList.push({
            type: 'card',
            card: 'yellow',
            minute: minStr,
            player: playerName || secondPlayer,
            team
          });
        } else if (isSub || (secondPlayer && secondPlayer !== playerName)) {
          eventsList.push({
            type: 'sub',
            minute: minStr,
            playerIn: playerName,
            playerOut: secondPlayer,
            team
          });
        }
      });

      return { eventsList, periods };
    });

    matchCenter.events = eventsData.eventsList || [];
    matchCenter.periods = eventsData.periods || matchCenter.periods;
    matchCenter.hasEvents = matchCenter.events.length > 0 || Boolean(matchCenter.periods.ht || matchCenter.periods.ft);

    // 3. PARSE LINE-UPS TAB
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('button[data-menu="line-ups"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      const lineupsData = await page.evaluate(() => {
        const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';
        const lineupsSec = document.querySelector('.ft-events__section[data-menu="line-ups"], .ft-events__main');
        if (!lineupsSec) return null;

        const text = lineupsSec.innerText || '';
        
        let venue = '';
        let capacity = '';
        let referee = '';

        const vMatch = text.match(/Venue\s*\n+([^\n]+)/i);
        if (vMatch) venue = clean(vMatch[1]);

        const cMatch = text.match(/Capacity\s*\n+([^\n]+)/i);
        if (cMatch) capacity = clean(cMatch[1]);

        const rMatch = text.match(/Referee\s*\n+([^\n]+)/i);
        if (rMatch) referee = clean(rMatch[1]);

        const formations = text.match(/\b\d\-\d\-\d(?:\-\d)?\b/g) || [];
        const homeFormation = formations[0] || '';
        const awayFormation = formations[1] || '';

        const homeStarting = [];
        const awayStarting = [];
        const homeSubs = [];
        const awaySubs = [];

        const playerRows = Array.from(lineupsSec.querySelectorAll('.ft-events__player-row, tr, .sdl_player, [class*="player"]'));
        playerRows.forEach(pr => {
          const num = clean(pr.querySelector('.number, .num, b')?.innerText);
          const name = clean(pr.querySelector('.name, span, a')?.innerText);
          if (name && num && !isNaN(parseInt(num, 10))) {
            const pObj = { num, name };
            if (homeStarting.length < 11) homeStarting.push(pObj);
            else if (awayStarting.length < 11) awayStarting.push(pObj);
            else if (homeSubs.length < 9) homeSubs.push(pObj);
            else awaySubs.push(pObj);
          }
        });

        return {
          venue,
          capacity,
          referee,
          home: { formation: homeFormation, coach: '', startingXI: homeStarting, substitutes: homeSubs },
          away: { formation: awayFormation, coach: '', startingXI: awayStarting, substitutes: awaySubs }
        };
      });

      if (lineupsData) {
        matchCenter.lineups = lineupsData;
      }
    } catch (e) {}

    // 4. PARSE IN-MATCH STATS TAB
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('button[data-menu="stats"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      const inMatchStatsData = await page.evaluate(() => {
        const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';
        const statsSec = document.querySelector('.ft-events__section[data-menu="stats"], .ft-events__main');
        if (!statsSec) return {};

        const rawText = statsSec.innerText || '';
        const lines = rawText.split('\n').map(l => clean(l)).filter(Boolean);
        const stats = {};

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const next1 = lines[i + 1];
          const next2 = lines[i + 2];

          if (next1 !== undefined && next2 !== undefined) {
            const isVal1 = /^[\d%]+$/.test(next1);
            const isVal2 = /^[\d%]+$/.test(next2);
            if (isVal1 && isVal2 && !/^[\d%]+$/.test(l)) {
              const key = l.toLowerCase().replace(/[^a-z0-9]/g, '_');
              stats[key] = {
                label: l,
                home: next1,
                away: next2
              };
            }
          }
        }

        return stats;
      });

      if (inMatchStatsData && Object.keys(inMatchStatsData).length > 0) {
        matchCenter.inMatchStats = inMatchStatsData;
      }
    } catch (e) {}

    // Close the overlay modal
    try {
      await page.evaluate(() => {
        const closeBtn = document.querySelector('.ft-events__cls-div, .ft-events__close, img[src*="close"]');
        if (closeBtn) closeBtn.click();
      });
      await page.keyboard.press('Escape');
    } catch (e) {}

    return matchCenter;
  } catch (err) {
    return matchCenter;
  }
}

module.exports = { parseMatchCenter };
