const fs = require('fs');
const Jimp = require('jimp');

// Configuration - matches app defaults
const CONFIG = {
  cellSize: 128,
  padding: 0,
  clearColor: { r: 0, g: 0, b: 0 },
  tolerance: 15
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

async function run() {
  // Check for input files
  if (!fs.existsSync('temp_meta.json') || !fs.existsSync('temp_raw.bin')) {
    console.error('Error: temp_meta.json or temp_raw.bin not found.');
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync('temp_meta.json', 'utf8'));
  const buffer = fs.readFileSync('temp_raw.bin');
  const width = meta.width;
  const height = meta.height;
  const data = new Uint8Array(buffer);

  // Override config from meta if available
  const clearColor = meta.clearColor ? hexToRgb(meta.clearColor) : CONFIG.clearColor;
  const tolerance = meta.tolerance ?? CONFIG.tolerance;
  const cellSize = meta.cellSize ?? CONFIG.cellSize;
  const padding = meta.padding ?? CONFIG.padding;

  function isNotBg(idx) {
    const pIdx = idx * 4;
    const alpha = data[pIdx + 3];
    if (alpha < 5) return false;
    
    return Math.abs(data[pIdx] - clearColor.r) >= tolerance ||
           Math.abs(data[pIdx + 1] - clearColor.g) >= tolerance ||
           Math.abs(data[pIdx + 2] - clearColor.b) >= tolerance;
  }

  const visited = new Uint8Array(width * height);
  const islands = [];
  const scanStep = 4;

  console.log(`Analyzing ${width}x${height}...`);

  for (let sy = 0; sy < height; sy += scanStep) {
    for (let sx = 0; sx < width; sx += scanStep) {
      const sidx = sy * width + sx;
      if (visited[sidx] || !isNotBg(sidx)) continue;

      let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
      const queue = [[sx, sy]];
      visited[sidx] = 1;
      let head = 0;

      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
        x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);

        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (!visited[nidx] && isNotBg(nidx)) {
              visited[nidx] = 1;
              queue.push([nx, ny]);
            }
          }
        }
      }
      
      if (x2 - x1 >= 4 && y2 - y1 >= 4) {
        islands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
      }
    }
  }

  console.log(`Found ${islands.length} islands.`);

  // Debug Visualization
  console.log('Generating debug_output.png...');
  // Use constructor with options object as seen in Jimp.toString()
  const image = new Jimp.Jimp({ width, height });
  
  // Fill background from raw data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Jimp bitmap data is a Buffer. writeUInt32BE writes in Big Endian.
      // rgbaToInt is [R, G, B, A] -> 0xRRGGBBAA
      const hex = Jimp.rgbaToInt(data[idx], data[idx+1], data[idx+2], data[idx+3]);
      image.setPixelColor(hex, x, y);
    }
  }

  // Draw detected islands
  const colors = [0xFF0000FF, 0x00FF00FF, 0x0000FFFF, 0xFFFF00FF, 0xFF00FFFF, 0x00FFFFFF];
  islands.forEach((isl, i) => {
    const color = colors[i % colors.length];
    // Draw horizontal lines
    for (let x = isl.x; x < isl.x + isl.w; x++) {
      image.setPixelColor(color, x, isl.y);
      image.setPixelColor(color, x, isl.y + isl.h - 1);
    }
    // Draw vertical lines
    for (let y = isl.y; y < isl.y + isl.h; y++) {
      image.setPixelColor(color, isl.x, y);
      image.setPixelColor(color, isl.x + isl.w - 1, y);
    }
  });

  await image.write('debug_output.png');
  console.log('Done. debug_output.png generated.');

  const fixedIslands = islands.map((island, i) => {
    const stepX = cellSize + padding * 2;
    const stepY = cellSize + padding * 2;
    const col = Math.round((island.x + island.w / 2 - padding - cellSize / 2) / stepX);
    const row = Math.round((island.y + island.h / 2 - padding - cellSize / 2) / stepY);
    return {
      id: i,
      old: { x: island.x, y: island.y, w: island.w, h: island.h },
      new: { x: padding + col * stepX, y: padding + row * stepY, w: cellSize, h: cellSize },
      cell: { col, row }
    };
  });

  fixedIslands.slice(0, 10).forEach(fix => {
    console.log(`Island #${fix.id}: [${fix.old.x}, ${fix.old.y}] -> Cell ${fix.cell.col}, ${fix.cell.row}`);
  });
}

run().catch(console.error);
