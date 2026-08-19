const puppeteer = require('puppeteer');

async function testH2H(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await new Promise(r => setTimeout(r, 4000));

  const data = await page.evaluate(() => {
    const clean = (str) => (str || '').replace(/\s+/g, ' ').trim();

    // 1. Hero Forms
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
    const homeForm = lLogo ? Array.from(lLogo.querySelectorAll('.prformcont span')).map(getBadgeLetter).filter(Boolean).slice(0, 6) : [];
    const awayForm = rLogo ? Array.from(rLogo.querySelectorAll('.prformcont span')).map(getBadgeLetter).filter(Boolean).slice(0, 6) : [];

    // 2. H2H Module
    const h2hModule = Array.from(document.querySelectorAll('.moduletable')).find(m => {
      const txt = clean(m.querySelector('.mptlt')?.innerText);
      return txt.toLowerCase().includes('head to head');
    });

    const availableLeagues = [];
    const leagueMap = {}; // id -> name

    if (h2hModule) {
      // Find tabs in .tabs-ul or .st_lgs
      const tabLis = h2hModule.querySelectorAll('.tabs-ul li, .tbl_head.st_lgs li');
      tabLis.forEach(li => {
        const name = clean(li.querySelector('button, a, span')?.innerText || li.innerText);
        const cls = li.className || '';
        const matchId = cls.match(/lg_(-?\d+)/);
        const id = matchId ? matchId[1] : null;
        if (name) {
          if (!availableLeagues.includes(name)) availableLeagues.push(name);
          if (id) leagueMap[id] = name;
        }
      });
    }

    if (availableLeagues.length === 0) availableLeagues.push('All');

    const matches = [];
    if (h2hModule) {
      const rows = h2hModule.querySelectorAll('.st_row');
      rows.forEach(r => {
        const dateDivs = r.querySelector('.st_date')?.querySelectorAll('div') || [];
        const dateStr = Array.from(dateDivs).map(d => clean(d.innerText)).filter(Boolean).join(' ') || clean(r.querySelector('.st_date')?.innerText);
        const home = clean(r.querySelector('.st_hteam')?.innerText);
        const away = clean(r.querySelector('.st_ateam')?.innerText);
        const resText = clean(r.querySelector('.st_res')?.innerText);
        const htText = clean(r.querySelector('.st_htscr')?.innerText).replace(/[()]/g, '');
        const lgs = clean(r.querySelector('.st_ltag, .shortTag')?.innerText) || 'League';

        // Determine league name from row class (e.g. stlg_97 -> leagueMap['97'])
        const rCls = r.className || '';
        const matchLg = rCls.match(/stlg_(-?\d+)/);
        const lgId = matchLg ? matchLg[1] : null;
        const leagueFull = (lgId && leagueMap[lgId]) ? leagueMap[lgId] : lgs;

        if (home && away && resText) {
          matches.push({
            date: dateStr,
            home,
            score: resText,
            htScore: htText,
            away,
            league: lgs,
            leagueFull,
            leagueId: lgId
          });
        }
      });
    }

    return { homeForm, awayForm, availableLeagues, leagueMap, matchCount: matches.length, first6: matches.slice(0, 6) };
  });

  console.log(`URL: ${url}`);
  console.log('Result:', JSON.stringify(data, null, 2));

  await browser.close();
}

async function main() {
  await testH2H('https://www.forebet.com/en/football/matches/fc-biel-bienne-fc-aarau-2511459');
  await testH2H('https://www.forebet.com/en/football/matches/v%C3%A9lez-s%C3%A1rsfield-defensa-y-justicia-2417426');
}

main().catch(console.error);
