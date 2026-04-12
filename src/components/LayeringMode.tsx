import React, { useState, useRef, useEffect } from 'react';
import { TextureTile, Layer } from '../types';
import { Download, Layers as LayersIcon, Eye, EyeOff, Trash2, Plus, MoveUp, MoveDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayeringModeProps {
  availableTiles: TextureTile[];
  layers: Layer[];
  setLayers: (layers: Layer[]) => void;
  onExport: (url: string, filename: string) => void;
}

export function LayeringMode({ availableTiles, layers, setLayers, onExport }: LayeringModeProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((prev) => Math.min(Math.max(prev * delta, 0.1), 10));
      }
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => el?.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto-zoom to fit
  useEffect(() => {
    if (resultUrl && containerRef.current) {
      const parent = containerRef.current;
      const pRect = parent.getBoundingClientRect();
      // We need the image dimensions. We can get them from the layers or the resultUrl.
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(pRect.width / img.width, pRect.height / img.height) * 0.8;
        setZoom(scale);
      };
      img.src = resultUrl;
    }
  }, [layers.length === 0]); // Only on first load

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const tileId = e.dataTransfer.getData('text/plain');
    const tile = availableTiles.find(t => t.id === tileId);
    if (!tile) return;

    const newLayer: Layer = {
      id: Math.random().toString(36).substring(2, 9),
      tile: { ...tile },
      opacity: 1,
      transparentColor: null,
      tolerance: 10,
      visible: true,
    };

    setLayers([newLayer, ...layers]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id: string, updates: Partial<Layer>) => {
    setLayers(layers.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const moveLayer = (index: number, direction: -1 | 1) => {
    const newLayers = [...layers];
    if (index + direction < 0 || index + direction >= newLayers.length) return;
    const temp = newLayers[index];
    newLayers[index] = newLayers[index + direction];
    newLayers[index + direction] = temp;
    setLayers(newLayers);
  };

  const removeLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  // Render layers to canvas
  useEffect(() => {
    const renderCanvas = async () => {
      if (layers.length === 0) {
        setResultUrl(null);
        return;
      }

      // Find max dimensions
      const width = Math.max(...layers.map(l => l.tile.width));
      const height = Math.max(...layers.map(l => l.tile.height));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Render from bottom to top (reverse array)
      const reversedLayers = [...layers].reverse();

      for (const layer of reversedLayers) {
        if (!layer.visible) continue;

        const img = new Image();
        img.src = layer.tile.url;
        await new Promise(resolve => { img.onload = resolve; });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) continue;

        tempCtx.drawImage(img, 0, 0, layer.tile.width, layer.tile.height);

        if (layer.transparentColor) {
          const imgData = tempCtx.getImageData(0, 0, width, height);
          const data = imgData.data;
          
          // Parse hex color
          const hex = layer.transparentColor.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          for (let i = 0; i < data.length; i += 4) {
            const dr = Math.abs(data[i] - r);
            const dg = Math.abs(data[i + 1] - g);
            const db = Math.abs(data[i + 2] - b);
            
            // Simple distance check
            if (dr <= layer.tolerance && dg <= layer.tolerance && db <= layer.tolerance) {
              data[i + 3] = 0; // Make transparent
            }
          }
          tempCtx.putImageData(imgData, 0, 0);
        }

        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
      }

      setResultUrl(canvas.toDataURL('image/png'));
    };

    renderCanvas();
  }, [layers]);

  const handleExport = () => {
    if (!resultUrl) return;
    onExport(resultUrl, 'layered_texture.png');
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="flex-1 flex h-full bg-zinc-900 overflow-hidden">
      {/* Left Panel: Layer Stack & Properties */}
      <div className="w-80 flex flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <LayersIcon className="w-4 h-4" />
            Layers
          </h2>
        </div>

        <div 
          className="flex-1 overflow-y-auto p-2 space-y-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {layers.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center mt-10 p-4 border-2 border-dashed border-zinc-800 rounded-lg">
              Drag textures here from the Asset Browser to create layers.
            </div>
          ) : (
            layers.map((layer, index) => (
              <div 
                key={layer.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                  selectedLayerId === layer.id ? "bg-blue-900/30 border border-blue-500/50" : "hover:bg-zinc-900 border border-transparent"
                )}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <button 
                  className="text-zinc-500 hover:text-zinc-300"
                  onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                >
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                
                <div className="w-8 h-8 bg-zinc-950 rounded overflow-hidden checkerboard shrink-0">
                  <img src={layer.tile.url} alt="layer" className="w-full h-full object-contain" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 truncate">{layer.tile.name}</div>
                  <div className="text-[10px] text-zinc-500">{Math.round(layer.opacity * 100)}% Opacity</div>
                </div>

                <div className="flex flex-col gap-1">
                  <button 
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                  >
                    <MoveUp className="w-3 h-3" />
                  </button>
                  <button 
                    disabled={index === layers.length - 1}
                    onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                  >
                    <MoveDown className="w-3 h-3" />
                  </button>
                </div>

                <button 
                  className="text-zinc-500 hover:text-red-400 ml-1"
                  onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Layer Properties */}
        {selectedLayer && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Layer Properties</h3>
            
            <div className="space-y-2">
              <label className="text-xs text-zinc-300 flex justify-between">
                <span>Opacity</span>
                <span>{Math.round(selectedLayer.opacity * 100)}%</span>
              </label>
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={selectedLayer.opacity}
                onChange={(e) => updateLayer(selectedLayer.id, { opacity: parseFloat(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-300 flex justify-between items-center">
                <span>Transparent Color Key</span>
                <input 
                  type="checkbox" 
                  checked={selectedLayer.transparentColor !== null}
                  onChange={(e) => updateLayer(selectedLayer.id, { 
                    transparentColor: e.target.checked ? '#000000' : null 
                  })}
                  className="rounded border-zinc-700 bg-zinc-900 text-blue-500"
                />
              </label>
              
              {selectedLayer.transparentColor !== null && (
                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="color" 
                    value={selectedLayer.transparentColor}
                    onChange={(e) => updateLayer(selectedLayer.id, { transparentColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-zinc-500">Tolerance: {selectedLayer.tolerance}</label>
                    <input 
                      type="range" 
                      min="0" max="255" step="1" 
                      value={selectedLayer.tolerance}
                      onChange={(e) => updateLayer(selectedLayer.id, { tolerance: parseInt(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Preview */}
      <div 
        className="flex-1 p-6 flex flex-col items-center justify-center relative checkerboard overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        ref={containerRef}
      >
        {resultUrl ? (
          <img 
            src={resultUrl} 
            alt="Result" 
            className="max-w-full max-h-full object-contain shadow-2xl ring-1 ring-white/10 origin-center"
            style={{ transform: `scale(${zoom})` }}
          />
        ) : (
          <div className="text-zinc-500 flex flex-col items-center gap-4">
            <Plus className="w-12 h-12 opacity-20" />
            <p>Drag textures here or to the layers panel</p>
          </div>
        )}

        {resultUrl && (
          <div className="absolute bottom-6 right-6">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded shadow-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Layered Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
