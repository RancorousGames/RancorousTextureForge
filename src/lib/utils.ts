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

export function detectSettingsFromImage(
  imageData: ImageData,
  clearColorHex: string,
  tolerance: number
): { cellSize: number; padding: number } {
  const { width, height, data } = imageData;
  const clearColor = hexToRgb(clearColorHex);
  const visited = new Uint8Array(width * height);
  const islands: { x1: number, y1: number, x2: number, y2: number }[] = [];

  const isColorClose = (r: number, g: number, b: number, target: {r: number, g: number, b: number}) => {
    return Math.abs(r - target.r) <= tolerance && Math.abs(g - target.g) <= tolerance && Math.abs(b - target.b) <= tolerance;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x);
      if (visited[idx]) continue;
      const pIdx = idx * 4;
      const alpha = data[pIdx + 3];
      const isClear = alpha < 5 || isColorClose(data[pIdx], data[pIdx+1], data[pIdx+2], clearColor);
      
      if (!isClear) {
        let x1 = x, y1 = y, x2 = x, y2 = y;
        const queue: [number, number][] = [[x, y]];
        visited[idx] = 1;
        let head = 0;
        while (head < queue.length) {
          const [cx, cy] = queue[head++];
          x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
          x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
          const neighbors: [number, number][] = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (!visited[nIdx]) {
                const npIdx = nIdx * 4;
                const nIsClear = data[npIdx + 3] < 5 || isColorClose(data[npIdx], data[npIdx+1], data[npIdx+2], clearColor);
                if (!nIsClear) { visited[nIdx] = 1; queue.push([nx, ny]); }
              }
            }
          }
        }
        // Filter tiny islands (noise)
        if (x2 - x1 >= 8 && y2 - y1 >= 8) {
          islands.push({ x1, y1, x2, y2 });
        }
      }
    }
  }

  if (islands.length === 0) return { cellSize: 128, padding: 0 };

  // Calculate detected max dimension (square requirement)
  let maxW = 0;
  let maxH = 0;
  islands.forEach(i => {
    maxW = Math.max(maxW, i.x2 - i.x1 + 1);
    maxH = Math.max(maxH, i.y2 - i.y1 + 1);
  });
  
  const cellSize = Math.max(maxW, maxH);

  // Padding detection: look at gaps between centers
  // We'll look at the distribution of horizontal and vertical gaps
  const hGaps: number[] = [];
  const vGaps: number[] = [];
  
  // Sort islands by row-ish
  const sortedByY = [...islands].sort((a, b) => a.y1 - b.y1);
  for (let i = 0; i < sortedByY.length - 1; i++) {
    const a = sortedByY[i];
    const b = sortedByY[i+1];
    // If overlap significantly in X, might be in same column
    const xOverlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    if (xOverlap > 0) {
      const gap = b.y1 - a.y2 - 1;
      if (gap >= 0 && gap < cellSize) vGaps.push(gap);
    }
  }

  // Sort islands by col-ish
  const sortedByX = [...islands].sort((a, b) => a.x1 - b.x1);
  for (let i = 0; i < sortedByX.length - 1; i++) {
    const a = sortedByX[i];
    const b = sortedByX[i+1];
    // If overlap significantly in Y, might be in same row
    const yOverlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (yOverlap > (cellSize * 0.5)) {
      const gap = b.x1 - a.x2 - 1;
      if (gap >= 0 && gap < cellSize) hGaps.push(gap);
    }
  }

  const getMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.75)]; // Use 75th percentile to be more aggressive with gap detection
  };

  const detectedHGap = getMedian(hGaps);
  const detectedVGap = getMedian(vGaps);
  
  // If we detected a gap, it means our initial cellSize (maxW/maxH) 
  // might have been correct OR it might have been the full step.
  // Actually, islands are detected by content, so they are the cell content.
  // Gaps are truly between content.
  const padding = Math.floor(Math.max(detectedHGap, detectedVGap) / 2);

  // Snapping logic: Prefer Power of 2 if within 15%
  let finalCellSize = cellSize;
  const p2s = [32, 64, 128, 256, 512, 1024, 2048];
  const nearestP2 = p2s.reduce((prev, curr) => 
    Math.abs(curr - cellSize) < Math.abs(prev - cellSize) ? curr : prev
  );

  if (Math.abs(nearestP2 - cellSize) / nearestP2 < 0.15) {
    finalCellSize = nearestP2;
  } else {
    finalCellSize = Math.round(cellSize / 4) * 4;
  }

  return { 
    cellSize: finalCellSize,
    padding: Math.max(0, padding)
  };
}
