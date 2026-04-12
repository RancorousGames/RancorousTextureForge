import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TextureTile, AppMode, GridSettings, ChannelMapping, PBRSet, Layer, AppState } from './types';
import { MainAtlas } from './components/MainAtlas';
import { SourceAtlas } from './components/SourceAtlas';
import { SecondaryAtlas } from './components/SecondaryAtlas';
import { Toolbox } from './components/Toolbox';
import { ChannelPackerMode } from './components/ChannelPackerMode';
import { LayeringMode } from './components/LayeringMode';
import { AdjustMode } from './components/AdjustMode';
import { FolderOpen, LayoutTemplate, Layers, Palette, SlidersHorizontal, Undo2, Redo2 } from 'lucide-react';
import { cn } from './lib/utils';
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
    clearColor: '#FFFFFF',
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
    clearColor: '#FFFFFF',
  },
  packerMapping: initialPackerMapping,
  pbrSet: initialPBRSet,
  layeringLayers: [],
  selectedCells: [],
  atlasSwapMode: false,
  selectedTileId: null,
  canvasSize: 2048,
  adjustSettings: {
    targetW: 'source',
    targetH: 'source',
  },
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('atlas');
  const { state, set, undo, redo, canUndo, canRedo } = useHistory<AppState>(initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTileId = state.selectedTileId;
  const setSelectedTileId = (id: string | null) => set(prev => ({ ...prev, selectedTileId: id }));
  const canvasSize = state.canvasSize;
  const setCanvasSize = (size: number) => set(prev => ({ ...prev, canvasSize: size }));

  const handleLoadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    
    const files = Array.from(e.target.files) as File[];
    const newTiles: TextureTile[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenDirectory = async () => {
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      const newTiles: TextureTile[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(png|jpe?g|webp)$/i)) {
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

  const [viewKey, setViewKey] = useState(0);

  const handleAssetClick = (tile: TextureTile) => {
    if (mode === 'atlas') {
      const newTile = { ...tile, id: Math.random().toString(36).substring(2, 9), x: 0, y: 0 };
      // Replace existing tiles in atlas mode
      set((prev) => ({ ...prev, mainTiles: [newTile] }));
      // Resize canvas to new image resolution
      setCanvasSize(Math.max(tile.width, tile.height));
      // Reset view
      setViewKey(prev => prev + 1);
    } else if (mode === 'adjust') {
      // If it's a library tile, create a modified duplicate if not already exists
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

  const updateTile = (id: string, updates: Partial<TextureTile>) => {
    set((prev) => {
      const isMain = prev.mainTiles.some(t => t.id === id);
      const isModified = prev.modifiedTiles.some(t => t.id === id);
      const isSecondary = prev.secondaryTiles.some(t => t.id === id);

      if (isMain) {
        return { ...prev, mainTiles: prev.mainTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      }
      if (isModified) {
        return { ...prev, modifiedTiles: prev.modifiedTiles.map(t => t.id === id ? { ...t, ...updates } : t) };
      }
      if (isSecondary) {
        // Create modified duplicate
        const tile = prev.secondaryTiles.find(t => t.id === id)!;
        const modified = { ...tile, ...updates, id: Math.random().toString(36).substring(2, 9) };
        setSelectedTileId(modified.id);
        return { ...prev, modifiedTiles: [...prev.modifiedTiles, modified] };
      }
      return prev;
    });
  };

  const packAtlas = () => {
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    const padding = 2;
    const maxWidth = 2048;

    const sorted = [...state.mainTiles].sort((a, b) => (b.height * b.scale) - (a.height * a.scale));

    const packed = sorted.map((tile) => {
      const scaledWidth = tile.width * tile.scale;
      const scaledHeight = tile.height * tile.scale;

      if (currentX + scaledWidth > maxWidth) {
        currentX = 0;
        currentY += rowHeight + padding;
        rowHeight = 0;
      }

      const updatedTile = { ...tile, x: currentX, y: currentY };
      rowHeight = Math.max(rowHeight, scaledHeight);
      currentX += scaledWidth + padding;
      return updatedTile;
    });

    set((prev) => ({ ...prev, mainTiles: packed }));
  };

  const exportAtlas = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, 2048, 2048);

    for (const tile of state.mainTiles) {
      const img = new Image();
      img.src = tile.url;
      await new Promise(resolve => { img.onload = resolve; });
      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0, tile.width * tile.scale, tile.height * tile.scale);
      ctx.restore();
    }

    exportTexture(canvas.toDataURL('image/png'), 'atlas.png');
  };

  const runExternalScript = async () => {
    try {
      const res = await fetch('/api/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'echo "Hello from Windows script!"' })
      });
      const data = await res.json();
      alert(data.error ? `Script Error: ${data.error}` : `Script Output:\n${data.stdout}`);
    } catch (e) {
      alert('Failed to connect to backend.');
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

  const handleSourceCellClick = async (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => {
    // w, h are source cell inner dimensions
    // scx, scy are source cell indices
    const sourcePadding = state.sourceGridSettings.padding || 0;
    const sourceStepX = w + sourcePadding * 2;
    const sourceStepY = h + sourcePadding * 2;

    let targetInnerW = 0, targetInnerH = 0;
    if (state.gridSettings.mode === 'perfect') {
      targetInnerW = state.canvasSize / state.gridSettings.gridX;
      targetInnerH = state.canvasSize / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
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
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = sourceTile.url;
    });

    const createCrop = (cx: number, cy: number) => {
      ctx.clearRect(0, 0, targetInnerW, targetInnerH);
      // Source crop: x = cx * step + padding, y = cy * step + padding
      // We only grab the inner area (w, h)
      ctx.drawImage(
        img, 
        cx * sourceStepX + sourcePadding, 
        cy * sourceStepY + sourcePadding, 
        w, h, 
        0, 0, 
        targetInnerW, targetInnerH
      );
      return canvas.toDataURL();
    };

    if (state.selectedCells.length > 0) {
      let minCX = Infinity, minCY = Infinity;
      state.selectedCells.forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        if (cx < minCX) minCX = cx;
        if (cy < minCY) minCY = cy;
      });

      const newTiles: TextureTile[] = [];
      const filteredMainTiles = [...state.mainTiles];

      for (const key of state.selectedCells) {
        const [dcx, dcy] = key.split(',').map(Number);
        const offsetX = dcx - minCX;
        const offsetY = dcy - minCY;
        
        const sourceCX = scx + offsetX;
        const sourceCY = scy + offsetY;

        if (sourceCX * sourceStepX < sourceTile.width && sourceCY * sourceStepY < sourceTile.height) {
          const croppedUrl = createCrop(sourceCX, sourceCY);
          
          const destX = dcx * targetStepX + targetPadding;
          const destY = dcy * targetStepY + targetPadding;
          
          const existingIdx = filteredMainTiles.findIndex(t => 
            Math.round(t.x) === Math.round(destX) && Math.round(t.y) === Math.round(destY)
          );
          if (existingIdx !== -1) {
            filteredMainTiles.splice(existingIdx, 1);
          }

          newTiles.push({
            id: Math.random().toString(36).substring(2, 9),
            url: croppedUrl,
            name: `${sourceTile.name}_crop_${sourceCX}_${sourceCY}`,
            width: targetInnerW,
            height: targetInnerH,
            x: destX,
            y: destY,
            hue: 0,
            brightness: 100,
            scale: 1,
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
        width: targetInnerW,
        height: targetInnerH,
        x: 0,
        y: 0,
        hue: 0,
        brightness: 100,
        scale: 1,
      }, 0, 0);
    }
  };

  const handleMainAtlasDrop = (tileOrId: string | TextureTile, x: number, y: number) => {
    const tile = typeof tileOrId === 'string' 
      ? [...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles].find(t => t.id === tileOrId)
      : tileOrId;

    if (tile) {
      let finalX = x;
      let finalY = y;
      
      let innerW = 0, innerH = 0;
      if (state.gridSettings.mode === 'perfect') {
        innerW = canvasSize / state.gridSettings.gridX;
        innerH = canvasSize / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
      } else if (state.gridSettings.mode === 'fixed') {
        innerW = state.gridSettings.cellSize;
        innerH = state.gridSettings.cellY || state.gridSettings.cellSize;
      }

      const padding = state.gridSettings.padding || 0;
      const stepX = innerW + padding * 2;
      const stepY = innerH + padding * 2;

      if (state.gridSettings.mode !== 'packing' && innerW > 0 && innerH > 0) {
        const cols = Math.floor(canvasSize / stepX);
        const rows = Math.floor(canvasSize / stepY);
        let found = false;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = c * stepX + padding;
            const cy = r * stepY + padding;
            const isOccupied = state.mainTiles.some(t => 
              Math.round(t.x) === Math.round(cx) && Math.round(t.y) === Math.round(cy)
            );
            if (!isOccupied) {
              finalX = cx;
              finalY = cy;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      const newTile = { 
        ...tile, 
        id: Math.random().toString(36).substring(2, 9),
        x: finalX, 
        y: finalY,
        isCrop: true
      };
      // Replace existing tiles in atlas mode
      set(prev => ({ ...prev, mainTiles: [newTile] }));
      // Resize canvas to new image resolution
      setCanvasSize(Math.max(tile.width, tile.height));
      // Reset view
      setViewKey(prev => prev + 1);
    }
  };

  const fixGrid = async () => {
    if (state.mainTiles.length === 0) return;

    // 1. Render current atlas to a single canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    for (const tile of state.mainTiles) {
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = tile.url;
      });
      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.scale(tile.scale, tile.scale);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }

    // 2. Detect islands
    const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const data = imageData.data;
    const visited = new Uint8Array(canvasSize * canvasSize);
    const islands: { x1: number, y1: number, x2: number, y2: number }[] = [];

    const clearColor = hexToRgb(state.gridSettings.clearColor);

    for (let y = 0; y < canvasSize; y++) {
      for (let x = 0; x < canvasSize; x++) {
        const idx = (y * canvasSize + x);
        if (visited[idx]) continue;

        const pIdx = idx * 4;
        const isClear = data[pIdx] === clearColor.r && data[pIdx+1] === clearColor.g && data[pIdx+2] === clearColor.b;

        if (!isClear) {
          // BFS to find island
          let x1 = x, y1 = y, x2 = x, y2 = y;
          const queue = [[x, y]];
          visited[idx] = 1;

          while (queue.length > 0) {
            const [cx, cy] = queue.shift()!;
            x1 = Math.min(x1, cx);
            y1 = Math.min(y1, cy);
            x2 = Math.max(x2, cx);
            y2 = Math.max(y2, cy);

            const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasSize && ny >= 0 && ny < canvasSize) {
                const nIdx = ny * canvasSize + nx;
                if (!visited[nIdx]) {
                  const npIdx = nIdx * 4;
                  const nIsClear = data[npIdx] === clearColor.r && data[npIdx+1] === clearColor.g && data[npIdx+2] === clearColor.b;
                  if (!nIsClear) {
                    visited[nIdx] = 1;
                    queue.push([nx, ny]);
                  }
                }
              }
            }
          }
          islands.push({ x1, y1, x2, y2 });
        }
      }
    }

    // 3. Center islands in cells
    let cellW = 0, cellH = 0;
    const padding = state.gridSettings.padding || 0;
    if (state.gridSettings.mode === 'perfect') {
      cellW = canvasSize / state.gridSettings.gridX;
      cellH = canvasSize / (state.gridSettings.keepSquare ? state.gridSettings.gridX : state.gridSettings.gridY);
    } else if (state.gridSettings.mode === 'fixed') {
      cellW = state.gridSettings.cellSize + padding * 2;
      cellH = (state.gridSettings.cellY || state.gridSettings.cellSize) + padding * 2;
    }

    if (cellW < 16 || cellH < 16) return;

    const newTiles: TextureTile[] = [];
    for (const island of islands) {
      const iw = island.x2 - island.x1 + 1;
      const ih = island.y2 - island.y1 + 1;
      const icx = (island.x1 + island.x2) / 2;
      const icy = (island.y1 + island.y2) / 2;

      const col = Math.floor(icx / cellW);
      const row = Math.floor(icy / cellH);

      const targetCenterX = (col + 0.5) * cellW;
      const targetCenterY = (row + 0.5) * cellH;

      const finalX = targetCenterX - iw / 2;
      const finalY = targetCenterY - ih / 2;

      // Extract island to its own tile
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
          name: `Island_${col}_${row}`,
          width: iw,
          height: ih,
          x: finalX,
          y: finalY,
          hue: 0,
          brightness: 100,
          scale: 1,
        });
      }
    }

    set(prev => ({ ...prev, mainTiles: newTiles }));
  };

  const packElements = async () => {
    if (state.mainTiles.length === 0) return;

    // 1. Render current atlas to a single canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = state.gridSettings.clearColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    for (const tile of state.mainTiles) {
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = tile.url;
      });
      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.scale(tile.scale, tile.scale);
      ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }

    // 2. Scan for bounding boxes of continuous items
    const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    const data = imageData.data;
    const visited = new Uint8Array(canvasSize * canvasSize);
    
    const clearRGB = hexToRgb(state.gridSettings.clearColor);
    
    const isClear = (idx: number) => {
      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];
      const a = data[idx * 4 + 3];
      if (a === 0) return true;
      return r === clearRGB.r && g === clearRGB.g && b === clearRGB.b;
    };

    const boxes: { x: number, y: number, w: number, h: number, url: string }[] = [];

    for (let y = 0; y < canvasSize; y += 4) { // Step for speed
      for (let x = 0; x < canvasSize; x += 4) {
        const idx = y * canvasSize + x;
        if (!visited[idx] && !isClear(idx)) {
          // Found a blob, find its bounding box
          let minX = x, maxX = x, minY = y, maxY = y;
          const stack = [[x, y]];
          visited[idx] = 1;

          while (stack.length > 0) {
            const [currX, currY] = stack.pop()!;
            if (currX < minX) minX = currX;
            if (currX > maxX) maxX = currX;
            if (currY < minY) minY = currY;
            if (currY > maxY) maxY = currY;

            // Check neighbors (8-connectivity, sparse)
            const neighbors = [[currX+4, currY], [currX-4, currY], [currX, currY+4], [currX, currY-4]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < canvasSize && ny >= 0 && ny < canvasSize) {
                const nidx = ny * canvasSize + nx;
                if (!visited[nidx] && !isClear(nidx)) {
                  visited[nidx] = 1;
                  stack.push([nx, ny]);
                }
              }
            }
          }

          // Refine box (optional, but good)
          const w = maxX - minX + 4;
          const h = maxY - minY + 4;
          
          const blobCanvas = document.createElement('canvas');
          blobCanvas.width = w;
          blobCanvas.height = h;
          const blobCtx = blobCanvas.getContext('2d');
          if (blobCtx) {
            blobCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
            boxes.push({ x: minX, y: minY, w, h, url: blobCanvas.toDataURL() });
          }
        }
      }
    }

    if (boxes.length === 0) return;

    // 3. Pack boxes
    const padding = state.gridSettings.padding || 2;
    const packItems = boxes.map((b, i) => ({ w: b.w + padding * 2, h: b.h + padding * 2, i }));
    
    if (state.gridSettings.packingAlgo === 'potpack') {
      potpack(packItems as any);
    } else {
      // Simple Shelf Packer
      let currentX = 0;
      let currentY = 0;
      let maxHeight = 0;
      const maxWidth = canvasSize;
      
      for (const item of packItems) {
        if (currentX + item.w > maxWidth) {
          currentX = 0;
          currentY += maxHeight;
          maxHeight = 0;
        }
        (item as any).x = currentX;
        (item as any).y = currentY;
        currentX += item.w;
        if (item.h > maxHeight) maxHeight = item.h;
      }
    }

    // 4. Update tiles
    const newTiles: TextureTile[] = packItems.map(item => {
      const b = boxes[item.i];
      return {
        id: Math.random().toString(36).substring(2, 9),
        url: b.url,
        name: `Packed_${item.i}`,
        width: b.w,
        height: b.h,
        x: (item as any).x + padding,
        y: (item as any).y + padding,
        hue: 0,
        brightness: 100,
        scale: 1,
        isCrop: true
      };
    });

    set(prev => ({ ...prev, mainTiles: newTiles }));
  };

  const createNewAtlas = (size: number) => {
    setCanvasSize(size);
    // Mark all cells as empty by starting with no tiles.
    // The background color is handled by AtlasCanvas.
    set(prev => ({ ...prev, mainTiles: [] }));
  };

  function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  const exportTexture = async (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const selectedTile = state.mainTiles.find((t) => t.id === selectedTileId) || 
                       state.modifiedTiles.find(t => t.id === selectedTileId) ||
                       state.secondaryTiles.find(t => t.id === selectedTileId);

  // Collect all modified or active tiles for the "Active" section
  const activeTiles = [
    ...state.modifiedTiles,
    ...state.mainTiles.filter(t => !t.isCrop),
    ...state.layeringLayers.map(l => l.tile),
    ...[state.packerMapping.r.tile, state.packerMapping.g.tile, state.packerMapping.b.tile, state.packerMapping.a.tile].filter((t): t is TextureTile => t !== null),
    ...[state.pbrSet.baseColor.tile, state.pbrSet.normal.tile, state.pbrSet.orm.tile].filter((t): t is TextureTile => t !== null),
  ].filter((v, i, a) => a.findIndex(t => t.url === v.url && t.hue === v.hue && t.brightness === v.brightness && t.scale === v.scale) === i);

  // Handle Keyboard Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
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
              key={viewKey}
              selectedTile={selectedTile}
              updateTile={updateTile}
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
            <div className="flex-1 flex overflow-hidden" key={`canvas-${viewKey}`}>
              <MainAtlas
                tiles={state.mainTiles}
                setTiles={(tiles) => {
                  if (typeof tiles === 'function') {
                    set(prev => ({ ...prev, mainTiles: (tiles as any)(prev.mainTiles) }));
                  } else {
                    set(prev => ({ ...prev, mainTiles: tiles }));
                  }
                }}
                selectedTileId={selectedTileId}
                setSelectedTileId={setSelectedTileId}
                onRemoveTile={(tile) => set(prev => ({ ...prev, mainTiles: prev.mainTiles.filter(t => t.id !== tile.id) }))}
                onDrop={handleMainAtlasDrop}
                gridSettings={state.gridSettings}
                selectedCells={state.selectedCells}
                onSelectedCellsChange={(cells) => set(prev => ({ ...prev, selectedCells: cells }))}
                atlasSwapMode={state.atlasSwapMode}
                canvasSize={canvasSize}
              />
            <SourceAtlas
              onAddTile={(tile) => handleMainAtlasDrop(tile, 0, 0)}
              gridSettings={state.sourceGridSettings}
              onGridSettingsChange={(gs) => set(prev => ({ ...prev, sourceGridSettings: gs }))}
              availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]}
              onSourceCellClick={handleSourceCellClick}
            />
            </div>
          </>
        )}

        {mode === 'adjust' && (
          <div className="flex-1 flex overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={handleAdjustDrop}>
            <AdjustMode 
              selectedTile={selectedTile} 
              updateTile={updateTile} 
              onExport={exportTexture} 
              adjustSettings={state.adjustSettings}
              onAdjustSettingsChange={(as) => set(prev => ({ ...prev, adjustSettings: as }))}
            />
          </div>
        )}

        {mode === 'channel-pack' && (
          <ChannelPackerMode 
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]} 
            mapping={state.packerMapping}
            setMapping={(m) => set(prev => ({ ...prev, packerMapping: m }))}
            pbrSet={state.pbrSet}
            setPbrSet={(p) => set(prev => ({ ...prev, pbrSet: p }))}
            onExport={exportTexture}
          />
        )}

        {mode === 'layering' && (
          <LayeringMode 
            availableTiles={[...state.secondaryTiles, ...state.modifiedTiles, ...state.mainTiles]} 
            layers={state.layeringLayers}
            setLayers={(l) => set(prev => ({ ...prev, layeringLayers: l }))}
            onExport={exportTexture}
          />
        )}
        
        <SecondaryAtlas
          tiles={state.secondaryTiles}
          activeTiles={activeTiles}
          onTileClick={handleAssetClick}
        />
      </div>
    </div>
  );
}




