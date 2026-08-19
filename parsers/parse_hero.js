/**
 * ====================================================================
 * PARSER: STEP 1 - MATCH HERO & TEAMS & REAL FORMS & VENUE & WEATHER
 * ====================================================================
 */

async function parseHero(page) {
  let htFromEvents = '';
  return await page.evaluate((htScoreFromEvents) => {
    const clean = s => s ? s.replace(/\s+/g, ' ').trim() : '';

    // 1. Teams from itemprop or H1 or short tags
    let homeTeam = clean(document.querySelector('span[itemprop="homeTeam"] span[itemprop="name"]')?.innerText) ||
                   clean(document.querySelector('.homeTeam span[itemprop="name"]')?.innerText) ||
                   clean(document.querySelector('.st_hteam')?.innerText);

    let awayTeam = clean(document.querySelector('span[itemprop="awayTeam"] span[itemprop="name"]')?.innerText) ||
                   clean(document.querySelector('.awayTeam span[itemprop="name"]')?.innerText) ||
                   clean(document.querySelector('.st_ateam')?.innerText);

    // Fallback from title
    if (!homeTeam || !awayTeam) {
      const rawTitle = document.title;
      const cleanedTitle = rawTitle.split(/Prediction|Stats|H2H|\–|\-/i)[0].trim();
      const vsMatch = cleanedTitle.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s*(?:vs|v|\-)\s*([A-Za-zÇĞİÖŞÜçğıöşü\s]+)/i);
      if (vsMatch) {
        if (!homeTeam) homeTeam = vsMatch[1].trim();
        if (!awayTeam) awayTeam = vsMatch[2].trim();
      }
    }

    // Short Codes (Dynamic from first 3 letters or known teams)
    const getCode = (t) => {
      if (!t) return 'XXX';
      const low = t.toLowerCase();
      if (low.includes('başakşehir') || low.includes('basaksehir')) return 'BAS';
      if (low.includes('kocaelispor')) return 'KOC';
      if (low.includes('kasımpaşa') || low.includes('kasimpasa')) return 'KAS';
      if (low.includes('trabzon')) return 'TRA';
      if (low.includes('beşiktaş') || low.includes('besiktas')) return 'BJK';
      if (low.includes('eyüp') || low.includes('eyup')) return 'EYU';
      if (low.includes('galatasaray')) return 'GAL';
      if (low.includes('fenerbahçe') || low.includes('fenerbahce')) return 'FB';
      return t.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    };

    const homeCode = getCode(homeTeam);
    const awayCode = getCode(awayTeam);

    // Logos
    const homeLogoEl = document.querySelector('.lLogo img.matchTLogo, .st_hteam img, img[alt*="' + homeTeam + '"]');
    const awayLogoEl = document.querySelector('.rLogo img.matchTLogo, .st_ateam img, img[alt*="' + awayTeam + '"]');

    const homeLogo = homeLogoEl ? homeLogoEl.src : 'https://www.forebet.com/images/icons/645.png';
    const awayLogo = awayLogoEl ? awayLogoEl.src : 'https://www.forebet.com/images/icons/674.png';

    // League & Country & Round (100% Dynamic & Match-Scoped)
    let country = '';
    let rawLeague = '';
    let leagueName = '';

    // 1. Primary: Exact match flag getstag onclick (e.g. getstag(this, 2494867, 'Malta', 'Premier League', ...))
    const stagImg = document.querySelector('.rcnt .shortagDiv img, .shortagDiv img, .flsc, img[onclick*="getstag"]');
    if (stagImg && stagImg.getAttribute('onclick')) {
      const m = stagImg.getAttribute('onclick').match(/getstag\s*\(\s*this\s*,\s*\d+\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
      if (m) {
        country = m[1].trim();
        rawLeague = m[2].trim();
      }
    }

    // 2. Secondary: If not found, walk left menu items in order to find active league and its country header
    if (!country || !rawLeague) {
      const activeMenu = document.querySelector('#active_menu_foremenu, .sublevel_foremenu#active_menu_foremenu');
      if (activeMenu) {
        if (!rawLeague) rawLeague = clean(activeMenu.innerText);
        const allNavs = Array.from(document.querySelectorAll('.mainlevel_foremenu, .sublevel_foremenu'));
        const activeIdx = allNavs.indexOf(activeMenu);
        for (let i = activeIdx - 1; i >= 0; i--) {
          if (allNavs[i].classList.contains('mainlevel_foremenu')) {
            country = clean(allNavs[i].innerText);
            break;
          }
        }
      }
    }

    // Fallbacks
    if (!country) country = 'International';
    if (!rawLeague) rawLeague = clean(document.querySelector('.shortTag')?.innerText) || 'League';

    if (rawLeague.toLowerCase().includes(country.toLowerCase()) || country === 'International') {
      leagueName = rawLeague;
    } else {
      leagueName = `${country} ${rawLeague}`;
    }

    // 3. Dynamic Round extraction (e.g. "Round 1, Apertura", "Round 2", "Round 5, Regular Season")
    const headingEl = document.querySelector('.heading, .schema .heading, .rcnt_wrap .heading, .hdrtb + .heading');
    let round = headingEl ? clean(headingEl.innerText) : 'Regular Season';

    // 4. Score, Status, FT, HT, AET, Pen Score extraction
    let status = 'Upcoming';
    let score = '-';
    let ftScore = '-';
    let htScore = '';
    let aetScore = '';
    let penScore = '';

    // Scope score strictly to the match hero container
    const heroScope = document.querySelector('.predictioncontain, [itemtype*="SportsEvent"]') || document.querySelector('.schema');
    const resEl = heroScope ? heroScope.querySelector('.match_res') : null;
    const lminEl = heroScope ? heroScope.querySelector('.match_res .lmin_mp, .match_res_status') : null;
    const lscrEl = heroScope ? heroScope.querySelector('.match_res .lscrsp, .match_res .l_scr') : null;

    // POSTP / CANCL tespiti: Score sütunu (.ex_sc.tabonly) headless'ta görünmez olabilir.
    // textContent kullanarak hidden elementleri de tarıyoruz.
    let matchStatusText = '';
    // 1. .lmin_mp veya .l_min elementi
    const allLMinEls = document.querySelectorAll('.l_min, span.l_min, .lmin, .lmin_mp');
    for (const el of allLMinEls) {
      const t = (el.textContent || '').trim();
      if (/postp|postponed|cancl|cancelled/i.test(t) && t.length < 20) {
        matchStatusText = t; break;
      }
    }
    // 2. rcnt.tr_0 içindeki tüm leaf elementler (textContent ile - hidden dahil)
    if (!matchStatusText) {
      const rowEls = document.querySelectorAll('div.rcnt, div[class*="rcnt"], .predblocktd');
      for (const container of rowEls) {
        const leafs = container.querySelectorAll('*');
        for (const el of leafs) {
          if (el.childElementCount === 0) {
            const t = (el.textContent || '').trim();
            if (/^(postp\.?|postponed|cancl\.?|cancelled)$/i.test(t)) {
              matchStatusText = t; break;
            }
          }
        }
        if (matchStatusText) break;
      }
    }

    // POSTP/CANCL: .match_res yoksa tespit edilen status text'ini uygula
    if (!resEl && !lscrEl && matchStatusText) {
      if (/postp|postponed/i.test(matchStatusText)) {
        status = 'POSTP.'; score = 'POSTP.'; ftScore = 'POSTP.';
      } else if (/cancl|cancelled/i.test(matchStatusText)) {
        status = 'CANCL.'; score = 'CANCL.'; ftScore = 'CANCL.';
      }
    }

    if (resEl || lscrEl) {
      const fullScoreText = clean(`${resEl?.innerText || ''} ${lminEl?.innerText || ''} ${lscrEl?.innerText || ''}`);

      if (/postp|postponed/i.test(fullScoreText)) {
        status = 'POSTP.';
        score = 'POSTP.';
        ftScore = 'POSTP.';
      } else if (/cancl|cancelled|canc/i.test(fullScoreText)) {
        status = 'CANCL.';
        score = 'CANCL.';
        ftScore = 'CANCL.';
      } else if (/pen/i.test(fullScoreText)) {
        status = 'PEN.';
      } else if (/aet/i.test(fullScoreText)) {
        status = 'AET';
      } else if (/ft/i.test(fullScoreText)) {
        status = 'FT';
      } else if (/live|'\d+/i.test(fullScoreText)) {
        status = 'LIVE';
      }

      // HT skoru: events popup'tan geçti (htScoreFromEvents), yoksa fullScoreText'te ara
      if (htScoreFromEvents) {
        htScore = htScoreFromEvents;
      } else {
        const htMatch = fullScoreText.match(/\(\s*(\d+\s*-\s*\d+)\s*\)/);
        if (htMatch) htScore = htMatch[1].replace(/\s+/g, ' ').trim();
      }

      // Penalty skoru (örn: Pen. 1-3 veya Pen: 1-3)
      const penMatch = fullScoreText.match(/pen\.?\s*:?\s*(\d+\s*-\s*\d+)/i);
      if (penMatch) {
        penScore = penMatch[1].replace(/\s+/g, ' ').trim();
      }

      // AET skoru (örn: AET 1-2)
      const aetMatch = fullScoreText.match(/aet\.?\s*:?\s*(\d+\s*-\s*\d+)/i);
      if (aetMatch) {
        aetScore = aetMatch[1].replace(/\s+/g, ' ').trim();
      }

      // Ana FT skoru: .match_res > .l_scr veya .lscrsp
      const mainScoreEl = heroScope.querySelector('.match_res .l_scr, .match_res .lscrsp');
      if (mainScoreEl) {
        const s = clean(mainScoreEl.innerText);
        if (/\d+\s*-\s*\d+/.test(s)) {
          ftScore = s.replace(/\s+/g, ' ').trim();
          score = ftScore;
          if (status === 'Upcoming') status = 'FT';
        }
      }
    } else if (status === 'Upcoming') {
      // Sadece daha önce set edilmediyse Upcoming'e dön (CANCL/POSTP ezilmesin)
      score = '-';
      ftScore = '-';
    }

    // Venue
    const venueEl = document.querySelector('.weather_main_pr span[itemprop="name address"], span[itemprop="location"] [itemprop="name address"]');
    const venue = venueEl ? clean(venueEl.innerText) : 'Stadyum';

    // Weather (Extract temperature directly from wnums or img.wthc next sibling)
    let weather = '';
    const wNumEl = document.querySelector('.weather_main_pr .wnums, .wnums');
    if (wNumEl) {
      weather = clean(wNumEl.innerText);
    } else {
      const wImg = document.querySelector('.weather_main_pr img.wthc');
      if (wImg && wImg.nextElementSibling) {
        weather = clean(wImg.nextElementSibling.innerText);
      }
    }
    if (!weather || !weather.includes('°')) {
      const allSpans = Array.from(document.querySelectorAll('.weather_main_pr span'));
      const degSpan = allSpans.find(s => s.innerText.includes('°'));
      weather = degSpan ? clean(degSpan.innerText) : '26°';
    }

    // Date & Time
    const dateEl = document.querySelector('.date_bah, time[itemprop="startDate"]');
    let matchDate = dateEl ? clean(dateEl.innerText) : '';

    // Form Series (Exact Real Form Badges from .lLogo / .rLogo)
    const getBadgeLetter = (el) => {
      if (!el) return null;
      const cls = (el.className || '').toLowerCase();
      const txt = clean(el.innerText).toUpperCase();
      if (cls.includes('form_w') || txt === 'W') return 'W';
      if (cls.includes('form_d') || txt === 'D') return 'D';
      if (cls.includes('form_l') || txt === 'L') return 'L';
      return null;
    };

    const lLogo = document.querySelector('.lLogo');
    const rLogo = document.querySelector('.rLogo');

    const homeForm = lLogo
      ? Array.from(lLogo.querySelectorAll('.prformcont span')).map(getBadgeLetter).filter(Boolean).slice(0, 6)
      : [];
    const awayForm = rLogo
      ? Array.from(rLogo.querySelectorAll('.prformcont span')).map(getBadgeLetter).filter(Boolean).slice(0, 6)
      : [];

    // Team Ranks / Places in Hero (e.g. "2nd place", "4th place", "1st place")
    let homeRank = '';
    let awayRank = '';

    const homePlaceEl = document.querySelector('.lLogo .st_place, .lLogo .team_rank, .lLogo .pos_rank, .st_hteam_rank, .lLogo ~ .st_place');
    const awayPlaceEl = document.querySelector('.rLogo .st_place, .rLogo .team_rank, .rLogo .pos_rank, .st_ateam_rank, .rLogo ~ .st_place');

    if (homePlaceEl) homeRank = clean(homePlaceEl.innerText);
    if (awayPlaceEl) awayRank = clean(awayPlaceEl.innerText);

    if (!homeRank || !awayRank) {
      const allPlaceEls = Array.from(document.querySelectorAll('.st_place, .team_pos, .pos_rank, span, div')).filter(el => {
        return /^\d+(?:st|nd|rd|th)\s+place$/i.test(clean(el.innerText));
      });
      if (allPlaceEls.length >= 2) {
        if (!homeRank) homeRank = clean(allPlaceEls[0].innerText);
        if (!awayRank) awayRank = clean(allPlaceEls[1].innerText);
      }
    }

    return {
      homeTeam,
      awayTeam,
      homeCode,
      awayCode,
      homeLogo,
      awayLogo,
      league: leagueName,
      leagueName,
      country,
      round,
      matchDate,
      stadium: venue,
      weather,
      weatherIcon: '',
      status,
      score,
      finalScore: score,
      ftScore,
      htScore,
      result: {
        status,
        score,
        ftScore,
        htScore,
        aetScore,
        penScore
      },
      homeForm,
      awayForm,
      homeRank,
      awayRank
    };
  }, htFromEvents);
}

module.exports = { parseHero };
