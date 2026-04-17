import React from 'react';
import { TextureTile, GridSettings, AtlasStatus } from '../types';
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
  canvasWidth?: number;
  canvasHeight?: number;
  className?: string;
  tooltip?: string;
  sourceTile?: TextureTile | null;
  clearedCells?: string[];
  atlasStatus: AtlasStatus;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
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
  canvasWidth,
  canvasHeight,
  className,
  tooltip,
  sourceTile,
  clearedCells,
  atlasStatus,
  onMaterialize
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
      sourceTile={sourceTile}
      clearedCells={clearedCells}
      atlasStatus={atlasStatus}
      uniqueId="main"
      onMaterialize={onMaterialize}
    />
  );
}
