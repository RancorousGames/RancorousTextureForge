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

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function detectBackgroundColor(imageData: ImageData, tolerance: number = 10): RGBA {

  const startTime = performance.now();
  const { width, height, data } = imageData;
  
  const getPixel = (x: number, y: number): RGBA => {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };
  };

  const corners = [
    getPixel(0, 0),
    getPixel(width - 1, 0),
    getPixel(0, height - 1),
    getPixel(width - 1, height - 1)
  ];

  const isSimilar = (c1: RGBA, c2: RGBA) => {
    // If both are mostly transparent, they match
    if (c1.a < 5 && c2.a < 5) return true;
    // If only one is transparent, they don't match
    if ((c1.a < 5) !== (c2.a < 5)) return false;
    
    return Math.abs(c1.r - c2.r) <= tolerance &&
           Math.abs(c1.g - c2.g) <= tolerance &&
           Math.abs(c1.b - c2.b) <= tolerance;
  };

  const groups: { color: RGBA, count: number, indices: number[] }[] = [];

  for (let i = 0; i < corners.length; i++) {
    let found = false;
    for (const group of groups) {
      if (isSimilar(corners[i], group.color)) {
        group.count++;
        group.indices.push(i);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({ color: corners[i], count: 1, indices: [i] });
    }
  }

  // Majority consensus (>= 3 out of 4)
  const majorityGroup = groups.find(g => g.count >= 3);
  if (majorityGroup) {
    console.log(`[detectBackgroundColor] Majority consensus found: rgba(${majorityGroup.color.r},${majorityGroup.color.g},${majorityGroup.color.b},${majorityGroup.color.a}) (${majorityGroup.count}/4 corners). Time: ${(performance.now() - startTime).toFixed(2)}ms`);
    return majorityGroup.color;
  }

  // No majority, scan diagonal
  console.log(`[detectBackgroundColor] No majority among corners. Scanning diagonal...`);
  const cornerMatches = new Array(corners.length).fill(0);
  const steps = Math.min(width, height, 100);
  for (let i = 0; i < steps; i++) {
    const x = Math.floor((i / (steps - 1)) * (width - 1));
    const y = Math.floor((i / (steps - 1)) * (height - 1));
    const px = getPixel(x, y);
    
    for (let j = 0; j < corners.length; j++) {
      if (isSimilar(px, corners[j])) {
        cornerMatches[j]++;
      }
    }
  }

  let maxIdx = 0;
  for (let i = 1; i < cornerMatches.length; i++) {
    if (cornerMatches[i] > cornerMatches[maxIdx]) {
      maxIdx = i;
    }
  }

  const resultColor = corners[maxIdx];
  console.log(`[detectBackgroundColor] Diagonal scan chose corner ${maxIdx}: rgba(${resultColor.r},${resultColor.g},${resultColor.b},${resultColor.a}). Total Time: ${(performance.now() - startTime).toFixed(2)}ms`);
  return resultColor;
}

