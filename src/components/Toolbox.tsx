import React, { useState, useEffect } from 'react';
import { DeferredNumberInput } from './DeferredNumberInput';
import { TextureAsset, GridSettings, GridMode, ResizeMode, AddMode, DragMode } from '../types';
import { cn } from '../lib/utils';
import { Download, Package, RefreshCw, Palette, Wand2, Grid3X3, Plus, Box, Library } from 'lucide-react';

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
  addTextEnabled: boolean;
  onAddTextEnabledChange: (enabled: boolean) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
}

export function Toolbox({
  updateAsset: _updateAsset, // Unused in this scope but part of props
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
  addTextEnabled,
  onAddTextEnabledChange,
  textColor,
  onTextColorChange
}: ToolboxProps) {

  const [localBgColor, setLocalBgColor] = useState(gridSettings.backgroundColor);
  const [localTextColor, setLocalTextColor] = useState(textColor);

  useEffect(() => {
    setLocalBgColor(gridSettings.backgroundColor);
  }, [gridSettings.backgroundColor]);

  useEffect(() => {
    setLocalTextColor(textColor);
  }, [textColor]);

  const [showNewAtlas, setShowNewAtlas] = useState(false);

  // Determine if a hex color is light or dark
  const isColorLight = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
  };

  const handleToggleText = () => {
    const nextEnabled = !addTextEnabled;
    if (nextEnabled) {
      // Auto-set contrast color
      const autoColor = isColorLight(gridSettings.backgroundColor) ? '#000000' : '#ffffff';
      onTextColorChange(autoColor);
    }
    onAddTextEnabledChange(nextEnabled);
  };

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
      <div className="p-3 space-y-2.5 border-b border-zinc-800 overflow-y-auto flex-1 text-zinc-200">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase">Mode</label>
          <select
            value={gridSettings.mode}
            onChange={(e) => onGridSettingsChange({ ...gridSettings, mode: e.target.value as GridMode })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
          >
            <option value="fixed">Grid</option>
            <option value="packing">Atlas Packing</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase">Add Mode</label>
          <select
            value={addMode}
            onChange={(e) => onAddModeChange(e.target.value as AddMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
          >
            <option value="as-is">As is</option>
            <option value="replace-bg">Replace Background</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase">Resize Mode</label>
          <select
            value={resizeMode}
            onChange={(e) => onResizeModeChange(e.target.value as ResizeMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
          >
            <option value="fill">Fill (Stretch)</option>
            <option value="fit">Fit (Proportional)</option>
            <option value="crop">Crop (Original Size)</option>
          </select>
        </div>

        {gridSettings.mode === 'packing' && (
          <div className="space-y-2.5 pt-2 border-t border-zinc-800">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 flex justify-between uppercase">
                <span>Padding</span>
                <span className="font-mono text-zinc-400">{gridSettings.padding}</span>
              </label>
              <DeferredNumberInput
                value={gridSettings.padding}
                min={0}
                onCommit={(val) => onGridSettingsChange({ ...gridSettings, padding: val })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase">Algorithm</label>
              <select
                value={gridSettings.packingAlgo}
                onChange={(e) => onGridSettingsChange({ ...gridSettings, packingAlgo: e.target.value as any })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
              >
                <option value="potpack">Potpack (Fast)</option>
                <option value="shelf">Shelf (Simple)</option>
              </select>
            </div>
            <button
              onClick={onPackElements}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-1 px-4 rounded text-xs font-medium transition-colors"
            >
              <Box className="w-3.5 h-3.5" />
              Pack Elements
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase">Text Overlay</label>
            <button
              onClick={handleToggleText}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all border",
                addTextEnabled 
                  ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              )}
            >
              <Palette className="w-3 h-3" />
              {addTextEnabled ? 'ENABLED' : 'ADD TEXT'}
            </button>
          </div>

          {addTextEnabled && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1">
                <input
                  type="color"
                  value={localTextColor}
                  onChange={(e) => setLocalTextColor(e.target.value)}
                  onBlur={() => onTextColorChange(localTextColor)}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="text-[10px] font-mono text-zinc-400 uppercase truncate">{localTextColor}</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 pt-2 border-t border-zinc-800">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase">Drag Mode</label>
          <select
            value={dragMode}
            onChange={(e) => setDragMode(e.target.value as DragMode)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
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
                <label className="text-[10px] text-zinc-500 whitespace-nowrap uppercase">Cell Width</label>
                <DeferredNumberInput
                  value={gridSettings.cellSize}
                  min={16}
                  onCommit={(val) => onGridSettingsChange({
                    ...gridSettings,
                    cellSize: val,
                    cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val)
                  })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 whitespace-nowrap uppercase">Cell Padding</label>
                <DeferredNumberInput
                  value={gridSettings.padding}
                  min={0}
                  onCommit={(val) => onGridSettingsChange({ ...gridSettings, padding: val })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
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
                className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0"
              />
              <label htmlFor="keepSquareFixed" className="text-xs text-zinc-400 uppercase font-semibold">Keep Square</label>
            </div>

            {!gridSettings.keepSquare && (
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase">Cell Height</label>
                <DeferredNumberInput
                  value={gridSettings.cellY || gridSettings.cellSize}
                  min={16}
                  onCommit={(val) => onGridSettingsChange({ ...gridSettings, cellY: val })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <Palette className="w-3 h-3" />
              <span>Background</span>
            </div>
            <select
              value={gridSettings.backgroundFillMode || 'transparent'}
              onChange={(e) => onGridSettingsChange({ ...gridSettings, backgroundFillMode: e.target.value as any })}
              className="bg-zinc-800 border-none text-[9px] font-bold text-zinc-300 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:bg-zinc-700 transition-colors uppercase tracking-tight"
            >
              <option value="transparent">Transparent</option>
              <option value="solid">Solid</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="relative group">
                <div 
                  className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 flex items-center px-2 gap-2 cursor-pointer hover:border-zinc-700 transition-colors"
                >
                  <div className="w-3.5 h-3.5 rounded-sm border border-white/10 shrink-0" style={{ backgroundColor: localBgColor }} />
                  <span className="text-[10px] font-mono text-zinc-400 uppercase truncate">{localBgColor}</span>
                </div>
                <input
                  type="color"
                  value={localBgColor}
                  onChange={(e) => setLocalBgColor(e.target.value)}
                  onBlur={() => onGridSettingsChange({ ...gridSettings, backgroundColor: localBgColor })}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
                <span>Tol.</span>
                <span className="font-mono text-zinc-400">{gridSettings.clearTolerance}</span>
              </div>
              <div className="flex items-center h-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={gridSettings.clearTolerance ?? 10}
                  onChange={(e) => onGridSettingsChange({ ...gridSettings, clearTolerance: Number(e.target.value) })}
                  className="w-full accent-blue-500 h-1"
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
                  className="bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono py-1 rounded border border-zinc-700 text-zinc-300"
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
              className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-2 rounded text-[10px] font-medium transition-colors border border-zinc-700 uppercase tracking-wider"
            >
              <Grid3X3 className="w-3 h-3" />
              Fix Grid
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onAddToLibrary}
              className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-2 rounded text-[10px] font-medium transition-colors border border-zinc-700 uppercase tracking-tight"
            >
              <Library className="w-3 h-3 shrink-0" />
              Add to Lib
            </button>
            <button
              onClick={onExport}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-2 rounded text-[10px] font-medium transition-colors uppercase tracking-tight"
            >
              <Download className="w-3 h-3 shrink-0" />
              Export PNG
            </button>
          </div>
        </div>
        {gridSettings.mode === 'fixed' && onExportZip && (
          <button
            onClick={onExportZip}
            className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-4 rounded text-[10px] font-medium transition-colors border border-zinc-700 uppercase tracking-wider"
          >
            <Package className="w-3 h-3" />
            Export Grid ZIP
          </button>
        )}
      </div>
    </div>
  );
}
