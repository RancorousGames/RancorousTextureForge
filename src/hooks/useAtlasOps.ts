import { useCallback } from 'react';
import { AppState, TextureAsset, initialPackerMapping, initialPBRSet } from '../types';
import { GridGeometry } from '../lib/GridGeometry';
import { hexToRgb, findIslands } from '../lib/utils';
import { renderTilesToCanvas, loadImage, generateId } from '../lib/canvas';
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
    const sorted = [...state.atlasEntries].sort((a, b) => (b.height * (b.scaleY ?? b.scale)) - (a.height * (a.scaleY ?? a.scale)));
    
    console.log(`[PackAtlas] Starting pack of ${sorted.length} entries. CanvasWidth: ${canvasWidth}`);

    const packed = sorted.map((entry, i) => {
      const sw = entry.width * (entry.scaleX ?? entry.scale);
      const sh = entry.height * (entry.scaleY ?? entry.scale);
      if (currentX + sw > canvasWidth) { 
        console.log(`[PackAtlas] Row full. Moving from X:${currentX.toFixed(1)} to X:0, Y:${(currentY + rowHeight + padding).toFixed(1)}`);
        currentX = 0; currentY += rowHeight + padding; rowHeight = 0; 
      }
      const result = { ...entry, x: currentX, y: currentY };
      if (i < 5 || i === sorted.length - 1) {
        console.log(`[PackAtlas] Entry #${i} ('${entry.name}'): size ${sw}x${sh} -> placed at ${currentX},${currentY}`);
      }
      rowHeight = Math.max(rowHeight, sh);
      currentX += sw + padding;
      return result;
    });
    console.log(`[PackAtlas] Complete.`);
    executeCommand(new SetMainTilesCommand(state.atlasEntries, packed));
  }, [state.atlasEntries, canvasWidth, executeCommand]);

  const fixGrid = useCallback(async () => {
    const sourceAssetObj = [...state.libraryAssets, ...state.modifiedAssets]
      .find(t => t.id === state.lastSourceAssetId);
    if (!sourceAssetObj) return;

    if (state.atlasStatus === 'modified' || state.atlasStatus === 'baked') {
      if (!confirm('Fix Grid will revert the atlas to the source image. Manual changes will be lost. Continue?')) return;
    }

    const img = await loadImage(sourceAssetObj.url);
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvasWidth, canvasHeight);

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const tolerance = state.gridSettings.clearTolerance ?? 10;
    const finalIslands = findIslands(
      imageData,
      state.gridSettings.clearColor,
      tolerance,
      true
    );

    const geo = mainAtlasGeo;

    if (finalIslands.length <= 1) {
      console.log(`[FixGrid] Aborting: Only ${finalIslands.length} island(s) detected. FixGrid requires multiple islands.`);
      return;
    }

    if (geo.padding === 0) {
      console.log(`[FixGrid] Aborting: Cell padding is 0. FixGrid requires non-zero padding to align islands.`);
      return;
    }

    console.log(`[FixGrid] Found ${finalIslands.length} islands. Using Geometry: Cell=${geo.cellW}x${geo.cellH}, Pad=${geo.padding}, Step=${geo.stepX}x${geo.stepY}`);

    const newEntries: TextureAsset[] = finalIslands.map((isl, i) => {
      const centerX = isl.x + isl.w / 2;
      const centerY = isl.y + isl.h / 2;

      const relX = centerX - geo.padding - geo.cellW / 2;
      const relY = centerY - geo.padding - geo.cellH / 2;

      const col = Math.round(relX / geo.stepX);
      const row = Math.round(relY / geo.stepY);

      const destX = geo.padding + col * geo.stepX;
      const destY = geo.padding + row * geo.stepY;

      if (i < 5 || i === finalIslands.length - 1) {
        console.log(`[FixGrid] Island #${i}: Rect(${isl.x},${isl.y},${isl.w},${isl.h}) Center(${centerX.toFixed(1)},${centerY.toFixed(1)})`);
        console.log(`[FixGrid]   -> Mapping: Rel(${relX.toFixed(1)},${relY.toFixed(1)}) -> Cell(${col},${row}) -> Dest(${destX},${destY})`);
      } else if (i === 5) {
        console.log(`[FixGrid] ... (skipping logs for intermediate islands) ...`);
      }

      const islCanvas = document.createElement('canvas');
      islCanvas.width = geo.cellW; islCanvas.height = geo.cellH;
      islCanvas.getContext('2d')?.drawImage(canvas, isl.x, isl.y, isl.w, isl.h, 0, 0, geo.cellW, geo.cellH);

      return {
        id: `fixed-${i}-${Date.now()}`,
        name: `Island_${i}`,
        url: islCanvas.toDataURL(),
        x: destX,
        y: destY,
        width: geo.cellW, height: geo.cellH,
        scale: 1, hue: 0, brightness: 100,
      };
    });

    console.log(`[FixGrid] Complete. Generated ${newEntries.length} fixed entries.`);
    executeCommand(new SetMainTilesCommand(state.atlasEntries, newEntries, state.atlasStatus, 'baked'));
  }, [state.libraryAssets, state.modifiedAssets, state.lastSourceAssetId, state.atlasStatus, state.gridSettings.clearColor, state.gridSettings.clearTolerance, canvasWidth, canvasHeight, mainAtlasGeo, executeCommand]);

  const packElements = useCallback(async () => {
    if (state.atlasEntries.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight,
      state.gridSettings.clearColor, { willReadFrequently: true }
    );
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvasWidth, canvasHeight);
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const { r: bgR, g: bgG, b: bgB } = hexToRgb(state.gridSettings.clearColor);
    const tolerance = state.gridSettings.clearTolerance ?? 10;
    console.log(`[PackElements] Starting island detection. Background: rgb(${bgR},${bgG},${bgB}), Tolerance: ${tolerance}`);

    const isBg = (x: number, y: number) => {
      const p = (y * canvasWidth + x) * 4;
      if (data[p + 3] < 5) return true;
      return Math.abs(data[p] - bgR) <= tolerance &&
             Math.abs(data[p + 1] - bgG) <= tolerance &&
             Math.abs(data[p + 2] - bgB) <= tolerance;
    };

    const islands: { x: number; y: number; w: number; h: number }[] = [];

    for (let sy = 0; sy < canvasHeight; sy++) {
      for (let sx = 0; sx < canvasWidth; sx++) {
        const sidx = sy * canvasWidth + sx;
        if (visited[sidx] || isBg(sx, sy)) continue;

        let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
        const queue: [number, number][] = [[sx, sy]];
        visited[sidx] = 1;
        let head = 0;

        while (head < queue.length) {
          const [cx, cy] = queue[head++];
          if (cx < x1) x1 = cx; if (cx > x2) x2 = cx;
          if (cy < y1) y1 = cy; if (cy > y2) y2 = cy;
          for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]] as [number,number][]) {
            if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
              const nidx = ny * canvasWidth + nx;
              if (!visited[nidx] && !isBg(nx, ny)) { visited[nidx] = 1; queue.push([nx, ny]); }
            }
          }
        }

        if (x2 - x1 >= 2 && y2 - y1 >= 2) islands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
      }
    }

    console.log(`[PackElements] Found ${islands.length} islands.`);

    if (islands.length === 0) return;

    const padding = state.gridSettings.padding || 2;
    console.log(`[PackElements] Packing with algorithm: ${state.gridSettings.packingAlgo}, Padding: ${padding}`);

    const packItems = islands.map((isl, i) => {
      const padX = (isl.w + padding * 2 > canvasWidth) ? 0 : padding;
      const padY = (isl.h + padding * 2 > canvasHeight) ? 0 : padding;
      return {
        w: isl.w + padX * 2, h: isl.h + padY * 2, i, x: 0, y: 0,
        padX, padY
      };
    });

    if (state.gridSettings.packingAlgo === 'potpack') {
      potpack(packItems as any);
    } else {
      let curX = 0, curY = 0, rowH = 0;
      for (const item of packItems) {
        if (curX + item.w > canvasWidth) { curX = 0; curY += rowH; rowH = 0; }
        item.x = curX; item.y = curY;
        curX += item.w;
        if (item.h > rowH) rowH = item.h;
      }
    }

    const nextEntries: TextureAsset[] = packItems.map((item, idx) => {
      const isl = islands[item.i];
      const blobCanvas = document.createElement('canvas');
      blobCanvas.width = isl.w; blobCanvas.height = isl.h;
      blobCanvas.getContext('2d')?.drawImage(canvas, isl.x, isl.y, isl.w, isl.h, 0, 0, isl.w, isl.h);
      
      if (idx < 5 || idx === packItems.length - 1) {
        console.log(`[PackElements] Island #${idx}: Original Rect(${isl.x},${isl.y},${isl.w},${isl.h}) -> Packed at ${item.x + item.padX},${item.y + item.padY}`);
      }

      return {
        id: generateId(), url: blobCanvas.toDataURL(), name: `Packed_${item.i}`,
        width: isl.w, height: isl.h,
        x: item.x + item.padX, y: item.y + item.padY,
        hue: 0, brightness: 100, scale: 1, isCrop: true,
      };
    });

    console.log(`[PackElements] Complete.`);
    executeCommand(new SetMainTilesCommand(state.atlasEntries, nextEntries, state.atlasStatus, 'baked'));
  }, [state.atlasEntries, state.gridSettings, state.atlasStatus, canvasWidth, canvasHeight, executeCommand]);

  const exportAtlas = useCallback(async () => {
    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings.clearColor
    );
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${state.textureName || 'T_Texture_BC'}.png`;
    link.click();
  }, [state.atlasEntries, state.gridSettings.clearColor, state.textureName, canvasWidth, canvasHeight]);

  const exportGridZip = useCallback(async () => {
    if (state.gridSettings.mode !== 'fixed') return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    const geo = mainAtlasGeo;
    const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets].find(t => t.id === state.lastSourceAssetId);

    const canvas = await renderTilesToCanvas(
      state.atlasEntries, canvasWidth, canvasHeight, state.gridSettings.clearColor,
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
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cellW;
    tempCanvas.height = cellH;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) return;

    for (let row = 0; row < geo.rows; row++) {
      for (let col = 0; col < geo.cols; col++) {
        const pos = geo.getPosFromCell(col, row);
        
        tempCtx.clearRect(0, 0, cellW, cellH);
        tempCtx.drawImage(
          canvas,
          pos.x, pos.y, cellW, cellH,
          0, 0, cellW, cellH
        );
        
        const dataUrl = tempCanvas.toDataURL('image/png');
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        zip.file(`${state.textureName || 'cell'}_${row}_${col}.png`, base64Data, {base64: true});
      }
    }
    
    const content = await zip.generateAsync({type: 'blob'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${state.textureName || 'T_Texture'}_cells.zip`;
    link.click();
  }, [state.gridSettings, state.atlasEntries, state.textureName, canvasWidth, canvasHeight, mainAtlasGeo, state.clearedCells, state.libraryAssets, state.modifiedAssets, state.lastSourceAssetId]);

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
      atlasEntries: [], dragMode: 'replace',
      atlasStatus: 'parametric',
      clearedCells: [],
      lastSourceAssetId: null,
      debugIslands: [],
      modifiedAssets: [],
      packerMapping: initialPackerMapping,
      pbrSet: initialPBRSet,
      layeringLayers: [],
    }));
    onAfterNewAtlas?.();
  }, [set, onAfterNewAtlas]);

  return { packAtlas, fixGrid, packElements, exportAtlas, exportGridZip, createNewAtlas };
}
