/**
 * ====================================================================
 * PARSER: Straight Line Distance & Stadium Geography (BPA V3)
 * ====================================================================
 * Extracts:
 * - Straight line distance between home stadium and away location (e.g. "3900km", 3900)
 * - Home City, Home Country, Home Stadium name
 * - Away City, Away Country, Away Origin name
 * - Team short codes and logo URLs in the distance widget
 * ====================================================================
 */

async function parseDistance(page, heroOrHome = '', heroAway = '') {
  try {
    let hTeam = '';
    let aTeam = '';
    let hCode = '';
    let aCode = '';
    let hLogo = '';
    let aLogo = '';

    if (typeof heroOrHome === 'object' && heroOrHome !== null) {
      hTeam = heroOrHome.homeTeam || '';
      aTeam = heroOrHome.awayTeam || '';
      hCode = heroOrHome.homeCode || heroOrHome.homeShort || '';
      aCode = heroOrHome.awayCode || heroOrHome.awayShort || '';
      hLogo = heroOrHome.homeLogo || '';
      aLogo = heroOrHome.awayLogo || '';
    } else {
      hTeam = String(heroOrHome || '');
      aTeam = String(heroAway || '');
    }

    const data = await page.evaluate((hTeamVal, aTeamVal, hCodeVal, aCodeVal, hLogoVal, aLogoVal) => {
      const clean = (str) => (str || '').replace(/\s+/g, ' ').trim();

      // Strictly target .dist_cnt or container with "Straight line distance" (NOT .st_dstc which is H2H distribution bar!)
      const distModule = document.querySelector('.dist_cnt') ||
                         Array.from(document.querySelectorAll('div, .moduletable')).find(d => {
                           const txt = (d.innerText || '').toLowerCase();
                           return txt.includes('straight line distance') && txt.includes('km');
                         });

      if (!distModule) {
        return {
          hasDistance: false,
          km: '-',
          kmNum: null,
          homeTeam: hTeamVal || '',
          homeCode: hCodeVal || '',
          homeLogo: hLogoVal || '',
          homeCity: '',
          homeCountry: '',
          homeStadium: '',
          awayTeam: aTeamVal || '',
          awayCode: aCodeVal || '',
          awayLogo: aLogoVal || '',
          awayCity: '',
          awayCountry: '',
          awayStadium: ''
        };
      }

      // 1. Team Logos and Short Codes
      const homeLogoBox = distModule.querySelector('.st_logo_box.__home, .st_logo_box--home, .st_logo_box:first-of-type');
      const awayLogoBox = distModule.querySelector('.st_logo_box.st_logo_box--away, .st_logo_box.__away, .st_logo_box:last-of-type');

      const homeCode = clean(homeLogoBox?.querySelector('div:not(.st_logo_box_img_container)')?.innerText || '');
      const homeLogo = homeLogoBox?.querySelector('img')?.src || '';

      const awayCode = clean(awayLogoBox?.querySelector('div:not(.st_logo_box_img_container)')?.innerText || '');
      const awayLogo = awayLogoBox?.querySelector('img')?.src || '';

      // 2. Cities & Countries (.dist_cities)
      const distCities = distModule.querySelector('.dist_cities');
      let homeCity = '';
      let homeCountry = '';
      let awayCity = '';
      let awayCountry = '';

      if (distCities && distCities.children.length >= 2) {
        const homeDiv = distCities.children[0];
        const awayDiv = distCities.children[1];

        homeCity = clean(homeDiv.querySelector('.fw-bold, b, strong')?.innerText || homeDiv.children[0]?.innerText || '');
        homeCountry = clean(homeDiv.querySelector('span:not(.fw-bold), span:last-child')?.innerText || homeDiv.children[1]?.innerText || '');

        awayCity = clean(awayDiv.querySelector('.fw-bold, b, strong')?.innerText || awayDiv.children[0]?.innerText || '');
        awayCountry = clean(awayDiv.querySelector('span:not(.fw-bold), span:last-child')?.innerText || awayDiv.children[1]?.innerText || '');
      }

      // 3. Distance Km (.dist_km)
      const kmEl = distModule.querySelector('.dist_km span, .dist_km, [class*="dist_km"]');
      let rawKmText = clean(kmEl?.innerText || distModule.innerText);
      let kmStr = '-';
      let kmNum = null;
      const kmMatch = rawKmText.match(/(\d+)\s*km/i);
      if (kmMatch) {
        kmNum = parseInt(kmMatch[1], 10);
        kmStr = `${kmNum}km`;
      }

      // 4. Stadium Name & Origin City (.dist_locab)
      const distLocab = distModule.querySelector('.dist_locab');
      let homeStadium = '';
      let awayOrigin = '';

      if (distLocab) {
        const spans = Array.from(distLocab.querySelectorAll('span'));
        if (spans.length >= 2) {
          homeStadium = clean(spans[0].innerText);
          awayOrigin = clean(spans[1].innerText);
        } else if (spans.length === 1) {
          homeStadium = clean(spans[0].innerText);
        } else {
          homeStadium = clean(distLocab.innerText);
        }
      }

      const hasDistance = Boolean(kmNum !== null || (homeCity && awayCity) || homeStadium);

      return {
        hasDistance,
        km: kmStr,
        kmNum,
        homeTeam: hTeamVal || '',
        homeCode: homeCode || hCodeVal || '',
        homeLogo: homeLogo || hLogoVal || '',
        homeCity,
        homeCountry,
        homeStadium,
        awayTeam: aTeamVal || '',
        awayCode: awayCode || aCodeVal || '',
        awayLogo: awayLogo || aLogoVal || '',
        awayCity,
        awayCountry,
        awayStadium: awayOrigin
      };
    }, hTeam, aTeam, hCode, aCode, hLogo, aLogo);

    return data;
  } catch (err) {
    console.error('Distance Parser Exception:', err);
    return {
      hasDistance: false,
      km: '-',
      kmNum: null,
      homeTeam: hTeam || '',
      homeCode: hCode || '',
      homeLogo: hLogo || '',
      homeCity: '',
      homeCountry: '',
      homeStadium: '',
      awayTeam: aTeam || '',
      awayCode: aCode || '',
      awayLogo: aLogo || '',
      awayCity: '',
      awayCountry: '',
      awayStadium: ''
    };
  }
}

module.exports = { parseDistance };
