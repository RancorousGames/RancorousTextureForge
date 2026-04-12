import React from 'react';
import { TextureTile, GridSettings } from '../types';
import { AtlasCanvas } from './AtlasCanvas';

interface MainAtlasProps {
  tiles: TextureTile[];
  setTiles: React.Dispatch<React.SetStateAction<TextureTile[]>>;
  selectedTileId: string | null;
  setSelectedTileId: (id: string | null) => void;
  onRemoveTile: (tile: TextureTile) => void;
  onDrop?: (tileId: string, x: number, y: number) => void;
  gridSettings: GridSettings;
  selectedCells: string[];
  onSelectedCellsChange: (cells: string[]) => void;
  atlasSwapMode: boolean;
  canvasSize?: number;
}

export function MainAtlas({ 
  tiles, 
  setTiles, 
  selectedTileId, 
  setSelectedTileId, 
  onRemoveTile,
  onDrop,
  gridSettings,
  selectedCells,
  onSelectedCellsChange,
  atlasSwapMode,
  canvasSize
}: MainAtlasProps) {
  return (
    <AtlasCanvas
      tiles={tiles}
      onTilesChange={setTiles}
      selectedTileId={selectedTileId}
      onSelectTile={setSelectedTileId}
      onRemoveTile={onRemoveTile}
      onDrop={onDrop}
      gridSettings={gridSettings}
      selectedCells={selectedCells}
      onSelectedCellsChange={onSelectedCellsChange}
      atlasSwapMode={atlasSwapMode}
      canvasSize={canvasSize}
      className="border-r border-zinc-800"
    />
  );
}

