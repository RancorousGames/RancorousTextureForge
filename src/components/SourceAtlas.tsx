import React, { useState, useRef } from 'react';
import { TextureAsset, GridSettings } from '../types';
import { AtlasCanvas } from './AtlasCanvas';
import { DeferredNumberInput } from './DeferredNumberInput';
import { Image as ImageIcon, Plus, Wand2, LayoutTemplate, RefreshCw } from 'lucide-react';
import { hexToRgb, findIslands, cn } from '../lib/utils';
import { GridGeometry } from '../lib/GridGeometry';

interface SourceAtlasProps {
  onAddAsset: (asset: TextureAsset) => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (settings: GridSettings) => void;
  onAutoDetectGrid: (sourceAsset: TextureAsset) => void;
  availableAssets: TextureAsset[];
  onSourceCellClick: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceAsset: TextureAsset) => void;
  onSourceCellRightClick?: (x: number, y: number, w: number, h: number, scx: number, scy: number, sourceAsset: TextureAsset) => void;
  mainGridSettings: GridSettings;
  canvasWidth: number;
  canvasHeight: number;
  autoDetectEnabled: boolean;
  onAutoDetectEnabledChange: (enabled: boolean) => void;
}

export function SourceAtlas({ 
  onAddAsset, 
  gridSettings, 
  onGridSettingsChange, 
  onAutoDetectGrid,
  availableAssets, 
  onSourceCellClick, 
  onSourceCellRightClick,
  mainGridSettings,
  canvasWidth: targetCanvasW,
  canvasHeight: targetCanvasH,
  autoDetectEnabled,
  onAutoDetectEnabledChange
}: SourceAtlasProps) {

  const [sourceAsset, setSourceAsset] = useState<TextureAsset | null>(null);
  const [customSelection, setCustomSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (assetId: string) => {
    const asset = availableAssets.find(t => t.id === assetId);
    if (asset) {
      const newAsset = { ...asset, id: 'source' };
      setSourceAsset(newAsset);
      if (autoDetectEnabled) {
        onAutoDetectGrid(newAsset);
      }
    }
  };

  const handleExtractIslands = async () => {
    if (!sourceAsset) return;

    const img = new Image();
    await new Promise(resolve => { img.onload = resolve; img.src = sourceAsset.url; });

    const canvas = document.createElement('canvas');
    canvas.width = sourceAsset.width;
    canvas.height = sourceAsset.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const islands = findIslands(
      imageData,
      gridSettings.clearColor,
      gridSettings.clearTolerance,
      true
    );

    if (islands.length <= 1) {
      console.log(`[FixGrid] Aborting: Only ${islands.length} island(s) detected. FixGrid requires multiple islands.`);
      return;
    }

    const geo = new GridGeometry(gridSettings, sourceAsset.width, sourceAsset.height);
    if (geo.padding === 0) {
      console.log(`[FixGrid] Aborting: Cell padding is 0. FixGrid requires non-zero padding to align islands.`);
      return;
    }

    console.log(`[FixGrid] Algorithm Start: Image ${sourceAsset.width}x${sourceAsset.height}`);
    console.log(`[FixGrid] Found ${islands.length} raw islands using tolerance ${gridSettings.clearTolerance}`);
    console.log(`[FixGrid] Geometry Config: CellSize=${geo.cellW}x${geo.cellH}, Padding=${geo.padding}, Step=${geo.stepX}x${geo.stepY}`);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = sourceAsset.width;
    outCanvas.height = sourceAsset.height;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    islands.forEach((isl, idx) => {
      const centerX = isl.x + isl.w / 2;
      const centerY = isl.y + isl.h / 2;
      
      const relX = centerX - geo.padding - geo.cellW / 2;
      const relY = centerY - geo.padding - geo.cellH / 2;
      
      const col = Math.round(relX / geo.stepX);
      const row = Math.round(relY / geo.stepY);
      
      const destX = geo.padding + col * geo.stepX;
      const destY = geo.padding + row * geo.stepY;
      
      if (idx < 5 || idx === islands.length - 1) {
        console.log(`[FixGrid] Island #${idx}: Original Rect(${isl.x},${isl.y},${isl.w},${isl.h}) Center(${centerX.toFixed(1)},${centerY.toFixed(1)})`);
        console.log(`[FixGrid]   -> Mapping: Rel(${relX.toFixed(1)},${relY.toFixed(1)}) -> Cell(${col},${row}) -> Dest(${destX},${destY})`);
      } else if (idx === 5) {
        console.log(`[FixGrid] ... (skipping logs for intermediate islands) ...`);
      }

      outCtx.drawImage(canvas, isl.x, isl.y, isl.w, isl.h, destX, destY, geo.cellW, geo.cellH);
    });

    console.log(`[FixGrid] Finished processing ${islands.length} islands.`);
    setSourceAsset({ ...sourceAsset, url: outCanvas.toDataURL() });
  };

  const handleLoadSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    console.log(`[Forge] Loading new source image: ${file.name}`);
    
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      console.log(`[Forge] Source image loaded: ${img.width}x${img.height}`);
      const newAsset: TextureAsset = {
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
      };
      setSourceAsset(newAsset);
      setCustomSelection(null);
      setMenuPos(null);

      if (autoDetectEnabled) {
        onAutoDetectGrid(newAsset);
      }
    };
    img.src = url;
  };

  const handleCellClick = (x: number, y: number, width: number, height: number, cx: number, cy: number) => {
    if (!sourceAsset) return;
    onSourceCellClick(x, y, width, height, cx, cy, sourceAsset);
  };

  const handleCellRightClick = (x: number, y: number, width: number, height: number, cx: number, cy: number) => {
    if (!sourceAsset) return;
    if (onSourceCellRightClick) {
      onSourceCellRightClick(x, y, width, height, cx, cy, sourceAsset);
    }
  };

  const handleCustomSelection = (rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number }) => {
    setCustomSelection(rect);
    if (!rect) setMenuPos(null);
    else if (screenPos) setMenuPos(screenPos);
  };

  const addSelection = async (detectIsland: boolean) => {
    if (!customSelection || !sourceAsset) return;

    const img = new Image();
    await new Promise(resolve => { img.onload = resolve; img.src = sourceAsset.url; });

    let sx = customSelection.x, sy = customSelection.y, sw = customSelection.w, sh = customSelection.h;
    
    const permClearRGB = hexToRgb(mainGridSettings.clearColor);

    // Temp canvas to sample the original selection
    const analyzeCanvas = document.createElement('canvas');
    analyzeCanvas.width = sw; analyzeCanvas.height = sh;
    const analyzeCtx = analyzeCanvas.getContext('2d', { willReadFrequently: true });
    if (!analyzeCtx) return;
    
    analyzeCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const analyzeImageData = analyzeCtx.getImageData(0, 0, sw, sh);
    const originalData = analyzeImageData.data;
    const actualW = analyzeImageData.width;
    const actualH = analyzeImageData.height;

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

    const isMatch = (r: number, g: number, b: number, a: number) => {
      if (a < 10) return true; 
      if (tempClear.a < 10) return a < 10; 
      const rDiff = Math.abs(r - tempClear.r);
      const gDiff = Math.abs(g - tempClear.g);
      const bDiff = Math.abs(b - tempClear.b);
      return rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance;
    };

    if (detectIsland) {
      let minX = actualW, minY = actualH, maxX = 0, maxY = 0, found = false;
      for (let y = 0; y < actualH; y++) {
        for (let x = 0; x < actualW; x++) {
          const i = (y * actualW + x) * 4;
          if (!isMatch(originalData[i], originalData[i+1], originalData[i+2], originalData[i+3])) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            found = true;
          }
        }
      }
      if (found) {
        const islandW = maxX - minX + 1;
        const islandH = maxY - minY + 1;
        sx += minX; sy += minY;
        sw = islandW; sh = islandH;
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
    cropCtx.putImageData(finalCropData, 0, 0);

    const targetW = mainGridSettings.cellSize;
    const targetH = mainGridSettings.cellY || mainGridSettings.cellSize;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW; finalCanvas.height = targetH;
    const finalCtx = finalCanvas.getContext('2d');
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = false; 
      finalCtx.drawImage(cropCanvas, 0, 0, sw, sh, 0, 0, targetW, targetH);
      
      onAddAsset({
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
        <div className="flex items-center gap-2" title="Pick textures from this source image">
          <ImageIcon className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Source Atlas</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5" title="Source grid settings (Width, Height, Padding, Tolerance)">
            <span className="text-[9px] text-zinc-500 uppercase font-bold" title="Cell Width">W</span>
            <DeferredNumberInput
              value={gridSettings.cellSize}
              min={16}
              onCommit={(val) => {
                onGridSettingsChange({ ...gridSettings, cellSize: val, cellY: gridSettings.keepSquare ? val : (gridSettings.cellY || val) });
              }}
              className="w-10 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
              title="Width for defining the source grid"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1" title="Cell Height">H</span>
            <DeferredNumberInput
              value={gridSettings.cellY || gridSettings.cellSize}
              min={16}
              onCommit={(val) => {
                onGridSettingsChange({ ...gridSettings, cellY: val, keepSquare: false });
              }}
              className="w-10 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
              title="Height for defining the source grid"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1" title="Cell Padding">Pad</span>
            <DeferredNumberInput
              value={gridSettings.padding}
              min={0}
              onCommit={(val) => {
                onGridSettingsChange({ ...gridSettings, padding: val });
              }}
              className="w-8 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
              title="Padding for defining the source grid spacing"
            />
            <span className="text-[9px] text-zinc-500 uppercase font-bold ml-1" title="Color Tolerance">Tol</span>
            <DeferredNumberInput
              value={gridSettings.clearTolerance}
              min={0}
              onCommit={(val) => {
                onGridSettingsChange({ ...gridSettings, clearTolerance: val });
              }}
              className="w-8 bg-transparent border-0 p-0 text-[10px] text-zinc-300 font-mono focus:ring-0"
              title="Color-key matching tolerance against the background color"
            />
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-colors border border-zinc-700"
            title="Load Source Image"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onAutoDetectEnabledChange(!autoDetectEnabled)}
              className={cn(
                "p-1.5 rounded transition-colors border",
                autoDetectEnabled 
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-400" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400"
              )}
              title={autoDetectEnabled ? "Auto-detect is ENABLED" : "Auto-detect is DISABLED"}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={!sourceAsset}
              onClick={() => sourceAsset && onAutoDetectGrid(sourceAsset)}
              className={cn(
                "flex items-center gap-2 text-xs font-medium px-2 py-1 rounded transition-colors border",
                sourceAsset 
                  ? "bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border-blue-500/30" 
                  : "bg-zinc-800/50 text-zinc-600 border-zinc-800 opacity-50 cursor-not-allowed"
              )}
              title="Auto Detect Grid Settings Now"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Auto Detect</span>
            </button>
          </div>

          <button
            disabled={!sourceAsset}
            onClick={handleExtractIslands}
            className={cn(
              "flex items-center gap-2 text-xs font-medium px-2 py-1 rounded transition-colors border",
              sourceAsset 
                ? "bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border-amber-500/30" 
                : "bg-zinc-800/50 text-zinc-600 border-zinc-800 opacity-50 cursor-not-allowed"
            )}
            title="Run Fix Grid algorithm on the entire source image to extract islands"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span>Fix Grid</span>
          </button>
        </div>
        <input type="file" className="hidden" ref={fileInputRef} onChange={handleLoadSource} accept="image/*" />
      </div>

      <div className="flex-1 relative overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleDrop(e.dataTransfer.getData('text/plain')); }}>
        {sourceAsset ? (
          <AtlasCanvas
            entries={[sourceAsset]}
            onSelectEntry={() => {}}
            gridSettings={gridSettings}
            onCellClick={handleCellClick}
            onCellRightClick={handleCellRightClick}
            onDrop={handleDrop}
            canvasWidth={sourceAsset.width}
            canvasHeight={sourceAsset.height}
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
