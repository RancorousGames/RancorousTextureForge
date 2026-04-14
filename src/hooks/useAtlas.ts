import { useState, useCallback, useMemo } from 'react';
import { TextureTile, GridSettings } from '../types';
import { GridGeometry } from '../lib/GridGeometry';

export interface AtlasController {
  tiles: TextureTile[];
  setTiles: (tiles: TextureTile[] | ((prev: TextureTile[]) => TextureTile[])) => void;
  addTile: (tile: TextureTile, x: number, y: number, snap?: boolean) => void;
  removeTilesInCell: (cx: number, cy: number) => void;
  moveTile: (id: string, nx: number, ny: number, snap?: boolean) => void;
  clear: () => void;
  geo: GridGeometry;
}

export function useAtlas(
  gridSettings: GridSettings,
  canvasW: number,
  canvasH: number,
  options?: {
    tiles?: TextureTile[];
    setTiles?: (tiles: TextureTile[] | ((prev: TextureTile[]) => TextureTile[])) => void;
  }
): AtlasController {
  const [internalTiles, _setInternalTiles] = useState<TextureTile[]>([]);
  
  const tiles = options?.tiles ?? internalTiles;
  const setTiles = useCallback((newTiles: TextureTile[] | ((prev: TextureTile[]) => TextureTile[])) => {
    if (options?.setTiles) {
      options.setTiles(newTiles);
    } else {
      _setInternalTiles(newTiles);
    }
  }, [options]);

  const geo = useMemo(() => new GridGeometry(gridSettings, canvasW, canvasH), [gridSettings, canvasW, canvasH]);

  const addTile = useCallback((tile: TextureTile, x: number, y: number, snap = true) => {
    let finalX = x;
    let finalY = y;
    if (snap) {
      const snapped = geo.snap(x, y);
      finalX = snapped.x;
      finalY = snapped.y;
    }

    const { cx, cy } = geo.getCellAtPos(finalX, finalY);
    
    setTiles(prev => {
      const filtered = prev.filter(t => !geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      return [...filtered, { ...tile, x: finalX, y: finalY, width: geo.cellW, height: geo.cellH }];
    });
  }, [geo, setTiles]);

  const removeTilesInCell = useCallback((cx: number, cy: number) => {
    setTiles(prev => prev.filter(t => !geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy)));
  }, [geo, setTiles]);

  const moveTile = useCallback((id: string, nx: number, ny: number, snap = true) => {
    let finalX = nx;
    let finalY = ny;
    if (snap) {
      const snapped = geo.snap(nx + geo.cellW / 2, ny + geo.cellH / 2);
      finalX = snapped.x;
      finalY = snapped.y;
    }

    const { cx, cy } = geo.getCellAtPos(finalX, finalY);

    setTiles(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;

      // Filter out others in target cell, but keep self
      const filtered = prev.filter(t => t.id === id || !geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      return filtered.map(t => t.id === id ? { ...t, x: finalX, y: finalY } : t);
    });
  }, [geo, setTiles]);

  const clear = useCallback(() => {
    setTiles([]);
  }, [setTiles]);

  return {
    tiles,
    setTiles,
    addTile,
    removeTilesInCell,
    moveTile,
    clear,
    geo
  };
}
