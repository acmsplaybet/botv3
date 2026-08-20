/**
 * ====================================================================
 * PARSER: STEP 1 - HERO, TAKIM BİLGİLERİ, LOGOLAR, FORMLAR, CANLI DURUM
 * ====================================================================
 */

async function parseHero(page) {
  return await page.evaluate(() => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // Helper to safely parse getstag(this, id, country, league, leagueUrl, flagCode)
    const parseGetStag = (onclickStr) => {
      if (!onclickStr) return null;
      const m = onclickStr.match(/getstag\s*\((.*)\)/i);
      if (!m) return null;
      const matches = m[1].match(/(?:'([^']*)'|"([^"]*)"|([^,]+))/g);
      if (!matches) return null;
      const args = matches.map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      return {
        id: args[1] || '',
        country: args[2] || '',
        league: args[3] || '',
        leagueUrl: args[4] || '',
        flagCode: args[5] || ''
      };
    };

    // Extract League, Country, Flag
    let leagueName = '';
    let country = '';
    let leagueFlag = '';
    let roundText = '';

    const allStagEls = Array.from(document.querySelectorAll('[onclick*="getstag"], .shortagDiv img, .short_tag img, img.flsc, .flsc'));
    for (const el of allStagEls) {
      const oc = el.getAttribute('onclick') || '';
      const parsed = parseGetStag(oc);
      if (parsed) {
        if (!country && parsed.country) country = clean(parsed.country);
        if (!leagueName && parsed.league) leagueName = clean(parsed.league);
        if (!leagueFlag && el.src && el.src.includes('/fc/')) leagueFlag = el.src;
        if (!leagueFlag && parsed.flagCode) leagueFlag = `https://www.forebet.com/images/fc/${parsed.flagCode}.png`;
        if (!country && parsed.leagueUrl) {
          const segs = parsed.leagueUrl.split('/');
          if (segs.length > 0) country = segs[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        if (country && leagueName) break;
      }
    }

    const breadLinks = Array.from(document.querySelectorAll('.stat-bread a, .breadcrumbs a, .bread a'));
    if (!leagueName && breadLinks.length >= 2) {
      country = country || clean(breadLinks[0].innerText);
      leagueName = clean(breadLinks[breadLinks.length - 1].innerText);
    } else if (!leagueName && breadLinks.length === 1) {
      leagueName = clean(breadLinks[0].innerText);
    }

    const shortTagSpan = document.querySelector('.shortagDiv .shortTag, .short_tag .shortTag, .shortTag');
    const shortTagCode = clean(shortTagSpan?.innerText);

    if (!leagueName) {
      const leagueEl = document.querySelector('.schema .short_tag, .schema a[href*="football-predictions"], .schema h1, .stat-bread a:last-child');
      leagueName = clean(leagueEl?.innerText) || 'Football League';
    }

    // Extract Round (e.g. "Round 30, Clausura", "1/8-finals", "Quarter-finals")
    const roundCandidates = Array.from(document.querySelectorAll('.heading, .stag_h1, .st_round, .stat_head_round, .rcnt_h, .schema_title, div[class*="heading"], span[class*="round"]'));
    for (const el of roundCandidates) {
      const t = clean(el.innerText);
      if (t && (t.includes('Round') || t.includes('1/8') || t.includes('1/4') || t.includes('1/2') || t.includes('Final') || t.includes('Clausura') || t.includes('Apertura') || t.includes('Group') || t.includes('Play-off'))) {
        roundText = t;
        break;
      }
    }

    // Extract Date & Time
    const dateEl = document.querySelector('.schema .date_br, .schema .date, .schema time');
    const fullDateText = clean(dateEl?.innerText);
    let matchDate = fullDateText;
    let matchTime = '';
    if (fullDateText) {
      const parts = fullDateText.split(/\s+/);
      matchDate = parts[0] || '';
      matchTime = parts[1] || '';
    }

    // Extract Teams & Short Codes
    const homeNameEl = document.querySelector('.schema .homeTeam, .schema .tname:first-of-type, .schema .st_homeTeam');
    const awayNameEl = document.querySelector('.schema .awayTeam, .schema .tname:last-of-type, .schema .st_awayTeam');
    const homeTeam = clean(homeNameEl?.innerText);
    const awayTeam = clean(awayNameEl?.innerText);

    const homeShortEl = document.querySelector('.schema .homeTeam .short_name, .schema .short_home, .schema .st_short_home');
    const awayShortEl = document.querySelector('.schema .awayTeam .short_name, .schema .short_away, .schema .st_short_away');
    const homeShort = clean(homeShortEl?.innerText) || (homeTeam ? homeTeam.substring(0, 3).toUpperCase() : 'HOM');
    const awayShort = clean(awayShortEl?.innerText) || (awayTeam ? awayTeam.substring(0, 3).toUpperCase() : 'AWY');

    // Extract Team Logos (Strictly targeting team logo containers and filtering out weather/flags)
    let homeLogo = 'https://www.forebet.com/images/icons/blank-logo.png';
    let awayLogo = 'https://www.forebet.com/images/icons/blank-logo.png';

    const isValidTeamLogo = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (url.includes('w-') || url.includes('weather') || url.includes('/fc/') || url.includes('blank-logo')) return false;
      return true;
    };

    const teamLogoContainers = Array.from(document.querySelectorAll('.st_logo_box_img_container img, .st_hteam_img img, .st_ateam_img img, .os_home_team_img img, .os_away_team_img img, .schema_h2h .st_hteam img, .schema_h2h .st_ateam img, .schema .homeTeam img, .schema .awayTeam img'));
    const validLogos = teamLogoContainers.map(img => img.src).filter(isValidTeamLogo);

    if (validLogos.length >= 2) {
      homeLogo = validLogos[0];
      awayLogo = validLogos[1];
    } else {
      const allImgs = Array.from(document.querySelectorAll('img')).map(img => img.src).filter(isValidTeamLogo);
      if (allImgs.length >= 2) {
        homeLogo = allImgs[0];
        awayLogo = allImgs[1];
      }
    }

    // Extract Score & Status (Live / FT / Upcoming / Pen / AET / Cancelled)
    // ONLY target legitimate score elements with valid numeric score regex!
    const scoreBox = document.querySelector('.match_res, .lscr_td, .schema .score');
    const scoreEl = document.querySelector('.match_res .l_scr, .lscrsp .l_scr, .lscrsp, .ft-events__score');
    let rawScoreText = clean(scoreEl?.innerText);
    let validScore = null;

    if (rawScoreText) {
      const scoreMatch = rawScoreText.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
      if (scoreMatch) {
        validScore = `${scoreMatch[1]} - ${scoreMatch[2]}`;
      }
    }

    // Extract HT Score, AET and Penalties
    const htEl = document.querySelector('.lscr_td .ht_scr, .ht_scr, .match_res .ht_scr, .ft-events__score-half');
    let htScore = clean(htEl?.innerText).replace(/[()]/g, '');

    const aetEl = document.querySelector('.aet_scr, .match_res .aet_scr');
    let aetScore = clean(aetEl?.innerText).replace(/[()]/g, '');

    const penEl = document.querySelector('.pen_scr, .match_res .pen_scr');
    let penScore = clean(penEl?.innerText).replace(/[()]/g, '');

    // Check Special Indicators (Pen., AET, Cancl., Postp.)
    const ladtmEl = document.querySelector('.ladtm, .lmin_td .ladtm, .match_res_status');
    const ladtmText = clean(ladtmEl?.innerText);
    const lminTextEl = document.querySelector('.l_min, .lmin_mp, .lsc_stat');
    const lminSpecial = clean(lminTextEl?.innerText);

    let isPen = ladtmText.includes('Pen') || lminSpecial.includes('Pen') || (scoreBox && clean(scoreBox.innerText).includes('Pen'));
    let isAet = ladtmText.includes('AET') || lminSpecial.includes('AET') || (scoreBox && clean(scoreBox.innerText).includes('AET'));
    let isCancelled = lminSpecial.includes('Cancl') || lminSpecial.includes('Postp') || lminSpecial.includes('Aband');

    // Extract exact numbers for Pen (e.g. "Pen. 1-4") or AET (e.g. "AET 1 - 0")
    const combinedStatusText = `${ladtmText} ${clean(scoreBox?.innerText)}`;
    const penMatch = combinedStatusText.match(/Pen\.?\s*(\d+\s*[-–:]\s*\d+)/i);
    if (penMatch) {
      penScore = penMatch[1].replace(/\s+/g, '');
    }

    const aetMatch = combinedStatusText.match(/AET\s*(\d+\s*[-–:]\s*\d+)/i);
    if (aetMatch) {
      aetScore = aetMatch[1].replace(/\s+/g, '');
    }

    // Check Live Indicators
    const liveMinEl = document.querySelector('.match_res_status.lmin_td, .lmin_mp, .live_min, .lsc_stat');
    const dataMinAttr = scoreBox?.getAttribute('data-minute');
    const liveMinText = clean(liveMinEl?.innerText) || dataMinAttr;

    let isLive = false;
    let matchStatus = 'Upcoming';
    let finalScore = '-';

    if (isCancelled) {
      isLive = false;
      matchStatus = lminSpecial || 'Cancelled';
      finalScore = '-';
    } else if (dataMinAttr && dataMinAttr !== '-' && dataMinAttr !== 'FT' && !isNaN(parseInt(dataMinAttr, 10))) {
      isLive = true;
      const cleanMin = dataMinAttr.replace(/'+$/, '').trim();
      matchStatus = `${cleanMin}' (Live)`;
      finalScore = validScore || '-';
    } else if (document.querySelector('.lscrlv, .live_score') !== null || (liveMinText && (liveMinText.includes("'") || liveMinText.includes('Live')))) {
      isLive = true;
      const cleanMin = liveMinText ? liveMinText.replace(/'+$/, '').trim() : 'Live';
      matchStatus = `${cleanMin} (Live)`;
      finalScore = validScore || '-';
    } else if (validScore) {
      // Valid finished match with score
      isLive = false;
      if (isPen) {
        matchStatus = penScore ? `Pen. ${penScore}` : 'Pen. FT';
      } else if (isAet) {
        matchStatus = aetScore ? `AET ${aetScore}` : 'AET FT';
      } else {
        matchStatus = 'FT';
      }
      finalScore = validScore;
    } else {
      // Upcoming match
      isLive = false;
      matchStatus = 'Upcoming';
      finalScore = '-';
    }

    if (isPen && !penScore) penScore = 'Yes';
    if (isAet && !aetScore) aetScore = 'Yes';

    // Extract Ranks
    let homeRank = clean(document.querySelector('div.lLogo .prrank, .homeTeam .prrank, .schema .home_rank, .schema .rank_home, .st_rank_home')?.innerText) || '-';
    let awayRank = clean(document.querySelector('div.rLogo .prrank, .awayTeam .prrank, .schema .away_rank, .schema .rank_away, .st_rank_away')?.innerText) || '-';

    // Extract Form Badges (Home & Away W/D/L)
    let homeForm = Array.from(document.querySelectorAll('div.lLogo .prformcont a, div.lLogo .prformcont span, .lLogo .prformcont a, .homeTeam .prformcont a, .homeTeam .prformcont span, .schema .form_home span, .schema .st_form_home span'))
      .map(el => clean(el.innerText))
      .filter(t => ['W', 'D', 'L'].includes(t));

    let awayForm = Array.from(document.querySelectorAll('div.rLogo .prformcont a, div.rLogo .prformcont span, .rLogo .prformcont a, .awayTeam .prformcont a, .awayTeam .prformcont span, .schema .form_away span, .schema .st_form_away span'))
      .map(el => clean(el.innerText))
      .filter(t => ['W', 'D', 'L'].includes(t));

    if (homeForm.length === 0 || awayForm.length === 0) {
      const prFormContainers = Array.from(document.querySelectorAll('.prformcont'));
      if (prFormContainers.length >= 1 && homeForm.length === 0) {
        homeForm = Array.from(prFormContainers[0].querySelectorAll('a, span, div'))
          .map(el => clean(el.innerText))
          .filter(t => ['W', 'D', 'L'].includes(t));
      }
      if (prFormContainers.length >= 2 && awayForm.length === 0) {
        awayForm = Array.from(prFormContainers[1].querySelectorAll('a, span, div'))
          .map(el => clean(el.innerText))
          .filter(t => ['W', 'D', 'L'].includes(t));
      }
    }

    // Weather
    const wNumsEl = document.querySelector('.prwth .wnums, .wnums, .schema .weather, .weather_pred, .st_weather');
    let weatherText = clean(wNumsEl?.innerText);
    if (!weatherText) {
      const wthDiv = document.querySelector('.prwth');
      weatherText = clean(wthDiv?.innerText);
    }

    // Venue / Stadium
    const venueEl = document.querySelector('.schema .st_venue, .st_stadium, .venue_name, .st_venue, .schema_h2h .st_stadium, .weather_main_pr');
    let venueText = clean(venueEl?.innerText);
    if (!venueText) {
      const allP = Array.from(document.querySelectorAll('.match_intro, .st_intro, .preview_text, p, div'));
      for (const p of allP) {
        const t = clean(p.innerText);
        const m = t.match(/^([^.]+?)\s+will be the setting as/i);
        if (m) {
          venueText = clean(m[1]);
          break;
        }
      }
    }

    return {
      country: country || 'Football',
      league: leagueName || 'Football League',
      leagueName: leagueName || 'Football League',
      leagueCode: shortTagCode || '',
      leagueFlag: leagueFlag || '',
      round: roundText || '',
      venue: venueText || '',
      stadium: venueText || '',
      matchDate: matchDate || '',
      matchTime: matchTime || '',
      homeTeam: homeTeam || 'Home Team',
      awayTeam: awayTeam || 'Away Team',
      homeCode: homeShort,
      awayCode: awayShort,
      homeShort: homeShort,
      awayShort: awayShort,
      homeLogo: homeLogo,
      awayLogo: awayLogo,
      isLive: isLive,
      weather: weatherText || '-',
      homeRank: homeRank,
      awayRank: awayRank,
      homeForm: homeForm,
      awayForm: awayForm,
      finalScore: isCancelled ? '-' : finalScore,
      score: isCancelled ? '-' : finalScore,
      htScore: htScore || '',
      aetScore: aetScore || '',
      penScore: penScore || '',
      result: {
        status: matchStatus,
        isLive: isLive,
        score: isCancelled ? '-' : finalScore,
        htScore: htScore || '',
        aetScore: aetScore || '',
        penScore: penScore || ''
      }
    };
  });
}

module.exports = { parseHero };
