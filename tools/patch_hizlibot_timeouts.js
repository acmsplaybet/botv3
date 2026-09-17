const fs = require('fs');
const path = require('path');

const targets = [
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot',
  'C:\\xampp\\htdocs\\bpiv2\\windows\\hizlibot2'
];

targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const targetPath = path.join(dir, 'daily_pipeline.js');
  if (fs.existsSync(targetPath)) {
    let content = fs.readFileSync(targetPath, 'utf-8');

    // Fix ensureMatchPageLoaded timeouts (12000 -> 30000, 3500 -> 15000)
    if (content.includes("await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });")) {
      content = content.replace(
        "await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });",
        "await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });"
      );
    }
    if (content.includes("await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });")) {
      content = content.replace(
        "await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });",
        "await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });"
      );
    }
    if (content.includes("await page.waitForSelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema', { timeout: 3500 });")) {
      content = content.replace(
        "await page.waitForSelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema', { timeout: 3500 });",
        "await page.waitForSelector('h1.predteamnames, .homeTeam, .predict-tables, .weather_main_pr, .schema', { timeout: 15000 });"
      );
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log(`Updated timeouts in ${targetPath}`);
  }
});
