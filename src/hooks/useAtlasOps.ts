import { useCallback } from 'react';
import { AppState, TextureTile } from '../types';
import { GridGeometry } from '../lib/GridGeometry';
import { hexToRgb, findIslands } from '../lib/utils';
import { renderTilesToCanvas, generateId } from '../lib/canvas';
import { Command, SetMainTilesCommand } from '../lib/Commands';
import potpack from 'potpack';

export function useAtlasOps(
  state: AppState,
  canvasWidth: number,
  canvasHeight: number,
  mainAtlasGeo: GridGeometry,
  set: (v: AppState | ((p: AppState) => AppState)) => void,
  executeCommand: (c: Command | Command[]) => void,
  onAfterNewAtlas?: () => void
) {
  const packAtlas = useCallback(() => {
    let currentX = 0, currentY = 0, rowHeight = 0;
    const padding = 2;
    const sorted = [...state.mainTiles].sort((a, b) => (b.height * b.scale) - (a.height * a.scale));
    const packed = sorted.map(tile => {
      const sw = tile.width * tile.scale;
      const sh = tile.height * tile.scale;
      if (currentX + sw > canvasWidth) { currentX = 0; currentY += rowHeight + padding; rowHeight = 0; }
      const result = { ...tile, x: currentX, y: currentY };
      rowHeight = Math.max(rowHeight, sh);
      currentX += sw + padding;
      return result;
    });
    executeCommand(new SetMainTilesCommand(state.mainTiles, packed));
  }, [state.mainTiles, canvasWidth, executeCommand]);

  const fixGrid = useCallback(async () => {
    if (state.mainTiles.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.mainTiles, canvasWidth, canvasHeight,
      state.gridSettings.clearColor, { willReadFrequently: true }
    );
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    
    const finalIslands = findIslands(
      imageData, 
      state.gridSettings.clearColor, 
      state.gridSettings.clearTolerance ?? 15,
      true // useMedianFilter
    );

    const geo = mainAtlasGeo;
    const newTiles: TextureTile[] = finalIslands.map((isl, i) => {
      const stepX = geo.cellW + geo.padding * 2;
      const stepY = geo.cellH + geo.padding * 2;
      const col = Math.round((isl.x + isl.w / 2 - geo.padding - geo.cellW / 2) / stepX);
      const row = Math.round((isl.y + isl.h / 2 - geo.padding - geo.cellH / 2) / stepY);

      const islCanvas = document.createElement('canvas');
      islCanvas.width = geo.cellW; islCanvas.height = geo.cellH;
      islCanvas.getContext('2d')?.drawImage(canvas, isl.x, isl.y, isl.w, isl.h, 0, 0, geo.cellW, geo.cellH);

      return {
        id: `fixed-${i}-${Date.now()}`,
        name: `Island_${i}`,
        url: islCanvas.toDataURL(),
        x: geo.padding + col * stepX,
        y: geo.padding + row * stepY,
        width: geo.cellW, height: geo.cellH,
        scale: 1, hue: 0, brightness: 100,
      };
    });

    executeCommand(new SetMainTilesCommand(state.mainTiles, newTiles));
  }, [state.mainTiles, state.gridSettings.clearColor, state.gridSettings.clearTolerance, canvasWidth, canvasHeight, mainAtlasGeo, executeCommand]);

  const packElements = useCallback(async () => {
    if (state.mainTiles.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.mainTiles, canvasWidth, canvasHeight,
      state.gridSettings.clearColor, { willReadFrequently: true }
    );
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    
    const islands = findIslands(
      imageData,
      state.gridSettings.clearColor,
      state.gridSettings.clearTolerance ?? 15,
      false // useMedianFilter = false for packing
    );

    if (islands.length === 0) return;

    const padding = state.gridSettings.padding || 2;
    const boxes = await Promise.all(islands.map(async (isl) => {
      const blobCanvas = document.createElement('canvas');
      blobCanvas.width = isl.w; blobCanvas.height = isl.h;
      blobCanvas.getContext('2d')?.drawImage(canvas, isl.x, isl.y, isl.w, isl.h, 0, 0, isl.w, isl.h);
      return { ...isl, url: blobCanvas.toDataURL() };
    }));

    const packItems = boxes.map((b, i) => ({ w: b.w + padding * 2, h: b.h + padding * 2, i, x: 0, y: 0 }));

    if (state.gridSettings.packingAlgo === 'potpack') {
      potpack(packItems as any);
    } else {
      let currentX = 0, currentY = 0, maxHeight = 0;
      for (const item of packItems) {
        if (currentX + item.w > canvasWidth) { currentX = 0; currentY += maxHeight; maxHeight = 0; }
        item.x = currentX; item.y = currentY;
        currentX += item.w;
        if (item.h > maxHeight) maxHeight = item.h;
      }
    }

    const nextTiles = packItems.map(item => ({
      id: generateId(), url: boxes[item.i].url, name: `Packed_${item.i}`,
      width: boxes[item.i].w, height: boxes[item.i].h,
      x: item.x + padding, y: item.y + padding,
      hue: 0, brightness: 100, scale: 1, isCrop: true,
    }));
    executeCommand(new SetMainTilesCommand(state.mainTiles, nextTiles));
  }, [state.mainTiles, state.gridSettings, canvasWidth, canvasHeight, executeCommand]);

  const exportAtlas = useCallback(async () => {
    const canvas = await renderTilesToCanvas(
      state.mainTiles, canvasWidth, canvasHeight, state.gridSettings.clearColor
    );
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'atlas.png';
    link.click();
  }, [state.mainTiles, state.gridSettings.clearColor, canvasWidth, canvasHeight]);

  const createNewAtlas = useCallback((width: number, height?: number) => {
    let finalW = width, finalH = height ?? width;

    if (width === 0) {
      const inputW = prompt('Enter atlas width (e.g. 1024, 2048):', '2048');
      if (!inputW) return;
      finalW = parseInt(inputW);
      if (isNaN(finalW) || finalW <= 0) return;
      const inputH = prompt('Enter atlas height (leave blank for square):', inputW);
      finalH = inputH ? parseInt(inputH) : finalW;
      if (isNaN(finalH) || finalH <= 0) finalH = finalW;
    }

    set(prev => ({
      ...prev,
      canvasWidth: finalW, canvasHeight: finalH,
      mainTiles: [], atlasSwapMode: false,
    }));
    onAfterNewAtlas?.();
  }, [set, onAfterNewAtlas]);

  return { packAtlas, fixGrid, packElements, exportAtlas, createNewAtlas };
}
