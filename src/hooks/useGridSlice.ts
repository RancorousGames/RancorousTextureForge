import { useCallback, useRef } from 'react';
import { AppState, TextureAsset } from '../types';
import { Command, AddTilesCommand, SetMainTilesCommand, PatchCommand, MaterializeCommand, ClearCellCommand, RemoveTilesCommand } from '../lib/Commands';
import { GridGeometry } from '../lib/GridGeometry';
import { tileRegistry } from '../lib/TileRegistry';
import { hexToRgb, detectBackgroundColor } from '../lib/utils';
import { loadImage, generateId } from '../lib/canvas';
import potpack from 'potpack';

export function useGridSlice(
  state: AppState,
  canvasWidth: number,
  canvasHeight: number,
  mainAtlasGeo: GridGeometry,
  selectedCells: string[],
  set: (v: AppState | ((p: AppState) => AppState)) => void,
  executeCommand: (c: Command | Command[]) => void
) {
  // Monotonically-increasing counter. Each new slice call claims a generation;
  // stale in-flight calls bail out when they see a newer generation was started.
  const sliceGenRef = useRef(0);
  // Always holds the latest gridSettings without creating a closure dependency —
  // prevents slicing image B with image A's auto-detected cell/padding values.
  const gridSettingsRef = useRef(state.gridSettings);
  gridSettingsRef.current = state.gridSettings;

  const performGridSlice = useCallback(async (
    sourceAsset: TextureAsset,
    width: number,
    height: number,
    skipHistory = false,
    settingsOverride?: any
  ) => {
    const gen = ++sliceGenRef.current;

    const imgUrl = sourceAsset.sourceUrl || sourceAsset.url;
    const img = await loadImage(imgUrl);

    // A newer slice was requested while we were loading — discard this result.
    if (gen !== sliceGenRef.current) return;

    const gs = settingsOverride || gridSettingsRef.current;

    if (gs.mode === 'packing') return;

    const padding = gs.padding || 0;
    const cellW = gs.cellSize;
    const cellH = gs.cellY || gs.cellSize;

    const stepX = cellW + padding * 2;
    const stepY = cellH + padding * 2;
    const cols = Math.floor(width / stepX);
    const rows = Math.floor(height / stepY);

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = cellW;
    sliceCanvas.height = cellH;
    const sliceCtx = sliceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sliceCtx) return;

    // Detect background color using majority consensus of corners + diagonal scan
    const checkCanvas = document.createElement('canvas');
    const realW = img.naturalWidth || img.width;
    const realH = img.naturalHeight || img.height;
    checkCanvas.width = realW; checkCanvas.height = realH;
    const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true })!;
    checkCtx.drawImage(img, 0, 0);
    const fullImageData = checkCtx.getImageData(0, 0, realW, realH);
    
    const tolerance = gs.clearTolerance;
    const keyColor = detectBackgroundColor(fullImageData, tolerance);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const permClear = hexToRgb(gs.clearColor);

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 5 && keyColor.a < 5) return true;
      return Math.abs(r - keyColor.r) <= tolerance &&
             Math.abs(g - keyColor.g) <= tolerance &&
             Math.abs(b - keyColor.b) <= tolerance;
    };

    const newEntries: TextureAsset[] = [];
    const newClearedCells: string[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        sliceCtx.clearRect(0, 0, cellW, cellH);
        sliceCtx.drawImage(img, col * stepX + padding, row * stepY + padding, cellW, cellH, 0, 0, cellW, cellH);
        const sliceData = sliceCtx.getImageData(0, 0, cellW, cellH);
        const pixels = sliceData.data;
        let hasContent = false;

        // Check for content without modifying pixels
        for (let i = 0; i < pixels.length; i += 4) {
          if (!isMatch(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])) {
            hasContent = true;
            break;
          }
        }

        if (hasContent) {
          const key = `${col},${row}`;
          newClearedCells.push(key);
          newEntries.push({
            id: generateId(),
            url: sliceCanvas.toDataURL(),
            sourceUrl: imgUrl,
            name: `Slice_${col}_${row}`,
            width: cellW, height: cellH,
            x: col * stepX + padding, y: row * stepY + padding,
            hue: sourceAsset.hue, brightness: sourceAsset.brightness, scale: 1, isCrop: true,
          });
        }
      }
    }

    if (newEntries.length === 0) return;
    tileRegistry.registerMany(newEntries);

    if (skipHistory) {
      set(prev => ({ ...prev, atlasEntries: newEntries, clearedCells: newClearedCells, atlasStatus: 'parametric' }));
    } else {
      executeCommand([
        new SetMainTilesCommand(state.atlasEntries, newEntries, state.atlasStatus, 'parametric'),
        new PatchCommand(
          { lastSourceAssetId: sourceAsset.id, clearedCells: newClearedCells },
          { lastSourceAssetId: state.lastSourceAssetId, clearedCells: state.clearedCells }
        ),
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.atlasEntries, state.lastSourceAssetId, state.clearedCells, state.atlasStatus, executeCommand, set]);

  const handleMaterialize = useCallback(async (
    cx: number,
    cy: number,
    reason: 'move' | 'clear',
    draggingPos?: { x: number; y: number }
  ) => {
    const sourceAsset = [...state.libraryAssets, ...state.modifiedAssets]
      .find(t => t.id === state.lastSourceAssetId);
    if (!sourceAsset) return;

    const geo = new GridGeometry(state.gridSettings, canvasWidth, canvasHeight);
    const cellPos = geo.getPosFromCell(cx, cy);

    const canvas = document.createElement('canvas');
    canvas.width = geo.cellW; canvas.height = geo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = await loadImage(sourceAsset.sourceUrl || sourceAsset.url);
    ctx.drawImage(img, cellPos.x, cellPos.y, geo.cellW, geo.cellH, 0, 0, geo.cellW, geo.cellH);

    const newEntry: TextureAsset = {
      id: generateId(),
      url: canvas.toDataURL(),
      sourceUrl: sourceAsset.sourceUrl || sourceAsset.url,
      name: `JIT_${cx}_${cy}`,
      width: geo.cellW, height: geo.cellH,
      x: draggingPos ? draggingPos.x : cellPos.x,
      y: draggingPos ? draggingPos.y : cellPos.y,
      hue: sourceAsset.hue, brightness: sourceAsset.brightness, scale: 1, isCrop: true,
    };
    tileRegistry.register(newEntry);
    const key = `${cx},${cy}`;

    // Clean up: find if there is an existing entry at the target location and remove it
    // so that materialize-to-move doesn't just "copy" on top of existing work.
    const { cx: tcx, cy: tcy } = draggingPos 
       ? geo.getCellAtPos(draggingPos.x + geo.cellW / 2, draggingPos.y + geo.cellH / 2)
       : { cx, cy };
    
    const existingEntry = state.atlasEntries.find(t => 
      geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, tcx, tcy)
    );

    if (reason === 'clear') {
      executeCommand(new ClearCellCommand(key, state.atlasStatus));
    } else {
      if (existingEntry) {
        executeCommand([
           new RemoveTilesCommand([existingEntry]),
           new MaterializeCommand(newEntry, key, state.atlasStatus)
        ]);
      } else {
        executeCommand(new MaterializeCommand(newEntry, key, state.atlasStatus));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.libraryAssets, state.modifiedAssets, state.atlasEntries, state.lastSourceAssetId, state.gridSettings,
      state.atlasStatus, canvasWidth, canvasHeight, executeCommand]);

  const handleSourceCellClick = useCallback(async (
    _x: number, _y: number, _w: number, _h: number,
    scx: number, scy: number,
    sourceAsset: TextureAsset
  ) => {
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceAsset.width, sourceAsset.height);
    const canvas = document.createElement('canvas');
    canvas.width = mainAtlasGeo.cellW; canvas.height = mainAtlasGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pick destination BEFORE await to minimize race conditions
    let destX = mainAtlasGeo.padding;
    let destY = mainAtlasGeo.padding;

    if (selectedCells.length === 0) {
      if (state.gridSettings.mode === 'packing') {
        const padding = state.gridSettings.padding || 2;
        const items = state.atlasEntries.map(e => ({
          w: (e.width * (e.scaleX ?? e.scale)) + padding * 2,
          h: (e.height * (e.scaleY ?? e.scale)) + padding * 2,
          x: e.x, y: e.y, id: e.id
        }));
        const newItem = {
          w: mainAtlasGeo.cellW + padding * 2,
          h: mainAtlasGeo.cellH + padding * 2,
          x: 0, y: 0, id: 'new'
        };
        const allItems = [...items, newItem];
        potpack(allItems as any);
        const placedNew = allItems.find(i => i.id === 'new')!;
        destX = placedNew.x + padding;
        destY = placedNew.y + padding;
      } else {
        let foundEmpty = false;
        outer: for (let r = 0; r < mainAtlasGeo.rows; r++) {
          for (let c = 0; c < mainAtlasGeo.cols; c++) {
            if (!state.atlasEntries.some(t => mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, c, r))) {
              const pos = mainAtlasGeo.getPosFromCell(c, r);
              destX = pos.x; destY = pos.y;
              foundEmpty = true;
              break outer;
            }
          }
        }
      }
    }

    const img = await loadImage(sourceAsset.url);

    const createCrop = (cx: number, cy: number): string => {
      ctx.clearRect(0, 0, mainAtlasGeo.cellW, mainAtlasGeo.cellH);
      const { x: sx, y: sy } = sourceGeo.getPosFromCell(cx, cy);
      ctx.drawImage(img, sx, sy, sourceGeo.cellW, sourceGeo.cellH, 0, 0, mainAtlasGeo.cellW, mainAtlasGeo.cellH);
      return canvas.toDataURL();
    };

    if (selectedCells.length > 0) {
      let minCX = Infinity, minCY = Infinity;
      for (const key of selectedCells) {
        const [cx, cy] = key.split(',').map(Number);
        if (cx < minCX) minCX = cx;
        if (cy < minCY) minCY = cy;
      }

      const newEntries: TextureAsset[] = [];
      const replacedEntries: TextureAsset[] = [];
      const newClearedCells = [...state.clearedCells];

      for (const key of selectedCells) {
        const [dcx, dcy] = key.split(',').map(Number);
        const sourceCX = scx + (dcx - minCX);
        const sourceCY = scy + (dcy - minCY);
        if (sourceCX >= sourceGeo.cols || sourceCY >= sourceGeo.rows) continue;

        const { x: dX, y: dY } = mainAtlasGeo.getPosFromCell(dcx, dcy);
        replacedEntries.push(...state.atlasEntries.filter(t =>
          mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)
        ));

        if (!newClearedCells.includes(key)) newClearedCells.push(key);

        const newEntry: TextureAsset = {
          id: generateId(), url: createCrop(sourceCX, sourceCY),
          name: `${sourceAsset.name}_crop_${sourceCX}_${sourceCY}`,
          width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
          x: dX, y: dY, hue: sourceAsset.hue, brightness: sourceAsset.brightness, scale: 1,
        };
        tileRegistry.register(newEntry);
        newEntries.push(newEntry);
      }
      executeCommand([
        new AddTilesCommand(newEntries, replacedEntries),
        new PatchCommand(
          { lastSourceAssetId: null, clearedCells: newClearedCells }, 
          { lastSourceAssetId: state.lastSourceAssetId, clearedCells: state.clearedCells }
        ),
      ]);
    } else {
      let replacedEntries: TextureAsset[] = [];
      let cellKey: string | null = null;

      if (state.gridSettings.mode !== 'packing') {
        const { cx: tcx, cy: tcy } = mainAtlasGeo.getCellAtPos(destX, destY);
        cellKey = `${tcx},${tcy}`;
        replacedEntries = state.atlasEntries.filter(t =>
          mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, tcx, tcy)
        );
      }

      const newClearedCells = (cellKey && !state.clearedCells.includes(cellKey))
        ? [...state.clearedCells, cellKey]
        : state.clearedCells;

      const newEntry: TextureAsset = {
        id: generateId(), url: createCrop(scx, scy),
        name: `${sourceAsset.name}_crop_${scx}_${scy}`,
        width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
        x: destX, y: destY, hue: sourceAsset.hue, brightness: sourceAsset.brightness, scale: 1, isCrop: true,
      };
      tileRegistry.register(newEntry);

      executeCommand([
        new AddTilesCommand([newEntry], replacedEntries),
        new PatchCommand(
          { lastSourceAssetId: null, clearedCells: newClearedCells }, 
          { lastSourceAssetId: state.lastSourceAssetId, clearedCells: state.clearedCells }
        ),
      ]);
    }
  }, [state.sourceGridSettings, state.atlasEntries, state.lastSourceAssetId, state.gridSettings,
      state.clearedCells, state.libraryAssets, state.modifiedAssets,
      mainAtlasGeo, selectedCells, executeCommand]);

  const handleSourceCellRightClick = useCallback(async (
    _x: number, _y: number, _w: number, _h: number,
    scx: number, scy: number,
    sourceAsset: TextureAsset
  ) => {
    if (selectedCells.length === 0) return;
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceAsset.width, sourceAsset.height);

    const canvas = document.createElement('canvas');
    canvas.width = mainAtlasGeo.cellW; canvas.height = mainAtlasGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = await loadImage(sourceAsset.url);
    const { x: sx, y: sy } = sourceGeo.getPosFromCell(scx, scy);
    ctx.drawImage(img, sx, sy, sourceGeo.cellW, sourceGeo.cellH, 0, 0, mainAtlasGeo.cellW, mainAtlasGeo.cellH);
    const croppedUrl = canvas.toDataURL();

    const newEntries: TextureAsset[] = [];
    const replacedEntries: TextureAsset[] = [];
    const newClearedCells = [...state.clearedCells];

    for (const key of selectedCells) {
      const [dcx, dcy] = key.split(',').map(Number);
      const { x: destX, y: destY } = mainAtlasGeo.getPosFromCell(dcx, dcy);
      replacedEntries.push(...state.atlasEntries.filter(t =>
        mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)
      ));

      if (!newClearedCells.includes(key)) newClearedCells.push(key);

      const newEntry: TextureAsset = {
        id: generateId(), url: croppedUrl,
        name: `${sourceAsset.name}_fill_${scx}_${scy}`,
        width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
        x: destX, y: destY, hue: sourceAsset.hue, brightness: sourceAsset.brightness, scale: 1, isCrop: true,
      };
      tileRegistry.register(newEntry);
      newEntries.push(newEntry);
    }
    executeCommand([
      new AddTilesCommand(newEntries, replacedEntries),
      new PatchCommand(
        { lastSourceAssetId: null, clearedCells: newClearedCells }, 
        { lastSourceAssetId: state.lastSourceAssetId, clearedCells: state.clearedCells }
      ),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sourceGridSettings, state.atlasEntries, state.lastSourceAssetId,
      mainAtlasGeo, selectedCells, executeCommand]);

  return { performGridSlice, handleMaterialize, handleSourceCellClick, handleSourceCellRightClick };
}
