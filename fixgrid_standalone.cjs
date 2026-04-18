const fs = require('fs');
const Jimp = require('jimp');

// Port of unified findIslands from src/lib/utils.ts
function findIslands(imageData, clearColor, tolerance, useMedianFilter = true) {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const reachable = new Uint8Array(width * height);

  const isClearColored = (x, y) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 5) return true;
    return Math.abs(data[idx] - clearColor.r) <= tolerance &&
           Math.abs(data[idx + 1] - clearColor.g) <= tolerance &&
           Math.abs(data[idx + 2] - clearColor.b) <= tolerance;
  };

  const bgQueue = [];
  const seedBorder = (x, y) => {
    const idx = y * width + x;
    if (!reachable[idx] && isClearColored(x, y)) { reachable[idx] = 1; bgQueue.push([x, y]); }
  };
  for (let x = 0; x < width; x++) { seedBorder(x, 0); seedBorder(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seedBorder(0, y); seedBorder(width - 1, y); }
  
  let bgHead = 0;
  while (bgHead < bgQueue.length) {
    const [cx, cy] = bgQueue[bgHead++];
    for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!reachable[nidx] && isClearColored(nx, ny)) { reachable[nidx] = 1; bgQueue.push([nx, ny]); }
      }
    }
  }

  const isNotBg = (x, y) => reachable[y * width + x] === 0;

  const rawIslands = [];
  const scanStep = 4;
  for (let sy = 0; sy < height; sy += scanStep) {
    for (let sx = 0; sx < width; sx += scanStep) {
      const sidx = sy * width + sx;
      if (visited[sidx] || !isNotBg(sx, sy)) continue;

      let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
      const queue = [[sx, sy]];
      visited[sidx] = 1;
      let head = 0;
      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
        x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
        for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (!visited[nidx] && isNotBg(nx, ny)) { visited[nidx] = 1; queue.push([nx, ny]); }
          }
        }
      }
      if (x2 - x1 >= 4 && y2 - y1 >= 4) rawIslands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
    }
  }

  const filtered = rawIslands
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    .filter((inner, idx, arr) => {
      for (let i = 0; i < idx; i++) {
        const outer = arr[i];
        if (inner.x >= outer.x && inner.y >= outer.y && (inner.x+inner.w) <= (outer.x+outer.w) && (inner.y+inner.h) <= (outer.y+outer.h)) return false;
      }
      return true;
    });

  if (useMedianFilter && filtered.length > 0) {
    const areas = filtered.map(isl => isl.w * isl.h).sort((a, b) => a - b);
    const medianArea = areas[Math.floor(areas.length / 2)];
    return filtered.filter(isl => (isl.w * isl.h) >= (medianArea * 0.5));
  }
  return filtered;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
}

async function run() {
  if (!fs.existsSync('temp_meta.json') || !fs.existsSync('temp_raw.bin')) {
    console.error('Error: temp_meta.json or temp_raw.bin not found.');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync('temp_meta.json', 'utf8'));
  const buffer = fs.readFileSync('temp_raw.bin');
  const width = meta.width, height = meta.height;
  const data = new Uint8Array(buffer);

  const clearColor = meta.clearColor ? hexToRgb(meta.clearColor) : { r: 0, g: 0, b: 0 };
  const tolerance = meta.tolerance ?? 15;
  const cellSize = meta.cellSize ?? 128, padding = meta.padding ?? 0;

  console.log(`Analyzing ${width}x${height} with unified logic...`);
  console.log(`Config: ClearColor=${meta.clearColor}, Tolerance=${tolerance}, CellSize=${cellSize}, Padding=${padding}`);
  
  const finalIslands = findIslands({ width, height, data }, clearColor, tolerance, true);
  
  if (finalIslands.length <= 1) {
    console.log(`Aborting: Only ${finalIslands.length} island(s) detected. FixGrid requires multiple islands.`);
    process.exit(0);
  }

  if (padding === 0) {
    console.log(`Aborting: Cell padding is 0. FixGrid requires non-zero padding to align islands.`);
    process.exit(0);
  }

  console.log(`Final count: ${finalIslands.length} islands.`);

  console.log('Generating debug_output.png...');
  const image = new Jimp.Jimp({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      image.setPixelColor(Jimp.rgbaToInt(data[idx], data[idx+1], data[idx+2], data[idx+3]), x, y);
    }
  }

  const colors = [0xFF0000FF, 0x00FF00FF, 0x0000FFFF, 0xFFFF00FF, 0xFF00FFFF, 0x00FFFFFF];
  finalIslands.forEach((isl, i) => {
    const color = colors[i % colors.length];
    for (let x = isl.x; x < isl.x + isl.w; x++) { image.setPixelColor(color, x, isl.y); image.setPixelColor(color, x, isl.y + isl.h - 1); }
    for (let y = isl.y; y < isl.y + isl.h; y++) { image.setPixelColor(color, isl.x, y); image.setPixelColor(color, isl.x + isl.w - 1, y); }
  });

  await image.write('debug_output.png');
  console.log('Done. debug_output.png generated.');

  const stepX = cellSize + padding * 2, stepY = cellSize + padding * 2;
  console.log(`Grid Geometry: StepX=${stepX}, StepY=${stepY}`);

  finalIslands.forEach((isl, i) => {
    const centerX = isl.x + isl.w / 2;
    const centerY = isl.y + isl.h / 2;
    
    const relX = centerX - padding - cellSize / 2;
    const relY = centerY - padding - cellSize / 2;
    
    const col = Math.round(relX / stepX);
    const row = Math.round(relY / stepY);
    
    const destX = padding + col * stepX;
    const destY = padding + row * stepY;

    if (i < 10 || i === finalIslands.length - 1) {
      console.log(`Island #${i}: Original Rect(${isl.x},${isl.y},${isl.w},${isl.h}) Center(${centerX.toFixed(1)},${centerY.toFixed(1)})`);
      console.log(`  -> Mapping: Rel(${relX.toFixed(1)},${relY.toFixed(1)}) -> Cell(${col},${row}) -> Dest(${destX},${destY})`);
    } else if (i === 10) {
      console.log(`... (skipping logs for intermediate islands) ...`);
    }
  });
}
run().catch(console.error);
