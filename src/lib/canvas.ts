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
  opts: { willReadFrequently?: boolean } = {}
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: opts.willReadFrequently ?? false });
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Load all images in parallel — avoids sequential I/O stalls and ensures the
  // entire tile set is resolved before any drawing begins (no mid-draw state drift).
  const images = await Promise.all(tiles.map(t => loadImage(t.url)));

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const img = images[i];
    const dw = tile.width * tile.scale;
    const dh = tile.height * tile.scale;

    ctx.save();
    ctx.translate(tile.x, tile.y);
    // Only engage the filter pipeline when values are non-identity — avoids a
    // software-rasterised compositing path for the common case.
    if (tile.hue !== 0 || tile.brightness !== 100) {
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
    }
    // 9-arg form: explicitly map the full source image to the destination rect,
    // so the render is correct regardless of the image's natural dimensions.
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, dw, dh);
    ctx.restore();
  }

  return canvas;
}
