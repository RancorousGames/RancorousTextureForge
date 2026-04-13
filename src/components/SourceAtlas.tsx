import React, { useState, useRef } from 'react';
import { TextureTile, GridSettings } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
import { Image as ImageIcon, Plus } from 'lucide-react';

interface SourceAtlasProps {
  onAddTile: (tile: TextureTile) => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (settings: GridSettings) => void;
  availableTiles: TextureTile[];
  onSourceCellClick: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => void;
  onSourceCellRightClick?: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => void;
}

export function SourceAtlas({ onAddTile, gridSettings, onGridSettingsChange, availableTiles, onSourceCellClick, onSourceCellRightClick }: SourceAtlasProps) {
  const [sourceTile, setSourceTile] = useState<TextureTile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (tileId: string) => {
    const tile = availableTiles.find(t => t.id === tileId);
    if (tile) {
      setSourceTile({ ...tile, id: 'source' });
    }
  };

  const handleLoadSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSourceTile({
        id: 'source',
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
  };

  const handleCellClick = (x: number, y: number, width: number, height: number, cx: number, cy: number) => {
    if (!sourceTile) return;
    onSourceCellClick(x, y, width, height, cx, cy, sourceTile);
  };

  const handleCellRightClick = (x: number, y: number, width: number, height: number, cx: number, cy: number) => {
    if (!sourceTile) return;
    if (onSourceCellRightClick) {
      onSourceCellRightClick(x, y, width, height, cx, cy, sourceTile);
    }
  };

  return (
    <div className="flex-1 h-full bg-zinc-900 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Source Atlas</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
            <span className="text-[9px] text-zinc-500 uppercase font-bold">W</span>
            <input
              type="number"
              value={gridSettings.cellSize}
              onBlur={(e) => {
                const val = Math.max(16, Number(e.target.value));
                onGridSettingsChange({ 
                  ...gridSettings, 
                  cellSize: val,
                  cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val)
                });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ 
                  ...gridSettings, 
                  cellSize: val,
                  cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val)
                });
              }}
              className="w-10 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1">H</span>
            <input
              type="number"
              value={gridSettings.cellY || gridSettings.cellSize}
              onBlur={(e) => {
                const val = Math.max(16, Number(e.target.value));
                onGridSettingsChange({ 
                  ...gridSettings, 
                  cellY: val,
                  keepSquare: false
                });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ 
                  ...gridSettings, 
                  cellY: val,
                  keepSquare: false
                });
              }}
              className="w-10 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1">Pad</span>
            <input
              type="number"
              value={gridSettings.padding}
              onBlur={(e) => {
                const val = Math.max(0, Number(e.target.value));
                onGridSettingsChange({ ...gridSettings, padding: val });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ ...gridSettings, padding: val });
              }}
              className="w-8 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium px-2 py-1 rounded transition-colors border border-zinc-700"
          >
            <Plus className="w-3 h-3" />
            Load Source
          </button>
        </div>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleLoadSource}
          accept="image/*"
        />
      </div>

      <div 
        className="flex-1 relative overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const tileId = e.dataTransfer.getData('text/plain');
          handleDrop(tileId);
        }}
      >
        {sourceTile ? (
          <AtlasCanvas
            tiles={[sourceTile]}
            onSelectTile={() => {}}
            gridSettings={gridSettings}
            onCellClick={handleCellClick}
            onCellRightClick={handleCellRightClick}
            onDrop={handleDrop}
            canvasWidth={sourceTile.width}
            canvasHeight={sourceTile.height}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">Load a source image to pick tiles from it.</p>
            <p className="text-xs mt-2 opacity-60">Click a grid cell to add it to the Main Atlas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
