/**
 * ====================================================================
 * BPA V3 - DATABASE INGESTER & DUAL-SYNC PIPELINE
 * ====================================================================
 * Formats scraped match records and ingests them into BPA V3 MySQL
 * via /api/sync_ingest.php or direct PDO connection with zero data loss.
 */

const http = require('http');
const https = require('https');

const API_ENDPOINT = process.env.BPA_SYNC_URL || 'http://127.0.0.1/bpav3/api/sync_ingest.php';
const API_SECRET = process.env.BPA_SECRET || 'BPA_g7wXmi9oa32slLeb';

/**
 * Transforms rich scraped match data + listing metadata into the exact format
 * expected by sync_ingest.php.
 */
function formatMatchForIngest(matchData, listingMeta = {}) {
  const hero = matchData.hero || {};
  const markets = matchData.markets || {};
  const distance = matchData.distance || {};
  const h2h = matchData.h2h || {};
  const lastMatches = matchData.lastMatches || {};
  const standings = matchData.standings || [];
  const injuries = matchData.injuries || {};
  const overallStats = matchData.overallStats || {};
  const nextMatches = matchData.nextMatches || {};

  const matchId = hero.matchId || listingMeta.match_id;

  // League details: Merge listing flag and short tag with parsed full name
  const leagueFlag = listingMeta.league?.flag_url || hero.leagueFlag || '';
  const leagueShort = listingMeta.league?.short_tag || hero.leagueShort || '';
  const leagueName = hero.league || listingMeta.league?.name_hint || '';

  // 9 Tabs Transformation
  const predictions_9_tabs = {};

  if (markets['1X2']) {
    predictions_9_tabs['1x2'] = {
      pick: markets['1X2'].pick,
      odd: markets['1X2'].odd || (listingMeta.prediction?.primary_odd ? String(listingMeta.prediction.primary_odd) : '-'),
      prob_1: markets['1X2'].prob1,
      prob_X: markets['1X2'].probX,
      prob_2: markets['1X2'].prob2,
      correctScore: markets['1X2'].correctScore,
      avgGoals: markets['1X2'].avgGoals
    };
  }

  if (markets['UnderOver']) {
    predictions_9_tabs['under_over_25'] = {
      pick: markets['UnderOver'].pick,
      odd: markets['UnderOver'].odd || '-',
      prob_option1: markets['UnderOver'].probUnder,
      prob_option2: markets['UnderOver'].probOver,
      avgGoals: markets['UnderOver'].avgGoals
    };
  }

  if (markets['BTTS']) {
    predictions_9_tabs['both_to_score'] = {
      pick: markets['BTTS'].pick,
      odd: markets['BTTS'].odd || '-',
      prob_option1: markets['BTTS'].probYes,
      prob_option2: markets['BTTS'].probNo
    };
  }

  if (markets['HT']) {
    predictions_9_tabs['half_time'] = {
      pick: markets['HT'].pick,
      odd: markets['HT'].odd || '-',
      prob_1: markets['HT'].prob1,
      prob_X: markets['HT'].probX,
      prob_2: markets['HT'].prob2,
      correctScore: markets['HT'].htScore
    };
  }

  if (markets['HT_FT']) {
    predictions_9_tabs['ht_ft'] = {
      pick: markets['HT_FT'].pick,
      odd: markets['HT_FT'].odd || '-',
      prob_1: markets['HT_FT'].prob
    };
  }

  if (markets['Handicap']) {
    predictions_9_tabs['asian_handicap'] = {
      pick: markets['Handicap'].pick,
      odd: markets['Handicap'].odd || '-',
      prob_1: markets['Handicap'].prob1,
      prob_X: markets['Handicap'].probX,
      prob_2: markets['Handicap'].prob2
    };
  }

  if (markets['Scorers']) {
    predictions_9_tabs['scorers'] = {
      pick: markets['Scorers'].pick,
      odd: markets['Scorers'].odd || '-'
    };
  }

  if (markets['Corners']) {
    predictions_9_tabs['corners'] = {
      pick: markets['Corners'].pick,
      odd: markets['Corners'].odd || '-'
    };
  }

  if (markets['Cards']) {
    predictions_9_tabs['cards'] = {
      pick: markets['Cards'].pick,
      odd: markets['Cards'].odd || '-'
    };
  }

  return {
    match_id: matchId,
    match_date: `${hero.matchDate || ''} ${hero.matchTime || ''}`.trim(),
    league: {
      name: leagueName,
      short_tag: leagueShort,
      flag_url: leagueFlag
    },
    home_team: {
      name: hero.homeTeam || listingMeta.home_team,
      logo_url: hero.homeLogo || '',
      form: hero.homeForm || []
    },
    away_team: {
      name: hero.awayTeam || listingMeta.away_team,
      logo_url: hero.awayLogo || '',
      form: hero.awayForm || []
    },
    match_outcome: {
      status: hero.status || 'SCHEDULED',
      final_score: hero.finalScore || hero.score || null,
      ht_score: hero.htScore || null
    },
    stadium_and_weather: {
      stadium_name: distance.homeStadium || hero.stadium || null,
      distance_km: distance.km || null,
      home_city: distance.homeCity || null,
      away_city: distance.awayCity || null,
      weather: hero.weather || null
    },
    predictions_9_tabs,
    h2h_matches: h2h.matches || [],
    home_last_matches: lastMatches.homeOverall?.matches || [],
    away_last_matches: lastMatches.awayOverall?.matches || [],
    standings: standings,
    injuries: injuries,
    overall_stats: overallStats,
    next_matches: nextMatches
  };
}

/**
 * Sends a batch of matches to the BPA V3 sync_ingest API.
 * @param {Array} matchesArray Array of formatted match objects
 * @param {Object} [options] Ingestion options
 * @returns {Promise<Object>} API response
 */
async function sendBatchToDatabase(matchesArray, options = {}) {
  const logger = options.logger || console.log;
  const url = options.endpoint || API_ENDPOINT;
  const secret = options.secret || API_SECRET;

  if (!matchesArray || matchesArray.length === 0) {
    return { success: true, count: 0, message: 'Gönderilecek maç yok.' };
  }

  const payload = JSON.stringify({ matches: matchesArray });
  const urlObj = new URL(url);

  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-BPA-Secret': secret
    },
    timeout: 30000
  };

  const client = urlObj.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`API Hatası [${res.statusCode}]: ${json.error || responseBody}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, raw: responseBody });
          } else {
            reject(new Error(`API Yanıt Ayrıştırma Hatası [${res.statusCode}]: ${responseBody}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`DB Bağlantı Hatası: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`DB İstek Zaman Aşımı (Timeout - 30s)`));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  formatMatchForIngest,
  sendBatchToDatabase
};
