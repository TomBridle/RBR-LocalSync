const fs = require("fs");
const path = require("path");

// Adjust these depending on how many bytes to read per block and what offset to start from
const BLOCK_SIZE = 32; // spacing between entries
const FLOAT_SIZE = 4;  // each float is 4 bytes

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("Usage: node parseTrkFile.js <path-to-.trk>");
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const result = [];

for (let offset = 20; offset + 16 <= buffer.length; offset += BLOCK_SIZE) {
  const stage_x = buffer.readFloatLE(offset);
  const track_x = buffer.readFloatLE(offset + 4);
  const stage_y = buffer.readFloatLE(offset + 8);
  const track_y = buffer.readFloatLE(offset + 12);

  result.push({ offset, stage_x, stage_y, track_x, track_y });
}

// Write to JSON
const outputPath = path.join(path.dirname(filePath), path.basename(filePath, ".trk") + "_parsed.json");
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`Parsed ${result.length} coordinate triples to ${outputPath}`);

// Chart generation using chartjs-node-canvas
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

(async () => {
  const width = 1200;
  const height = 1000;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  // Filter out entries with undefined or non-numeric stage_x or stage_y
const filtered = result.filter(p =>
  typeof p.stage_x === 'number' &&
  typeof p.stage_y === 'number' &&
  !isNaN(p.stage_x) &&
  !isNaN(p.stage_y) &&
  Math.abs(p.stage_x) < 1e6 &&
  Math.abs(p.stage_y) < 1e6
);
  const stageX = filtered.map(p => p.stage_x);
  const stageY = filtered.map(p => p.stage_y);

  const configuration = {
    type: 'line',
    data: {
      labels: stageX,
      datasets: [{
        label: 'Stage Track',
        data: stageX.map((x, i) => ({ x, y: stageY[i] })),
        borderColor: 'blue',
        fill: false,
        tension: 0.1,
        pointRadius: 0,
      }]
    },
    options: {
      scales: {
        x: { type: 'linear', position: 'bottom' },
        y: { type: 'linear' }
      }
    }
  };

  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  const imagePath = path.join(path.dirname(filePath), path.basename(filePath, ".trk") + "_plot.png");
  fs.writeFileSync(imagePath, imageBuffer);
  console.log(`Chart saved to ${imagePath}`);
})();