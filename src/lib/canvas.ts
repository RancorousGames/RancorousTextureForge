import { TextureAsset } from '../types';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
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
    if (entry.hue !== 0 || entry.brightness !== 100) {
      ctx.filter = `hue-rotate(${entry.hue}deg) brightness(${entry.brightness}%)`;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  }

  return canvas;
}

export const renderTilesToCanvas = renderEntriesToCanvas; // Alias for backward compatibility

