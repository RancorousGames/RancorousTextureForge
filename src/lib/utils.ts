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

  // 4. Median Filter
  if (useMedianFilter && filtered.length > 0) {
    const areas = filtered.map(isl => isl.w * isl.h).sort((a, b) => a - b);
    const medianArea = areas[Math.floor(areas.length / 2)];
    return filtered.filter(isl => (isl.w * isl.h) >= (medianArea * 0.5));
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

  // Determine Padding by looking at gaps between islands
  const hGaps: number[] = [];
  const vGaps: number[] = [];
  
  // X-Gaps (Vertical gutters)
  const sortedX = [...islands].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sortedX.length - 1; i++) {
    const a = sortedX[i], b = sortedX[i+1];
    const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (yOverlap > 0) {
      const gap = b.x - (a.x + a.w);
      if (gap >= 0 && gap < rawSize) hGaps.push(gap);
    }
  }

  // Y-Gaps (Horizontal gutters)
  const sortedY = [...islands].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sortedY.length - 1; i++) {
    const a = sortedY[i], b = sortedY[i+1];
    const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (xOverlap > 0) {
      const gap = b.y - (a.y + a.h);
      if (gap >= 0 && gap < rawSize) vGaps.push(gap);
    }
  }

  const hGap = getMedian(hGaps);
  const vGap = getMedian(vGaps);
  const detectedGap = Math.max(hGap, vGap);

  const p2s = [32, 64, 128, 256, 512, 1024];
  const nearestP2 = p2s.reduce((prev, curr) => Math.abs(curr - rawSize) < Math.abs(prev - rawSize) ? curr : prev);
  let finalSize = Math.round(rawSize / 4) * 4;
  if (Math.abs(nearestP2 - rawSize) / nearestP2 <= 0.15) finalSize = nearestP2;

  return { cellSize: finalSize, padding: Math.round(detectedGap / 2) };
}
