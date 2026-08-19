const fs = require('fs');
const path = require('path');
const { generateMatchViewer } = require('./viewer/generate_viewer');

const outputDir = path.join(__dirname, 'output');
const items = fs.readdirSync(outputDir, { withFileTypes: true });

for (const item of items) {
  if (item.isDirectory()) {
    const jsonPath = path.join(outputDir, item.name, 'match_data.json');
    const viewerPath = path.join(outputDir, item.name, 'viewer.html');
    if (fs.existsSync(jsonPath)) {
      try {
        const matchData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        generateMatchViewer(matchData, viewerPath);
        console.log(`✅ Regenerated viewer for ${item.name}`);
      } catch (err) {
        console.error(`❌ Error for ${item.name}:`, err.message);
      }
    }
  }
}

// Also update latest_viewer.html
const latestJson = path.join(outputDir, 'latest_match.json');
const latestViewer = path.join(outputDir, 'latest_viewer.html');
if (fs.existsSync(latestJson)) {
  const data = JSON.parse(fs.readFileSync(latestJson, 'utf-8'));
  generateMatchViewer(data, latestViewer);
  console.log(`✅ Regenerated latest_viewer.html`);
}
