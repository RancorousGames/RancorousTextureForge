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
  for (const tile of tiles) {
    const img = await loadImage(tile.url);
    ctx.save();
    ctx.translate(tile.x, tile.y);
    ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
    ctx.drawImage(img, 0, 0, tile.width * tile.scale, tile.height * tile.scale);
    ctx.restore();
  }
  return canvas;
}
