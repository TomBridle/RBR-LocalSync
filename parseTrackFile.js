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

for (let offset = 20; offset + 12 <= buffer.length; offset += BLOCK_SIZE) {
  const x = buffer.readFloatLE(offset);
  const y = buffer.readFloatLE(offset + 4);
  const z = buffer.readFloatLE(offset + 8);

  result.push({ offset, x, y, z });
}

// Write to JSON
const outputPath = path.join(path.dirname(filePath), path.basename(filePath, ".trk") + "_parsed.json");
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`Parsed ${result.length} coordinate triples to ${outputPath}`);