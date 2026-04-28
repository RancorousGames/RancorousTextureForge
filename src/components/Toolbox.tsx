import React, { useState, useEffect, useCallback } from 'react';
import { DeferredNumberInput } from './DeferredNumberInput';
import { TextureAsset, GridSettings, GridMode, ResizeMode, AddMode, DragMode } from '../types';
import { cn } from '../lib/utils';
import { Settings2, Download, Package, RefreshCw, LayoutGrid, Palette, Layers, Wand2, Grid3X3, Plus, Box, Maximize2, MousePointer2, Library } from 'lucide-react';

interface ToolboxProps {
  selectedAsset: TextureAsset | null;
  updateAsset: (updates: Partial<TextureAsset>) => void;
  onPack: () => void;
  onPackElements: () => void;
  onNewAtlas: (size: number) => void;
  onFixGrid: () => void;
  onAutoDetect: () => void;
  onExport: () => void;
  onAddToLibrary: () => void;
  onExportZip?: () => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (settings: GridSettings) => void;
  dragMode: DragMode;
  setDragMode: (mode: DragMode) => void;
  resizeMode: ResizeMode;
  onResizeModeChange: (mode: ResizeMode) => void;
  addMode: AddMode;
  onAddModeChange: (mode: AddMode) => void;
  autoDetectEnabled: boolean;
  onAutoDetectEnabledChange: (enabled: boolean) => void;
  debugIslandDetection: boolean;
  onDebugIslandDetectionChange: (enabled: boolean) => void;
  }

  export function Toolbox({
    selectedAsset,
    updateAsset,
    onPack,
    onPackElements,
    onNewAtlas,
    onFixGrid,
    onAutoDetect,
    onExport,
    onAddToLibrary,
    onExportZip,
    gridSettings,
    onGridSettingsChange,
    dragMode,
    setDragMode,
    resizeMode,
    onResizeModeChange,
    addMode,
    onAddModeChange,
    autoDetectEnabled,
    onAutoDetectEnabledChange,
    debugIslandDetection,
    onDebugIslandDetectionChange
  }: ToolboxProps) {

  const [localClearColor, setLocalClearColor] = useState(gridSettings.clearColor);

  useEffect(() => {
    setLocalClearColor(gridSettings.clearColor);
  }, [gridSettings.clearColor]);
  const [showNewAtlas, setShowNewAtlas] = React.useState(false);
  return (
    <div className="w-64 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Grid Settings */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Grid Settings</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAutoDetectEnabledChange(!autoDetectEnabled)}
            className={cn(
              "p-1 rounded transition-colors border",
              autoDetectEnabled 
                ? "bg-blue-600/20 border-blue-500/50 text-blue-400" 
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400"
            )}
            title={autoDetectEnabled ? "Auto-detect is ENABLED" : "Auto-detect is DISABLED"}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onAutoDetect}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-colors border border-zinc-800"
            title="Auto Detect Grid Settings Now"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2.5 border-b border-zinc-800 overflow-y-auto flex-1">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase" title="Choose the layout logic for the atlas">Mode</label>
          <select
            value={gridSettings.mode}
            onChange={(e) => onGridSettingsChange({ ...gridSettings, mode: e.target.value as GridMode })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
            title="Switch between grid slicing and free-form atlas packing"
          >
            <option value="fixed">Grid</option>
            <option value="packing">Atlas Packing</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase" title="Choose how tiles are added to the main atlas">Add Mode</label>
          <select
            value={addMode}
            onChange={(e) => onAddModeChange(e.target.value as AddMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
            title="Choose how tiles are added to the main atlas"
          >
            <option value="as-is">As is</option>
            <option value="replace-bg">Replace Background</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase" title="Choose how tiles are resized when added to the main atlas">Resize Mode</label>
          <select
            value={resizeMode}
            onChange={(e) => onResizeModeChange(e.target.value as ResizeMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
            title="Choose how tiles are resized when added to the main atlas"
          >
            <option value="fill">Fill (Stretch)</option>
            <option value="fit">Fit (Proportional)</option>
            <option value="crop">Crop (Original Size)</option>
          </select>
        </div>

        {gridSettings.mode === 'packing' && (
          <div className="space-y-2.5 pt-2 border-t border-zinc-800">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 flex justify-between" title="Space between elements in pixels">
                <span>Padding</span>
                <span className="font-mono">{gridSettings.padding}</span>
              </label>
              <DeferredNumberInput
                value={gridSettings.padding}
                min={0}
                onCommit={(val) => onGridSettingsChange({ ...gridSettings, padding: val })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                title="Internal padding between packed sprites"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase" title="The mathematical logic used to arrange sprites">Algorithm</label>
              <select
                value={gridSettings.packingAlgo}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, packingAlgo: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                title="Select the packing algorithm"
              >
                <option value="potpack">Potpack (Fast)</option>
                <option value="shelf">Shelf (Simple)</option>
              </select>
            </div>
            <button
              onClick={onPackElements}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-1 px-4 rounded text-xs font-medium transition-colors"
              title="Run the packing algorithm to arrange all sprites efficiently"
            >
              <Box className="w-3.5 h-3.5" />
              Pack Elements
            </button>
          </div>
        )}

        <div className="space-y-1 pt-2 border-t border-zinc-800">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase" title="Choose what happens when dragging an entry onto another">Drag Mode</label>
          <select
            value={dragMode}
            onChange={(e) => setDragMode(e.target.value as DragMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
            title="Choose behavior when dragging an entry onto an occupied cell"
          >
            <option value="replace">Replace</option>
            <option value="swap">Swap</option>
            <option value="overlay">Overlay</option>
          </select>
        </div>
        {gridSettings.mode === 'fixed' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 whitespace-nowrap" title="Width of each grid cell in pixels">Cell Width</label>
                <DeferredNumberInput
                  value={gridSettings.cellSize}
                  min={16}
                  onCommit={(val) => onGridSettingsChange({
                    ...gridSettings,
                    cellSize: val,
                    cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val)
                  })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                  title="Width of each grid cell. Used for defining the grid and snap points."
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 whitespace-nowrap" title="Padding around each sprite inside its cell">Cell Padding</label>
                <DeferredNumberInput
                  value={gridSettings.padding}
                  min={0}
                  onCommit={(val) => onGridSettingsChange({ ...gridSettings, padding: val })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                  title="Padding around each sprite inside its cell. Used for defining the grid spacing."
                />
              </div>
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
                title="Lock aspect ratio to 1:1"
              />
              <label htmlFor="keepSquareFixed" className="text-xs text-zinc-400" title="Force height to match width">Keep Square</label>
            </div>

            {!gridSettings.keepSquare && (
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500" title="Height of each grid cell in pixels">Cell Height (Pixels)</label>
                <DeferredNumberInput
                  value={gridSettings.cellY || gridSettings.cellSize}
                  min={16}
                  onCommit={(val) => onGridSettingsChange({ ...gridSettings, cellY: val })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                  title="Vertical size for defining the grid"
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500" title="Atlas background color">Background</label>
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5">
                <input
                  type="color"
                  value={localClearColor}
                  onChange={(e) => setLocalClearColor(e.target.value)}
                  onBlur={() => onGridSettingsChange({ ...gridSettings, clearColor: localClearColor })}
                  className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                  title="Select the background and transparency key color"
                />
                <span className="text-[10px] font-mono text-zinc-400 uppercase truncate" title="Hex code of the current background color">{localClearColor}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 flex justify-between" title="Sensitivity for color matching during island detection">
                <span>Tol.</span>
                <span className="font-mono">{gridSettings.clearTolerance}</span>
              </label>
              <div className="flex items-center h-5">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={gridSettings.clearTolerance ?? 10}
                  onChange={(e) => onGridSettingsChange({ ...gridSettings, clearTolerance: Number(e.target.value) })}
                  className="w-full accent-blue-500 h-1.5"
                  title="Adjust how closely colors must match the background color to be considered transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-zinc-800 bg-zinc-950 space-y-1.5">
        <div className="relative">
          <button
            onClick={() => setShowNewAtlas(!showNewAtlas)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-4 rounded text-xs font-medium transition-colors border border-zinc-700"
            title="Create a new empty atlas or reset current session"
          >
            <Plus className="w-3.5 h-3.5" />
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
                  title={size === 0 ? "Specify a custom resolution" : `Create a ${size}x${size} atlas`}
                >
                  {size === 0 ? 'Custom...' : `${size}x${size}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {gridSettings.mode === 'fixed' && (
            <button
              onClick={onFixGrid}
              className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-2 rounded text-[10px] font-medium transition-colors border border-zinc-700"
              title="Detect islands and center them in the nearest grid cells"
            >
              <Grid3X3 className="w-3 h-3" />
              Fix Grid
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onAddToLibrary}
              className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-2 rounded text-[10px] font-medium transition-colors border border-zinc-700"
              title="Rasterize current atlas and add to asset library without downloading"
            >
              <Library className="w-3 h-3" />
              Add to Library
            </button>
            <button
              onClick={onExport}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-2 rounded text-[10px] font-medium transition-colors"
              title="Export the final atlas as a PNG image"
            >
              <Download className="w-3 h-3" />
              Export PNG
            </button>
          </div>
        </div>
        {gridSettings.mode === 'fixed' && onExportZip && (
          <button
            onClick={onExportZip}
            className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-4 rounded text-[10px] font-medium transition-colors border border-zinc-700"
            title="Export each grid cell as a separate image in a ZIP file"
          >
            <Package className="w-3 h-3" />
            Export Grid ZIP
          </button>
        )}
      </div>
    </div>
  );
}
