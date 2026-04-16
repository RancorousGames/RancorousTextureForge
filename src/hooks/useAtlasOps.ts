import { useCallback } from 'react';
import { AppState, TextureTile } from '../types';
import { GridGeometry } from '../lib/GridGeometry';
import { hexToRgb } from '../lib/utils';
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
    const { data } = imageData;
    const visited = new Uint8Array(canvasWidth * canvasHeight);

    const { r: bgR, g: bgG, b: bgB } = hexToRgb(state.gridSettings.clearColor);
    const tolerance = state.gridSettings.clearTolerance ?? 15;

    const isClearColored = (x: number, y: number) => {
      const idx = (y * canvasWidth + x) * 4;
      if (data[idx + 3] < 5) return true;
      return Math.abs(data[idx] - bgR) <= tolerance &&
             Math.abs(data[idx + 1] - bgG) <= tolerance &&
             Math.abs(data[idx + 2] - bgB) <= tolerance;
    };

    // Flood-fill from every border pixel to find reachable background.
    // Clear-colored pixels enclosed inside a sprite won't be reachable and
    // will be treated as sprite content, preventing false island splits.
    const reachable = new Uint8Array(canvasWidth * canvasHeight);
    const bgQueue: [number, number][] = [];
    const seedBorder = (x: number, y: number) => {
      const idx = y * canvasWidth + x;
      if (!reachable[idx] && isClearColored(x, y)) { reachable[idx] = 1; bgQueue.push([x, y]); }
    };
    for (let x = 0; x < canvasWidth; x++) { seedBorder(x, 0); seedBorder(x, canvasHeight - 1); }
    for (let y = 1; y < canvasHeight - 1; y++) { seedBorder(0, y); seedBorder(canvasWidth - 1, y); }
    let bgHead = 0;
    while (bgHead < bgQueue.length) {
      const [cx, cy] = bgQueue[bgHead++];
      for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]] as [number,number][]) {
        if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
          const nidx = ny * canvasWidth + nx;
          if (!reachable[nidx] && isClearColored(nx, ny)) { reachable[nidx] = 1; bgQueue.push([nx, ny]); }
        }
      }
    }

    // A pixel is not background if it was never reached from the border
    const isNotBg = (x: number, y: number) => reachable[y * canvasWidth + x] === 0;

    const islands: { x: number; y: number; w: number; h: number }[] = [];
    const scanStep = 4;

    for (let sy = 0; sy < canvasHeight; sy += scanStep) {
      for (let sx = 0; sx < canvasWidth; sx += scanStep) {
        const sidx = sy * canvasWidth + sx;
        if (visited[sidx] || !isNotBg(sx, sy)) continue;

        let x1 = sx, y1 = sy, x2 = sx, y2 = sy;
        const queue: [number, number][] = [[sx, sy]];
        visited[sidx] = 1;
        let head = 0;

        while (head < queue.length) {
          const [cx, cy] = queue[head++];
          x1 = Math.min(x1, cx); y1 = Math.min(y1, cy);
          x2 = Math.max(x2, cx); y2 = Math.max(y2, cy);
          // 4-directional only — bridging caused adjacent sprites to merge when padding < 4px
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
            if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
              const nidx = ny * canvasWidth + nx;
              if (!visited[nidx] && isNotBg(nx, ny)) {
                visited[nidx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }
        if (x2 - x1 >= 4 && y2 - y1 >= 4) islands.push({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
      }
    }

    // Filter out islands that are entirely contained within other islands
    const filteredIslands = islands
      .sort((a, b) => (b.w * b.h) - (a.w * a.h))
      .filter((inner, idx, arr) => {
        for (let i = 0; i < idx; i++) {
          const outer = arr[i];
          const isContained = 
            inner.x >= outer.x && 
            inner.y >= outer.y && 
            (inner.x + inner.w) <= (outer.x + outer.w) && 
            (inner.y + inner.h) <= (outer.y + outer.h);
          if (isContained) return false;
        }
        return true;
      });

    const geo = mainAtlasGeo;
    const newTiles: TextureTile[] = filteredIslands.map((isl, i) => {
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
  }, [state.mainTiles, state.gridSettings.clearColor, canvasWidth, canvasHeight, mainAtlasGeo, executeCommand]);

  const packElements = useCallback(async () => {
    if (state.mainTiles.length === 0) return;

    const canvas = await renderTilesToCanvas(
      state.mainTiles, canvasWidth, canvasHeight,
      state.gridSettings.clearColor, { willReadFrequently: true }
    );
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const { data } = imageData;
    const visited = new Uint8Array(canvasWidth * canvasHeight);
    const clearRGB = hexToRgb(state.gridSettings.clearColor);

    const isClear = (idx: number) => {
      const r = data[idx * 4], g = data[idx * 4 + 1], b = data[idx * 4 + 2], a = data[idx * 4 + 3];
      if (a === 0) return true;
      return r === clearRGB.r && g === clearRGB.g && b === clearRGB.b;
    };

    const boxes: { x: number; y: number; w: number; h: number; url: string }[] = [];
    for (let y = 0; y < canvasHeight; y += 4) {
      for (let x = 0; x < canvasWidth; x += 4) {
        const idx = y * canvasWidth + x;
        if (visited[idx] || isClear(idx)) continue;

        let minX = x, maxX = x, minY = y, maxY = y;
        const stack = [[x, y]];
        visited[idx] = 1;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [nx, ny] of [[cx + 4, cy], [cx - 4, cy], [cx, cy + 4], [cx, cy - 4]] as [number, number][]) {
            if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
              const nidx = ny * canvasWidth + nx;
              if (!visited[nidx] && !isClear(nidx)) { visited[nidx] = 1; stack.push([nx, ny]); }
            }
          }
        }

        const w = maxX - minX + 4, h = maxY - minY + 4;
        const blobCanvas = document.createElement('canvas');
        blobCanvas.width = w; blobCanvas.height = h;
        blobCanvas.getContext('2d')?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
        boxes.push({ x: minX, y: minY, w, h, url: blobCanvas.toDataURL() });
      }
    }

    if (boxes.length === 0) return;

    const padding = state.gridSettings.padding || 2;
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
