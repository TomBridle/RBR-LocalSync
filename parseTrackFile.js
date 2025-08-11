const fs = require('fs');

// Adjust these to match the known min/max of the map if needed
const MIN_X = -1000, MAX_X = 1000;
const MIN_Y = -1000, MAX_Y = 1000;

const filePath = 'track-500_M.trk'; // <- update this path

function readFloat(buffer, offset) {
  return buffer.readFloatLE(offset); // assuming little-endian
}

function isWithinBounds(x, y) {
  return x > MIN_X && x < MAX_X && y > MIN_Y && y < MAX_Y;
}

function parseTrkFileToJson(buffer) {
  const results = [];

  for (let i = 0; i < buffer.length - 12; i += 4) {
    const x = readFloat(buffer, i);
    const y = readFloat(buffer, i + 4);
    const z = readFloat(buffer, i + 8);

    if (isFinite(x) && isFinite(y) && isFinite(z) && isWithinBounds(x, y)) {
      results.push({ x, y, z, offset: i });
    }
  }

  return results;
}

fs.readFile(filePath, (err, buffer) => {
  if (err) throw err;

  const parsedData = parseTrkFileToJson(buffer);
  fs.writeFileSync('parsed_track.json', JSON.stringify(parsedData, null, 2));
  console.log(`Parsed ${parsedData.length} points to parsed_track.json`);
});
