import React, { useState, useRef, useEffect } from 'react';
import { TextureTile, Layer, VIRTUAL_MAIN_ATLAS_ID } from '../types';
import { Download, Layers as LayersIcon, Eye, EyeOff, Trash2, Plus, MoveUp, MoveDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateId } from '../lib/canvas';

interface LayeringModeProps {
  availableTiles: TextureTile[];
  layers: Layer[];
  setLayers: (layers: Layer[]) => void;
  onExport: (url: string, filename: string) => void;
  canvasWidth: number;
  canvasHeight: number;
  onGetSnapshot?: () => Promise<string>;
}

type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';

interface Interaction {
  type: 'move' | 'resize' | null;
  startMouse: { x: number; y: number };
  startTile: { x: number; y: number; scale: number };
  corner: ResizeCorner | null;
  fixedPoint: { x: number; y: number } | null;
}

const HANDLE_SCREEN_PX = 10;

export function LayeringMode({ availableTiles, layers, setLayers, onExport, canvasWidth, canvasHeight, onGetSnapshot }: LayeringModeProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const [interaction, setInteraction] = useState<Interaction>({
    type: null,
    startMouse: { x: 0, y: 0 },
    startTile: { x: 0, y: 0, scale: 1 },
    corner: null,
    fixedPoint: null,
  });

  // Convert screen coords to canvas-space coords using the scaled canvas element bounds
  const getCanvasPos = (e: React.PointerEvent | PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(prev => Math.min(Math.max(0.1, prev * (e.deltaY > 0 ? 0.9 : 1.1)), 10));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Fit canvas to viewport when dimensions change
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !canvasWidth || !canvasHeight) return;
    const { clientWidth, clientHeight } = vp;
    if (!clientWidth || !clientHeight) return;
    setZoom(Math.min(Math.max(0.1, Math.min(clientWidth / canvasWidth, clientHeight / canvasHeight) * 0.9), 10));
  }, [canvasWidth, canvasHeight]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    let tile = availableTiles.find(t => t.id === id);
    if (!tile) return;

    if (tile.id === VIRTUAL_MAIN_ATLAS_ID && onGetSnapshot) {
      const url = await onGetSnapshot();
      tile = { ...tile, url, id: generateId(), name: `Snapshot ${new Date().toLocaleTimeString()}` };
    }

    const newLayer: Layer = {
      id: generateId(),
      tile: { ...tile, x: 0, y: 0, scale: 1 },
      opacity: 1,
      transparentColor: null,
      tolerance: 10,
      visible: true,
    };
    setLayers([newLayer, ...layers]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id: string, updates: Partial<Layer>) =>
    setLayers(layers.map(l => l.id === id ? { ...l, ...updates } : l));

  const updateLayerTile = (id: string, updates: Partial<TextureTile>) =>
    setLayers(layers.map(l => l.id === id ? { ...l, tile: { ...l.tile, ...updates } } : l));

  const moveLayer = (index: number, direction: -1 | 1) => {
    const next = [...layers];
    if (index + direction < 0 || index + direction >= next.length) return;
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setLayers(next);
  };

  const removeLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const getCachedImage = async (url: string): Promise<HTMLImageElement> => {
    if (imageCache.current.has(url)) return imageCache.current.get(url)!;
    const img = new Image();
    img.src = url;
    await new Promise(resolve => { img.onload = resolve; });
    imageCache.current.set(url, img);
    return img;
  };

  useEffect(() => {
    const renderCanvas = async () => {
      if (layers.length === 0) {
        setResultUrl(null);
        return;
      }

      // Logic: Use the maximum width and height found among all layers (ignoring global canvasWidth/Height)
      const w = Math.max(...layers.map(l => l.tile.width * l.tile.scale));
      const h = Math.max(...layers.map(l => l.tile.height * l.tile.scale));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      for (const layer of [...layers].reverse()) {
        if (!layer.visible) continue;
        const img = await getCachedImage(layer.tile.url);
        const { tile } = layer;
        const tw = Math.max(1, tile.width * tile.scale);
        const th = Math.max(1, tile.height * tile.scale);
        if (layer.transparentColor) {
          const tmp = document.createElement('canvas');
          tmp.width = tw; tmp.height = th;
          const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
          if (!tmpCtx) continue;
          tmpCtx.drawImage(img, 0, 0, tw, th);
          const imgData = tmpCtx.getImageData(0, 0, tw, th);
          const data = imgData.data;
          const hex = layer.transparentColor.replace('#', '');
          const cr = parseInt(hex.substring(0, 2), 16);
          const cg = parseInt(hex.substring(2, 4), 16);
          const cb = parseInt(hex.substring(4, 6), 16);
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            if (Math.abs(data[i] - cr) <= layer.tolerance && Math.abs(data[i + 1] - cg) <= layer.tolerance && Math.abs(data[i + 2] - cb) <= layer.tolerance) {
              data[i + 3] = 0;
            }
          }
          tmpCtx.putImageData(imgData, 0, 0);
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(tmp, tile.x, tile.y);
        } else {
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(img, tile.x, tile.y, tw, th);
        }
        ctx.globalAlpha = 1;
      }
      setResultUrl(canvas.toDataURL('image/png'));
    };
    renderCanvas();
  }, [layers]); // removed canvasWidth/Height dependency to be independent of other screens

  // Hit-test corner handles of the given layer. Returns corner name or null.
  const getCornerHit = (pos: { x: number; y: number }, layer: Layer): ResizeCorner | null => {
    const hs = HANDLE_SCREEN_PX / zoom;
    const { x, y, width, height, scale } = layer.tile;
    const w = width * scale;
    const h = height * scale;
    const corners: [ResizeCorner, number, number][] = [
      ['tl', x, y], ['tr', x + w, y], ['bl', x, y + h], ['br', x + w, y + h],
    ];
    for (const [c, cx, cy] of corners) {
      if (Math.abs(pos.x - cx) <= hs && Math.abs(pos.y - cy) <= hs) return c;
    }
    return null;
  };

  const getFixedPoint = (corner: ResizeCorner, tile: TextureTile) => {
    const w = tile.width * tile.scale;
    const h = tile.height * tile.scale;
    return { tl: { x: tile.x + w, y: tile.y + h }, tr: { x: tile.x, y: tile.y + h }, bl: { x: tile.x + w, y: tile.y }, br: { x: tile.x, y: tile.y } }[corner];
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pos = getCanvasPos(e);
    if (!pos) return;

    // Corner handle of selected layer takes priority
    if (selectedLayerId) {
      const sel = layers.find(l => l.id === selectedLayerId);
      if (sel) {
        const corner = getCornerHit(pos, sel);
        if (corner) {
          setInteraction({
            type: 'resize',
            startMouse: pos,
            startTile: { x: sel.tile.x, y: sel.tile.y, scale: sel.tile.scale },
            corner,
            fixedPoint: getFixedPoint(corner, sel.tile),
          });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // Layer body hit test
    const hit = layers.find(layer => {
      if (!layer.visible) return false;
      const { x, y, width, height, scale } = layer.tile;
      return pos.x >= x && pos.x <= x + width * scale && pos.y >= y && pos.y <= y + height * scale;
    });

    if (hit) {
      setSelectedLayerId(hit.id);
      setInteraction({
        type: 'move',
        startMouse: pos,
        startTile: { x: hit.tile.x, y: hit.tile.y, scale: hit.tile.scale },
        corner: null,
        fixedPoint: null,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      setSelectedLayerId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!interaction.type || !selectedLayerId) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;

    if (interaction.type === 'move') {
      updateLayerTile(selectedLayerId, {
        x: interaction.startTile.x + (pos.x - interaction.startMouse.x),
        y: interaction.startTile.y + (pos.y - interaction.startMouse.y),
      });
    } else if (interaction.type === 'resize' && interaction.fixedPoint && interaction.corner) {
      const { x: fx, y: fy } = interaction.fixedPoint;
      const dx = pos.x - fx;
      const dy = pos.y - fy;
      const { tile } = layer;
      const origScaledDiag = Math.sqrt((tile.width * interaction.startTile.scale) ** 2 + (tile.height * interaction.startTile.scale) ** 2);
      const newScale = Math.max(0.05, (Math.sqrt(dx * dx + dy * dy) / origScaledDiag) * interaction.startTile.scale);
      let newX = fx, newY = fy;
      if (interaction.corner === 'tl') { newX = fx - tile.width * newScale; newY = fy - tile.height * newScale; }
      else if (interaction.corner === 'tr') { newX = fx; newY = fy - tile.height * newScale; }
      else if (interaction.corner === 'bl') { newX = fx - tile.width * newScale; newY = fy; }
      updateLayerTile(selectedLayerId, { x: newX, y: newY, scale: newScale });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setInteraction({ type: null, startMouse: { x: 0, y: 0 }, startTile: { x: 0, y: 0, scale: 1 }, corner: null, fixedPoint: null });
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  const effectiveWidth = Math.max(...layers.map(l => l.tile.width * l.tile.scale), 1024);
  const effectiveHeight = Math.max(...layers.map(l => l.tile.height * l.tile.scale), 1024);

  const cornerPositions: Record<ResizeCorner, React.CSSProperties> = {
    tl: { top: 0, left: 0, transform: `translate(-50%, -50%) scale(${1 / zoom})` },
    tr: { top: 0, right: 0, transform: `translate(50%, -50%) scale(${1 / zoom})` },
    bl: { bottom: 0, left: 0, transform: `translate(-50%, 50%) scale(${1 / zoom})` },
    br: { bottom: 0, right: 0, transform: `translate(50%, 50%) scale(${1 / zoom})` },
  };

  return (
    <div className="flex-1 flex h-full bg-zinc-900 overflow-hidden">
      {/* Left Panel */}
      <div className="w-80 flex flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="p-4 border-b border-zinc-800 flex items-center" title="Manage the stack of texture layers">
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
                  selectedLayerId === layer.id
                    ? "bg-zinc-700/40 border border-zinc-500/50"
                    : "hover:bg-zinc-900 border border-transparent"
                )}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <button
                  className="text-zinc-500 hover:text-zinc-300"
                  onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <div className="w-8 h-8 bg-zinc-950 rounded overflow-hidden checkerboard shrink-0">
                  <img src={layer.tile.url} alt="layer" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 truncate">{layer.tile.name}</div>
                  <div className="text-[10px] text-zinc-500">{Math.round(layer.opacity * 100)}% opacity</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button disabled={index === 0} onClick={(e) => { e.stopPropagation(); moveLayer(index, -1); }} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30" title="Move layer up">
                    <MoveUp className="w-3 h-3" />
                  </button>
                  <button disabled={index === layers.length - 1} onClick={(e) => { e.stopPropagation(); moveLayer(index, 1); }} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30" title="Move layer down">
                    <MoveDown className="w-3 h-3" />
                  </button>
                </div>
                <button className="text-zinc-500 hover:text-red-400 ml-1" onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} title="Remove layer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {selectedLayer && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Layer Properties</h3>
              <div className="text-[10px] text-zinc-500 font-mono">
                {Math.round(selectedLayer.tile.x)},{Math.round(selectedLayer.tile.y)} @ {Math.round(selectedLayer.tile.scale * 100)}%
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-300 flex justify-between">
                <span>Opacity</span>
                <span>{Math.round(selectedLayer.opacity * 100)}%</span>
              </label>
              <input type="range" min="0" max="1" step="0.01" value={selectedLayer.opacity}
                onChange={(e) => updateLayer(selectedLayer.id, { opacity: parseFloat(e.target.value) })}
                className="w-full accent-blue-500" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-300 flex justify-between items-center">
                <span>Transparent Color Key</span>
                <input type="checkbox" checked={selectedLayer.transparentColor !== null}
                  onChange={(e) => updateLayer(selectedLayer.id, { transparentColor: e.target.checked ? '#000000' : null })}
                  className="rounded border-zinc-700 bg-zinc-900 text-blue-500" />
              </label>
              {selectedLayer.transparentColor !== null && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={selectedLayer.transparentColor}
                    onChange={(e) => updateLayer(selectedLayer.id, { transparentColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" />
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-zinc-500">Tolerance: {selectedLayer.tolerance}</label>
                    <input type="range" min="0" max="255" step="1" value={selectedLayer.tolerance}
                      onChange={(e) => updateLayer(selectedLayer.id, { tolerance: parseInt(e.target.value) })}
                      className="w-full accent-blue-500" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Viewport — flex-centered so canvas stays centered at all zoom levels */}
      <div
        ref={viewportRef}
        className="flex-1 flex items-center justify-center overflow-hidden checkerboard relative select-none"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: interaction.type === 'move' ? 'grabbing' : 'default' }}
      >
        {resultUrl ? (
          <div
            ref={canvasRef}
            className="relative shadow-2xl"
            style={{
              width: effectiveWidth,
              height: effectiveHeight,
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              flexShrink: 0,
            }}
          >
            <img
              src={resultUrl}
              alt="Result"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />

            {/* Selection overlay — thin outline + corner resize handles, no fill */}
            {selectedLayer && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: selectedLayer.tile.x,
                  top: selectedLayer.tile.y,
                  width: selectedLayer.tile.width * selectedLayer.tile.scale,
                  height: selectedLayer.tile.height * selectedLayer.tile.scale,
                }}
              >
                <div className="absolute inset-0 border border-dashed border-white/60" />
                {(Object.keys(cornerPositions) as ResizeCorner[]).map(corner => (
                  <div
                    key={corner}
                    className="absolute bg-white border border-zinc-500 rounded-sm"
                    style={{
                      width: HANDLE_SCREEN_PX,
                      height: HANDLE_SCREEN_PX,
                      ...cornerPositions[corner],
                      transformOrigin: 'center center',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-zinc-500 flex flex-col items-center gap-4 pointer-events-none">
            <Plus className="w-12 h-12 opacity-20" />
            <p>Drag textures here or to the layers panel</p>
          </div>
        )}

        <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono z-50 pointer-events-none">
          {`Zoom: ${Math.round(zoom * 100)}% (Ctrl+Scroll) | Drag: Move | Corner-drag: Resize`}
        </div>

        {resultUrl && (
          <div className="absolute bottom-4 right-4">
            <button
              onClick={() => onExport(resultUrl, 'layered_texture.png')}
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
