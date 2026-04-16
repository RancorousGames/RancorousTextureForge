import { useCallback } from 'react';
import { AppState, TextureTile } from '../types';
import { rgbToHex, detectSettingsFromImage, findIslands } from '../lib/utils';
import { loadImage, renderTilesToCanvas, generateId } from '../lib/canvas';

export function useAutoDetect(
  state: AppState,
  canvasWidth: number,
  canvasHeight: number,
  set: (v: AppState | ((p: AppState) => AppState)) => void
) {
  const handleAutoDetectMainGrid = useCallback(async () => {
    let imageData: ImageData | null = null;

    const sharedSourceUrls = Array.from(new Set(
      state.mainTiles.map(t => t.sourceUrl).filter((u): u is string => Boolean(u))
    ));

    if (sharedSourceUrls.length === 1) {
      const img = await loadImage(sharedSourceUrls[0]).catch(() => null);
      if (img) {
        const realW = img.naturalWidth || img.width;
        const realH = img.naturalHeight || img.height;
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = realW; sourceCanvas.height = realH;
        const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, realW, realH);
          imageData = ctx.getImageData(0, 0, realW, realH);
        }
      }
    }

    if (!imageData) {
      const canvas = await renderTilesToCanvas(
        state.mainTiles, canvasWidth, canvasHeight,
        state.gridSettings.clearColor, { willReadFrequently: true }
      );
      imageData = canvas.getContext('2d')!.getImageData(0, 0, canvasWidth, canvasHeight);
    }

    const [r, g, b] = [imageData.data[0], imageData.data[1], imageData.data[2]];
    const detectedClearColor = rgbToHex(r, g, b);
    const tolerance = state.gridSettings.clearTolerance ?? 10;

    const { cellSize, padding } = detectSettingsFromImage(imageData, detectedClearColor, tolerance);
    const islands = findIslands(imageData, detectedClearColor, tolerance);

    const capturedImageData = imageData;
    const nextTiles = await Promise.all(islands.map(async (island, i) => {
      const step = cellSize + 2 * padding;
      const col = Math.round((island.x + island.w / 2 - padding - cellSize / 2) / step);
      const row = Math.round((island.y + island.h / 2 - padding - cellSize / 2) / step);

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = island.w; cropCanvas.height = island.h;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = capturedImageData.width; tempCanvas.height = capturedImageData.height;
      tempCanvas.getContext('2d')?.putImageData(capturedImageData, 0, 0);
      cropCanvas.getContext('2d')?.drawImage(tempCanvas, island.x, island.y, island.w, island.h, 0, 0, island.w, island.h);

      const blob = await new Promise<Blob | null>(resolve => cropCanvas.toBlob(resolve, 'image/png'));
      const url = blob ? URL.createObjectURL(blob) : '';

      return {
        id: generateId(),
        name: `Normalized ${col},${row}`,
        url,
        x: padding + col * step,
        y: padding + row * step,
        width: island.w, height: island.h,
        scale: 1,
        scaleX: cellSize / island.w,
        scaleY: cellSize / island.h,
        hue: 0, brightness: 100,
        sourceUrl: sharedSourceUrls[0] || '',
        sourceX: island.x, sourceY: island.y,
        sourceW: island.w, sourceH: island.h,
      } satisfies TextureTile;
    }));

    set(prev => ({
      ...prev,
      mainTiles: nextTiles,
      gridSettings: {
        ...prev.gridSettings,
        clearColor: detectedClearColor,
        cellSize, cellY: cellSize,
        padding, keepSquare: true,
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mainTiles, state.gridSettings, canvasWidth, canvasHeight, set]);

  const handleAutoDetectSourceGrid = useCallback(async (sourceTile: TextureTile) => {
    const img = await loadImage(sourceTile.sourceUrl || sourceTile.url).catch(() => null);
    if (!img) return;

    const realW = img.naturalWidth || img.width;
    const realH = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = realW; canvas.height = realH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, realW, realH);
    const imageData = ctx.getImageData(0, 0, realW, realH);

    const [r, g, b] = [imageData.data[0], imageData.data[1], imageData.data[2]];
    const detectedClearColor = rgbToHex(r, g, b);
    const { cellSize, padding } = detectSettingsFromImage(
      imageData, detectedClearColor, state.sourceGridSettings.clearTolerance ?? 10
    );

    set(prev => ({
      ...prev,
      sourceGridSettings: {
        ...prev.sourceGridSettings,
        clearColor: detectedClearColor,
        cellSize, cellY: cellSize,
        padding, keepSquare: true,
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sourceGridSettings, set]);

  return { handleAutoDetectMainGrid, handleAutoDetectSourceGrid };
}
