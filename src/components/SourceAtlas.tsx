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
    console.log(`[Forge] Loading new source image: ${file.name}`);
    
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      console.log(`[Forge] Source image loaded: ${img.width}x${img.height}`);
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
      setCustomSelection(null);
      setMenuPos(null);
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

    // Temp canvas to sample the original selection
    const analyzeCanvas = document.createElement('canvas');
    analyzeCanvas.width = sw; analyzeCanvas.height = sh;
    const analyzeCtx = analyzeCanvas.getContext('2d', { willReadFrequently: true });
    if (!analyzeCtx) return;
    
    analyzeCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const originalData = analyzeCtx.getImageData(0, 0, sw, sh).data;

    // Chroma-Key Sampling with fallback to (0,0)
    let tempClear = { r: originalData[0], g: originalData[1], b: originalData[2], a: originalData[3] };
    
    if (sx < 0 || sy < 0) {
      const sampler = document.createElement('canvas');
      sampler.width = 1; sampler.height = 1;
      const sCtx = sampler.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
        const sData = sCtx.getImageData(0, 0, 1, 1).data;
        tempClear = { r: sData[0], g: sData[1], b: sData[2], a: sData[3] };
        console.log(`[Forge] Sample coord out of bounds. Falling back to (0,0) key.`);
      }
    }

    const tolerance = gridSettings.clearTolerance;
    console.log(`[Forge] Chroma-Key Sampled: rgba(${tempClear.r},${tempClear.g},${tempClear.b},${tempClear.a}) with tolerance ${tolerance}`);

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 10) return true; 
      if (tempClear.a < 10) return a < 10; 
      return Math.abs(r - tempClear.r) <= tolerance && 
             Math.abs(g - tempClear.g) <= tolerance && 
             Math.abs(b - tempClear.b) <= tolerance;
    };

    if (detectIsland) {
      let minX = sw, minY = sh, maxX = 0, maxY = 0, found = false;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          if (!isMatch(originalData[i], originalData[i+1], originalData[i+2], originalData[i+3])) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            found = true;
          }
        }
      }
      if (found) {
        console.log(`[Forge] Island detected! Shrinking box from ${sw}x${sh} to ${maxX-minX+1}x${maxY-minY+1}`);
        sx += minX; sy += minY;
        sw = maxX - minX + 1; sh = maxY - minY + 1;
      }
    }

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw; cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (!cropCtx) return;

    cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const finalCropData = cropCtx.getImageData(0, 0, sw, sh);
    const finalPixels = finalCropData.data;
    let replacedCount = 0;
    const mismatchSamples: string[] = [];

    for (let i = 0; i < finalPixels.length; i += 4) {
      const r = finalPixels[i], g = finalPixels[i+1], b = finalPixels[i+2], a = finalPixels[i+3];
      if (isMatch(r, g, b, a)) {
        finalPixels[i] = permClearRGB.r;
        finalPixels[i+1] = permClearRGB.g;
        finalPixels[i+2] = permClearRGB.b;
        finalPixels[i+3] = 255; 
        replacedCount++;
      } else if (mismatchSamples.length < 5 && Math.random() < 0.01) {
        const dist = Math.max(Math.abs(r-tempClear.r), Math.abs(g-tempClear.g), Math.abs(b-tempClear.b));
        mismatchSamples.push(`rgba(${r},${g},${b},${a}) dist:${dist}`);
      }
    }
    console.log(`[Forge] Summary: Replaced ${replacedCount} of ${sw * sh} pixels. Mismatches: ${mismatchSamples.join(' | ')}`);
    cropCtx.putImageData(finalCropData, 0, 0);

    let targetW = 0, targetH = 0;
    if (mainGridSettings.mode === 'perfect') {
      targetW = targetCanvasW / mainGridSettings.gridX;
      targetH = targetCanvasH / (mainGridSettings.keepSquare ? mainGridSettings.gridX : mainGridSettings.gridY);
    } else {
      targetW = mainGridSettings.cellSize;
      targetH = mainGridSettings.cellY || mainGridSettings.cellSize;
    }

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW; finalCanvas.height = targetH;
    const finalCtx = finalCanvas.getContext('2d');
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = false; 
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
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1">Tol</span>
            <input
              type="number"
              value={gridSettings.clearTolerance}
              onBlur={(e) => {
                const val = Math.max(0, Number(e.target.value));
                onGridSettingsChange({ ...gridSettings, clearTolerance: val });
              }}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                onGridSettingsChange({ ...gridSettings, clearTolerance: val });
              }}
              className="w-8 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
            />
          </div>
          {sourceTile && (
            <button
              onClick={() => onAutoDetectGrid(sourceTile)}
              className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-medium px-2 py-1 rounded transition-colors border border-blue-500/30"
              title="Auto-detect grid settings"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Auto Detect</span>
            </button>
          )}
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
            uniqueId="source"
            tooltip="L-Click: Transfer | R-Click: Fill | Drag: Free Crop"
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
