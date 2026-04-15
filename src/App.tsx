import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TextureTile, AppMode, GridSettings, ChannelMapping, PBRSet, Layer, AppState } from './types';
import { MainAtlas } from './components/MainAtlas';
import { SourceAtlas } from './components/SourceAtlas';
import { SecondaryAtlas } from './components/SecondaryAtlas';
import { Toolbox } from './components/Toolbox';
import { ChannelPackerMode } from './components/ChannelPackerMode';
import { LayeringMode } from './components/LayeringMode';
import { AdjustMode } from './components/AdjustMode';
import { FolderOpen, LayoutTemplate, Layers, Palette, SlidersHorizontal, Undo2, Redo2, Plus, Image as ImageIcon } from 'lucide-react';
import { cn, hexToRgb, detectSettingsFromImage, rgbToHex } from './lib/utils';
import { useHistory } from './hooks/useHistory';
import { GridGeometry } from './lib/GridGeometry';
import { useAtlas } from './hooks/useAtlas';
import { tileRegistry } from './lib/TileRegistry';
import { AddTilesCommand, RemoveTilesCommand, SetMainTilesCommand, MoveTileCommand } from './lib/Commands';
import potpack from 'potpack';

const initialPackerMapping: ChannelMapping = {
  r: { tile: null, sourceChannel: 'r' },
  g: { tile: null, sourceChannel: 'r' },
  b: { tile: null, sourceChannel: 'r' },
  a: { tile: null, sourceChannel: 'r' },
};

const initialPBRSet: PBRSet = {
  baseColor: { tile: null, active: true },
  normal: { tile: null, active: true },
  orm: { tile: null, active: true },
};

const FORGE_CONFIG_KEY = 'forge_config_v1';

