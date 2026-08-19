/**
 * ====================================================================
 * BPA V3 ASSET DOWNLOADER & LOCAL CACHE ENGINE
 * ====================================================================
 * Downloads league flags and team logos locally to PC disk so data
 * is 100% offline-ready, independent, and resilient against URL changes.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FLAGS_DIR = path.join(ASSETS_DIR, 'flags');
const LOGOS_DIR = path.join(ASSETS_DIR, 'logos');

// Ensure directories exist
[ASSETS_DIR, FLAGS_DIR, LOGOS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Downloads a remote image and saves it to the specified local path.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) return resolve(null);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
      return resolve(destPath); // Already cached
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.forebet.com/'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', () => resolve(null));
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Saves a League Flag locally.
 */
async function downloadLeagueFlag(flagUrl) {
  if (!flagUrl || !flagUrl.startsWith('http')) return null;
  const ext = path.extname(new URL(flagUrl).pathname) || '.png';
  const filename = path.basename(new URL(flagUrl).pathname);
  const destPath = path.join(FLAGS_DIR, filename);

  const saved = await downloadFile(flagUrl, destPath);
  return saved ? `/assets/flags/${filename}` : null;
}

/**
 * Saves a Team Logo locally.
 */
async function downloadTeamLogo(logoUrl, teamName = '') {
  if (!logoUrl || !logoUrl.startsWith('http')) return null;
  const hash = crypto.createHash('md5').update(logoUrl + teamName).digest('hex').substring(0, 12);
  const ext = path.extname(new URL(logoUrl).pathname) || '.png';
  const filename = `team_${hash}${ext}`;
  const destPath = path.join(LOGOS_DIR, filename);

  const saved = await downloadFile(logoUrl, destPath);
  return saved ? `/assets/logos/${filename}` : null;
}

module.exports = {
  downloadLeagueFlag,
  downloadTeamLogo,
  FLAGS_DIR,
  LOGOS_DIR
};
