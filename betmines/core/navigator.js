/**
 * ====================================================================
 * BETMINES - NAVIGATOR & SMART SCROLLER
 * ====================================================================
 */

const { parseMatchesFromDOM } = require('../parsers/match_parser');

function delay(min, max) {
  const ms = max ? Math.floor(Math.random() * (max - min + 1)) + min : min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(d) {
  let day = String(d.getDate()).padStart(2, '0');
  let month = String(d.getMonth() + 1).padStart(2, '0');
  let year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

async function smartScrollAndParse(page, dateString = "Today", logger = console.log) {
  const localMatchesMap = new Map();

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await delay(1500, 2500);

  let totalHeight = await page.evaluate(() => document.body.scrollHeight);
  let currentPos = 0;

  logger(`[Scroller] 📜 Sayfa taranıyor (${dateString}). Toplam yükseklik: ${totalHeight}px`);

  while (currentPos <= totalHeight) {
    const step = Math.floor(Math.random() * (1100 - 600 + 1)) + 600;
    currentPos += step;

    await page.evaluate((pos) => window.scrollTo({ top: pos, behavior: 'smooth' }), currentPos);
    await delay(800, 1500);

    const matches = await page.evaluate(parseMatchesFromDOM, dateString);
    if (Array.isArray(matches)) {
      for (const m of matches) {
        localMatchesMap.set(m.home + "|" + m.away, m);
      }
    }

    const pageInfo = await page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      offset: window.pageYOffset + window.innerHeight
    }));

    totalHeight = pageInfo.scrollHeight;
    if (pageInfo.offset >= totalHeight - 15) {
      const finalMatches = await page.evaluate(parseMatchesFromDOM, dateString);
      if (Array.isArray(finalMatches)) {
        for (const m of finalMatches) {
          localMatchesMap.set(m.home + "|" + m.away, m);
        }
      }
      break;
    }
  }

  logger(`[Scroller] ✅ Tarama tamamlandı. Bulunan maç: ${localMatchesMap.size}`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await delay(1000, 1800);

  return Array.from(localMatchesMap.values());
}

async function getAvailableDateTabs(page) {
  return await page.evaluate(() => {
    const dateBar = document.querySelector('div.tw-bg-bm-white.\\!tw-rounded-\\[4px\\]') || document.querySelector('div[class*="from-bm-primary-from"]');
    if (!dateBar) return null;

    const buttons = Array.from(dateBar.querySelectorAll('.tw-cursor-pointer')).filter(b => !b.innerText.includes("Live"));
    const today = new Date();
    const todayDay = today.getDate();

    let todayIdx = buttons.findIndex(b => {
      let numMatch = b.innerText.match(/\d+/);
      if (numMatch) return parseInt(numMatch[0]) === todayDay;
      return b.innerText.includes("Today") || b.innerText.includes("Bugün") || b.innerText.includes("Bug");
    });

    if (todayIdx === -1) {
      todayIdx = buttons.findIndex(b => b.innerText.includes("Today") || b.querySelector('.tw-text-bm-primary-from'));
    }

    return {
      total: buttons.length,
      todayIdx: todayIdx
    };
  });
}

async function clickDateTabByIndex(page, index, logger = console.log) {
  return await page.evaluate((idx) => {
    const dateBar = document.querySelector('div.tw-bg-bm-white.\\!tw-rounded-\\[4px\\]') || document.querySelector('div[class*="from-bm-primary-from"]');
    if (!dateBar) return false;
    const buttons = Array.from(dateBar.querySelectorAll('.tw-cursor-pointer')).filter(b => !b.innerText.includes("Live"));
    if (buttons[idx]) {
      buttons[idx].click();
      return true;
    }
    return false;
  }, index);
}

async function toggleLiveFilter(page, logger = console.log) {
  return await page.evaluate(() => {
    let liveBtn = document.querySelector('.tw-bg-bm-light-red') || Array.from(document.querySelectorAll('p')).find(p => p.innerText === "Live")?.parentElement;
    if (liveBtn) {
      const isAlreadyActive = liveBtn.classList.contains('tw-bg-bm-light-red');
      if (!isAlreadyActive) {
        liveBtn.click();
        return { clicked: true, wasActive: false };
      }
      return { clicked: false, wasActive: true };
    }
    return { clicked: false, notFound: true };
  });
}

module.exports = {
  delay,
  formatDate,
  smartScrollAndParse,
  getAvailableDateTabs,
  clickDateTabByIndex,
  toggleLiveFilter
};
