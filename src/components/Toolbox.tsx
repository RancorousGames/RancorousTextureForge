import React, { useState, useEffect } from 'react';
import { TextureTile, GridSettings, GridMode } from '../types';
import { Settings2, Download, Package, RefreshCw, LayoutGrid, Palette, Layers, Wand2, Grid3X3, Plus } from 'lucide-react';

interface ToolboxProps {
  selectedTile: TextureTile | null;
  updateTile: (updates: Partial<TextureTile>) => void;
  onPack: () => void;
  onPackElements: () => void;
  onNewAtlas: (size: number) => void;
  onFixGrid: () => void;
  onExport: () => void;
  onRunScript: () => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (settings: GridSettings) => void;
  atlasSwapMode: boolean;
  setAtlasSwapMode: (val: boolean) => void;
}

export function Toolbox({ 
  selectedTile, 
  updateTile, 
  onPack, 
  onPackElements,
  onNewAtlas, 
  onFixGrid,
  onExport,
  onRunScript,
  gridSettings,
  onGridSettingsChange,
  atlasSwapMode,
  setAtlasSwapMode
}: ToolboxProps) {
  const [localClearColor, setLocalClearColor] = useState(gridSettings.clearColor);

  useEffect(() => {
    setLocalClearColor(gridSettings.clearColor);
  }, [gridSettings.clearColor]);
  const [showNewAtlas, setShowNewAtlas] = React.useState(false);
  return (
    <div className="w-64 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Grid Settings */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center gap-2">
        <Grid3X3 className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Grid Settings</h2>
      </div>
      
      <div className="p-4 space-y-4 border-b border-zinc-800 overflow-y-auto flex-1">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase">Mode</label>
          <select
            value={gridSettings.mode}
            onChange={(e) => onGridSettingsChange({ ...gridSettings, mode: e.target.value as GridMode })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="perfect">Perfect Grid</option>
            <option value="fixed">Fixed Cell Size</option>
            <option value="packing">Atlas Packing</option>
          </select>
        </div>

        {gridSettings.mode === 'packing' && (
          <div className="space-y-4 pt-2 border-t border-zinc-800">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500 flex justify-between">
                <span>Padding</span>
                <span className="font-mono">{gridSettings.padding}</span>
              </label>
              <input
                type="number"
                value={gridSettings.padding}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, padding: Number(e.target.value) })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase">Algorithm</label>
              <select
                value={gridSettings.packingAlgo}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, packingAlgo: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="potpack">Potpack (Fast)</option>
                <option value="shelf">Shelf (Simple)</option>
              </select>
            </div>
            <button
              onClick={onPackElements}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-4 rounded text-xs font-medium transition-colors"
            >
              <Box className="w-3.5 h-3.5" />
              Pack Elements
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          <input
            type="checkbox"
            id="swapMode"
            checked={atlasSwapMode}
            onChange={(e) => setAtlasSwapMode(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-950 text-blue-500"
          />
          <label htmlFor="swapMode" className="text-xs text-zinc-400">Swap Tiles on Drag</label>
        </div>

        {gridSettings.mode === 'perfect' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500 flex justify-between">
                <span>Grid X</span>
                <span className="font-mono">{gridSettings.gridX}</span>
              </label>
              <input
                type="range"
                min="2"
                max="64"
                value={gridSettings.gridX}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, gridX: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="keepSquare"
                checked={gridSettings.keepSquare}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, keepSquare: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-950 text-blue-500"
              />
              <label htmlFor="keepSquare" className="text-xs text-zinc-400">Keep Square</label>
            </div>

            {!gridSettings.keepSquare && (
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 flex justify-between">
                  <span>Grid Y</span>
                  <span className="font-mono">{gridSettings.gridY}</span>
                </label>
                <input
                  type="range"
                  min="2"
                  max="64"
                  value={gridSettings.gridY}
                  onChange={(e) => onGridSettingsChange({ ...gridSettings, gridY: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>
            )}
          </div>
        )}

        {gridSettings.mode === 'fixed' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Cell Width (Pixels)</label>
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
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="keepSquareFixed"
                checked={gridSettings.keepSquare}
                onChange={(e) => {
                  const keep = e.target.checked;
                  onGridSettingsChange({ 
                    ...gridSettings, 
                    keepSquare: keep,
                    cellY: keep ? gridSettings.cellSize : (gridSettings.cellY || gridSettings.cellSize)
                  });
                }}
                className="rounded border-zinc-700 bg-zinc-950 text-blue-500"
              />
              <label htmlFor="keepSquareFixed" className="text-xs text-zinc-400">Keep Square</label>
            </div>

            {!gridSettings.keepSquare && (
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500">Cell Height (Pixels)</label>
                <input
                  type="number"
                  min="16"
                  value={gridSettings.cellY || gridSettings.cellSize}
                  onChange={(e) => onGridSettingsChange({ ...gridSettings, cellY: Math.max(16, Number(e.target.value)) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] text-zinc-500">Cell Padding (Pixels)</label>
              <input
                type="number"
                min="0"
                value={gridSettings.padding}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, padding: Math.max(0, Number(e.target.value)) })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] text-zinc-500">Clear Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={localClearColor}
              onChange={(e) => setLocalClearColor(e.target.value)}
              onBlur={() => onGridSettingsChange({ ...gridSettings, clearColor: localClearColor })}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-xs font-mono text-zinc-400 uppercase">{localClearColor}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-zinc-500 flex justify-between">
            <span>Tolerance</span>
            <span className="font-mono">{gridSettings.clearTolerance}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={gridSettings.clearTolerance ?? 10}
            onChange={(e) => onGridSettingsChange({ ...gridSettings, clearTolerance: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-950 space-y-2">
        <div className="relative">
          <button
            onClick={() => setShowNewAtlas(!showNewAtlas)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-4 rounded text-sm font-medium transition-colors border border-zinc-700"
          >
            <Plus className="w-4 h-4" />
            New Atlas
          </button>
          {showNewAtlas && (
            <div className="absolute bottom-full left-0 w-full bg-zinc-900 border border-zinc-800 rounded shadow-xl p-2 mb-2 z-50 grid grid-cols-2 gap-2">
              {[0, 1024, 2048, 4096].map(size => (
                <button
                  key={size}
                  onClick={() => {
                    onNewAtlas(size);
                    setShowNewAtlas(false);
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono py-1 rounded border border-zinc-700"
                >
                  {size === 0 ? 'Custom...' : `${size}x${size}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {gridSettings.mode === 'fixed' && (
          <button
            onClick={onFixGrid}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-4 rounded text-sm font-medium transition-colors border border-zinc-700"
            title="Detect islands and center them in the nearest grid cells"
          >
            <Grid3X3 className="w-4 h-4" />
            Fix Grid
          </button>
        )}
        <button
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export PNG
        </button>
      </div>
    </div>
  );
}
