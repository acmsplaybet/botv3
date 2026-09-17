/**
 * ====================================================================
 * BETMINES - API SENDER (RECEIVER.PHP SYNC)
 * ====================================================================
 */

const axios = require('axios');
const config = require('../config');

async function sendMatchesToApi(matches, mode = 'LIVE', logger = console.log) {
  if (!matches || !Array.isArray(matches)) {
    logger(`[API] ⚠️ Gönderilecek geçerli maç verisi bulunamadı.`);
    return { success: false, count: 0 };
  }

  logger(`[API] 📤 ${matches.length} maç API'ye gönderiliyor... (Mod: ${mode}, URL: ${config.apiUrl})`);

  const payload = {
    data: matches,
    mode: mode,
    key: config.apiKey
  };

  try {
    const response = await axios.post(config.apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BPI-Node-MasterBot/6.0'
      },
      timeout: 30000
    });

    if (response.status === 200) {
      const msg = response.data && response.data.message ? response.data.message : 'Veri başarıyla iletildi.';
      logger(`[API] ✅ BAŞARILI! Sunucu yanıtı: ${msg}`);
      return { success: true, count: matches.length, data: response.data };
    } else {
      logger(`[API] ⚠️ Sunucu beklenmeyen durum döndü: ${response.status}`);
      return { success: false, status: response.status };
    }
  } catch (error) {
    logger(`[API] ❌ Gönderim hatası: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendMatchesToApi
};
