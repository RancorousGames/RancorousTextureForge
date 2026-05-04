import { useCallback } from 'react';
import { AppState, TextureAsset } from '../types';
import { SetMainTilesCommand } from '../lib/Commands';
import { renderTilesToCanvas, canvasToBlobURL, generateId, loadImage } from '../lib/canvas';
import { hexToRgb, detectSettingsFromImage } from '../lib/utils';
import { GridGeometry } from '../lib/GridGeometry';

export function useAtlasOps(
  state: AppState,
  canvasWidth: number,
  canvasHeight: number,
  mainAtlasGeo: GridGeometry,
  set: (v: AppState | ((p: AppState) => AppState)) => void,
  executeCommand: (cmd: any) => void,
  onCommandExecuted?: () => void
) {
  const packAtlas = useCallback(async () => {
    if (state.atlasEntries.length === 0) return;

    const items = state.atlasEntries.map((entry, idx) => ({
      w: (entry.width * (entry.scaleX ?? entry.scale)) + (state.gridSettings.padding * 2),
      h: (entry.height * (entry.scaleY ?? entry.scale)) + (state.gridSettings.padding * 2),
      originalIdx: idx
    }));

    if (state.gridSettings.packingAlgo === 'shelf') {
       const sorted = [...items].sort((a, b) => b.h - a.h);
       let x = 0, y = 0, rowH = 0;
       sorted.forEach(item => {
         if (x + item.w > canvasWidth) {
           x = 0;
           y += rowH;
           rowH = 0;
         }
         (item as any).x = x;
         (item as any).y = y;
         x += item.w;
         rowH = Math.max(rowH, item.h);
       });
    } else {
       const potpack = (await import('potpack')).default;
       potpack(items as any);
    }

    const nextEntries = items.map((item: any) => {
      const entry = state.atlasEntries[item.originalIdx];
      return {
        ...entry,
        x: item.x + state.gridSettings.padding,
        y: item.y + state.gridSettings.padding
      };
    });

    executeCommand(new SetMainTilesCommand(state.atlasEntries, nextEntries, state.atlasStatus, 'baked', state.lastMainAssetId, state.lastMainAssetId));
    onCommandExecuted?.();
  }, [state.atlasEntries, state.gridSettings, state.atlasStatus, state.lastMainAssetId, canvasWidth, executeCommand, onCommandExecuted]);

  const createNewAtlas = useCallback((size: number) => {
    let finalSize = size;
    if (finalSize === 0) {
      const input = prompt("Enter resolution (e.g. 2048):", "2048");
      if (!input) return;
      finalSize = parseInt(input);
      if (isNaN(finalSize)) return;
    }
    set(prev => ({
      ...prev,
      canvasWidth: finalSize,
      canvasHeight: finalSize,
      atlasEntries: [],
      clearedCells: [],
      atlasStatus: 'parametric',
      lastMainAssetId: null
    }));
    onCommandExecuted?.();
  }, [set, onCommandExecuted]);

  const packElements = useCallback(async () => {
    if (state.atlasEntries.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight,
      state.gridSettings, { willReadFrequently: true }
    );
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvasWidth, canvasHeight);
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const { r: bgR, g: bgG, b: bgB } = hexToRgb(state.gridSettings.backgroundColor);
    const tolerance = state.gridSettings.clearTolerance ?? 10;
    console.log(`[PackElements] Starting island detection. Background: rgb(${bgR},${bgG},${bgB}), Tolerance: ${tolerance}`);

    const isBg = (x: number, y: number) => {
      const idx = (y * canvasWidth + x) * 4;
      if (data[idx + 3] < 5) return true;
      return Math.abs(data[idx] - bgR) <= tolerance &&
             Math.abs(data[idx + 1] - bgG) <= tolerance &&
             Math.abs(data[idx + 2] - bgB) <= tolerance;
    };

    const islands: { x: number, y: number, w: number, h: number }[] = [];
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        if (!visited[y * canvasWidth + x] && !isBg(x, y)) {
          let minX = x, maxX = x, minY = y, maxY = y;
          const queue: [number, number][] = [[x, y]];
          visited[y * canvasWidth + x] = 1;

          let head = 0;
          while (head < queue.length) {
            const [cx, cy] = queue[head++];
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

            const neighbors: [number, number][] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight && !visited[ny * canvasWidth + nx] && !isBg(nx, ny)) {
                visited[ny * canvasWidth + nx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
          islands.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      }
    }

    console.log(`[PackElements] Detected ${islands.length} islands. Packing...`);
    const items = islands.map((isl, idx) => ({ 
      w: isl.w + (state.gridSettings.padding * 2), 
      h: isl.h + (state.gridSettings.padding * 2), 
      originalIdx: idx,
      padX: state.gridSettings.padding,
      padY: state.gridSettings.padding
    }));

    let packedWidth = canvasWidth;
    let packedHeight = canvasHeight;

    if (state.gridSettings.packingAlgo === 'shelf') {
       const sorted = [...items].sort((a, b) => b.h - a.h);
       let x = 0, y = 0, rowH = 0;
       sorted.forEach(item => {
         if (x + item.w > canvasWidth) {
           x = 0;
           y += rowH;
           rowH = 0;
         }
         (item as any).x = x;
         (item as any).y = y;
         x += item.w;
         rowH = Math.max(rowH, item.h);
       });
       packedHeight = y + rowH;
    } else {
       const potpack = (await import('potpack')).default;
       const { w, h } = potpack(items as any);
       packedWidth = w;
       packedHeight = h;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(canvas, 0, 0);

    const nextEntries: TextureAsset[] = await Promise.all(items.map(async (item: any) => {
      const isl = islands[item.originalIdx];
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = isl.w;
      cropCanvas.height = isl.h;
      const cCtx = cropCanvas.getContext('2d')!;
      cCtx.drawImage(tempCanvas, isl.x, isl.y, isl.w, isl.h, 0, 0, isl.w, isl.h);
      
      return {
        id: generateId(),
        url: await canvasToBlobURL(cropCanvas),
        name: `Packed_${item.originalIdx}`,
        width: isl.w, height: isl.h,
        x: item.x + item.padX, y: item.y + item.padY,
        hue: 0, brightness: 100, scale: 1, isCrop: true,
      };
    }));

    console.log(`[PackElements] Complete.`);
    executeCommand(new SetMainTilesCommand(state.atlasEntries, nextEntries, state.atlasStatus, 'baked', state.lastMainAssetId, state.lastMainAssetId));
    onCommandExecuted?.();
  }, [state.atlasEntries, state.gridSettings, state.atlasStatus, state.lastMainAssetId, canvasWidth, canvasHeight, executeCommand, onCommandExecuted]);

  const addToLibrary = useCallback(async () => {
    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings
    );
    const url = await canvasToBlobURL(canvas);
    const name = `${state.textureName || 'T_Texture_BC'}.png`;

    const img = new Image();
    img.onload = () => {
      const id = generateId();
      const newAsset: TextureAsset = {
        id, url, name,
        width: canvas.width, height: canvas.height,
        x: 0, y: 0, hue: 0, brightness: 100, scale: 1,
        file: new File([], name),
      };
      set(prev => ({ ...prev, libraryAssets: [...prev.libraryAssets, newAsset] }));
    };
    img.src = url;
  }, [state.atlasEntries, state.gridSettings, state.textureName, canvasWidth, canvasHeight, set]);

  const exportAtlas = useCallback(async () => {
    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings
    );
    const url = await canvasToBlobURL(canvas);
    const name = `${state.textureName || 'T_Texture_BC'}.png`;

    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
  }, [state.atlasEntries, state.gridSettings, state.textureName, canvasWidth, canvasHeight]);

  const exportGridZip = useCallback(async () => {
    if (state.gridSettings.mode !== 'fixed') return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const geo = mainAtlasGeo;
    const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId);

    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings,
      {
        sourceAsset,
        clearedCells: state.clearedCells,
        cellW: geo.cellW,
        cellH: geo.cellH,
        stepX: geo.stepX,
        stepY: geo.stepY
      }
    );

    const cellW = geo.cellW;
    const cellH = geo.cellH;
    const stepX = geo.stepX;
    const stepY = geo.stepY;

    for (let cy = 0; cy < geo.rows; cy++) {
      for (let cx = 0; cx < geo.cols; cx++) {
        const cellCanvas = document.createElement('canvas');
        cellCanvas.width = cellW;
        cellCanvas.height = cellH;
        const ctx = cellCanvas.getContext('2d')!;
        const paddingX = (stepX - cellW) / 2;
        const paddingY = (stepY - cellH) / 2;
        ctx.drawImage(canvas, cx * stepX + paddingX, cy * stepY + paddingY, cellW, cellH, 0, 0, cellW, cellH);
        
        const blob = await new Promise<Blob | null>(resolve => cellCanvas.toBlob(resolve, 'image/png'));
        if (blob) {
          zip.file(`cell_${cx}_${cy}.png`, blob);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.textureName || 'T_Texture_Grid'}.zip`;
    link.click();
  }, [state.atlasEntries, state.gridSettings, state.textureName, canvasWidth, canvasHeight, state.clearedCells, state.libraryAssets, state.modifiedAssets, state.lastSourceAssetId, mainAtlasGeo]);

  const fixGrid = useCallback(async () => {
    if (state.atlasEntries.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings, { willReadFrequently: true }
    );
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvasWidth, canvasHeight);
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const { r: bgR, g: bgG, b: bgB } = hexToRgb(state.gridSettings.backgroundColor);
    const tolerance = state.gridSettings.clearTolerance ?? 10;

    const isBg = (x: number, y: number) => {
      const idx = (y * canvasWidth + x) * 4;
      if (data[idx + 3] < 5) return true;
      return Math.abs(data[idx] - bgR) <= tolerance &&
             Math.abs(data[idx + 1] - bgG) <= tolerance &&
             Math.abs(data[idx + 2] - bgB) <= tolerance;
    };

    const islands: { x: number, y: number, w: number, h: number }[] = [];
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        if (!visited[y * canvasWidth + x] && !isBg(x, y)) {
          let minX = x, maxX = x, minY = y, maxY = y;
          const queue: [number, number][] = [[x, y]];
          visited[y * canvasWidth + x] = 1;
          let head = 0;
          while (head < queue.length) {
            const [cx, cy] = queue[head++];
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            const neighbors: [number, number][] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight && !visited[ny * canvasWidth + nx] && !isBg(nx, ny)) {
                visited[ny * canvasWidth + nx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
          islands.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      }
    }

    const nextEntries = state.atlasEntries.map(entry => {
      const centerX = entry.x + (entry.width * (entry.scaleX ?? entry.scale)) / 2;
      const centerY = entry.y + (entry.height * (entry.scaleY ?? entry.scale)) / 2;
      const island = islands.find(isl => 
        centerX >= isl.x && centerX <= isl.x + isl.w &&
        centerY >= isl.y && centerY <= isl.y + isl.h
      );

      if (island) {
        const { cx, cy } = mainAtlasGeo.getCellAtPos(island.x + island.w / 2, island.y + island.h / 2);
        const cellPos = mainAtlasGeo.getPosFromCell(cx, cy);
        return { ...entry, x: cellPos.x, y: cellPos.y };
      }
      return entry;
    });

    executeCommand(new SetMainTilesCommand(state.atlasEntries, nextEntries, state.atlasStatus, state.atlasStatus, state.lastMainAssetId, state.lastMainAssetId));
    onCommandExecuted?.();
  }, [state.atlasEntries, state.gridSettings, state.atlasStatus, state.lastMainAssetId, canvasWidth, canvasHeight, mainAtlasGeo, executeCommand, onCommandExecuted]);

  const clearAll = useCallback(() => {
    executeCommand(new SetMainTilesCommand(state.atlasEntries, [], state.atlasStatus, 'parametric', state.lastMainAssetId, null));
    onCommandExecuted?.();
  }, [state.atlasEntries, state.atlasStatus, state.lastMainAssetId, executeCommand, onCommandExecuted]);

  return { packAtlas, packElements, addToLibrary, exportAtlas, exportGridZip, fixGrid, createNewAtlas, clearAll };
}
