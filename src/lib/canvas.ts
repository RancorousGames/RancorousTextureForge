import { TextureAsset } from '../types';
import { hexToRgb } from './utils';

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

export async function applyAlphaKey(img: HTMLImageElement, keyColor: { r: number, g: number, b: number, a: number }, tolerance: number): Promise<string> {
  return processImageBackground(img, 'all', `#${((1 << 24) + (keyColor.r << 16) + (keyColor.g << 8) + keyColor.b).toString(16).slice(1)}`, tolerance);
}

export async function processImageBackground(
  img: HTMLImageElement, 
  mode: 'all' | 'contour', 
  keyColorHex: string, 
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
  const key = hexToRgb(keyColorHex);
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
  bgColor: string,
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

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 1. Draw source asset if present
  if (opts.sourceAsset) {
    const srcImg = await loadImage(opts.sourceAsset.sourceUrl || opts.sourceAsset.url);
    
    ctx.save();
    // If we have holes, we use a temporary canvas to apply them
    if (opts.clearedCells && opts.clearedCells.length > 0 && opts.stepX && opts.stepY) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.drawImage(srcImg, 0, 0, width, height);
        tCtx.globalCompositeOperation = 'destination-out';
        const paddingX = (opts.stepX - (opts.cellW || opts.stepX)) / 2;
        const paddingY = (opts.stepY - (opts.cellH || opts.stepY)) / 2;
        opts.clearedCells.forEach(key => {
          const [cx, cy] = key.split(',').map(Number);
          tCtx.fillRect(
            cx * opts.stepX! + paddingX, 
            cy * opts.stepY! + paddingY, 
            opts.cellW || opts.stepX!, 
            opts.cellH || opts.stepY!
          );
        });
        ctx.drawImage(tempCanvas, 0, 0);
      }
    } else {
      ctx.drawImage(srcImg, 0, 0, width, height);
    }
    ctx.restore();
  }

  // 2. Draw normal entries
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

    if (entry.hue !== 0 || entry.brightness !== 100) {
      ctx.filter = `hue-rotate(${entry.hue}deg) brightness(${entry.brightness}%)`;
    }

    const rotation = entry.rotation ?? 0;
    const p = entry.internalPadding ?? 0;

    // Center of the cell
    ctx.translate(dw / 2, dh / 2);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Draw centered with padding
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2 + p, -dh / 2 + p, dw - 2 * p, dh - 2 * p);
    ctx.restore();
  }

  return canvas;
}

export const renderTilesToCanvas = renderEntriesToCanvas; // Alias for backward compatibility

