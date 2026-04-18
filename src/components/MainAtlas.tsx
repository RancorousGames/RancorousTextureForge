import React from 'react';
import { TextureAsset, GridSettings, AtlasStatus } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
interface MainAtlasProps {
  entries: TextureAsset[];
  setEntries: React.Dispatch<React.SetStateAction<TextureAsset[]>>;
  onRemoveEntry: (entry: TextureAsset) => void;
  onDrop: (assetId: string, x: number, y: number) => void;
  gridSettings: GridSettings;
  selectedCells: string[];
  onSelectedCellsChange: (cells: string[]) => void;
  atlasSwapMode: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  className?: string;
  tooltip?: string;
  sourceAsset?: TextureAsset | null;
  clearedCells?: string[];
  atlasStatus: AtlasStatus;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
}

export function MainAtlas({
  entries,
  setEntries,
  onRemoveEntry,
  onDrop,
  gridSettings,
  selectedCells,
  onSelectedCellsChange,
  atlasSwapMode,
  canvasWidth,
  canvasHeight,
  className,
  tooltip,
  sourceAsset,
  clearedCells,
  atlasStatus,
  onMaterialize
}: MainAtlasProps) {
  return (
    <AtlasCanvas
      entries={entries}
      onEntriesChange={setEntries}
      onSelectEntry={() => {}}
      onRemoveEntry={onRemoveEntry}
      onDrop={onDrop}
      gridSettings={gridSettings}
      selectedCells={selectedCells}
      onSelectedCellsChange={onSelectedCellsChange}
      atlasSwapMode={atlasSwapMode}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      className="border-r border-zinc-800"
      tooltip={tooltip}
      sourceAsset={sourceAsset}
      clearedCells={clearedCells}
      atlasStatus={atlasStatus}
      uniqueId="main"
      onMaterialize={onMaterialize}
    />
  );
}
