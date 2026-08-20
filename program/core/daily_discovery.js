/**
 * ====================================================================
 * BPA V3 - FOREBET DAILY MATCH DISCOVERY & QUEUE BUILDER
 * ====================================================================
 * Navigates to /predictions-1x2/{DATE}, clicks 'More' to reveal all
 * matches, extracts league flag/short tag/name, and filters ONLY
 * matches with valid odds.
 */

const { createBrowser, setupPageInterception, navigateWithRetry } = require('./browser_engine.js');

/**
 * Discovers and filters all matches with odds for a given date.
 * @param {string} dateStr Format: 'YYYY-MM-DD' (e.g. '2026-08-19')
 * @param {Object} options Configuration options
 * @param {Function} [options.logger] Optional logger callback
 * @param {boolean} [options.headless] Headless mode flag
 * @returns {Promise<Object>} Summary and list of filtered match objects
 */
async function discoverDailyMatches(dateStr, options = {}) {
  const logger = options.logger || console.log;
  const headless = options.headless !== undefined ? options.headless : 'new';
  
  // Format URL: if no date provided, use default predictions-1x2
  let targetUrl = 'https://www.forebet.com/en/football-predictions/predictions-1x2';
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    targetUrl += `/${dateStr}`;
  }

  logger(`[Keşif] 🌐 Tarih sayfası açılıyor: ${targetUrl}`);

  const browser = await createBrowser({ headless });
  const page = await browser.newPage();
  await setupPageInterception(page);

  try {
    await navigateWithRetry(page, targetUrl, logger, 5, 35000);

    // 1. Click 'More' button repeatedly until all matches are loaded
    logger(`[Keşif] 🔄 'More' butonu taranıyor ve tüm günün maçları açılıyor...`);
    let moreClickedCount = 0;
    const maxMoreClicks = 35; // Safety guard for days with 300+ matches

    while (moreClickedCount < maxMoreClicks) {
      const moreVisible = await page.evaluate(() => {
        const mrows = document.getElementById('mrows');
        if (!mrows) return false;
        const span = mrows.querySelector('span');
        if (!span) return false;
        
        // Check if button is visible and not loading
        const style = window.getComputedStyle(mrows);
        if (style.display === 'none' || style.visibility === 'hidden' || mrows.offsetHeight === 0) return false;
        
        // Click it
        span.click();
        return true;
      });

      if (!moreVisible) {
        break; // No more button or reached end of list
      }

      moreClickedCount++;
      logger(`[Keşif] ⏳ 'More' tıklandı (#${moreClickedCount}), yeni maçlar yükleniyor...`);
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 600));

      // Scroll to trigger dynamic lazy content if needed
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(r => setTimeout(r, 400));
    }

    logger(`[Keşif] ✅ Tüm liste açıldı (Toplam ${moreClickedCount} kez 'More' tıklandı).`);

    // 2. Parse all match rows from the DOM
    const rawMatches = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.schema .rcnt'));
      
      return rows.map((r, index) => {
        // Link & URL
        const linkEl = r.querySelector('a.tnmscn, a[href*="/football/matches/"], a[href*="/predictions-predictions-"]');
        const href = linkEl ? linkEl.href : '';
        
        // Extract matchId
        let matchId = null;
        if (href) {
          const match = href.match(/-(\d+)$/);
          if (match) matchId = parseInt(match[1], 10);
        }
        if (!matchId) {
          const favIcon = r.querySelector('.fav_icon, [id]');
          if (favIcon && /^\d+$/.test(favIcon.id)) {
            matchId = parseInt(favIcon.id, 10);
          }
        }

        // Teams
        const homeEl = r.querySelector('.homeTeam, .home_team, [itemprop="homeTeam"]');
        const awayEl = r.querySelector('.awayTeam, .away_team, [itemprop="awayTeam"]');
        const homeTeam = homeEl ? (homeEl.innerText || '').trim() : '';
        const awayTeam = awayEl ? (awayEl.innerText || '').trim() : '';

        // Date & Time
        const dateEl = r.querySelector('.date_bah, time');
        const rawDateTime = dateEl ? (dateEl.innerText || '').trim() : '';

        // League Flag & Short Tag & Name
        const flagImg = r.querySelector('.shortagDiv img.flsc, img.flsc');
        let leagueFlag = '';
        let leagueNameFromClick = '';
        let leagueShortTag = '';

        if (flagImg) {
          leagueFlag = flagImg.src || '';
          const onclickAttr = flagImg.getAttribute('onclick') || '';
          // getstag(this,2518713,'','Champions League','predictions-europe/uefa-champions-league','13')
          const onclickMatch = onclickAttr.match(/getstag\([^,]+,[^,]+,[^,]*,'([^']+)'/i);
          if (onclickMatch && onclickMatch[1]) {
            leagueNameFromClick = onclickMatch[1].trim();
          }
        }

        const tagEl = r.querySelector('.shortTag, .shortagDiv span');
        if (tagEl) {
          leagueShortTag = (tagEl.innerText || '').trim();
        }

        // Prediction & Probabilities
        const fprEls = Array.from(r.querySelectorAll('.fprc span, .fpr'));
        const probs = fprEls.map(s => (s.innerText || '').trim()).filter(Boolean);
        const predEl = r.querySelector('.predict .forepr span, .predict, .fore_sc');
        const prediction = predEl ? (predEl.innerText || '').trim() : '';
        const scorePredEl = r.querySelector('.scrmobpred, .ex_sc');
        const predictedScore = scorePredEl ? (scorePredEl.innerText || '').trim() : '';

        // Odd (Oran)
        // Primary location: .bigOnly.prmod .lscrsp or .prmod span
        const oddEl = r.querySelector('.bigOnly.prmod .lscrsp, .prmod .lscrsp, .lodd, .odd, .podd');
        let oddText = oddEl ? (oddEl.innerText || '').trim() : '';
        
        let numericOdd = null;
        if (oddText && oddText !== '-' && !isNaN(parseFloat(oddText))) {
          numericOdd = parseFloat(oddText);
        }

        // Extra odds breakdown (1, X, 2)
        const haoddSpans = Array.from(r.querySelectorAll('.haodd span')).map(s => (s.innerText || '').trim());
        let odds1x2 = { 1: null, X: null, 2: null };
        if (haoddSpans.length >= 3) {
          odds1x2 = {
            1: !isNaN(parseFloat(haoddSpans[0])) ? parseFloat(haoddSpans[0]) : null,
            X: !isNaN(parseFloat(haoddSpans[1])) ? parseFloat(haoddSpans[1]) : null,
            2: !isNaN(parseFloat(haoddSpans[2])) ? parseFloat(haoddSpans[2]) : null
          };
        }

        return {
          row_index: index,
          match_id: matchId,
          url: href,
          home_team: homeTeam,
          away_team: awayTeam,
          raw_datetime: rawDateTime,
          league: {
            flag_url: leagueFlag,
            short_tag: leagueShortTag,
            name_hint: leagueNameFromClick
          },
          prediction: {
            pick: prediction,
            correct_score: predictedScore,
            probs: probs,
            primary_odd: numericOdd,
            odds_1x2: odds1x2
          },
          has_valid_odd: (numericOdd !== null && numericOdd > 1.0) || (odds1x2[1] !== null && odds1x2[1] > 1.0)
        };
      });
    });

    await browser.close();

    // 3. Filter ONLY matches with valid odds and valid URLs
    const totalFound = rawMatches.length;
    const quotedMatches = rawMatches.filter(m => m.has_valid_odd && m.url && m.match_id);

    logger(`[Keşif] 📊 İstatistik: Toplam ${totalFound} maç bulundu, ${quotedMatches.length} tanesinin ORANI MEVCUT.`);

    return {
      date: dateStr || new Date().toISOString().split('T')[0],
      total_matches_in_list: totalFound,
      quoted_count: quotedMatches.length,
      unquoted_count: totalFound - quotedMatches.length,
      matches: quotedMatches
    };

  } catch (err) {
    logger(`[Keşif] ❌ Keşif hatası: ${err.message}`);
    throw err;
  } finally {
    if (browser) {
      try {
        const { closeBrowser } = require('./browser_engine');
        await closeBrowser(browser);
      } catch (e) {
        try { await browser.close(); } catch (_) {}
      }
    }
  }
}

module.exports = {
  discoverDailyMatches
};
