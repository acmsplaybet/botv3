/**
 * ====================================================================
 * PARSER: STEP 10 - MATCH CENTER (EVENTS, LINE-UPS, IN-MATCH STATS)
 * ====================================================================
 * Universal, robust parser that extracts ALL match events:
 * - Goals (Normal, Penalty Scored 'pen-goal.png', Own Goal)
 * - Penalty Misses ('pen-miss.png')
 * - VAR Decisions ('var.png')
 * - Yellow Cards ('ycard_img'), Red Cards ('rcard_img'), 2nd Yellow ('yred_img')
 * - Substitutions ('subs-arrows.png')
 * - Scoreboards (HT, FT, AET, Penalty Shootout)
 * - Pitch Line-ups (Starting XI on tactical pitch + Substitutes bench + Coaches + In/Out changes)
 * - In-Match Live Stats
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
      home: { formation: '', coach: '', startingXI: [], substitutes: [], inOutChanges: [] },
      away: { formation: '', coach: '', startingXI: [], substitutes: [], inOutChanges: [] }
    },
    inMatchStats: {}
  };

  try {
    // 1. Trigger match center popup by clicking score element
    const clicked = await page.evaluate(() => {
      const el = document.getElementById('evhdbte') || 
                 document.querySelector('.lscrsp[onclick*="getFTEvents"]') || 
                 document.querySelector('.lscrsp[onclick*="getLiveEvents"]') ||
                 document.querySelector('.match_res .lscrsp, .match_res, .live_score');
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
    const eventsAppeared = await page.waitForSelector('.ft-events, .match-events', { timeout: 6000 }).then(() => true).catch(() => false);
    if (!eventsAppeared) {
      return matchCenter;
    }

    await new Promise(r => setTimeout(r, 1200));

    // 2. PARSE EVENTS TAB (Universal match event recognition)
    const eventsData = await page.evaluate(() => {
      const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';
      const eventsList = [];
      const periods = { ht: '', ft: '', aet: '', penalties: null };

      const evSec = document.querySelector('.ft-events__section.match-events, .ft-events__section[data-menu="events"], .match-events');
      if (!evSec) return { eventsList, periods };

      const rows = Array.from(evSec.querySelectorAll('.match-events__row, .match-events__scoreboard'));

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

        // Recognition patterns
        const isGoalNormal = html.includes('goal.png') || html.includes('football ball');
        const isPenGoal = html.includes('pen-goal.png') || html.includes('scored pen');
        const isPenMiss = html.includes('pen-miss.png') || html.includes('missed pen');
        const isVar = html.includes('var.png') || html.includes('VAR logo');
        const isYellowCard = html.includes('ycard_img') || html.includes('ycard') || targetSide.querySelector('.ycard_img');
        const isYellowRed = html.includes('yred_img') || targetSide.querySelector('.yred_img');
        const isRedCard = html.includes('rcard_img') || targetSide.querySelector('.rcard_img');
        const isSub = html.includes('subs-arrows.png') || html.includes('subs-arrows') || targetSide.querySelector('img[src*="subs"]');

        let scoreMatch = text.match(/(\d+\s*[-–]\s*\d+)/);
        let scoreAtTime = scoreMatch ? scoreMatch[1].replace(/\s+/g, '') : null;

        if (inPenaltyShootout) {
          const isScored = isGoalNormal || isPenGoal || text.includes('(pen.)');
          eventsList.push({
            type: 'penalty_kick',
            minute: minStr || 'Pen',
            player: playerName || secondPlayer || 'Penalty Kick',
            scored: isScored,
            score: scoreAtTime,
            team
          });
        } else if (isPenGoal || (isGoalNormal && text.toLowerCase().includes('(pen.)'))) {
          eventsList.push({
            type: 'goal',
            minute: minStr,
            scorer: playerName || 'Goal',
            assist: null,
            isPenalty: true,
            isOwnGoal: false,
            score: scoreAtTime,
            team
          });
        } else if (isGoalNormal || (scoreAtTime && !isVar && !isPenMiss && !isYellowCard && !isRedCard && !isSub)) {
          let isOwn = text.toLowerCase().includes('(o.g.)') || text.toLowerCase().includes('own goal');
          let assist = '';
          const assistMatch = text.match(/Assists?:\s*([^\n\r]+)/i);
          if (assistMatch) assist = assistMatch[1].trim();

          const finalScorer = playerName || (secondPlayer && !secondPlayer.includes('pen') && !secondPlayer.includes('o.g.') ? secondPlayer : (scoreAtTime ? `Goal (${scoreAtTime})` : 'Goal'));

          eventsList.push({
            type: 'goal',
            minute: minStr,
            scorer: finalScorer,
            assist: assist || (secondPlayer && !secondPlayer.includes('pen') && !secondPlayer.includes('o.g.') ? secondPlayer : null),
            isPenalty: false,
            isOwnGoal: isOwn,
            score: scoreAtTime,
            team
          });
        } else if (isPenMiss) {
          eventsList.push({
            type: 'penalty_miss',
            minute: minStr,
            player: playerName || secondPlayer || 'Penalty Missed',
            team
          });
        } else if (isVar) {
          eventsList.push({
            type: 'var',
            minute: minStr,
            player: playerName || secondPlayer || 'VAR Review',
            detail: 'VAR Decision',
            team
          });
        } else if (isYellowRed) {
          eventsList.push({
            type: 'card',
            card: 'yellow_red',
            minute: minStr,
            player: playerName || secondPlayer || 'Red Card (2nd Yellow)',
            team
          });
        } else if (isRedCard) {
          eventsList.push({
            type: 'card',
            card: 'red',
            minute: minStr,
            player: playerName || secondPlayer || 'Red Card',
            team
          });
        } else if (isYellowCard) {
          eventsList.push({
            type: 'card',
            card: 'yellow',
            minute: minStr,
            player: playerName || secondPlayer || 'Yellow Card',
            team
          });
        } else if (isSub || (secondPlayer && secondPlayer !== playerName && !secondPlayer.includes('(pen.)'))) {
          eventsList.push({
            type: 'sub',
            minute: minStr,
            playerIn: playerName || 'Sub In',
            playerOut: secondPlayer || 'Sub Out',
            team
          });
        } else if (playerName) {
          eventsList.push({
            type: 'event',
            minute: minStr,
            player: playerName,
            detail: text,
            team
          });
        }
      });

      return { eventsList, periods };
    });

    matchCenter.events = eventsData.eventsList || [];
    matchCenter.periods = eventsData.periods || matchCenter.periods;
    matchCenter.hasEvents = matchCenter.events.length > 0 || Boolean(matchCenter.periods.ht || matchCenter.periods.ft);

    // 3. PARSE LINE-UPS TAB (Tactical Pitch + Starting XI + Substitutes + Substitutions In/Out + Coaches)
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('button[data-menu="line-ups"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      const lineupsData = await page.evaluate(() => {
        const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';
        const lineupsSec = document.querySelector('.ft-events__section[data-menu="line-ups"], .ft-events__main, .ft-events');
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
        if (rMatch && !rMatch[1].toLowerCase().includes('no data')) {
          referee = clean(rMatch[1]);
        }

        // Formations & Coaches
        const formationContainers = Array.from(lineupsSec.querySelectorAll('.mc-formation--container'));
        let homeFormation = '';
        let awayFormation = '';
        let homeCoach = '';
        let awayCoach = '';

        if (formationContainers.length >= 1) {
          const fcHome = formationContainers[0];
          homeFormation = clean(fcHome.querySelector('.mc-formation')?.innerText);
          homeCoach = clean(fcHome.querySelector('.mc-coach--text')?.innerText);
        }
        if (formationContainers.length >= 2) {
          const fcAway = formationContainers[1];
          awayFormation = clean(fcAway.querySelector('.mc-formation')?.innerText);
          awayCoach = clean(fcAway.querySelector('.mc-coach--text')?.innerText);
        }

        // Extract pitch starting XI players with roles & statuses
        const parsePitchSide = (container) => {
          if (!container) return [];
          const roleRows = Array.from(container.querySelectorAll('.mc-role'));
          const players = [];

          roleRows.forEach((roleRow, roleIdx) => {
            const playerEls = Array.from(roleRow.querySelectorAll('.mc-player'));
            playerEls.forEach(p => {
              const num = clean(p.querySelector('.mc-player__num, .number, .num')?.innerText);
              const name = clean(p.querySelector('.mc-player__name, .name')?.innerText);
              const pHtml = p.innerHTML || '';
              const pText = clean(p.innerText);

              const hasGoal = pHtml.includes('goal.png') || pText.includes('Goal');
              const hasAssist = pHtml.includes('mc-player-assist') || pHtml.includes('>A<');
              const hasYellow = pHtml.includes('ycard_img') || pHtml.includes('ycard');
              const hasRed = pHtml.includes('rcard_img') || pHtml.includes('yred_img');

              // Sub minute if substituted out (e.g. > 85')
              const subMatch = pText.match(/>\s*(\d+['\+]*)/);
              const subMinute = subMatch ? subMatch[1] : null;

              if (name) {
                players.push({
                  num: num || '',
                  name: name.replace(/>\s*\d+['\+]*/, '').trim(),
                  line: roleIdx, // tactical line (0 = GK, 1 = DEF, 2 = MID, etc.)
                  hasGoal,
                  hasAssist,
                  hasYellow,
                  hasRed,
                  subMinute
                });
              }
            });
          });

          return players;
        };

        const homePitch = lineupsSec.querySelector('.mc-team__home, .mc-field--team:first-child');
        const awayPitch = lineupsSec.querySelector('.mc-team__away, .mc-field--team:last-child');

        let homeStarting = parsePitchSide(homePitch);
        let awayStarting = parsePitchSide(awayPitch);

        // Extract Substitutions (In / Out changes)
        const inOutHome = [];
        const inOutAway = [];

        const subInContainers = Array.from(lineupsSec.querySelectorAll('.mc-sub'));
        subInContainers.forEach(sc => {
          const prevSep = sc.previousElementSibling;
          const isSubstitutions = prevSep && prevSep.innerText && prevSep.innerText.includes('Substitutions');

          if (isSubstitutions) {
            const hSide = sc.querySelector('.mc-sub__home');
            const aSide = sc.querySelector('.mc-sub__away');

            const parseSubRows = (sideEl, targetList) => {
              if (!sideEl) return;
              const rows = Array.from(sideEl.querySelectorAll('.mc-sub__inner--container, div[class*="sub"], tr'));
              rows.forEach(r => {
                const text = clean(r.innerText);
                if (text && text.includes('▲') || text.includes('▼') || text.includes('>')) {
                  targetList.push(text);
                }
              });
            };

            parseSubRows(hSide, inOutHome);
            parseSubRows(aSide, inOutAway);
          }
        });

        // Extract Substitutes Bench List
        let homeSubs = [];
        let awaySubs = [];

        const subBenchContainers = Array.from(lineupsSec.querySelectorAll('.mc-sub'));
        subBenchContainers.forEach(sc => {
          const prevSep = sc.previousElementSibling;
          const isSubstitutes = prevSep && prevSep.innerText && prevSep.innerText.includes('Substitutes');

          if (isSubstitutes) {
            const hSide = sc.querySelector('.mc-sub__home');
            const aSide = sc.querySelector('.mc-sub__away');

            const parseBench = (sideEl) => {
              if (!sideEl) return [];
              return Array.from(sideEl.querySelectorAll('.mc-sub__substitute')).map(s => ({
                num: '',
                name: clean(s.innerText)
              })).filter(p => p.name);
            };

            homeSubs = parseBench(hSide);
            awaySubs = parseBench(aSide);
          }
        });

        // Fallback for unified substitute elements
        if (homeSubs.length === 0 && awaySubs.length === 0) {
          const allSubEls = Array.from(lineupsSec.querySelectorAll('.mc-sub__substitute')).map(s => clean(s.innerText)).filter(Boolean);
          if (allSubEls.length > 0) {
            const half = Math.ceil(allSubEls.length / 2);
            homeSubs = allSubEls.slice(0, half).map(name => ({ num: '', name }));
            awaySubs = allSubEls.slice(half).map(name => ({ num: '', name }));
          }
        }

        return {
          venue,
          capacity,
          referee,
          home: { formation: homeFormation, coach: homeCoach, startingXI: homeStarting, substitutes: homeSubs, inOutChanges: inOutHome },
          away: { formation: awayFormation, coach: awayCoach, startingXI: awayStarting, substitutes: awaySubs, inOutChanges: inOutAway }
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
        const statsSec = document.querySelector('.ft-events__section[data-menu="stats"], .ft-events__main, .ft-events');
        if (!statsSec) return {};

        const rawText = statsSec.innerText || '';
        const lines = rawText.split('\n').map(l => clean(l)).filter(Boolean);
        const stats = {};

        // Parse key-value triples: [Label, HomeVal, AwayVal]
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const next1 = lines[i + 1];
          const next2 = lines[i + 2];

          if (next1 !== undefined && next2 !== undefined) {
            const isVal1 = /^[\d%]+$/.test(next1);
            const isVal2 = /^[\d%]+$/.test(next2);
            if (isVal1 && isVal2 && !/^[\d%]+$/.test(l)) {
              const key = l.toLowerCase().replace(/[^a-z0-9]/g, '_');
              if (!stats[key]) {
                stats[key] = {
                  label: l,
                  home: next1,
                  away: next2
                };
              }
            }
          }
        }

        return stats;
      });

      if (inMatchStatsData && Object.keys(inMatchStatsData).length > 0) {
        matchCenter.inMatchStats = inMatchStatsData;
      }
    } catch (e) {}

    // Close overlay
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
