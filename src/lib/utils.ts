import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

export function findIslands(
  imageData: ImageData,
  clearColorHex: string,
  tolerance: number,
  useMedianFilter: boolean = true
): { x: number; y: number; w: number; h: number }[] {
  const { width, height, data } = imageData;
  const clearColor = hexToRgb(clearColorHex);
  const visited = new Uint8Array(width * height);
  const reachable = new Uint8Array(width * height);

  console.log(`[findIslands] Starting detection on ${width}x${height} image. ClearColor: rgb(${clearColor.r},${clearColor.g},${clearColor.b}), Tolerance: ${tolerance}`);

  const isClearColored = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 5) return true;
    return Math.abs(data[idx] - clearColor.r) <= tolerance &&
           Math.abs(data[idx + 1] - clearColor.g) <= tolerance &&
           Math.abs(data[idx + 2] - clearColor.b) <= tolerance;
  };

  // 1. Reachable Background pass (Flood-fill from borders)
  const bgQueue: [number, number][] = [];
  const seedBorder = (x: number, y: number) => {
    const idx = y * width + x;
    if (!reachable[idx] && isClearColored(x, y)) { reachable[idx] = 1; bgQueue.push([x, y]); }
  };
  for (let x = 0; x < width; x++) { seedBorder(x, 0); seedBorder(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seedBorder(0, y); seedBorder(width - 1, y); }
  
  let bgHead = 0;
  while (bgHead < bgQueue.length) {
    const [cx, cy] = bgQueue[bgHead++];
    for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]] as [number,number][]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!reachable[nidx] && isClearColored(nx, ny)) { reachable[nidx] = 1; bgQueue.push([nx, ny]); }
      }
    }
  }

  console.log(`[findIslands] Step 1: Background flood-fill complete. Marked ${bgQueue.length} pixels as reachable background.`);

  const isNotBg = (x: number, y: number) => reachable[y * width + x] === 0;

  // 2. Island detection
  const rawIslands: { x: number; y: number; w: number; h: number }[] = [];
  const scanStep = 4;
  for (let sy = 0; sy < height; sy += scanStep) {
    for (let sx = 0; sx < width; sx += scanStep) {
      const sidx = sy * width + sx;
      if (visited[sidx] || !isNotBg(sx, sy)) continue;

      let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
      const queue: [number, number][] = [[sx, sy]];
      visited[sidx] = 1;
      let head = 0;
      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
        x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
        for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]] as [number,number][]) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (!visited[nidx] && isNotBg(nx, ny)) { visited[nidx] = 1; queue.push([nx, ny]); }
          }
        }
      }
      if (x2 - x1 >= 4 && y2 - y1 >= 4) rawIslands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
    }
  }

  console.log(`[findIslands] Step 2: Found ${rawIslands.length} raw foreground clusters.`);

  // 3. Containment Filter
  const filtered = rawIslands
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    .filter((inner, idx, arr) => {
      for (let i = 0; i < idx; i++) {
        const outer = arr[i];
        if (inner.x >= outer.x && inner.y >= outer.y && (inner.x+inner.w) <= (outer.x+outer.w) && (inner.y+inner.h) <= (outer.y+outer.h)) return false;
      }
      return true;
    });

  console.log(`[findIslands] Step 3: Containment filter reduced ${rawIslands.length} -> ${filtered.length} islands.`);

  // 4. Median Filter
  if (useMedianFilter && filtered.length > 0) {
    const areas = filtered.map(isl => isl.w * isl.h).sort((a, b) => a - b);
    const medianArea = areas[Math.floor(areas.length / 2)];
    const result = filtered.filter(isl => (isl.w * isl.h) >= (medianArea * 0.5));
    console.log(`[findIslands] Step 4: Median area filter (${medianArea}px). Reduced ${filtered.length} -> ${result.length} islands.`);
    return result;
  }

  return filtered;
}

