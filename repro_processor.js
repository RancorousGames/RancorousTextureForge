import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('repro_meta.json', 'utf8'));
const buffer = fs.readFileSync('repro_raw.bin');
const { width, height } = meta;
const data = new Uint8Array(buffer);

// Parameters (Matching user report: 256x256, 8px padding)
const targetSize = 256;
const targetPadding = 8;
const tolerance = 20;
const clearColor = { r: 0, g: 0, b: 0 };

function isClear(idx) {
    const p = idx * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
    if (a < 5) return true;
    return Math.abs(r - clearColor.r) <= tolerance &&
           Math.abs(g - clearColor.g) <= tolerance &&
           Math.abs(b - clearColor.b) <= tolerance;
}

// 1. Find Islands
const visited = new Uint8Array(width * height);
const islands = [];
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx] || isClear(idx)) continue;

        let x1 = x, y1 = y, x2 = x, y2 = y;
        const queue = [[x, y]];
        visited[idx] = 1;
        let head = 0;
        while (head < queue.length) {
            const [cx, cy] = queue[head++];
            x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
            x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
            for (const [nx, ny] of [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]]) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (!visited[nIdx] && !isClear(nIdx)) {
                        visited[nIdx] = 1;
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

console.log(`Detected ${islands.length} islands.`);

// 2. Create output buffer (Black background)
const outData = new Uint8Array(width * height * 4).fill(0);
for (let i = 3; i < outData.length; i += 4) outData[i] = 255;

// 3. Normalized Rendering (Simplified Simulation)
islands.forEach((island, i) => {
    const cx = island.x + island.w / 2;
    const cy = island.y + island.h / 2;
    const col = Math.floor(cx / (targetSize + targetPadding));
    const row = Math.floor(cy / (targetSize + targetPadding));
    const targetX = col * (targetSize + targetPadding);
    const targetY = row * (targetSize + targetPadding);

    console.log(`Fixing Island #${i}: [${island.x}, ${island.y}] ${island.w}x${island.h} -> Cell [${col}, ${row}] at [${targetX}, ${targetY}]`);

    // Simulation: Draw a filled rect at the target position to show coverage
    // In the real app, we'd stretch the pixels. Here we just color the target cell area.
    for (let dy = 0; dy < targetSize; dy++) {
        for (let dx = 0; dx < targetSize; dx++) {
            const tx = targetX + dx;
            const ty = targetY + dy;
            if (tx < width && ty < height) {
                const outIdx = (ty * width + tx) * 4;
                outData[outIdx] = 255; // Red channel for visualization of fixed areas
                outData[outIdx + 3] = 255;
            }
        }
    }
});

fs.writeFileSync('repro_output_raw.bin', outData);
