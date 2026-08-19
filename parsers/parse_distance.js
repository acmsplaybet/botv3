/**
 * ====================================================================
 * PARSER: Straight Line Distance & Stadium Geography (BPA V3)
 * ====================================================================
 * Extracts:
 * - Straight line distance between home stadium and away location (e.g. "167km", 167)
 * - Home City, Home Country, Home Stadium name
 * - Away City, Away Country, Away Origin name
 * - Team short codes and logo URLs in the distance widget
 * ====================================================================
 */

async function parseDistance(page, heroHomeTeam = '', heroAwayTeam = '') {
  try {
    const data = await page.evaluate((hTeam, aTeam) => {
      const clean = (str) => (str || '').replace(/\s+/g, ' ').trim();

      // Find distance module
      const allDivs = Array.from(document.querySelectorAll('.moduletable, div, section'));
      const distModule = allDivs.find(d => {
        const txt = clean(d.innerText).toLowerCase();
        return (txt.includes('straight line distance') || txt.includes('distance:')) && d.querySelectorAll('.moduletable').length === 0;
      }) || allDivs.find(d => d.querySelector('.dist_block, .dist_cities'));

      if (!distModule) {
        return {
          hasDistance: false,
          km: '',
          kmNum: null,
          homeTeam: hTeam || '',
          homeCode: '',
          homeLogo: '',
          homeCity: '',
          homeCountry: '',
          homeStadium: '',
          awayTeam: aTeam || '',
          awayCode: '',
          awayLogo: '',
          awayCity: '',
          awayCountry: '',
          awayStadium: ''
        };
      }

      // 1. Team Logos and Short Codes in distance header
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

      if (distCities) {
        const cityDivs = distCities.children;
        if (cityDivs.length >= 2) {
          const homeDiv = cityDivs[0];
          const awayDiv = cityDivs[1];

          homeCity = clean(homeDiv.querySelector('.fw-bold, b, strong')?.innerText || homeDiv.children[0]?.innerText || '');
          homeCountry = clean(homeDiv.querySelector('span:not(.fw-bold), span:last-child')?.innerText || homeDiv.children[1]?.innerText || '');

          awayCity = clean(awayDiv.querySelector('.fw-bold, b, strong')?.innerText || awayDiv.children[0]?.innerText || '');
          awayCountry = clean(awayDiv.querySelector('span:not(.fw-bold), span:last-child')?.innerText || awayDiv.children[1]?.innerText || '');
        }
      }

      // 3. Distance Km (.dist_km)
      const distKmEl = distModule.querySelector('.dist_km, [class*="dist_km"]');
      let kmStr = clean(distKmEl?.querySelector('span')?.innerText || distKmEl?.innerText || '');
      let kmNum = null;
      const kmMatch = kmStr.match(/(\d+)\s*km/i);
      if (kmMatch) {
        kmNum = parseInt(kmMatch[1], 10);
        kmStr = `${kmNum}km`;
      } else {
        const rawDigits = kmStr.match(/\d+/);
        if (rawDigits) {
          kmNum = parseInt(rawDigits[0], 10);
          kmStr = `${kmNum}km`;
        }
      }

      // 4. Stadium Name & Origin City (.dist_locab)
      const distLocab = distModule.querySelector('.dist_locab, [class*="dist_locab"]');
      let homeStadium = '';
      let awayOrigin = '';

      if (distLocab) {
        const spans = Array.from(distLocab.querySelectorAll('span'));
        if (spans.length >= 2) {
          homeStadium = clean(spans[0].innerText);
          awayOrigin = clean(spans[1].innerText);
        } else if (spans.length === 1) {
          homeStadium = clean(spans[0].innerText);
        }
      }

      return {
        hasDistance: Boolean(kmStr || homeCity || homeStadium),
        km: kmStr || (kmNum ? `${kmNum}km` : ''),
        kmNum,
        homeTeam: hTeam || '',
        homeCode,
        homeLogo,
        homeCity: homeCity || hTeam,
        homeCountry,
        homeStadium,
        awayTeam: aTeam || '',
        awayCode,
        awayLogo,
        awayCity: awayCity || awayOrigin || aTeam,
        awayCountry,
        awayStadium: awayOrigin || awayCity
      };
    }, heroHomeTeam, heroAwayTeam);

    return data;
  } catch (err) {
    console.error('Error in parseDistance:', err.message);
    return {
      hasDistance: false,
      km: '',
      kmNum: null,
      homeTeam: heroHomeTeam,
      homeCode: '',
      homeLogo: '',
      homeCity: heroHomeTeam,
      homeCountry: '',
      homeStadium: '',
      awayTeam: heroAwayTeam,
      awayCode: '',
      awayLogo: '',
      awayCity: heroAwayTeam,
      awayCountry: '',
      awayStadium: ''
    };
  }
}

module.exports = { parseDistance };
