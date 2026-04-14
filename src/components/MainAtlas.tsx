import React from 'react';
import { TextureTile, GridSettings } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
interface MainAtlasProps {
  tiles: TextureTile[];
  setTiles: React.Dispatch<React.SetStateAction<TextureTile[]>>;
  onRemoveTile: (tile: TextureTile) => void;
  onDrop: (tileId: string, x: number, y: number) => void;
  gridSettings: GridSettings;
  selectedCells: string[];
  onSelectedCellsChange: (cells: string[]) => void;
  atlasSwapMode: boolean;
  canvasSize: number;
  canvasWidth?: number;
  canvasHeight?: number;
  className?: string;
  tooltip?: string;
}

export function MainAtlas({
  tiles,
  setTiles,
  onRemoveTile,
  onDrop,
  gridSettings,
  selectedCells,
  onSelectedCellsChange,
  atlasSwapMode,
  canvasSize,
  canvasWidth,
  canvasHeight,
  className,
  tooltip
}: MainAtlasProps) {
  return (
    <AtlasCanvas
      tiles={tiles}
      onTilesChange={setTiles}
      onSelectTile={() => {}}
      onRemoveTile={onRemoveTile}
      onDrop={onDrop}
      gridSettings={gridSettings}
      selectedCells={selectedCells}
      onSelectedCellsChange={onSelectedCellsChange}
      atlasSwapMode={atlasSwapMode}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      className="border-r border-zinc-800"
      tooltip={tooltip}
    />
  );
}