export function detectSettingsFromImage(
  imageData: ImageData,
  clearColorHex: string,
  tolerance: number,
  useMedianFilter: boolean = true
): { cellSize: number; padding: number } {
  const islands = findIslands(imageData, clearColorHex, tolerance, useMedianFilter);
  if (islands.length === 0) return { cellSize: 128, padding: 0 };

  const getMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const sizes = islands.map(i => Math.max(i.w, i.h));
  const rawSize = getMedian(sizes);
  console.log(`[AutoDetect] Island sizes: ${sizes.join(', ')}`);
  console.log(`[AutoDetect] Raw median size: ${rawSize}`);

  const p2s = [32, 64, 128, 256, 512, 1024];
  const nearestP2 = p2s.reduce((prev, curr) => Math.abs(curr - rawSize) < Math.abs(prev - rawSize) ? curr : prev);
  let finalSize = Math.round(rawSize / 4) * 4;
  
  const p2Diff = Math.abs(nearestP2 - rawSize) / nearestP2;
  console.log(`[AutoDetect] Nearest P2: ${nearestP2}, Difference: ${(p2Diff * 100).toFixed(2)}%`);

  if (p2Diff <= 0.02) {
    console.log(`[AutoDetect] Snapping cell size ${finalSize} -> ${nearestP2} (within 2% threshold)`);
    finalSize = nearestP2;
  } else {
    console.log(`[AutoDetect] Keeping calculated size: ${finalSize}`);
  }

  // New Simplified Gap Detection
  const minX = Math.min(...islands.map(i => i.x));
  const minY = Math.min(...islands.map(i => i.y));
  const maxX = Math.max(...islands.map(i => i.x + i.w));
  const maxY = Math.max(...islands.map(i => i.y + i.h));
  const bbW = maxX - minX;
  const bbH = maxY - minY;

  const numX = Math.max(1, Math.floor(bbW / (finalSize * 1.01)));
  const numY = Math.max(1, Math.floor(bbH / (finalSize * 1.01)));

  console.log(`[AutoDetect] Bounding Box: min(${minX},${minY}) max(${maxX},${maxY}) size(${bbW}x${bbH})`);
  console.log(`[AutoDetect] Estimated Grid: ${numX} columns, ${numY} rows based on size ${finalSize}`);

  const totalGapX = bbW - (numX * finalSize);
  const totalGapY = bbH - (numY * finalSize);
  
  const paddingX = numX > 1 ? (totalGapX / (numX - 1)) / 2 : 0;
  const paddingY = numY > 1 ? (totalGapY / (numY - 1)) / 2 : 0;

  console.log(`[AutoDetect] Padding Math X: (${bbW} - (${numX} * ${finalSize})) / (${numX}-1) / 2 = ${paddingX.toFixed(3)}`);
  console.log(`[AutoDetect] Padding Math Y: (${bbH} - (${numY} * ${finalSize})) / (${numY}-1) / 2 = ${paddingY.toFixed(3)}`);

  const targetPadding = finalSize * 0.03;
  const distX = Math.abs(paddingX - targetPadding);
  const distY = Math.abs(paddingY - targetPadding);
  const rawPadding = distX <= distY ? paddingX : paddingY;
  
  console.log(`[AutoDetect] Target padding (3% of cell): ${targetPadding.toFixed(3)}`);
  console.log(`[AutoDetect] Best fit padding: ${rawPadding.toFixed(3)} (picked ${distX <= distY ? 'X' : 'Y'} axis)`);

  let detectedPadding = Math.round(rawPadding);
  
  // Snap padding to P2 if within 1px of the RAW float value
  const paddingP2s = [0, 1, 2, 4, 8, 16, 32, 64];
  const nearestPaddingP2 = paddingP2s.reduce((prev, curr) => {
    const distPrev = Math.abs(prev - rawPadding);
    const distCurr = Math.abs(curr - rawPadding);
    return distCurr <= distPrev ? curr : prev;
  });
  
  if (Math.abs(rawPadding - nearestPaddingP2) <= 1.0) {
    console.log(`[AutoDetect] Padding Snapping: ${rawPadding.toFixed(3)} -> ${nearestPaddingP2} (within 1px of power-of-two)`);
    detectedPadding = nearestPaddingP2;
  } else {
    console.log(`[AutoDetect] Padding Snapping: Keeping rounded ${detectedPadding}`);
  }

  console.log(`[AutoDetect] FINAL RESULT -> Cell: ${finalSize}, Padding: ${detectedPadding}`);
  return { cellSize: finalSize, padding: detectedPadding };
}
