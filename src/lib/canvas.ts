import { TextureAsset } from '../types';
import { hexToRgb, detectBackgroundColor } from './utils';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export async function canvasToBlobURL(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, type, quality);
  });
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export async function applyAlphaKey(img: HTMLImageElement, keyColor: { r: number, g: number, b: number, a: number } | null, tolerance: number): Promise<string> {
  const hex = keyColor ? `#${((1 << 24) + (keyColor.r << 16) + (keyColor.g << 8) + keyColor.b).toString(16).slice(1)}` : null;
  return processImageBackground(img, 'all', hex, tolerance);
}

export async function processImageBackground(
  img: HTMLImageElement, 
  mode: 'all' | 'contour', 
  keyColorHex: string | null, // null for auto
  tolerance: number
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  const key = keyColorHex ? hexToRgb(keyColorHex) : detectBackgroundColor(imageData, tolerance);
  const width = canvas.width;
  const height = canvas.height;

  if (mode === 'all') {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 5) continue;
      if (Math.abs(data[i] - key.r) <= tolerance &&
          Math.abs(data[i+1] - key.g) <= tolerance &&
          Math.abs(data[i+2] - key.b) <= tolerance) {
        data[i + 3] = 0;
      }
    }
  } else {
    // Contour mode: anything reachable from border matching key color is gone
    const reachable = new Uint8Array(width * height);
    const queue: [number, number][] = [];

    const isMatch = (x: number, y: number) => {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 5) return true;
      return Math.abs(data[idx] - key.r) <= tolerance &&
             Math.abs(data[idx+1] - key.g) <= tolerance &&
             Math.abs(data[idx+2] - key.b) <= tolerance;
    };

    const check = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = y * width + x;
      if (!reachable[idx] && isMatch(x, y)) {
        reachable[idx] = 1;
        queue.push([x, y]);
      }
    };

    for (let x = 0; x < width; x++) { check(x, 0); check(x, height - 1); }
    for (let y = 0; y < height; y++) { check(0, y); check(width - 1, y); }

    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      check(cx + 1, cy); check(cx - 1, cy);
      check(cx, cy + 1); check(cx, cy - 1);
    }

    for (let i = 0; i < reachable.length; i++) {
      if (reachable[i]) data[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return await canvasToBlobURL(canvas);
}

export async function renderEntriesToCanvas(
  entries: TextureAsset[],
  width: number,
  height: number,
  gridSettings: { 
    backgroundColor: string, 
    backgroundFillMode?: 'transparent' | 'solid',
    clearTolerance?: number
  },
  opts: { 
    willReadFrequently?: boolean, 
    sourceAsset?: TextureAsset | null,
    clearedCells?: string[],
    cellW?: number,
    cellH?: number,
    stepX?: number,
    stepY?: number
  } = {}
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: opts.willReadFrequently ?? false });
  if (!ctx) throw new Error('Could not get 2D context');

  // 1. Initial base coat (if solid)
  if (gridSettings.backgroundFillMode === 'solid') {
    ctx.fillStyle = gridSettings.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw source asset if present
  if (opts.sourceAsset) {
    const srcImg = await loadImage(opts.sourceAsset.sourceUrl || opts.sourceAsset.url);
    
    // Create temporary canvas to draw source then punch holes
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    
    if (tCtx) {
      tCtx.drawImage(srcImg, 0, 0, width, height);
      
      // Punch holes through the source image for any cells that should be transparent
      // This includes explicitly cleared cells AND cells where tiles have transparent backgrounds
      tCtx.globalCompositeOperation = 'destination-out';
      
      const paddingX = (opts.stepX && opts.cellW) ? (opts.stepX - opts.cellW) / 2 : 0;
      const paddingY = (opts.stepY && opts.cellH) ? (opts.stepY - opts.cellH) / 2 : 0;

      // Punch explicitly cleared cells
      if (opts.clearedCells && opts.clearedCells.length > 0 && opts.stepX && opts.stepY) {
        opts.clearedCells.forEach(key => {
          const [cx, cy] = key.split(',').map(Number);
          tCtx.fillRect(
            cx * opts.stepX! + paddingX, 
            cy * opts.stepY! + paddingY, 
            opts.cellW || opts.stepX!, 
            opts.cellH || opts.stepY!
          );
        });
      }

      // Punch cells that contain a tile with backgroundColor === 'transparent'
      // This ensures the source image doesn't show through the transparent tile
      if (opts.stepX && opts.stepY) {
        entries.forEach(entry => {
          if (entry.backgroundColor === 'transparent') {
            const centerX = entry.x + (entry.width * (entry.scaleX ?? entry.scale)) / 2;
            const centerY = entry.y + (entry.height * (entry.scaleY ?? entry.scale)) / 2;
            const cx = Math.floor(centerX / opts.stepX!);
            const cy = Math.floor(centerY / opts.stepY!);
            
            tCtx.fillRect(
              cx * opts.stepX! + paddingX,
              cy * opts.stepY! + paddingY,
              opts.cellW || opts.stepX!,
              opts.cellH || opts.stepY!
            );
          }
        });
      }

      ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  // 3. Draw entries
  const images = await Promise.all(entries.map(t => loadImage(t.url)));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const img = images[i];
    const dw = entry.width * (entry.scaleX ?? entry.scale);
    const dh = entry.height * (entry.scaleY ?? entry.scale);

    const sx = entry.sourceX ?? 0;
    const sy = entry.sourceY ?? 0;
    const sw = entry.sourceW ?? img.naturalWidth;
    const sh = entry.sourceH ?? img.naturalHeight;

    ctx.save();
    ctx.translate(entry.x, entry.y);

    // Clip to cell bounds
    ctx.beginPath();
    ctx.rect(0, 0, dw, dh);
    ctx.clip();

    if (entry.backgroundColor && entry.backgroundColor !== 'transparent') {
      ctx.fillStyle = entry.backgroundColor;
      ctx.fillRect(0, 0, dw, dh);
    }

    if (entry.hue !== 0 || entry.brightness !== 100 || entry.grayscale || entry.inverted) {
      let filter = `hue-rotate(${entry.hue}deg) brightness(${entry.brightness}%)`;
      if (entry.grayscale) filter += ' grayscale(100%)';
      if (entry.inverted) filter += ' invert(100%)';
      ctx.filter = filter;
    }

    const rotation = entry.rotation ?? 0;
    const px = entry.paddingX ?? 0;
    const py = entry.paddingY ?? 0;
    const ox = entry.offsetX ?? 0;
    const oy = entry.offsetY ?? 0;

    // Center of the cell
    ctx.translate(dw / 2 + ox, dh / 2 + oy);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Draw centered with padding
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2 + px, -dh / 2 + py, dw - 2 * px, dh - 2 * py);
    ctx.restore();
  }

  return canvas;
}

export const renderTilesToCanvas = renderEntriesToCanvas; // Alias for backward compatibility

