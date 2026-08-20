/**
 * ====================================================================
 * VIEWER GENERATOR: Injects scraped match JSON into HTML viewer
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');

function generateMatchViewer(matchData, outputPath = null) {
  const templatePath = path.join(__dirname, 'template_viewer.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Stringify match data safely
  const jsonStr = JSON.stringify(matchData, null, 2);
  
  // Replace placeholder
  const finalHtml = template.replace('__MATCH_DATA_PLACEHOLDER__', jsonStr);

  if (outputPath) {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, finalHtml, 'utf-8');
    return outputPath;
  }

  return finalHtml;
}

module.exports = { generateMatchViewer };
