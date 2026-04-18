import { useCallback, useRef } from 'react';
import { AppState, TextureTile } from '../types';
import { Command, AddTilesCommand, SetMainTilesCommand, PatchCommand, MaterializeCommand, ClearCellCommand, RemoveTilesCommand } from '../lib/Commands';
import { GridGeometry } from '../lib/GridGeometry';
import { tileRegistry } from '../lib/TileRegistry';
import { hexToRgb } from '../lib/utils';
import { loadImage, generateId } from '../lib/canvas';

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
    sourceTile: TextureTile,
    width: number,
    height: number,
    skipHistory = false,
    settingsOverride?: any
  ) => {
    const gen = ++sliceGenRef.current;

    const imgUrl = sourceTile.sourceUrl || sourceTile.url;
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

    // Sample key color from bottom-right pixel of source to detect background
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 1; checkCanvas.height = 1;
    const checkCtx = checkCanvas.getContext('2d')!;
    const realW = img.naturalWidth || img.width;
    const realH = img.naturalHeight || img.height;
    checkCtx.drawImage(img, realW - 1, realH - 1, 1, 1, 0, 0, 1, 1);
    const keyData = checkCtx.getImageData(0, 0, 1, 1).data;
    const keyColor = { r: keyData[0], g: keyData[1], b: keyData[2], a: keyData[3] };
    const permClear = hexToRgb(gs.clearColor);
    const tolerance = gs.clearTolerance;

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 5 && keyColor.a < 5) return true;
      return Math.abs(r - keyColor.r) <= tolerance &&
             Math.abs(g - keyColor.g) <= tolerance &&
             Math.abs(b - keyColor.b) <= tolerance;
    };

    const newTiles: TextureTile[] = [];
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
          newTiles.push({
            id: generateId(),
            url: sliceCanvas.toDataURL(),
            sourceUrl: imgUrl,
            name: `Slice_${col}_${row}`,
            width: cellW, height: cellH,
            x: col * stepX + padding, y: row * stepY + padding,
            hue: 0, brightness: 100, scale: 1, isCrop: true,
          });
        }
      }
    }

    if (newTiles.length === 0) return;
    tileRegistry.registerMany(newTiles);

    if (skipHistory) {
      set(prev => ({ ...prev, mainTiles: newTiles, clearedCells: [], atlasStatus: 'parametric' }));
    } else {
      executeCommand([
        new SetMainTilesCommand(state.mainTiles, newTiles, state.atlasStatus, 'parametric'),
        new PatchCommand(
          { lastSourceTileId: sourceTile.id, clearedCells: [] },
          { lastSourceTileId: state.lastSourceTileId, clearedCells: state.clearedCells }
        ),
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mainTiles, state.lastSourceTileId, state.clearedCells, state.atlasStatus, executeCommand, set]);

  const handleMaterialize = useCallback(async (
    cx: number,
    cy: number,
    reason: 'move' | 'clear',
    draggingPos?: { x: number; y: number }
  ) => {
    const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles]
      .find(t => t.id === state.lastSourceTileId);
    if (!sourceTile) return;

    const geo = new GridGeometry(state.gridSettings, canvasWidth, canvasHeight);
    const cellPos = geo.getPosFromCell(cx, cy);

    const canvas = document.createElement('canvas');
    canvas.width = geo.cellW; canvas.height = geo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = await loadImage(sourceTile.sourceUrl || sourceTile.url);
    ctx.drawImage(img, cellPos.x, cellPos.y, geo.cellW, geo.cellH, 0, 0, geo.cellW, geo.cellH);

    const newTile: TextureTile = {
      id: generateId(),
      url: canvas.toDataURL(),
      sourceUrl: sourceTile.sourceUrl || sourceTile.url,
      name: `JIT_${cx}_${cy}`,
      width: geo.cellW, height: geo.cellH,
      x: draggingPos ? draggingPos.x : cellPos.x,
      y: draggingPos ? draggingPos.y : cellPos.y,
      hue: 0, brightness: 100, scale: 1, isCrop: true,
    };
    tileRegistry.register(newTile);
    const key = `${cx},${cy}`;

    // Clean up: find if there is an existing tile at the target location and remove it
    // so that materialize-to-move doesn't just "copy" on top of existing work.
    const { cx: tcx, cy: tcy } = draggingPos 
       ? geo.getCellAtPos(draggingPos.x + geo.cellW / 2, draggingPos.y + geo.cellH / 2)
       : { cx, cy };
    
    const existingTile = state.mainTiles.find(t => 
      geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, tcx, tcy)
    );

    if (reason === 'clear') {
      executeCommand(new ClearCellCommand(key, state.atlasStatus));
    } else {
      if (existingTile) {
        executeCommand([
           new RemoveTilesCommand([existingTile]),
           new MaterializeCommand(newTile, key, state.atlasStatus)
        ]);
      } else {
        executeCommand(new MaterializeCommand(newTile, key, state.atlasStatus));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.secondaryTiles, state.modifiedTiles, state.mainTiles, state.lastSourceTileId, state.gridSettings,
      state.atlasStatus, canvasWidth, canvasHeight, executeCommand]);

  const handleSourceCellClick = useCallback(async (
    _x: number, _y: number, _w: number, _h: number,
    scx: number, scy: number,
    sourceTile: TextureTile
  ) => {
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceTile.width, sourceTile.height);
    const canvas = document.createElement('canvas');
    canvas.width = mainAtlasGeo.cellW; canvas.height = mainAtlasGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = await loadImage(sourceTile.url);

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

      const newTiles: TextureTile[] = [];
      const replacedTiles: TextureTile[] = [];
      for (const key of selectedCells) {
        const [dcx, dcy] = key.split(',').map(Number);
        const sourceCX = scx + (dcx - minCX);
        const sourceCY = scy + (dcy - minCY);
        if (sourceCX >= sourceGeo.cols || sourceCY >= sourceGeo.rows) continue;

        const { x: destX, y: destY } = mainAtlasGeo.getPosFromCell(dcx, dcy);
        replacedTiles.push(...state.mainTiles.filter(t =>
          mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)
        ));
        const newTile: TextureTile = {
          id: generateId(), url: createCrop(sourceCX, sourceCY),
          name: `${sourceTile.name}_crop_${sourceCX}_${sourceCY}`,
          width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
          x: destX, y: destY, hue: 0, brightness: 100, scale: 1,
        };
        tileRegistry.register(newTile);
        newTiles.push(newTile);
      }
      executeCommand([
        new AddTilesCommand(newTiles, replacedTiles),
        new PatchCommand({ lastSourceTileId: null }, { lastSourceTileId: state.lastSourceTileId }),
      ]);
    } else {
      // Find first empty cell to place the crop
      let destX = 0, destY = 0;
      outer: for (let r = 0; r < mainAtlasGeo.rows; r++) {
        for (let c = 0; c < mainAtlasGeo.cols; c++) {
          if (!state.mainTiles.some(t => mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, c, r))) {
            ({ x: destX, y: destY } = mainAtlasGeo.getPosFromCell(c, r));
            break outer;
          }
        }
      }
      const newTile: TextureTile = {
        id: generateId(), url: createCrop(scx, scy),
        name: `${sourceTile.name}_crop_${scx}_${scy}`,
        width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
        x: destX, y: destY, hue: 0, brightness: 100, scale: 1, isCrop: true,
      };
      tileRegistry.register(newTile);
      const { cx: tcx, cy: tcy } = mainAtlasGeo.getCellAtPos(destX, destY);
      const replacedTiles = state.mainTiles.filter(t =>
        mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, tcx, tcy)
      );
      executeCommand([
        new AddTilesCommand([newTile], replacedTiles),
        new PatchCommand({ lastSourceTileId: null }, { lastSourceTileId: state.lastSourceTileId }),
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sourceGridSettings, state.mainTiles, state.lastSourceTileId,
      mainAtlasGeo, selectedCells, executeCommand]);

  const handleSourceCellRightClick = useCallback(async (
    _x: number, _y: number, _w: number, _h: number,
    scx: number, scy: number,
    sourceTile: TextureTile
  ) => {
    if (selectedCells.length === 0) return;
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceTile.width, sourceTile.height);

    const canvas = document.createElement('canvas');
    canvas.width = mainAtlasGeo.cellW; canvas.height = mainAtlasGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = await loadImage(sourceTile.url);
    const { x: sx, y: sy } = sourceGeo.getPosFromCell(scx, scy);
    ctx.drawImage(img, sx, sy, sourceGeo.cellW, sourceGeo.cellH, 0, 0, mainAtlasGeo.cellW, mainAtlasGeo.cellH);
    const croppedUrl = canvas.toDataURL();

    const newTiles: TextureTile[] = [];
    const replacedTiles: TextureTile[] = [];
    for (const key of selectedCells) {
      const [dcx, dcy] = key.split(',').map(Number);
      const { x: destX, y: destY } = mainAtlasGeo.getPosFromCell(dcx, dcy);
      replacedTiles.push(...state.mainTiles.filter(t =>
        mainAtlasGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)
      ));
      const newTile: TextureTile = {
        id: generateId(), url: croppedUrl,
        name: `${sourceTile.name}_fill_${scx}_${scy}`,
        width: mainAtlasGeo.cellW, height: mainAtlasGeo.cellH,
        x: destX, y: destY, hue: 0, brightness: 100, scale: 1, isCrop: true,
      };
      tileRegistry.register(newTile);
      newTiles.push(newTile);
    }
    executeCommand([
      new AddTilesCommand(newTiles, replacedTiles),
      new PatchCommand({ lastSourceTileId: null }, { lastSourceTileId: state.lastSourceTileId }),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sourceGridSettings, state.mainTiles, state.lastSourceTileId,
      mainAtlasGeo, selectedCells, executeCommand]);

  return { performGridSlice, handleMaterialize, handleSourceCellClick, handleSourceCellRightClick };
}
