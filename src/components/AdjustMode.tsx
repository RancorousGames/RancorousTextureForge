import React from 'react';
import { TextureAsset } from '../types';
import { SlidersHorizontal, Download, Maximize2 } from 'lucide-react';
import Pica from 'pica';
import { cn } from '../lib/utils';

const pica = Pica();

interface AdjustModeProps {
  selectedAsset: TextureAsset | undefined;
  updateAsset: (id: string, updates: Partial<TextureAsset>) => void;
  onExport: (url: string, filename: string) => void;
  adjustSettings: { targetW: number | 'source'; targetH: number | 'source' };
  onAdjustSettingsChange: (settings: { targetW: number | 'source'; targetH: number | 'source' }) => void;
}

export function AdjustMode({ selectedAsset, updateAsset, onExport, adjustSettings, onAdjustSettingsChange }: AdjustModeProps) {
  const [zoom, setZoom] = React.useState(1);
  const [isResizing, setIsResizing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const targetW = adjustSettings.targetW;
  const targetH = adjustSettings.targetH;

  const resolutions = [
    { label: 'Source', value: 'source' },
    { label: '16', value: 16 },
    { label: '32', value: 32 },
    { label: '64', value: 64 },
    { label: '128', value: 128 },
    { label: '256', value: 256 },
    { label: '512', value: 512 },
    { label: '1024', value: 1024 },
    { label: '2048', value: 2048 },
    { label: '4096', value: 4096 },
    { label: '8192', value: 8192 },
  ];

  const setTargetW = (w: number | 'source') => onAdjustSettingsChange({ ...adjustSettings, targetW: w });
  const setTargetH = (h: number | 'source') => onAdjustSettingsChange({ ...adjustSettings, targetH: h });

  const handleResize = async () => {
    if (!selectedAsset) return;
    setIsResizing(true);
    
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        // Use sourceUrl for high-quality resampling if available
        img.src = selectedAsset.sourceUrl || selectedAsset.url;
      });

      const finalW = targetW === 'source' ? img.width : targetW;
      const finalH = targetH === 'source' ? img.height : targetH;

      const fromCanvas = document.createElement('canvas');
      fromCanvas.width = img.width;
      fromCanvas.height = img.height;
      const fCtx = fromCanvas.getContext('2d');
      if (!fCtx) return;
      fCtx.drawImage(img, 0, 0);

      const toCanvas = document.createElement('canvas');
      toCanvas.width = finalW;
      toCanvas.height = finalH;

      await pica.resize(fromCanvas, toCanvas);
      
      const newUrl = toCanvas.toDataURL();
      updateAsset(selectedAsset.id, { 
        url: newUrl, 
        width: finalW, 
        height: finalH,
        scale: 1 
      });
    } catch (err) {
      console.error('Resize failed', err);
    } finally {
      setIsResizing(false);
    }
  };

  React.useEffect(() => {
    if (selectedAsset) {
      setTargetW('source');
      setTargetH('source');
    }
  }, [selectedAsset?.id]);

  React.useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.min(Math.max(prev * delta, 0.1), 10));
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => el?.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto-zoom to fit
  React.useEffect(() => {
    if (selectedAsset && containerRef.current) {
      const parent = containerRef.current;
      const pRect = parent.getBoundingClientRect();
      const scale = Math.min(pRect.width / selectedAsset.width, pRect.height / selectedAsset.height) * 0.8;
      setZoom(scale);
    }
  }, [selectedAsset?.id]);

  const handleExport = () => {
    if (!selectedAsset) return;
    
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.filter = `hue-rotate(${selectedAsset.hue}deg) brightness(${selectedAsset.brightness}%)`;
      ctx.drawImage(img, 0, 0);
      onExport(canvas.toDataURL(), `adjusted_${selectedAsset.name}`);
    };
    img.src = selectedAsset.url;
  };
  if (!selectedAsset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 gap-4">
        <SlidersHorizontal className="w-12 h-12 opacity-20" />
        <div className="text-center">
          <p className="text-sm font-medium">No texture selected for adjustment</p>
          <p className="text-xs opacity-60">Select or drag a texture from the browser to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-zinc-900 overflow-hidden">
      <div className="w-80 p-6 border-r border-zinc-800 bg-zinc-950 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-2 pb-4 border-b border-zinc-800" title="Adjust the selected texture properties">
          <SlidersHorizontal className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-zinc-100">Adjust Asset</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400" title="Filename of the selected texture">Asset Name</label>
            <div className="text-sm text-zinc-200 truncate" title={selectedAsset.name}>
              {selectedAsset.name}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="text-xs font-medium text-zinc-400 flex items-center gap-2" title="Resample the texture to a new resolution">
              <Maximize2 className="w-3 h-3" />
              <span>Target Resolution</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase" title="Desired width in pixels">Width</label>
                <select
                  value={targetW}
                  onChange={(e) => setTargetW(e.target.value === 'source' ? 'source' : Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200"
                  title="Select target width"
                >
                  {resolutions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase" title="Desired height in pixels">Height</label>
                <select
                  value={targetH}
                  onChange={(e) => setTargetH(e.target.value === 'source' ? 'source' : Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200"
                  title="Select target height"
                >
                  {resolutions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <button
              onClick={handleResize}
              disabled={isResizing}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 rounded text-xs font-medium border border-zinc-700 transition-colors"
              title="Apply the resolution change using high-quality resampling"
            >
              Apply Resample
            </button>
            {isResizing && <p className="text-[10px] text-blue-500 animate-pulse">Resampling...</p>}
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="text-xs font-medium text-zinc-400 flex justify-between" title="Shift the colors of the texture along the hue spectrum">
              <span>Hue Shift</span>
              <span className="font-mono">{selectedAsset.hue}°</span>
            </label>
            <input
              type="range"
              min="0"
              max="360"
              value={selectedAsset.hue}
              onChange={(e) => updateAsset(selectedAsset.id, { hue: Number(e.target.value) })}
              className="w-full accent-blue-500"
              title="Drag to shift hue (0-360 degrees)"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="text-xs font-medium text-zinc-400 flex justify-between" title="Adjust the overall brightness of the texture">
              <span>Brightness</span>
              <span className="font-mono">{selectedAsset.brightness}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="300"
              value={selectedAsset.brightness}
              onChange={(e) => updateAsset(selectedAsset.id, { brightness: Number(e.target.value) })}
              className="w-full accent-blue-500"
              title="Drag to adjust brightness (0-300%)"
            />
          </div>

          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-md text-sm font-medium transition-colors mt-6"
            title="Download the adjusted texture as a new PNG file"
          >
            <Download className="w-4 h-4" />
            Export Adjusted Texture
          </button>
        </div>
      </div>

      <div className="flex-1 p-12 flex items-center justify-center checkerboard overflow-hidden" ref={containerRef}>
        <div 
          className="shadow-2xl ring-1 ring-white/10 transition-all duration-200 origin-center"
          style={{
            transform: `scale(${selectedAsset.scale * zoom})`,
            filter: `hue-rotate(${selectedAsset.hue}deg) brightness(${selectedAsset.brightness}%)`,
          }}
        >
          <img 
            src={selectedAsset.url} 
            alt="Preview" 
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
}
