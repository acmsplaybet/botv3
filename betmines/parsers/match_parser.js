/**
 * ====================================================================
 * BETMINES - MATCH DOM PARSER
 * ====================================================================
 * Bu modül, Betmines sayfasında o an render edilmiş tüm maç satırlarını
 * saf ve temiz JSON formatına dönüştürür.
 */

function parseMatchesFromDOM(dateLabel = "Today") {
  const collected = new Map();
  let currentLeague = "Unknown League";
  let currentLeagueFlag = "";

  function cleanImgUrl(rawUrl) {
    if (!rawUrl) return "";
    let parts = rawUrl.split('https://');
    return parts.length > 1 ? 'https://' + parts[parts.length - 1] : rawUrl;
  }

  document.querySelectorAll('div.tw-flex-row, div.tw-grid').forEach(el => {
    // A. LİG TESPİTİ (Bayrak ve İsim)
    let leagueEl = el.querySelector('a[href*="/league/"]');
    if (leagueEl) {
      let textSpans = leagueEl.querySelectorAll('span.tw-text-bm-black');
      if (textSpans.length >= 3) {
        currentLeague = textSpans[0].innerText.trim() + " - " + textSpans[2].innerText.trim();
      }
      let flagImg = el.querySelector('img');
      if (flagImg) currentLeagueFlag = cleanImgUrl(flagImg.src);
      return; // Lig satırıysa alt adıma inme
    }

    // B. MAÇ TESPİTİ
    let matchLink = el.querySelector('a[href*="/matches/"]');
    if (matchLink) {
      let teams = el.querySelectorAll('p.tw-text-bm-black');
      if (teams.length >= 2) {
        let home = teams[0].innerText.trim();
        let away = teams[1].innerText.trim();
        let key = home + "|" + away;

        if (["Tools", "Predictions"].some(x => home.includes(x))) return;

        // Benzersiz Maç ID Çekimi (URL sonundaki sayı)
        let matchId = "";
        let href = matchLink.getAttribute('href');
        if (href) {
          let idMatch = href.match(/[-_](\d+)$/) || href.match(/\/(\d+)$/);
          if (idMatch) {
            matchId = idMatch[1];
          }
        }
        if (!matchId) {
          matchId = (home + "_" + away + "_" + dateLabel).replace(/\s+/g, "");
        }

        // Takım Logoları
        let imgs = el.querySelectorAll('img.tw-rounded-full');
        let homeLogo = imgs.length >= 1 ? cleanImgUrl(imgs[0].src) : "";
        let awayLogo = imgs.length >= 2 ? cleanImgUrl(imgs[1].src) : "";

        // Dakika, Saat ve Canlı Skoru
        let minuteEl = el.querySelector('p.tw-text-bm-live-text');
        let timeEl = el.querySelector('.tw-text-bm-gray-font.tw-text-xs, .tw-text-bm-gray-font-2.tw-text-xs');
        let matchTime = timeEl ? timeEl.innerText.trim() : "";
        let liveMinute = minuteEl ? minuteEl.innerText.replace("'", "").trim() : "";
        let isLive = minuteEl && minuteEl.querySelector('.tw-animate-ping') !== null;

        // Skor (Canlı veya FT)
        let scoreDivs = el.querySelectorAll('div.tw-text-bm-red');
        let score = "vs";
        if (scoreDivs.length >= 2) {
          score = scoreDivs[0].innerText.trim() + "-" + scoreDivs[1].innerText.trim();
        } else {
          let blackScores = el.querySelectorAll('div.tw-text-bm-black');
          if (blackScores.length >= 2 && blackScores[0].innerText !== "") {
            score = blackScores[0].innerText.trim() + "-" + blackScores[1].innerText.trim();
          } else {
            let whiteScores = el.querySelectorAll('div.tw-text-white, div.tw-text-bm-white');
            if (whiteScores.length >= 2 && whiteScores[0].innerText !== "") {
              score = whiteScores[0].innerText.trim() + "-" + whiteScores[1].innerText.trim();
            }
          }
        }

        // Tahmin ve Oran
        let probEl = el.querySelector('p.tw-text-bm-gray-font-4.tw-font-bold');
        let prob = probEl && probEl.innerText.includes('%') ? probEl.innerText : "0%";
        let oddMatch = el.innerText.match(/\d+\.\d{2}/g);
        let odd = oddMatch ? oddMatch.pop() : "0.00";
        let tipElements = Array.from(el.querySelectorAll('p[class*="tw-text-bm-"]')).filter(p => p.innerText.length < 15 && !p.innerText.includes('%'));
        let tip = tipElements.length > 0 ? tipElements[tipElements.length - 1].innerText.trim() : "N/A";

        let status = 'Waiting';
        let result = "PENDING";

        let isCanceledOrPostponed = false;
        let cancelReason = '';
        let scoreAbbr = 'POSTP';
        let upperTime = matchTime.trim().toUpperCase();

        if (upperTime === 'ABAN') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'ABAN'; }
        else if (upperTime === 'CANCL') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'CANCL'; }
        else if (upperTime === 'POSTP') { isCanceledOrPostponed = true; cancelReason = 'Postponed'; scoreAbbr = 'POSTP'; }
        else if (upperTime === 'AWAR') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'AWAR'; }
        else if (upperTime === 'AU') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'SUSP'; }
        else if (upperTime === 'INT') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'INT'; }

        let isPlaying = isLive || minuteEl !== null || upperTime.includes('HT') || upperTime.includes('HALF') || /^\d+[']?$/.test(upperTime);

        if (isCanceledOrPostponed) {
          status = cancelReason;
          result = 'POSTPONED';
          score = scoreAbbr;
        } else if (isPlaying) {
          status = 'LIVE';
          score = score !== 'vs' ? score : 'vs';
          result = 'PENDING';
        } else if (upperTime.includes('AET') || upperTime.includes('PEN')) {
          status = 'Finished (AET)';
        } else if (upperTime.includes('FT') || upperTime.includes('FINISHED')) {
          status = 'Finished';
        } else {
          status = 'Waiting';
          result = 'PENDING';
        }

        if (!isCanceledOrPostponed && !isPlaying) {
          let rowContainer = el.closest('.tw-bg-bm-white') || el;
          let rowHtml = rowContainer.outerHTML;
          if (rowHtml.includes('bm-green')) {
            result = 'WIN';
            status = 'Finished';
          } else if (rowHtml.includes('bm-red')) {
            result = 'LOSE';
            status = 'Finished';
          }
        }

        if (!collected.has(key)) {
          collected.set(key, {
            match_id: matchId,
            date_label: dateLabel,
            league: currentLeague,
            league_flag: currentLeagueFlag,
            home: home,
            home_logo: homeLogo,
            away: away,
            away_logo: awayLogo,
            score: score,
            minute: liveMinute,
            time: matchTime,
            prob: prob,
            tip: tip,
            odd: odd,
            status: status,
            result: result
          });
        }
      }
    }
  });

  return Array.from(collected.values());
}

module.exports = {
  parseMatchesFromDOM
};
