const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

(async () => {
  console.log('Testing Forebet root page navigation...');
  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  try {
    console.log('1. Opening forebet.com root...');
    await page.goto('https://www.forebet.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Title:', await page.title());
  } catch (e) {
    console.log('Error 1:', e.message);
  }

  await browser.close();
})();
