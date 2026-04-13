import React, { useState, useRef } from 'react';
import { TextureTile, GridSettings } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
import { Image as ImageIcon, Plus, Wand2 } from 'lucide-react';
import { hexToRgb } from '../lib/utils';

interface SourceAtlasProps {
  onAddTile: (tile: TextureTile) => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (settings: GridSettings) => void;
  onAutoDetectGrid: (sourceTile: TextureTile) => void;
  availableTiles: TextureTile[];
  onSourceCellClick: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => void;
  onSourceCellRightClick?: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceTile: TextureTile) => void;
  mainGridSettings: GridSettings;
  canvasWidth: number;
  canvasHeight: number;
}

export function SourceAtlas({ 
  onAddTile, 
  gridSettings, 
  onGridSettingsChange, 
  onAutoDetectGrid,
  availableTiles, 
  onSourceCellClick, 
  onSourceCellRightClick,
  mainGridSettings,
  canvasWidth: targetCanvasW,
  canvasHeight: targetCanvasH
}: SourceAtlasProps) {

  const [sourceTile, setSourceTile] = useState<TextureTile | null>(null);
  const [customSelection, setCustomSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
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

  const handleCustomSelection = (rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number }) => {
    setCustomSelection(rect);
    if (!rect) setMenuPos(null);
    else if (screenPos) setMenuPos(screenPos);
  };

  const addSelection = async (detectIsland: boolean) => {
    if (!customSelection || !sourceTile) return;

    const img = new Image();
    await new Promise(resolve => { img.onload = resolve; img.src = sourceTile.url; });

    let sx = customSelection.x, sy = customSelection.y, sw = customSelection.w, sh = customSelection.h;
    const permClearRGB = hexToRgb(mainGridSettings.clearColor);

    // Initial Crop Canvas to analyze the selection
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw; cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (!cropCtx) return;
    
    cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropData = cropCtx.getImageData(0, 0, sw, sh);
    const pixels = cropData.data;

    // Use top-left pixel as the local clear key
    const tempClear = { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
    const tolerance = gridSettings.clearTolerance;

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 5 && tempClear.a < 5) return true;
      return Math.abs(r - tempClear.r) <= tolerance && 
             Math.abs(g - tempClear.g) <= tolerance && 
             Math.abs(b - tempClear.b) <= tolerance;
    };

    if (detectIsland) {
      let minX = sw, minY = sh, maxX = 0, maxY = 0, found = false;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          if (!isMatch(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3])) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            found = true;
          }
        }
      }
      if (found) {
        // Adjust the crop coordinates to the detected island
        sx += minX; sy += minY;
        sw = maxX - minX + 1; sh = maxY - minY + 1;
        
        // Re-draw the tightened crop
        cropCanvas.width = sw; cropCanvas.height = sh;
        cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      }
    }

    // Process Pixels: Replace Temp Clear Color with Permanent Clear Color
    const finalCropData = cropCtx.getImageData(0, 0, sw, sh);
    const finalPixels = finalCropData.data;
    for (let i = 0; i < finalPixels.length; i += 4) {
      if (isMatch(finalPixels[i], finalPixels[i+1], finalPixels[i+2], finalPixels[i+3])) {
        finalPixels[i] = permClearRGB.r;
        finalPixels[i+1] = permClearRGB.g;
        finalPixels[i+2] = permClearRGB.b;
        finalPixels[i+3] = 255; // Set to opaque project clear color
      }
    }
    cropCtx.putImageData(finalCropData, 0, 0);

    // Target Cell Dimensions for Resampling
    let targetW = 0, targetH = 0;
    if (mainGridSettings.mode === 'perfect') {
      targetW = targetCanvasW / mainGridSettings.gridX;
      targetH = targetCanvasH / (mainGridSettings.keepSquare ? mainGridSettings.gridX : mainGridSettings.gridY);
    } else {
      targetW = mainGridSettings.cellSize;
      targetH = mainGridSettings.cellY || mainGridSettings.cellSize;
    }

    // Final Resampled Canvas
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW; finalCanvas.height = targetH;
    const finalCtx = finalCanvas.getContext('2d');
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = false; // Keep pixel art sharp
      finalCtx.drawImage(cropCanvas, 0, 0, sw, sh, 0, 0, targetW, targetH);
      
      onAddTile({
        id: Math.random().toString(36).substring(2, 9),
        url: finalCanvas.toDataURL(),
        sourceUrl: finalCanvas.toDataURL(),
        name: `Crop_${Math.round(sx)}_${Math.round(sy)}`,
        width: targetW, height: targetH, x: 0, y: 0,
        hue: 0, brightness: 100, scale: 1,
        isCrop: true
      });
    }

    setCustomSelection(null);
    setMenuPos(null);
  };

  return (
    <div className="flex-1 h-full bg-zinc-900 flex flex-col overflow-hidden relative">
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
                onGridSettingsChange({ ...gridSettings, cellSize: val, cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val) });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ ...gridSettings, cellSize: val, cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val) });
              }}
              className="w-10 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1">H</span>
            <input
              type="number"
              value={gridSettings.cellY || gridSettings.cellSize}
              onBlur={(e) => {
                const val = Math.max(16, Number(e.target.value));
                onGridSettingsChange({ ...gridSettings, cellY: val, keepSquare: false });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ ...gridSettings, cellY: val, keepSquare: false });
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
        <input type="file" className="hidden" ref={fileInputRef} onChange={handleLoadSource} accept="image/*" />
      </div>

      <div className="flex-1 relative overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleDrop(e.dataTransfer.getData('text/plain')); }}>
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
            customSelection={customSelection}
            onCustomSelectionChange={handleCustomSelection}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">Load a source image to pick tiles from it.</p>
            <p className="text-xs mt-2 opacity-60">Click a grid cell or drag a box to add it to the Main Atlas.</p>
          </div>
        )}
      </div>

      {menuPos && (
        <div 
          className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-1 flex flex-col min-w-[160px]"
          style={{ left: Math.min(menuPos.x, window.innerWidth - 180), top: menuPos.y }}
        >
          <button onClick={() => addSelection(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-600 text-xs font-medium rounded transition-colors text-left">Add Selection</button>
          <button onClick={() => addSelection(true)} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-600 text-xs font-medium rounded transition-colors text-left border-t border-zinc-800">Detect Island and add</button>
          <button onClick={() => { setCustomSelection(null); setMenuPos(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-xs font-medium rounded transition-colors text-left border-t border-zinc-800 text-zinc-400">Cancel</button>
        </div>
      )}
    </div>
  );
}
