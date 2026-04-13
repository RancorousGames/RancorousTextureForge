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
import { cn, hexToRgb } from './lib/utils';
import { useHistory } from './hooks/useHistory';
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

const initialState: AppState = {
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
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('atlas');
  const { state, set, undo, redo, canUndo, canRedo } = useHistory<AppState>(initialState);
  
  // Transient UI state - not in history
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const canvasWidth = state.canvasWidth || state.canvasSize;
  const canvasHeight = state.canvasHeight || state.canvasSize;

  const addFilesToLibrary = async (files: File[]) => {
    const newTiles: TextureTile[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.secondaryTiles.some(t => t.name === file.name)) continue;
      
      const tile = await new Promise<TextureTile>((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          resolve({
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
          });
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
              resolve({
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
              });
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

  const performAutoSlice = async (sourceTile: TextureTile, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = sourceTile.url;
    });

    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, sourceTile.width, sourceTile.height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const islands: { x1: number, y1: number, x2: number, y2: number }[] = [];

    const clearColor = hexToRgb(state.gridSettings.clearColor);
    const tolerance = state.gridSettings.clearTolerance;

    const isColorClose = (r: number, g: number, b: number, target: {r: number, g: number, b: number}) => {
      return Math.abs(r - target.r) <= tolerance && Math.abs(g - target.g) <= tolerance && Math.abs(b - target.b) <= tolerance;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x);
        if (visited[idx]) continue;
        const pIdx = idx * 4;
        const isClear = isColorClose(data[pIdx], data[pIdx+1], data[pIdx+2], clearColor) || data[pIdx+3] < 5;

        if (!isClear) {
          let x1 = x, y1 = y, x2 = x, y2 = y;
          const queue: [number, number][] = [[x, y]];
          visited[idx] = 1;
          let head = 0;
          while (head < queue.length) {
            const [cx, cy] = queue[head++];
            x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
            x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
            const neighbors: [number, number][] = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (!visited[nIdx]) {
                  const npIdx = nIdx * 4;
                  const nIsClear = isColorClose(data[npIdx], data[npIdx+1], data[npIdx+2], clearColor) || data[npIdx+3] < 5;
                  if (!nIsClear) {
                    visited[nIdx] = 1;
                    queue.push([nx, ny]);
                  }
                }
              }
            }
          }
          if (x2 - x1 > 2 && y2 - y1 > 2) islands.push({ x1, y1, x2, y2 });
        }
      }
    }

    const newTiles: TextureTile[] = [];
    for (const island of islands) {
      const iw = island.x2 - island.x1 + 1;
      const ih = island.y2 - island.y1 + 1;
      const islandCanvas = document.createElement('canvas');
      islandCanvas.width = iw;
      islandCanvas.height = ih;
      const islandCtx = islandCanvas.getContext('2d');
      if (islandCtx) {
        islandCtx.putImageData(ctx.getImageData(island.x1, island.y1, iw, ih), 0, 0);
        newTiles.push({
          id: Math.random().toString(36).substring(2, 9),
          url: islandCanvas.toDataURL(),
          sourceUrl: islandCanvas.toDataURL(),
          name: `Slice_${island.x1}_${island.y1}`,
          width: iw, height: ih,
          x: island.x1, y: island.y1,
          hue: 0, brightness: 100, scale: 1,
          isCrop: true,
        });
      }
    }

    if (newTiles.length === 0) {
      newTiles.push({
        ...sourceTile,
        id: Math.random().toString(36).substring(2, 9),
        x: 0, y: 0,
      });
    }

    set(prev => ({ ...prev, mainTiles: newTiles }));
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
        mainTiles: []
      }));
      setSelectedTileId(null);
      setSelectedCells([]);
      setTimeout(() => performAutoSlice(tile, w, h), 50);
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
      let innerW = 0, innerH = 0;
      if (state.gridSettings.mode === 'perfect') {
        innerW = canvasWidth / state.gridSettings.gridX;
        innerH = canvasHeight / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
      } else if (state.gridSettings.mode === 'fixed') {
        innerW = state.gridSettings.cellSize;
        innerH = state.gridSettings.cellY || state.gridSettings.cellSize;
      }

      const padding = state.gridSettings.padding || 0;
      const stepX = innerW + padding * 2;
      const stepY = innerH + padding * 2;

      if (state.gridSettings.mode !== 'packing' && innerW > 0 && innerH > 0 && x === 0 && y === 0) {
        const cols = Math.floor(canvasWidth / stepX);
        const rows = Math.floor(canvasHeight / stepY);
        let found = false;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = c * stepX + padding;
            const cy = r * stepY + padding;
            const isOccupied = state.mainTiles.some(t => 
              Math.round(t.x) === Math.round(cx) && Math.round(t.y) === Math.round(cy)
            );
            if (!isOccupied) {
              finalX = cx; finalY = cy;
              found = true; break;
            }
          }
          if (found) break;
        }
      }

      const newTile = { 
        ...tile, 
        id: Math.random().toString(36).substring(2, 9),
        x: finalX, y: finalY,
        isCrop: true
      };
      set(prev => ({ ...prev, mainTiles: [...prev.mainTiles, newTile] }));
    }
  };

  const handleSourceCellClick = async (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => {
    const sourcePadding = state.sourceGridSettings.padding || 0;
    const sourceStepX = w + sourcePadding * 2;
    const sourceStepY = h + sourcePadding * 2;

    let targetInnerW = 0, targetInnerH = 0;
    if (state.gridSettings.mode === 'perfect') {
      targetInnerW = canvasWidth / state.gridSettings.gridX;
      targetInnerH = canvasHeight / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
    } else if (state.gridSettings.mode === 'fixed') {
      targetInnerW = state.gridSettings.cellSize;
      targetInnerH = state.gridSettings.cellY || state.gridSettings.cellSize;
    }

    const targetPadding = state.gridSettings.padding || 0;
    const targetStepX = targetInnerW + targetPadding * 2;
    const targetStepY = targetInnerH + targetPadding * 2;

    if (targetInnerW <= 0 || targetInnerH <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = targetInnerW;
    canvas.height = targetInnerH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = sourceTile.url; });

    const createCrop = (cx: number, cy: number) => {
      ctx.clearRect(0, 0, targetInnerW, targetInnerH);
      ctx.drawImage(img, cx * sourceStepX + sourcePadding, cy * sourceStepY + sourcePadding, w, h, 0, 0, targetInnerW, targetInnerH);
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
      const filteredMainTiles = [...state.mainTiles];

      for (const key of selectedCells) {
        const [dcx, dcy] = key.split(',').map(Number);
        const offsetX = dcx - minCX;
        const offsetY = dcy - minCY;
        const sourceCX = scx + offsetX;
        const sourceCY = scy + offsetY;

        if (sourceCX * sourceStepX < sourceTile.width && sourceCY * sourceStepY < sourceTile.height) {
          const croppedUrl = createCrop(sourceCX, sourceCY);
          const destX = dcx * targetStepX + targetPadding;
          const destY = dcy * targetStepY + targetPadding;
          const existingIdx = filteredMainTiles.findIndex(t => Math.round(t.x) === Math.round(destX) && Math.round(t.y) === Math.round(destY));
          if (existingIdx !== -1) filteredMainTiles.splice(existingIdx, 1);

          newTiles.push({
            id: Math.random().toString(36).substring(2, 9),
            url: croppedUrl,
            name: `${sourceTile.name}_crop_${sourceCX}_${sourceCY}`,
            width: targetInnerW, height: targetInnerH, x: destX, y: destY,
            hue: 0, brightness: 100, scale: 1,
          });
        }
      }
      set((prev) => ({ ...prev, mainTiles: [...filteredMainTiles, ...newTiles] }));
    } else {
      const croppedUrl = createCrop(scx, scy);
      handleMainAtlasDrop({
        id: Math.random().toString(36).substring(2, 9),
        url: croppedUrl,
        name: `${sourceTile.name}_crop_${scx}_${scy}`,
        width: targetInnerW, height: targetInnerH, x: 0, y: 0,
        hue: 0, brightness: 100, scale: 1,
      }, 0, 0);
    }
  };

  const handleSourceCellRightClick = async (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => {
    if (selectedCells.length === 0) return;
    const sourcePadding = state.sourceGridSettings.padding || 0;
    const sourceStepX = w + sourcePadding * 2;
    const sourceStepY = h + sourcePadding * 2;

    let targetInnerW = 0, targetInnerH = 0;
    if (state.gridSettings.mode === 'perfect') {
      targetInnerW = canvasWidth / state.gridSettings.gridX;
      targetInnerH = canvasHeight / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
    } else if (state.gridSettings.mode === 'fixed') {
      targetInnerW = state.gridSettings.cellSize;
      targetInnerH = state.gridSettings.cellY || state.gridSettings.cellSize;
    }

    const targetPadding = state.gridSettings.padding || 0;
    const targetStepX = targetInnerW + targetPadding * 2;
    const targetStepY = targetInnerH + targetPadding * 2;

    if (targetInnerW <= 0 || targetInnerH <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = targetInnerW;
    canvas.height = targetInnerH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = sourceTile.url; });

    ctx.drawImage(img, scx * sourceStepX + sourcePadding, scy * sourceStepY + sourcePadding, w, h, 0, 0, targetInnerW, targetInnerH);
    const croppedUrl = canvas.toDataURL();

    const newTiles: TextureTile[] = [];
    const filteredMainTiles = [...state.mainTiles];

    for (const key of selectedCells) {
      const [dcx, dcy] = key.split(',').map(Number);
      const destX = dcx * targetStepX + targetPadding;
      const destY = dcy * targetStepY + targetPadding;
      const existingIdx = filteredMainTiles.findIndex(t => Math.round(t.x) === Math.round(destX) && Math.round(t.y) === Math.round(destY));
      if (existingIdx !== -1) filteredMainTiles.splice(existingIdx, 1);

      newTiles.push({
        id: Math.random().toString(36).substring(2, 9),
        url: croppedUrl,
        name: `${sourceTile.name}_fill_${scx}_${scy}`,
        width: targetInnerW, height: targetInnerH, x: destX, y: destY,
        hue: 0, brightness: 100, scale: 1, isCrop: true
      });
    }
    set((prev) => ({ ...prev, mainTiles: [...filteredMainTiles, ...newTiles] }));
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

  const fixGrid = async () => {
    if (state.mainTiles.length === 0) return;
    console.log('%c--- Fix Grid Start ---', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth; canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    for (const tile of state.mainTiles) {
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.src = tile.url; });
      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.scale(tile.scale, tile.scale);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0, tile.width, tile.height);
      ctx.restore();
    }

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const islands: { x1: number, y1: number, x2: number, y2: number }[] = [];
    const clearColor = hexToRgb(state.gridSettings.clearColor);
    const tolerance = state.gridSettings.clearTolerance;

    const isColorClose = (r: number, g: number, b: number, target: {r: number, g: number, b: number}) => {
      return Math.abs(r - target.r) <= tolerance && Math.abs(g - target.g) <= tolerance && Math.abs(b - target.b) <= tolerance;
    };

    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const idx = (y * canvasWidth + x);
        if (visited[idx]) continue;
        const pIdx = idx * 4;
        const isClear = isColorClose(data[pIdx], data[pIdx+1], data[pIdx+2], clearColor) || data[pIdx+3] < 5;
        if (!isClear) {
          let x1 = x, y1 = y, x2 = x, y2 = y;
          const queue: [number, number][] = [[x, y]];
          visited[idx] = 1;
          let head = 0;
          while (head < queue.length) {
            const [cx, cy] = queue[head++];
            x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
            x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
            const neighbors: [number, number][] = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
                const nIdx = ny * canvasWidth + nx;
                if (!visited[nIdx]) {
                  const npIdx = nIdx * 4;
                  const nIsClear = isColorClose(data[npIdx], data[npIdx+1], data[npIdx+2], clearColor) || data[npIdx+3] < 5;
                  if (!nIsClear) { visited[nIdx] = 1; queue.push([nx, ny]); }
                }
              }
            }
          }
          islands.push({ x1, y1, x2, y2 });
        }
      }
    }

    let cellW = 0, cellH = 0;
    const padding = state.gridSettings.padding || 0;
    if (state.gridSettings.mode === 'perfect') {
      cellW = canvasWidth / state.gridSettings.gridX;
      cellH = canvasHeight / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
    } else if (state.gridSettings.mode === 'fixed') {
      cellW = state.gridSettings.cellSize + padding * 2;
      cellH = (state.gridSettings.cellY || state.gridSettings.cellSize) + padding * 2;
    }

    console.log(`[Grid] Cell Size: ${cellW.toFixed(1)}x${cellH.toFixed(1)}, Padding: ${padding}`);
    console.log(`[Islands] Detected ${islands.length} raw islands.`);

    const cellMap = new Map<string, {x1: number, y1: number, x2: number, y2: number}[]>();
    for (const island of islands) {
      if (island.x2 - island.x1 <= 2 || island.y2 - island.y1 <= 2) continue;
      const midX = (island.x1 + island.x2) / 2;
      const midY = (island.y1 + island.y2) / 2;
      const col = Math.floor(midX / cellW);
      const row = Math.floor(midY / cellH);
      const key = `${col},${row}`;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key)!.push(island);
    }

    const newTiles: TextureTile[] = [];
    cellMap.forEach((cellIslands, key) => {
      const [col, row] = key.split(',').map(Number);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const i of cellIslands) {
        minX = Math.min(minX, i.x1); minY = Math.min(minY, i.y1);
        maxX = Math.max(maxX, i.x2); maxY = Math.max(maxY, i.y2);
      }
      
      const iw = maxX - minX + 1;
      const ih = maxY - minY + 1;
      const targetCenterX = (col + 0.5) * cellW;
      const targetCenterY = (row + 0.5) * cellH;
      const finalX = targetCenterX - iw / 2;
      const finalY = targetCenterY - ih / 2;

      console.log(`[Match] Cell (${col}, ${row}): BBox ${iw}x${ih} at [${minX}, ${minY}] -> Centered at [${finalX.toFixed(1)}, ${finalY.toFixed(1)}]`);

      const islandCanvas = document.createElement('canvas');
      islandCanvas.width = iw; islandCanvas.height = ih;
      const islandCtx = islandCanvas.getContext('2d');
      if (islandCtx) {
        islandCtx.putImageData(ctx.getImageData(minX, minY, iw, ih), 0, 0);
        newTiles.push({
          id: Math.random().toString(36).substring(2, 9),
          url: islandCanvas.toDataURL(),
          sourceUrl: islandCanvas.toDataURL(),
          name: `Island_${col}_${row}`,
          width: iw, height: ih, x: finalX, y: finalY,
          hue: 0, brightness: 100, scale: 1, isCrop: true,
        });
      }
    });

    console.log(`%c--- Fix Grid Complete: ${newTiles.length} tiles generated ---`, 'color: #10b981; font-weight: bold;');
    set(prev => ({ ...prev, mainTiles: newTiles }));
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
    let cellW = 0, cellH = 0, padding = 0;
    if (state.gridSettings.mode === 'perfect') {
      cellW = canvasWidth / state.gridSettings.gridX;
      cellH = canvasHeight / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
    } else {
      padding = state.gridSettings.padding || 0;
      cellW = state.gridSettings.cellSize;
      cellH = state.gridSettings.cellY || state.gridSettings.cellSize;
    }
    const stepX = cellW + padding * 2;
    const stepY = cellH + padding * 2;
    const tx = cx * stepX + padding;
    const ty = cy * stepY + padding;
    return state.mainTiles.find(t => Math.round(t.x) === Math.round(tx) && Math.round(t.y) === Math.round(ty));
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
              onExport={exportAtlas}
              onRunScript={() => {}}
              gridSettings={state.gridSettings}
              onGridSettingsChange={(gs) => set(prev => ({ ...prev, gridSettings: gs }))}
              atlasSwapMode={state.atlasSwapMode}
              setAtlasSwapMode={(val) => set(prev => ({ ...prev, atlasSwapMode: val }))}
            />
            <div className="flex-1 flex overflow-hidden">
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
              {canvasWidth > 0 && (
                <SourceAtlas
                  onAddTile={(tile) => handleMainAtlasDrop(tile, 0, 0)}
                  gridSettings={state.sourceGridSettings}
                  onGridSettingsChange={(gs) => set(prev => ({ ...prev, sourceGridSettings: gs }))}
                  availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
                  onSourceCellClick={handleSourceCellClick}
                  onSourceCellRightClick={handleSourceCellRightClick}
                />
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