export function findIslands(
  imageData: ImageData,
  clearColorHex: string,
  tolerance: number,
  useMedianFilter: boolean = true,
  seedPoint?: { x: number, y: number }
): { x: number; y: number; w: number; h: number }[] {
  const startTime = performance.now();
  const { width, height, data } = imageData;
  const clearColor = hexToRgb(clearColorHex);
  const visited = new Uint8Array(width * height);
  const reachable = new Uint8Array(width * height);

  console.log(`[findIslands] Starting detection on ${width}x${height} image. ClearColor: rgb(${clearColor.r},${clearColor.g},${clearColor.b}), Tolerance: ${tolerance}${seedPoint ? `, Seed: (${seedPoint.x},${seedPoint.y})` : ''}`);

  const isClearColored = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 5) return true;
    return Math.abs(data[idx] - clearColor.r) <= tolerance &&
           Math.abs(data[idx + 1] - clearColor.g) <= tolerance &&
           Math.abs(data[idx + 2] - clearColor.b) <= tolerance;
  };

  // 1. Reachable Background pass (Flood-fill from borders)
  const step1Start = performance.now();
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

  console.log(`[findIslands] Step 1: Background flood-fill complete. Marked ${bgQueue.length} pixels as reachable background. Time: ${(performance.now() - step1Start).toFixed(2)}ms`);

  const isNotBg = (x: number, y: number) => reachable[y * width + x] === 0;

  // 2. Island detection
  const step2Start = performance.now();
  const rawIslands: { x: number; y: number; w: number; h: number }[] = [];
  
  if (seedPoint) {
    // Targeted detection from seed point
    const sx = Math.floor(seedPoint.x), sy = Math.floor(seedPoint.y);
    const sidx = sy * width + sx;
    const isBg = !isNotBg(sx, sy);
    const pidx = sidx * 4;
    console.log(`[findIslands] Debug Seed (${sx},${sy}): pixel=rgba(${data[pidx]},${data[pidx+1]},${data[pidx+2]},${data[pidx+3]}), isBackground=${isBg}, isClearColored=${isClearColored(sx, sy)}`);

    // Neighborhood scan
    const radius = 2;
    let fgCount = 0;
    for (let ny = sy - radius; ny <= sy + radius; ny++) {
      for (let nx = sx - radius; nx <= sx + radius; nx++) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (isNotBg(nx, ny)) fgCount++;
        }
      }
    }
    console.log(`[findIslands] Neighborhood scan (radius ${radius}): found ${fgCount} foreground pixels in ${((radius*2+1)**2)} sample area.`);

    if (sx >= 0 && sx < width && sy >= 0 && sy < height && isNotBg(sx, sy)) {
      let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
      const queue: [number, number][] = [[sx, sy]];
      visited[sy * width + sx] = 1;
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
      rawIslands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
    }
  } else {
    // Global scan
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
  }

  console.log(`[findIslands] Step 2: Found ${rawIslands.length} raw foreground clusters. Time: ${(performance.now() - step2Start).toFixed(2)}ms`);

  // 3. Containment Filter
  const step3Start = performance.now();
  const filtered = rawIslands
    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    .filter((inner, idx, arr) => {
      for (let i = 0; i < idx; i++) {
        const outer = arr[i];
        if (inner.x >= outer.x && inner.y >= outer.y && (inner.x+inner.w) <= (outer.x+outer.w) && (inner.y+inner.h) <= (outer.y+outer.h)) return false;
      }
      return true;
    });

  console.log(`[findIslands] Step 3: Containment filter reduced ${rawIslands.length} -> ${filtered.length} islands. Time: ${(performance.now() - step3Start).toFixed(2)}ms`);

  // 4. Median Filter
  if (useMedianFilter && filtered.length > 0) {
    const step4Start = performance.now();
    const areas = filtered.map(isl => isl.w * isl.h).sort((a, b) => a - b);
    const medianArea = areas[Math.floor(areas.length / 2)];
    const result = filtered.filter(isl => (isl.w * isl.h) >= (medianArea * 0.5));
    console.log(`[findIslands] Step 4: Median area filter (${medianArea}px). Reduced ${filtered.length} -> ${result.length} islands. Time: ${(performance.now() - step4Start).toFixed(2)}ms`);
    console.log(`[findIslands] Total Time: ${(performance.now() - startTime).toFixed(2)}ms`);
    return result;
  }

  console.log(`[findIslands] Total Time: ${(performance.now() - startTime).toFixed(2)}ms`);
  return filtered;
}

export function detectSettingsFromImage(
  imageData: ImageData,
  clearColorHex: string,
  tolerance: number,
  useMedianFilter: boolean = true
): { cellSize: number; padding: number; islands: { x: number; y: number; w: number; h: number }[] } {
  const startTime = performance.now();
  const islands = findIslands(imageData, clearColorHex, tolerance, useMedianFilter);
  if (islands.length === 0) return { cellSize: 128, padding: 0, islands: [] };

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

  console.log(`[AutoDetect] FINAL RESULT -> Cell: ${finalSize}, Padding: ${detectedPadding}. Total Time: ${(performance.now() - startTime).toFixed(2)}ms`);
  return { cellSize: finalSize, padding: detectedPadding, islands };
}

export function checkGridDensity(
  imageWidth: number,
  imageHeight: number,
  cellWidth: number,
  cellHeight: number
): { cellSize: number; cellY: number } | null {
  const maxRatio = 30;
  const ratioX = imageWidth / cellWidth;
  const ratioY = imageHeight / cellHeight;

  if (ratioX > maxRatio || ratioY > maxRatio) {
    const message = `The current grid settings result in a very high density (${Math.max(ratioX, ratioY).toFixed(1)} cells across). This might be slow to process and render. \n\nClick OK to continue anyway, or CANCEL to use a safer density (1/16th of resolution).`;
    if (confirm(message)) {
      return { cellSize: cellWidth, cellY: cellHeight };
    } else {
      const safeSize = Math.max(16, Math.floor(Math.max(imageWidth, imageHeight) / 16));
      return { cellSize: safeSize, cellY: safeSize };
    }
  }
  return { cellSize: cellWidth, cellY: cellHeight };
}
