// parseMatAndRender.js
/*
/*
Reads a MATLAB .mat file containing StageMap center-line coordinates and
renders a PNG of the track. Uses the 'mat-for-js' and 'canvas' packages.

**Note**: mat-for-js only supports MATLAB Level 5 (`-v7`) MAT-files. If your `.mat`
uses the newer HDF5-based v7.3 format (as indicated by HDF5 signatures), mat-for-js
will error. In that case, convert to a Level 5 MAT or use an HDF5-capable library, e.g.
`hdf5.node`, or fallback to the provided Python script.

Install:
  npm install mat-for-js canvas

Usage:
  node parseMatAndRender.js track-103_O.mat
*/

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

(async () => {
  // 1) Check arguments
  if (process.argv.length !== 3) {
    console.error('Usage: node parseMatAndRender.js <track-file.mat>');
    process.exit(1);
  }

  const matPath = process.argv[2];
  if (!fs.existsSync(matPath)) {
    console.error(`.mat file not found: ${matPath}`);
    process.exit(1);
  }

  // 2) Dynamically import mat-for-js
  let readMat;
  try {
    const matModule = await import('mat-for-js');
    // The package exports 'read' and also named exports
    readMat = matModule.read || matModule.default?.read;
    if (typeof readMat !== 'function') throw new Error('read function not found in mat-for-js');
  } catch (err) {
    console.error('Failed to import mat-for-js:', err.message);
    process.exit(1);
  }

  // 3) Read file into ArrayBuffer
  const buffer = fs.readFileSync(matPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  // 4) Parse MAT data
  let result;
  try {
    result = readMat(arrayBuffer);
  } catch (err) {
    console.error('Error reading MAT data:', err.message);
    process.exit(1);
  }

  // 5) Extract StageMap data
  // The data may be under .data property
  const data = result.data || result;
  if (!data.StageMap || !data.StageMap.px || !data.StageMap.py) {
    console.error('StageMap.px and StageMap.py not found in MAT data');
    process.exit(1);
  }

  const px = data.StageMap.px;
  const py = data.StageMap.py;
  if (px.length !== py.length) {
    console.error('Mismatched px/py lengths:', px.length, py.length);
    process.exit(1);
  }
  console.log(`Loaded ${px.length} points from StageMap`);


    // 5b) Convert coordinates to JSON format
const coordinates = px.map((x, i) => ({
  x: x,
  y: py[i]
}));

// 5c) Write JSON to file
const jsonOutPath = path.join(path.dirname(matPath), path.basename(matPath, '.mat') + '_coordinates.json');
fs.writeFileSync(jsonOutPath, JSON.stringify(coordinates, null, 2));
console.log(`Saved coordinates JSON: ${jsonOutPath}`);


  // 6) Setup canvas
  const size = 1200;
  const pad = 50;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  // 7) Compute bounds & scale
  const minX = Math.min(...px);
  const maxX = Math.max(...px);
  const minY = Math.min(...py);
  const maxY = Math.max(...py);
  const scale = Math.min((size - 2 * pad) / (maxX - minX), (size - 2 * pad) / (maxY - minY));

  // 8) Draw track in blue
  ctx.strokeStyle = '#1f77b4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  px.forEach((x, i) => {
    const y = py[i];
    const cx = pad + (x - minX) * scale;
    const cy = size - pad - (y - minY) * scale;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  // 9) Save PNG
  const outPath = path.join(path.dirname(matPath), path.basename(matPath, '.mat') + '_map.png');
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`Rendered StageMap PNG: ${outPath}`);



})();
