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

  console.log(`[Forge-Detect] === GRID SPAN ANALYSIS ===`);
  console.log(`[Forge-Detect] Buffer: ${width}x${height}`);

  const isClear = (idx: number) => {
    const p = idx * 4;
    const r = data[p], g = data[p+1], b = data[p+2], a = data[p+3];
    if (a < 5) return true;
    return Math.abs(r - clearColor.r) <= tolerance && 
           Math.abs(g - clearColor.g) <= tolerance && 
           Math.abs(b - clearColor.b) <= tolerance;
  };

  const colEnergy = new Float32Array(width);
  const rowEnergy = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isClear(y * width + x)) {
        colEnergy[x]++;
        rowEnergy[y]++;
      }
    }
  }

  const getMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const findContentBands = (energy: Float32Array) => {
    const maxEnergy = Math.max(...Array.from(energy));
    if (maxEnergy <= 0) return [];

    const threshold = Math.max(1, Math.floor(maxEnergy * 0.03));
    const maxBridge = 2;
    const bands: { start: number; end: number; size: number }[] = [];
    let start = -1;
    let inactiveRun = 0;

    for (let i = 0; i < energy.length; i++) {
      if (energy[i] >= threshold) {
        if (start === -1) start = i;
        inactiveRun = 0;
        continue;
      }

      if (start === -1) continue;

      inactiveRun++;
      if (inactiveRun <= maxBridge) continue;

      const end = i - inactiveRun;
      if (end >= start) {
        const size = end - start + 1;
        if (size >= 4) bands.push({ start, end, size });
      }
      start = -1;
      inactiveRun = 0;
    }

    if (start !== -1) {
      const end = energy.length - 1 - inactiveRun;
      if (end >= start) {
        const size = end - start + 1;
        if (size >= 4) bands.push({ start, end, size });
      }
    }

    return bands;
  };

  const summarizeBands = (bands: { start: number; end: number; size: number }[]) => {
    const steps: number[] = [];
    const gaps: number[] = [];
    for (let i = 0; i < bands.length - 1; i++) {
      steps.push(bands[i + 1].start - bands[i].start);
      gaps.push(bands[i + 1].start - bands[i].end - 1);
    }

    return {
      size: getMedian(bands.map((band) => band.size)),
      step: getMedian(steps),
      gap: getMedian(gaps.filter((gap) => gap > 0)),
    };
  };

  const xBands = findContentBands(colEnergy);
  const yBands = findContentBands(rowEnergy);

  console.log(`[Forge-Detect] Bands: X=${xBands.length} Y=${yBands.length}`);

  if (xBands.length === 0 || yBands.length === 0) return { cellSize: 128, padding: 0 };

  const xSummary = summarizeBands(xBands);
  const ySummary = summarizeBands(yBands);
  const detectedSize = Math.max(xSummary.size, ySummary.size);
  const detectedStep = Math.max(xSummary.step, ySummary.step);
  const detectedGap = Math.max(xSummary.gap, ySummary.gap);

  console.log(`[Forge-Detect] Raw Size: ${detectedSize}, Step: ${detectedStep}, Gap: ${detectedGap}`);

  const p2s = [32, 64, 128, 256, 512, 1024];
  const nearestP2 = p2s.reduce((prev, curr) => 
    Math.abs(curr - detectedSize) < Math.abs(prev - detectedSize) ? curr : prev
  );

  let finalSize = Math.round(detectedSize / 4) * 4;
  if (Math.abs(nearestP2 - detectedSize) / nearestP2 <= 0.125) {
    finalSize = nearestP2;
  }

  let finalPadding = 0;
  if (detectedGap > 0) {
    finalPadding = Math.round(detectedGap / 2);
  } else if (detectedStep > finalSize) {
    finalPadding = Math.round((detectedStep - finalSize) / 2);
  }

  console.log(`[Forge-Detect] === RESULT: ${finalSize} / ${finalPadding} ===`);
  return { cellSize: finalSize, padding: Math.max(0, finalPadding) };
}
