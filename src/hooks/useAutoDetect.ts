import { useCallback } from 'react';
import { AppState, GridSettings, TextureTile } from '../types';
import { rgbToHex, detectSettingsFromImage, detectBackgroundColor } from '../lib/utils';
import { loadImage, renderTilesToCanvas } from '../lib/canvas';

export function useAutoDetect(
  state: AppState,
  canvasWidth: number,
  canvasHeight: number,
  set: (v: AppState | ((p: AppState) => AppState)) => void,
  onSettingsDetected?: (gs: GridSettings) => void
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

    const tolerance = state.gridSettings.clearTolerance ?? 10;
    const keyColor = detectBackgroundColor(imageData, tolerance);
    const detectedClearColor = rgbToHex(keyColor.r, keyColor.g, keyColor.b);
    console.log(`[AutoDetect] Main Grid: Detected background color ${detectedClearColor}.`);

    const { cellSize, padding } = detectSettingsFromImage(imageData, detectedClearColor, tolerance, true);

    const newSettings: GridSettings = {
      ...state.gridSettings,
      clearColor: detectedClearColor,
      cellSize, cellY: cellSize,
      padding, keepSquare: true,
    };

    console.log(`[AutoDetect] Applying Main Grid settings: Cell=${cellSize}, Pad=${padding}, Color=${detectedClearColor}`);
    set(prev => ({ ...prev, gridSettings: newSettings }));
    onSettingsDetected?.(newSettings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mainTiles, state.gridSettings, canvasWidth, canvasHeight, set, onSettingsDetected]);

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

    const tolerance = state.sourceGridSettings.clearTolerance ?? 10;
    const keyColor = detectBackgroundColor(imageData, tolerance);
    const detectedClearColor = rgbToHex(keyColor.r, keyColor.g, keyColor.b);
    console.log(`[AutoDetect] Source Grid: Detected background color ${detectedClearColor}.`);
    
    const { cellSize, padding } = detectSettingsFromImage(
      imageData, detectedClearColor, tolerance
    );

    console.log(`[AutoDetect] Applying Source Grid settings: Cell=${cellSize}, Pad=${padding}, Color=${detectedClearColor}`);
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
