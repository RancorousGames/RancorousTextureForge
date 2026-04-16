import { useCallback } from 'react';
import { AppState, TextureTile } from '../types';
import { rgbToHex, detectSettingsFromImage } from '../lib/utils';
import { loadImage, renderTilesToCanvas } from '../lib/canvas';

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

    const { cellSize, padding } = detectSettingsFromImage(imageData, detectedClearColor, tolerance, true);

    set(prev => ({
      ...prev,
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
