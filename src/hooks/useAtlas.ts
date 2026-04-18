import { TextureTile, GridSettings } from '../types';
import { useMemo } from 'react';
import { GridGeometry } from '../lib/GridGeometry';

interface AtlasState {
  tiles: TextureTile[];
  setTiles: (tiles: TextureTile[] | ((prev: TextureTile[]) => TextureTile[])) => void;
}

export function useAtlas(
  gridSettings: GridSettings,
  canvasWidth: number,
  canvasHeight: number,
  state: AtlasState
) {
  const geo = useMemo(() => 
    new GridGeometry(gridSettings, canvasWidth, canvasHeight),
    [gridSettings, canvasWidth, canvasHeight]
  );

  return { geo, state };
}
