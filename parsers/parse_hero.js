/**
 * ====================================================================
 * PARSER: STEP 1 - HERO, TAKIM BİLGİLERİ, LOGOLAR, FORMLAR, CANLI DURUM
 * ====================================================================
 */

async function parseHero(page) {
  return await page.evaluate(() => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // Extract League / Tournament
    const leagueEl = document.querySelector('.schema .short_tag, .schema a[href*="football-predictions"], .schema h1, .stat-bread a:last-child');
    const leagueText = clean(leagueEl?.innerText);

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

    // Extract Logos
    const logoImgs = Array.from(document.querySelectorAll('.schema img, .st_logo_box_img_container img'));
    let homeLogo = 'https://www.forebet.com/images/icons/blank-logo.png';
    let awayLogo = 'https://www.forebet.com/images/icons/blank-logo.png';

    if (logoImgs.length >= 2) {
      homeLogo = logoImgs[0].src;
      awayLogo = logoImgs[1].src;
    }

    // Extract Score & Status (Live / FT / Upcoming)
    const scoreBox = document.querySelector('.match_res, .lscr_td, .schema .score');
    const scoreEl = document.getElementById('evhdbte') || document.querySelector('.lscrsp .l_scr, .lscrsp, .match_res .l_scr');
    const rawScore = clean(scoreEl?.innerText);

    // Check Live Indicators
    const liveMinEl = document.querySelector('.match_res_status.lmin_td, .lmin_mp, .live_min, .lsc_stat');
    const isLiveElement = document.querySelector('.lscrlv, .blink_me, .live_score') !== null;
    const dataMinAttr = scoreBox?.getAttribute('data-minute');
    const liveMinText = clean(liveMinEl?.innerText) || dataMinAttr;

    let isLive = false;
    let matchStatus = 'Upcoming';
    let finalScore = '-';

    if (isLiveElement || liveMinText || (rawScore && (rawScore.includes('-') || rawScore.includes(':')) && !rawScore.includes('FT'))) {
      if (liveMinText) {
        isLive = true;
        matchStatus = `${liveMinText}' (Live)`;
        finalScore = rawScore || '-';
      }
    }

    // Check FT
    const ftStatusEl = document.querySelector('.lscr_td .l_scr, .ft-events__match-res, .lsc_stat');
    const ftText = clean(ftStatusEl?.innerText);
    if (ftText.includes('Full time') || ftText.includes('FT') || (scoreBox && scoreBox.innerText.includes('FT'))) {
      isLive = false;
      matchStatus = 'FT';
      finalScore = rawScore || '-';
    } else if (!isLive && rawScore && rawScore.includes('-') && !rawScore.includes('VS')) {
      matchStatus = 'FT';
      finalScore = rawScore;
    }

    // Extract Ranks
    const homeRankEl = document.querySelector('.schema .home_rank, .schema .rank_home');
    const awayRankEl = document.querySelector('.schema .away_rank, .schema .rank_away');
    const homeRank = clean(homeRankEl?.innerText) || '-';
    const awayRank = clean(awayRankEl?.innerText) || '-';

    // Extract Form Badges
    const homeFormSpans = Array.from(document.querySelectorAll('.schema .form_home span, .schema .st_form_home span'));
    const awayFormSpans = Array.from(document.querySelectorAll('.schema .form_away span, .schema .st_form_away span'));

    const homeForm = homeFormSpans.map(s => clean(s.innerText)).filter(Boolean);
    const awayForm = awayFormSpans.map(s => clean(s.innerText)).filter(Boolean);

    // Weather
    const weatherEl = document.querySelector('.schema .weather, .weather_pred, .st_weather');
    const weatherText = clean(weatherEl?.innerText);

    return {
      league: leagueText || 'Football League',
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
      homeForm: homeForm.length > 0 ? homeForm : ['W', 'D', 'L'],
      awayForm: awayForm.length > 0 ? awayForm : ['W', 'D', 'L'],
      finalScore: finalScore,
      score: finalScore !== '-' ? finalScore : (rawScore || '-'),
      result: {
        status: matchStatus,
        isLive: isLive,
        score: finalScore !== '-' ? finalScore : (rawScore || '-')
      }
    };
  });
}

module.exports = { parseHero };
