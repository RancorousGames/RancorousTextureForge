import { TextureTile } from '../types';

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

export async function renderTilesToCanvas(
  tiles: TextureTile[],
  width: number,
  height: number,
  bgColor: string,
  opts: { 
    willReadFrequently?: boolean, 
    sourceTile?: TextureTile | null,
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

  // 1. Draw source tile if present
  if (opts.sourceTile) {
    const srcImg = await loadImage(opts.sourceTile.sourceUrl || opts.sourceTile.url);
    
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
        opts.clearedCells.forEach(key => {
          const [cx, cy] = key.split(',').map(Number);
          tCtx.fillRect(cx * opts.stepX!, cy * opts.stepY!, opts.cellW || opts.stepX!, opts.cellH || opts.stepY!);
        });
        ctx.drawImage(tempCanvas, 0, 0);
      }
    } else {
      ctx.drawImage(srcImg, 0, 0, width, height);
    }
    ctx.restore();
  }

  // 2. Draw normal tiles
  const images = await Promise.all(tiles.map(t => loadImage(t.url)));

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const img = images[i];
    const dw = tile.width * (tile.scaleX ?? tile.scale);
    const dh = tile.height * (tile.scaleY ?? tile.scale);

    ctx.save();
    ctx.translate(tile.x, tile.y);
    if (tile.hue !== 0 || tile.brightness !== 100) {
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
    }
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, dw, dh);
    ctx.restore();
  }

  return canvas;
}