const getInitialState = (): AppState => {
  const baseState: AppState = {
    mainTiles: [],
    secondaryTiles: [],
    modifiedTiles: [],
    gridSettings: {
      mode: 'fixed',
      gridX: 8,
      gridY: 8,
      keepSquare: true,
      cellSize: 128,
      cellY: 128,
      padding: 0,
      clearColor: '#000000',
      clearTolerance: 10,
      packingAlgo: 'potpack',
    },
    sourceGridSettings: {
      mode: 'fixed',
      gridX: 8,
      gridY: 8,
      keepSquare: true,
      cellSize: 128,
      cellY: 128,
      padding: 0,
      clearColor: '#000000',
      clearTolerance: 10,
    },
    packerMapping: initialPackerMapping,
    pbrSet: initialPBRSet,
    layeringLayers: [],
    atlasSwapMode: false,
    canvasSize: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    adjustSettings: {
      targetW: 'source',
      targetH: 'source',
    },
    lastSourceTileId: null,
    clearedCells: [],
  };

  try {
    const saved = localStorage.getItem(FORGE_CONFIG_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      return {
        ...baseState,
        gridSettings: { ...baseState.gridSettings, ...config.gridSettings },
        sourceGridSettings: { ...baseState.sourceGridSettings, ...config.sourceGridSettings },
        adjustSettings: { ...baseState.adjustSettings, ...config.adjustSettings },
      };
    }
  } catch (e) {
    console.error('Failed to load forge config', e);
  }
  return baseState;
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('forge_mode');
    return (saved as AppMode) || 'atlas';
  });
  const { state, set, executeCommand, undo, redo, canUndo, canRedo } = useHistory<AppState>(getInitialState());
  
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);
  const splitPaneRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = (e: React.PointerEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: PointerEvent) => {
      if (!splitPaneRef.current) return;
      const rect = splitPaneRef.current.getBoundingClientRect();
      const nextRatio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(Math.max(0.1, nextRatio), 0.9));
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isResizing]);

  // Transient UI state - not in history
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reSliceTimerRef = useRef<any>(null);
  
  const canvasWidth = state.canvasWidth || state.canvasSize;
  const canvasHeight = state.canvasHeight || state.canvasSize;

  const mainAtlas = useAtlas(state.gridSettings, canvasWidth, canvasHeight, {
    tiles: state.mainTiles,
    setTiles: (newTiles) => {
      const nextTiles = typeof newTiles === 'function' ? newTiles(state.mainTiles) : newTiles;
      executeCommand(new SetMainTilesCommand(state.mainTiles, nextTiles));
    }
  });

  const performGridSlice = useCallback(async (sourceTile: TextureTile, width: number, height: number, skipHistory = false) => {
    const imgUrl = sourceTile.sourceUrl || sourceTile.url;
    console.log(`[Forge] Reslicing from ${imgUrl}`);
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = imgUrl;
    });

    const gs = state.gridSettings;
    let cellW = 0, cellH = 0, padding = 0;
    if (gs.mode === 'perfect') {
      cellW = width / gs.gridX;
      cellH = height / (gs.keepSquare ? gs.gridX : gs.gridY);
    } else {
      padding = gs.padding || 0;
      cellW = gs.cellSize;
      cellH = gs.cellY || gs.cellSize;
    }

    const stepX = cellW + padding * 2;
    const stepY = cellH + padding * 2;
    const cols = Math.floor(width / stepX);
    const rows = Math.floor(height / stepY);

    const newTiles: TextureTile[] = [];
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = cellW;
    sliceCanvas.height = cellH;
    const sliceCtx = sliceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sliceCtx) return;

    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 1; checkCanvas.height = 1;
    const checkCtx = checkCanvas.getContext('2d');
    if (!checkCtx) return;
    checkCtx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const keyData = checkCtx.getImageData(0, 0, 1, 1).data;
    const keyColor = { r: keyData[0], g: keyData[1], b: keyData[2], a: keyData[3] };
    const permClear = hexToRgb(gs.clearColor);
    const tolerance = gs.clearTolerance;

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 5 && keyColor.a < 5) return true;
      return Math.abs(r - keyColor.r) <= tolerance && Math.abs(g - keyColor.g) <= tolerance && Math.abs(b - keyColor.b) <= tolerance;
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        sliceCtx.clearRect(0, 0, cellW, cellH);
        sliceCtx.drawImage(img, c * stepX + padding, r * stepY + padding, cellW, cellH, 0, 0, cellW, cellH);
        
        const sliceData = sliceCtx.getImageData(0, 0, cellW, cellH);
        const pixels = sliceData.data;
        let hasContent = false;

        for (let i = 0; i < pixels.length; i += 4) {
          if (isMatch(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
            pixels[i] = permClear.r; pixels[i+1] = permClear.g; pixels[i+2] = permClear.b; pixels[i+3] = 255;
          } else {
            hasContent = true;
          }
        }

        if (hasContent) {
          sliceCtx.putImageData(sliceData, 0, 0);
          const newTile: TextureTile = {
            id: Math.random().toString(36).substring(2, 9),
            url: sliceCanvas.toDataURL(),
            sourceUrl: imgUrl,
            name: `Slice_${c}_${r}`,
            width: cellW, height: cellH,
            x: c * stepX + padding, y: r * stepY + padding,
            hue: 0, brightness: 100, scale: 1,
            isCrop: true,
          };
          tileRegistry.register(newTile);
          newTiles.push(newTile);
        }
      }
    }

    if (newTiles.length > 0) {
      tileRegistry.registerMany(newTiles);
      if (skipHistory) {
        set(prev => ({ ...prev, mainTiles: newTiles, clearedCells: [] }));
      } else {
        executeCommand([
          new SetMainTilesCommand(state.mainTiles, newTiles),
          { execute: (s: any) => ({ ...s, lastSourceTileId: sourceTile.id, clearedCells: [] }), undo: (s: any) => ({ ...s, lastSourceTileId: state.lastSourceTileId, clearedCells: state.clearedCells }) } as any
        ]);
      }
    }
  }, [state.gridSettings.cellSize, state.gridSettings.padding, state.gridSettings.mode, state.gridSettings.gridX, state.gridSettings.gridY, state.gridSettings.keepSquare, state.gridSettings.clearColor, state.gridSettings.clearTolerance, state.lastSourceTileId, state.mainTiles, executeCommand, set]);

  // Save settings on change
  useEffect(() => {
    const config = {
      gridSettings: state.gridSettings,
      sourceGridSettings: state.sourceGridSettings,
      adjustSettings: state.adjustSettings,
    };
    localStorage.setItem(FORGE_CONFIG_KEY, JSON.stringify(config));
  }, [state.gridSettings, state.sourceGridSettings, state.adjustSettings]);

  useEffect(() => {
    localStorage.setItem('forge_mode', mode);
  }, [mode]);

  const addFilesToLibrary = async (files: File[]) => {
    const newTiles: TextureTile[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.secondaryTiles.some(t => t.name === file.name)) continue;
      
      const tile = await new Promise<TextureTile>((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const t: TextureTile = {
            id: Math.random().toString(36).substring(2, 9),
            file,
            url,
            sourceUrl: url,
            name: file.name,
            width: img.width,
            height: img.height,
            x: 0,
            y: 0,
            hue: 0,
            brightness: 100,
            scale: 1,
          };
          tileRegistry.register(t);
          resolve(t);
        };
        img.src = url;
      });
      newTiles.push(tile);
    }
    set((prev) => ({ ...prev, secondaryTiles: [...prev.secondaryTiles, ...newTiles] }));
  };

  const handleLoadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await addFilesToLibrary(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearLibrary = () => {
    if (confirm('Are you sure you want to clear all loaded assets?')) {
      set(prev => ({ ...prev, secondaryTiles: [] }));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenDirectory = async () => {
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      const newTiles: TextureTile[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(png|jpe?g|webp)$/i)) {
          if (state.secondaryTiles.some(t => t.name === entry.name)) continue;
          const file = await entry.getFile();
          const tile = await new Promise<TextureTile>((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              const t: TextureTile = {
                id: Math.random().toString(36).substring(2, 9),
                file,
                url,
                name: file.name,
                width: img.width,
                height: img.height,
                x: 0,
                y: 0,
                hue: 0,
                brightness: 100,
                scale: 1,
              };
              tileRegistry.register(t);
              resolve(t);
            };
            img.src = url;
          });
          newTiles.push(tile);
        }
      }
      set((prev) => ({ ...prev, secondaryTiles: [...prev.secondaryTiles, ...newTiles] }));
    } catch (e) {
      console.log('Directory picker cancelled or failed', e);
      fileInputRef.current?.click();
    }
  };


  const handleAssetClick = async (tile: TextureTile) => {
    if (mode === 'atlas') {
      const w = tile.width;
      const h = tile.height;
      set(prev => ({ 
        ...prev, 
        canvasWidth: w, 
        canvasHeight: h, 
        canvasSize: Math.max(w, h),
        mainTiles: [],
        lastSourceTileId: tile.id,
        clearedCells: []
      }));
      setSelectedTileId(null);
      setSelectedCells([]);
      setTimeout(() => performGridSlice(tile, w, h, false), 50);
    } else if (mode === 'adjust') {
      if (state.secondaryTiles.some(t => t.id === tile.id)) {
        const existingModified = state.modifiedTiles.find(t => t.name === tile.name && t.file === tile.file);
        if (existingModified) {
          setSelectedTileId(existingModified.id);
        } else {
          const modified = { ...tile, id: Math.random().toString(36).substring(2, 9) };
          set(prev => ({ ...prev, modifiedTiles: [...prev.modifiedTiles, modified] }));
          setSelectedTileId(modified.id);
        }
      } else {
        setSelectedTileId(tile.id);
      }
    } else if (mode === 'layering') {
      const newLayer: Layer = {
        id: Math.random().toString(36).substring(2, 9),
        tile: { ...tile },
        opacity: 1,
        transparentColor: null,
        tolerance: 10,
        visible: true,
      };
      set(prev => ({ ...prev, layeringLayers: [newLayer, ...prev.layeringLayers] }));
    }
  };

  const handleAdjustDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const tileId = e.dataTransfer.getData('text/plain');
    const tile = [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles].find(t => t.id === tileId);
    if (tile) {
      handleAssetClick(tile);
    }
  };

  const handleMainAtlasDrop = (tileOrId: string | TextureTile, x: number, y: number) => {
    const tile = typeof tileOrId === 'string' 
      ? [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles].find(t => t.id === tileOrId)
      : tileOrId;

    if (tile) {
      const isFromLibrary = state.secondaryTiles.some(t => t.id === tile.id);
      if (isFromLibrary) {
        handleAssetClick(tile);
        return;
      }

      let finalX = x;
      let finalY = y;

      if (state.gridSettings.mode !== 'packing') {
        const snapped = mainAtlas.geo.snap(x, y);
        finalX = snapped.x;
        finalY = snapped.y;

        if (x === 0 && y === 0) {
          let found = false;
          for (let r = 0; r < mainAtlas.geo.rows; r++) {
            for (let c = 0; c < mainAtlas.geo.cols; c++) {
              const isOccupied = state.mainTiles.some(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, c, r));
              if (!isOccupied) {
                const pos = mainAtlas.geo.getPosFromCell(c, r);
                finalX = pos.x; finalY = pos.y;
                found = true; break;
              }
            }
            if (found) break;
          }
        }
      }

      const newTile: TextureTile = { 
        ...tile, 
        id: Math.random().toString(36).substring(2, 9),
        x: finalX, y: finalY,
        width: mainAtlas.geo.cellW,
        height: mainAtlas.geo.cellH,
        isCrop: true
      };
      
      tileRegistry.register(newTile);
      const { cx, cy } = mainAtlas.geo.getCellAtPos(finalX, finalY);
      const replacedTiles = state.mainTiles.filter(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      executeCommand([
        new AddTilesCommand([newTile], replacedTiles),
        { execute: (s: any) => ({ ...s, lastSourceTileId: null }), undo: (s: any) => ({ ...s, lastSourceTileId: state.lastSourceTileId }) } as any
      ]);
    }
  };

  const handleSourceCellClick = async (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => {
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceTile.width, sourceTile.height);
    const targetGeo = mainAtlas.geo;

    const canvas = document.createElement('canvas');
    canvas.width = targetGeo.cellW;
    canvas.height = targetGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = sourceTile.url; });

    const createCrop = (cx: number, cy: number) => {
      ctx.clearRect(0, 0, targetGeo.cellW, targetGeo.cellH);
      const { x: sx, y: sy } = sourceGeo.getPosFromCell(cx, cy);
      ctx.drawImage(img, sx, sy, sourceGeo.cellW, sourceGeo.cellH, 0, 0, targetGeo.cellW, targetGeo.cellH);
      return canvas.toDataURL();
    };

    if (selectedCells.length > 0) {
      let minCX = Infinity, minCY = Infinity;
      selectedCells.forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        if (cx < minCX) minCX = cx;
        if (cy < minCY) minCY = cy;
      });

      const newTiles: TextureTile[] = [];
      const replacedTiles: TextureTile[] = [];

      for (const key of selectedCells) {
        const [dcx, dcy] = key.split(',').map(Number);
        const offsetX = dcx - minCX;
        const offsetY = dcy - minCY;
        const sourceCX = scx + offsetX;
        const sourceCY = scy + offsetY;

        if (sourceCX < sourceGeo.cols && sourceCY < sourceGeo.rows) {
          const croppedUrl = createCrop(sourceCX, sourceCY);
          const { x: destX, y: destY } = targetGeo.getPosFromCell(dcx, dcy);
          
          replacedTiles.push(...state.mainTiles.filter(t => targetGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)));

          const newTile: TextureTile = {
            id: Math.random().toString(36).substring(2, 9),
            url: croppedUrl,
            name: `${sourceTile.name}_crop_${sourceCX}_${sourceCY}`,
            width: targetGeo.cellW, height: targetGeo.cellH, x: destX, y: destY,
            hue: 0, brightness: 100, scale: 1,
          };
          tileRegistry.register(newTile);
          newTiles.push(newTile);
        }
      }
      executeCommand([
        new AddTilesCommand(newTiles, replacedTiles),
        { execute: (s: any) => ({ ...s, lastSourceTileId: null }), undo: (s: any) => ({ ...s, lastSourceTileId: state.lastSourceTileId }) } as any
      ]);
    } else {
      const croppedUrl = createCrop(scx, scy);
      handleMainAtlasDrop({
        ...sourceTile,
        url: croppedUrl,
        id: Math.random().toString(36).substring(2, 9),
        width: targetGeo.cellW,
        height: targetGeo.cellH
      }, 0, 0);
    }
  };

  const handleMaterialize = async (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => {
    const sourceTile = [...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId);
    if (!sourceTile) return;

    const sourceGeo = new GridGeometry(state.gridSettings, canvasWidth, canvasHeight);
    const cellPos = sourceGeo.getPosFromCell(cx, cy);

    const canvas = document.createElement('canvas');
    canvas.width = sourceGeo.cellW;
    canvas.height = sourceGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = sourceTile.sourceUrl || sourceTile.url; });
    ctx.drawImage(img, cellPos.x, cellPos.y, sourceGeo.cellW, sourceGeo.cellH, 0, 0, sourceGeo.cellW, sourceGeo.cellH);
    const croppedUrl = canvas.toDataURL();

    const newTile: TextureTile = {
      id: Math.random().toString(36).substring(2, 9),
      url: croppedUrl,
      sourceUrl: sourceTile.sourceUrl || sourceTile.url,
      name: `JIT_${cx}_${cy}`,
      width: sourceGeo.cellW, height: sourceGeo.cellH,
      x: draggingPos ? draggingPos.x : cellPos.x,
      y: draggingPos ? draggingPos.y : cellPos.y,
      hue: 0, brightness: 100, scale: 1,
      isCrop: true
    };

    tileRegistry.register(newTile);
    const key = `${cx},${cy}`;

    if (reason === 'clear') {
      executeCommand({
        execute: (s: any) => ({ ...s, clearedCells: [...s.clearedCells, key] }),
        undo: (s: any) => ({ ...s, clearedCells: s.clearedCells.filter((k: string) => k !== key) })
      } as any);
    } else {
      executeCommand([
        new AddTilesCommand([newTile], []),
        { 
          execute: (s: any) => ({ ...s, clearedCells: [...s.clearedCells, key] }), 
          undo: (s: any) => ({ ...s, clearedCells: s.clearedCells.filter((k: string) => k !== key) }) 
        } as any
      ]);
    }
  };

  const handleSourceCellRightClick = async (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => {
    if (selectedCells.length === 0) return;
    
    const sourceGeo = new GridGeometry(state.sourceGridSettings, sourceTile.width, sourceTile.height);
    const targetGeo = mainAtlas.geo;

    const canvas = document.createElement('canvas');
    canvas.width = targetGeo.cellW;
    canvas.height = targetGeo.cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = sourceTile.url; });

    const { x: sx, y: sy } = sourceGeo.getPosFromCell(scx, scy);
    ctx.drawImage(img, sx, sy, sourceGeo.cellW, sourceGeo.cellH, 0, 0, targetGeo.cellW, targetGeo.cellH);
    const croppedUrl = canvas.toDataURL();

    const newTiles: TextureTile[] = [];
    const replacedTiles: TextureTile[] = [];

    for (const key of selectedCells) {
      const [dcx, dcy] = key.split(',').map(Number);
      const { x: destX, y: destY } = targetGeo.getPosFromCell(dcx, dcy);
      
      replacedTiles.push(...state.mainTiles.filter(t => targetGeo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, dcx, dcy)));

      const newTile: TextureTile = {
        id: Math.random().toString(36).substring(2, 9),
        url: croppedUrl,
        name: `${sourceTile.name}_fill_${scx}_${scy}`,
        width: targetGeo.cellW, height: targetGeo.cellH, x: destX, y: destY,
        hue: 0, brightness: 100, scale: 1, isCrop: true
      };
      tileRegistry.register(newTile);
      newTiles.push(newTile);
    }
    executeCommand([
      new AddTilesCommand(newTiles, replacedTiles),
      { execute: (s: any) => ({ ...s, lastSourceTileId: null }), undo: (s: any) => ({ ...s, lastSourceTileId: state.lastSourceTileId }) } as any
    ]);
  };

  const handleAutoDetectMainGrid = async () => {
    console.log("[Forge] Auto-detecting main grid");
    let imageData: ImageData | null = null;

    const sharedSourceUrls = Array.from(new Set(
      state.mainTiles
        .map((tile) => tile.sourceUrl)
        .filter((url): url is string => Boolean(url))
    ));

    if (sharedSourceUrls.length === 1) {
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = sharedSourceUrls[0];
      });

      const realW = img.naturalWidth || img.width;
      const realH = img.naturalHeight || img.height;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = realW;
      sourceCanvas.height = realH;
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

      if (sourceCtx) {
        sourceCtx.imageSmoothingEnabled = false;
        sourceCtx.drawImage(img, 0, 0, realW, realH);
        imageData = sourceCtx.getImageData(0, 0, realW, realH);
        console.log(`[Forge] Main detection using shared source image: ${realW}x${realH}`);
      }
    }

    if (!imageData) {
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        console.error("[Forge] Could not get 2D context for main grid detection");
        return;
      }

      ctx.fillStyle = state.gridSettings.clearColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      for (const tile of state.mainTiles) {
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.src = tile.url; });
        ctx.save();
        ctx.translate(tile.x, tile.y);
        ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
        ctx.drawImage(img, 0, 0, tile.width * tile.scale, tile.height * tile.scale);
        ctx.restore();
      }

      imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      console.log(`[Forge] Main detection falling back to reconstructed canvas: ${canvasWidth}x${canvasHeight}`);
    }

    const data = imageData.data;
    const r = data[0], g = data[1], b = data[2], a = data[3];
    console.log(`[Forge] Sampled main canvas at (0,0): RGBA(${r},${g},${b},${a})`);

    const detectedClearColor = rgbToHex(r, g, b);
    console.log(`[Forge] Detected main clear color hex: ${detectedClearColor}`);

    const { cellSize, padding } = detectSettingsFromImage(
      imageData, 
      detectedClearColor, 
      state.gridSettings.clearTolerance ?? 10
    );

    console.log(`[Forge] Main detection result: cellSize=${cellSize}, padding=${padding}`);

    set(prev => ({
      ...prev,
      gridSettings: {
        ...prev.gridSettings,
        clearColor: detectedClearColor,
        cellSize,
        cellY: cellSize,
        padding,
        keepSquare: true
      }
    }));
  };


  const handleAutoDetectSourceGrid = async (sourceTile: TextureTile) => {
    console.log(`[Forge] Auto-detecting source grid for: ${sourceTile.name}`);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve) => { 
      img.onload = resolve; 
      img.onerror = () => {
        console.error(`[Forge] Failed to load image for detection: ${sourceTile.url}`);
        resolve(null);
      };
      img.src = sourceTile.sourceUrl || sourceTile.url; 
    });
    
    // CRITICAL: Use natural dimensions to avoid browser-side scaling
    const realW = img.naturalWidth || img.width;
    const realH = img.naturalHeight || img.height;
    console.log(`[Forge] Image natural dimensions: ${realW}x${realH}`);

    const canvas = document.createElement('canvas');
    canvas.width = realW;
    canvas.height = realH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      console.error("[Forge] Could not get 2D context for detection");
      return;
    }
    // Ensure no smoothing
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, realW, realH);

    // CRITICAL: On high-DPI displays, getImageData width/height may differ 
    // from canvas.width/height if the browser is scaling.
    const imageData = ctx.getImageData(0, 0, realW, realH);
    console.log(`[Forge] ImageData actual dimensions: ${imageData.width}x${imageData.height} (DPR: ${window.devicePixelRatio})`);
    
    const data = imageData.data;
    const r = data[0], g = data[1], b = data[2], a = data[3];
    console.log(`[Forge] Sampled pixel at (0,0): RGBA(${r},${g},${b},${a})`);
    
    const detectedClearColor = rgbToHex(r, g, b);
    console.log(`[Forge] Detected clear color hex: ${detectedClearColor}`);

    const { cellSize, padding } = detectSettingsFromImage(
      imageData, 
      detectedClearColor, 
      state.sourceGridSettings.clearTolerance ?? 10
    );

    console.log(`[Forge] Detection result: cellSize=${cellSize}, padding=${padding}`);

    set(prev => ({
      ...prev,
      sourceGridSettings: {
        ...prev.sourceGridSettings,
        clearColor: detectedClearColor,
        cellSize,
        cellY: cellSize,
        padding,
        keepSquare: true
      }
    }));
  };

  const packAtlas = () => {
    let currentX = 0, currentY = 0, rowHeight = 0;
    const padding = 2;
    const maxWidth = canvasWidth;
    const sorted = [...state.mainTiles].sort((a, b) => (b.height * b.scale) - (a.height * a.scale));
    const packed = sorted.map((tile) => {
      const scaledWidth = tile.width * tile.scale;
      const scaledHeight = tile.height * tile.scale;
      if (currentX + scaledWidth > maxWidth) {
        currentX = 0; currentY += rowHeight + padding; rowHeight = 0;
      }
      const updatedTile = { ...tile, x: currentX, y: currentY };
      rowHeight = Math.max(rowHeight, scaledHeight);
      currentX += scaledWidth + padding;
      return updatedTile;
    });
    set((prev) => ({ ...prev, mainTiles: packed }));
  };

  const fixGrid = () => {
    if (state.mainTiles.length === 0) return;
    const geo = mainAtlas.geo;

    const fixedTiles = state.mainTiles.map(tile => {
      const centerX = tile.x + (tile.width * tile.scale) / 2;
      const centerY = tile.y + (tile.height * tile.scale) / 2;
      const { cx, cy } = geo.getCellAtPos(centerX - geo.padding, centerY - geo.padding);
      const pos = geo.getPosFromCell(cx, cy);
      
      console.log(`[Fix Grid] Snapping ${tile.name} from [${tile.x.toFixed(1)}, ${tile.y.toFixed(1)}] to cell (${cx}, ${cy})`);
      
      return {
        ...tile,
        x: pos.x,
        y: pos.y,
        width: geo.cellW,
        height: geo.cellH
      };
    });

    set(prev => ({ ...prev, mainTiles: fixedTiles }));
  };

  const packElements = async () => {
    if (state.mainTiles.length === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth; canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    for (const tile of state.mainTiles) {
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.src = tile.url; });
      ctx.save(); ctx.translate(tile.x, tile.y); ctx.scale(tile.scale, tile.scale);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0); ctx.restore();
    }
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const clearRGB = hexToRgb(state.gridSettings.clearColor);
    const isClear = (idx: number) => {
      const r = data[idx * 4]; const g = data[idx * 4 + 1]; const b = data[idx * 4 + 2]; const a = data[idx * 4 + 3];
      if (a === 0) return true;
      return r === clearRGB.r && g === clearRGB.g && b === clearRGB.b;
    };
    const boxes: { x: number, y: number, w: number, h: number, url: string }[] = [];
    for (let y = 0; y < canvasHeight; y += 4) {
      for (let x = 0; x < canvasWidth; x += 4) {
        const idx = y * canvasWidth + x;
        if (!visited[idx] && !isClear(idx)) {
          let minX = x, maxX = x, minY = y, maxY = y;
          const stack = [[x, y]]; visited[idx] = 1;
          while (stack.length > 0) {
            const [currX, currY] = stack.pop()!;
            if (currX < minX) minX = currX; if (currX > maxX) maxX = currX;
            if (currY < minY) minY = currY; if (currY > maxY) maxY = currY;
            const neighbors = [[currX+4, currY], [currX-4, currY], [currX, currY+4], [currX, currY-4]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
                const nidx = ny * canvasWidth + nx;
                if (!visited[nidx] && !isClear(nidx)) { visited[nidx] = 1; stack.push([nx, ny]); }
              }
            }
          }
          const w = maxX - minX + 4; const h = maxY - minY + 4;
          const blobCanvas = document.createElement('canvas');
          blobCanvas.width = w; blobCanvas.height = h;
          const blobCtx = blobCanvas.getContext('2d');
          if (blobCtx) {
            blobCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
            boxes.push({ x: minX, y: minY, w, h, url: blobCanvas.toDataURL() });
          }
        }
      }
    }
    if (boxes.length === 0) return;
    const padding = state.gridSettings.padding || 2;
    const packItems = boxes.map((b, i) => ({ w: b.w + padding * 2, h: b.h + padding * 2, i }));
    if (state.gridSettings.packingAlgo === 'potpack') {
      potpack(packItems as any);
    } else {
      let currentX = 0, currentY = 0, maxHeight = 0;
      for (const item of packItems) {
        if (currentX + item.w > canvasWidth) { currentX = 0; currentY += maxHeight; maxHeight = 0; }
        (item as any).x = currentX; (item as any).y = currentY;
        currentX += item.w; if (item.h > maxHeight) maxHeight = item.h;
      }
    }
    const newTiles: TextureTile[] = packItems.map(item => {
      const b = boxes[item.i];
      return {
        id: Math.random().toString(36).substring(2, 9),
        url: b.url, name: `Packed_${item.i}`, width: b.w, height: b.h,
        x: (item as any).x + padding, y: (item as any).y + padding,
        hue: 0, brightness: 100, scale: 1, isCrop: true
      };
    });
    set(prev => ({ ...prev, mainTiles: newTiles }));
  };

  const createNewAtlas = (width: number, height?: number) => {
    let finalW = width;
    let finalH = height ?? width;

    if (width === 0) {
      const inputW = prompt("Enter atlas width (e.g. 1024, 2048):", "2048");
      if (!inputW) return;
      finalW = parseInt(inputW);
      if (isNaN(finalW) || finalW <= 0) return;

      const inputH = prompt("Enter atlas height (leave blank for square):", inputW);
      finalH = inputH ? parseInt(inputH) : finalW;
      if (isNaN(finalH) || finalH <= 0) finalH = finalW;
    }

    set(prev => ({ 
      ...prev, 
      canvasWidth: finalW,
      canvasHeight: finalH,
      canvasSize: Math.max(finalW, finalH),
      mainTiles: [],
      atlasSwapMode: false
    }));
    setSelectedTileId(null);
    setSelectedCells([]);
  };

  const exportAtlas = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth; canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    for (const tile of state.mainTiles) {
      const img = new Image();
      img.src = tile.url;
      await new Promise(resolve => { img.onload = resolve; });
      ctx.save(); ctx.translate(tile.x, tile.y);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0, tile.width * tile.scale, tile.height * tile.scale);
      ctx.restore();
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'atlas.png';
    link.click();
  };

  // Helper to get tile in cell
  const getTileAtCell = (key: string) => {
    const [cx, cy] = key.split(',').map(Number);
    return state.mainTiles.find(t => mainAtlas.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
  };

  // Derived Selection
  const selectedTile = selectedCells.length > 0 ? getTileAtCell(selectedCells[0]) : 
                       (selectedTileId ? (state.modifiedTiles.find(t => t.id === selectedTileId) || state.secondaryTiles.find(t => t.id === selectedTileId)) : null);

  const activeTiles = [
    ...state.modifiedTiles,
    ...state.mainTiles.filter(t => !t.isCrop),
    ...state.layeringLayers.map(l => l.tile),
    ...[state.packerMapping.r.tile, state.packerMapping.g.tile, state.packerMapping.b.tile, state.packerMapping.a.tile].filter((t): t is TextureTile => t !== null),
    ...[state.pbrSet.baseColor.tile, state.pbrSet.normal.tile, state.pbrSet.orm.tile].filter((t): t is TextureTile => t !== null),
  ].filter((v, i, a) => a.findIndex(t => t.url === v.url && t.hue === v.hue && t.brightness === v.brightness && t.scale === v.scale) === i);

  const updateTile = (id: string, updates: Partial<TextureTile>) => {
    set((prev) => {
      const isMain = prev.mainTiles.some(t => t.id === id);
      const isModified = prev.modifiedTiles.some(t => t.id === id);
      const isSecondary = prev.secondaryTiles.some(t => t.id === id);
      if (isMain) return { ...prev, mainTiles: prev.mainTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (isModified) return { ...prev, modifiedTiles: prev.modifiedTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      if (isSecondary) {
        const tile = prev.secondaryTiles.find(t => t.id === id)!;
        const modified = { ...tile, ...updates, id: Math.random().toString(36).substring(2, 9) };
        setSelectedTileId(modified.id);
        return { ...prev, modifiedTiles: [...prev.modifiedTiles, modified] };
      }
      return prev;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200 overflow-hidden">
      <header className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">TextureForge</h1>
          </div>
          <div className="flex items-center bg-zinc-950 rounded-lg p-1 border border-zinc-800">
            {[
              { id: 'atlas', icon: LayoutTemplate, label: 'Atlas' },
              { id: 'adjust', icon: SlidersHorizontal, label: 'Adjust' },
              { id: 'channel-pack', icon: Palette, label: 'Channel Pack' },
              { id: 'layering', icon: Layers, label: 'Layering' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id as AppMode)}
                className={cn("px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors", mode === m.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200")}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-4">
            <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400" title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30 text-zinc-400" title="Redo (Ctrl+Y)">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLoadFiles} />
          <button onClick={handleOpenDirectory} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium px-3 py-1.5 rounded transition-colors border border-zinc-700">
            <FolderOpen className="w-4 h-4" />
            Load Assets
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {mode === 'atlas' && (
          <>
            <Toolbox
              selectedTile={selectedTile}
              updateTile={(u) => { if (selectedTile) updateTile(selectedTile.id, u); }}
              onPack={packAtlas}
              onPackElements={packElements}
              onNewAtlas={createNewAtlas}
              onFixGrid={fixGrid}
              onAutoDetect={handleAutoDetectMainGrid}
              onExport={exportAtlas}
              onRunScript={() => {}}
              gridSettings={state.gridSettings}
              onGridSettingsChange={(gs) => set(prev => ({ ...prev, gridSettings: gs }))}
              atlasSwapMode={state.atlasSwapMode}
              setAtlasSwapMode={(val) => set(prev => ({ ...prev, atlasSwapMode: val }))}
            />
            <div className="flex-1 flex overflow-hidden" ref={splitPaneRef}>
              <div style={{ flex: canvasWidth > 0 ? splitRatio : 1 }} className="flex overflow-hidden">
                {canvasWidth > 0 ? (
                  <MainAtlas
                    tiles={state.mainTiles}
                    setTiles={(tiles) => {
                      if (typeof tiles === 'function') set(prev => ({ ...prev, mainTiles: (tiles as any)(prev.mainTiles) }));
                      else set(prev => ({ ...prev, mainTiles: tiles }));
                    }}
                    onRemoveTile={(tile) => set(prev => ({ ...prev, mainTiles: prev.mainTiles.filter(t => t.id !== tile.id) }))}
                    onDrop={handleMainAtlasDrop}
                    gridSettings={state.gridSettings}
                    selectedCells={selectedCells}
                    onSelectedCellsChange={setSelectedCells}
                    atlasSwapMode={state.atlasSwapMode}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    tooltip="L-Click: Select | R-Drag: Move | R-Click: Clear | Ctrl+Z/Y: Undo/Redo"
                    sourceTile={[...state.secondaryTiles, ...state.modifiedTiles].find(t => t.id === state.lastSourceTileId)}
                    clearedCells={state.clearedCells}
                    onMaterialize={handleMaterialize}
                  />
                ) : (
                  <div 
                    className="flex-1 flex flex-col items-center justify-center bg-zinc-950 border-r border-zinc-800"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const tileId = e.dataTransfer.getData('text/plain');
                      const tile = state.secondaryTiles.find(t => t.id === tileId);
                      if (tile) handleAssetClick(tile);
                    }}
                  >
                    <div className="p-12 border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center gap-6 max-w-lg text-center">
                      <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800 shadow-inner">
                        <ImageIcon className="w-10 h-10 text-zinc-600" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-zinc-200 tracking-tight">Create atlas or drag in existing one</h3>
                        <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
                          Start fresh with a specific resolution or drag a texture from the Asset Browser to automatically slice it into tiles.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                        {[1024, 2048, 4096, 0].map(size => (
                          <button 
                            key={size}
                            onClick={() => createNewAtlas(size)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border",
                              size === 0 
                                ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800" 
                                : "bg-blue-600 border-blue-500 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20"
                            )}
                          >
                            {size === 0 ? <Plus className="w-4 h-4" /> : null}
                            {size === 0 ? 'Custom Size...' : `${size}x${size}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {canvasWidth > 0 && (
                <>
                  <div 
                    className={cn(
                      "w-1 bg-zinc-800 hover:bg-blue-500 cursor-col-resize transition-colors z-50",
                      isResizing && "bg-blue-600 w-1.5"
                    )}
                    onPointerDown={handleResizeStart}
                  />
                  <div style={{ flex: 1 - splitRatio }} className="flex overflow-hidden">
                    <SourceAtlas
                      onAddTile={(tile) => handleMainAtlasDrop(tile, 0, 0)}
                      gridSettings={state.sourceGridSettings}
                      onGridSettingsChange={(gs) => set(prev => ({ ...prev, sourceGridSettings: gs }))}
                      onAutoDetectGrid={handleAutoDetectSourceGrid} 
                      availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
                      onSourceCellClick={handleSourceCellClick}
                      onSourceCellRightClick={handleSourceCellRightClick}
                      mainGridSettings={state.gridSettings}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {mode === 'adjust' && (
          <div className="flex-1 flex overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={handleAdjustDrop}>
            <AdjustMode selectedTile={selectedTile} updateTile={updateTile} onExport={(url, name) => {}} adjustSettings={state.adjustSettings} onAdjustSettingsChange={(as) => set(prev => ({ ...prev, adjustSettings: as }))} />
          </div>
        )}

        {mode === 'channel-pack' && (
          <ChannelPackerMode 
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]} 
            mapping={state.packerMapping} setMapping={(m) => set(prev => ({ ...prev, packerMapping: m }))}
            pbrSet={state.pbrSet} setPbrSet={(p) => set(prev => ({ ...prev, pbrSet: p }))}
            onExport={(url, name) => {}}
          />
        )}

        {mode === 'layering' && (
          <LayeringMode 
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]} 
            layers={state.layeringLayers} setLayers={(l) => set(prev => ({ ...prev, layeringLayers: l }))}
            onExport={(url, name) => {}}
          />
        )}
        
        <SecondaryAtlas
          tiles={state.secondaryTiles} activeTiles={activeTiles}
          onTileClick={handleAssetClick} onFilesDrop={addFilesToLibrary} onClear={handleClearLibrary}
        />
      </div>
    </div>
  );
}
