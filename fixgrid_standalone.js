import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('temp_meta.json', 'utf8'));
const buffer = fs.readFileSync('temp_raw.bin');
const width = meta.width;
const height = meta.height;
const data = new Uint8Array(buffer);

const targetSize = 128;
const tolerance = 20;
const clearColor = { r: 0, g: 0, b: 0 }; // Assume black for now

function isColorClose(r, g, b, target) {
  return Math.abs(r - target.r) <= tolerance && Math.abs(g - target.g) <= tolerance && Math.abs(b - target.b) <= tolerance;
}

const visited = new Uint8Array(width * height);
const islands = [];

console.log(`Analyzing ${width}x${height}...`);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = y * width + x;
    if (visited[idx]) continue;

    const pIdx = idx * 4;
    const alpha = data[pIdx + 3];
    const isClear = alpha < 10 || isColorClose(data[pIdx], data[pIdx + 1], data[pIdx + 2], clearColor);

    if (!isClear) {
      let x1 = x, y1 = y, x2 = x, y2 = y;
      const queue = [[x, y]];
      visited[idx] = 1;
      let head = 0;
      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
        x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);

        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx]) {
              const npIdx = nIdx * 4;
              const nAlpha = data[npIdx + 3];
              const nIsClear = nAlpha < 10 || isColorClose(data[npIdx], data[npIdx + 1], data[npIdx + 2], clearColor);
              if (!nIsClear) {
                visited[nIdx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }
      }
      if (x2 - x1 >= 8 && y2 - y1 >= 8) {
        islands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
      }
    }
  }
}

console.log(`Found ${islands.length} islands.`);

const fixedIslands = islands.map((island, i) => {
  // 1. Calculate center
  const cx = island.x + island.w / 2;
  const cy = island.y + island.h / 2;

  // 2. Snap center to nearest grid (assuming tight packing for now)
  const gridX = Math.round((cx - targetSize / 2) / targetSize) * targetSize;
  const gridY = Math.round((cy - targetSize / 2) / targetSize) * targetSize;

  // 3. AGGRESSIVE NON-UNIFORM RESIZING
  // We want the island to become exactly targetSize x targetSize
  const scaleX = targetSize / island.w;
  const scaleY = targetSize / island.h;
  
  const finalX = gridX;
  const finalY = gridY;

  return {
    id: i,
    old: { x: island.x, y: island.y, w: island.w, h: island.h },
    new: { x: Math.round(finalX), y: Math.round(finalY), w: targetSize, h: targetSize, scaleX: parseFloat(scaleX.toFixed(3)), scaleY: parseFloat(scaleY.toFixed(3)) },
    cell: { x: gridX, y: gridY }
  };
});

// Summary of the first 5 fixes
fixedIslands.slice(0, 10).forEach(fix => {
  console.log(`Island #${fix.id}:`);
  console.log(`  Original: [${fix.old.x}, ${fix.old.y}] ${fix.old.w}x${fix.old.h}`);
  console.log(`  Snapping to Cell: [${fix.cell.x}, ${fix.cell.y}]`);
  console.log(`  New: [${fix.new.x}, ${fix.new.y}] ${fix.new.w}x${fix.new.h} (ScaleX: ${fix.new.scaleX}, ScaleY: ${fix.new.scaleY})`);
});

if (fixedIslands.length > 10) console.log(`... and ${fixedIslands.length - 10} more.`);
