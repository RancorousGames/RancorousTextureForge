import React from 'react';
import { TextureAsset, GridSettings, AtlasStatus, DragMode } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
interface MainAtlasProps {
  entries: TextureAsset[];
  setEntries: React.Dispatch<React.SetStateAction<TextureAsset[]>>;
  onRemoveEntry: (entry: TextureAsset) => void;
  onDrop: (assetId: string, x: number, y: number) => void;
  gridSettings: GridSettings;
  selectedCells: string[];
  onSelectedCellsChange: (cells: string[]) => void;
  dragMode: DragMode;
  canvasWidth?: number;
  canvasHeight?: number;
  className?: string;
  tooltip?: string;
  sourceAsset?: TextureAsset | null;
  clearedCells?: string[];
  atlasStatus: AtlasStatus;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
  onHoverChange?: (pos: { x: number, y: number } | null, cell: { cx: number, cy: number } | null) => void;
  debugIslands?: { x: number; y: number; w: number; h: number }[];
  addTextEnabled?: boolean;
  textColor?: string;
}

export function MainAtlas({
  entries,
  setEntries,
  onRemoveEntry,
  onDrop,
  gridSettings,
  selectedCells,
  onSelectedCellsChange,
  dragMode,
  canvasWidth,
  canvasHeight,
  className,
  tooltip,
  sourceAsset,
  clearedCells,
  atlasStatus,
  onMaterialize,
  onHoverChange,
  debugIslands,
  addTextEnabled,
  textColor
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
      dragMode={dragMode}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      className="border-r border-zinc-800"
      tooltip={tooltip}
      sourceAsset={sourceAsset}
      clearedCells={clearedCells}
      atlasStatus={atlasStatus}
      uniqueId="main"
      onMaterialize={onMaterialize}
      onHoverChange={onHoverChange}
      debugIslands={debugIslands}
      addTextEnabled={addTextEnabled}
      textColor={textColor}
    />
  );
}
