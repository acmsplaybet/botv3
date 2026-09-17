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

    if (content.includes("if (attempt >= 1) {\n          log(`  ↳ 🔓 Doğrulama ekranı açılıyor")) {
      content = content.replace(
        "if (attempt >= 1) {\n          log(`  ↳ 🔓 Doğrulama ekranı açılıyor",
        "if (attempt >= 2) {\n          log(`  ↳ 🔓 Doğrulama ekranı açılıyor"
      );
    } else if (content.includes("if (attempt >= 1) {")) {
      content = content.replace(
        "if (attempt >= 1) {",
        "if (attempt >= 2) {"
      );
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log(`Updated attempt check in ${targetPath}`);
  }
});
