import fs from 'fs';

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function detectSettingsFromImage(
  imageData,
  clearColorHex,
  tolerance
) {
  const { width, height, data } = imageData;
  const clearColor = hexToRgb(clearColorHex);
  
  console.log(`[Forge-Detect] === GLOBAL PEAK ANALYSIS ===`);
  console.log(`[Forge-Detect] Buffer Dimensions: ${width}x${height}`);

  const isClear = (idx) => {
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

  const findClusters = (energy, label) => {
    const maxEnergy = Math.max(...Array.from(energy));
    const threshold = Math.max(2, maxEnergy * 0.15); 
    console.log(`[Forge-Detect] ${label} Peak Energy: ${maxEnergy.toFixed(1)}, Threshold: ${threshold.toFixed(1)}`);

    const clusters = [];
    let start = -1;
    
    for (let i = 0; i < energy.length; i++) {
      const active = energy[i] > threshold;
      if (active && start === -1) {
        start = i;
      } else if (!active && start !== -1) {
        let isRealGap = true;
        for (let lookahead = 1; lookahead <= 4 && (i + lookahead) < energy.length; lookahead++) {
          if (energy[i + lookahead] > threshold) {
            isRealGap = false;
            break;
          }
        }

        if (isRealGap) {
          const size = i - start;
          if (size >= 8) clusters.push({ start, end: i - 1, size });
          start = -1;
        }
      }
    }
    if (start !== -1) {
      const size = energy.length - start;
      if (size >= 8) clusters.push({ start, end: energy.length - 1, size });
    }
    return clusters;
  };

  const colClusters = findClusters(colEnergy, "Col");
  const rowClusters = findClusters(rowEnergy, "Row");

  console.log(`[Forge-Detect] Clusters Found: X:${colClusters.length} Y:${rowClusters.length}`);

  if (colClusters.length === 0 || rowClusters.length === 0) {
    return { cellSize: 128, padding: 0 };
  }

  const getMedian = (arr) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const medianW = getMedian(colClusters.map(c => c.size));
  const medianH = getMedian(rowClusters.map(c => c.size));
  const baseSize = Math.max(medianW, medianH);

  const findStep = (clusters) => {
    if (clusters.length < 2) return 0;
    const diffs = [];
    for (let i = 0; i < clusters.length - 1; i++) {
      diffs.push(clusters[i+1].start - clusters[i].start);
    }
    return getMedian(diffs);
  };

  const stepX = findStep(colClusters);
  const stepY = findStep(rowClusters);
  const medianStep = Math.max(stepX, stepY);

  console.log(`[Forge-Detect] Median Sizes: ${medianW}x${medianH}, Median Step: ${medianStep}`);

  let padding = 0;
  if (medianStep > baseSize) {
    padding = Math.floor((medianStep - baseSize) / 2);
  } else {
    const findGaps = (clusters) => {
      const gaps = [];
      for (let i = 0; i < clusters.length - 1; i++) {
        gaps.push(clusters[i+1].start - clusters[i].end - 1);
      }
      return getMedian(gaps);
    };
    const gap = Math.max(findGaps(colClusters), findGaps(rowClusters));
    padding = Math.floor(gap / 2);
  }

  let finalSize = baseSize;
  const p2s = [32, 64, 128, 256, 512, 1024];
  const nearestP2 = p2s.reduce((prev, curr) => 
    Math.abs(curr - baseSize) < Math.abs(prev - baseSize) ? curr : prev
  );

  if (Math.abs(nearestP2 - baseSize) / nearestP2 < 0.25) {
    finalSize = nearestP2;
    if (medianStep > 0) {
      padding = Math.floor((medianStep - finalSize) / 2);
    }
  } else {
    finalSize = Math.round(baseSize / 4) * 4;
  }

  console.log(`[Forge-Detect] Final Calculation: cellSize=${finalSize}, padding=${padding}`);
  return { cellSize: finalSize, padding: Math.max(0, padding) };
}

const buffer = fs.readFileSync('test2_raw.bin');
const imageData = {
  width: 666,
  height: 999,
  data: new Uint8Array(buffer)
};

detectSettingsFromImage(imageData, '#000000', 10);
