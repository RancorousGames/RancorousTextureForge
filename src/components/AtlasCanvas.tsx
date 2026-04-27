import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextureAsset, GridSettings, AtlasStatus } from '../types';
import { cn, hexToRgb } from '../lib/utils';
import { GridGeometry } from '../lib/GridGeometry';
import { InteractionState, DefaultInteractionStrategy } from '../lib/Interactions';

interface AtlasCanvasProps {
  entries: TextureAsset[];
  onEntriesChange?: (entries: TextureAsset[]) => void;
  onSelectEntry: (id: string | null) => void;
  onRemoveEntry?: (entry: TextureAsset) => void;
  gridSettings: GridSettings;
  onCellClick?: (x: number, y: number, width: number, height: number, cx: number, cy: number) => void;
  onCellRightClick?: (x: number, y: number, width: number, height: number, cx: number, cy: number) => void;
  onDrop?: (assetId: string, x: number, y: number) => void;
  className?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  selectedCells?: string[];
  onSelectedCellsChange?: (cells: string[]) => void;
  customSelection?: { x: number, y: number, w: number, h: number } | null;
  onCustomSelectionChange?: (rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number }) => void;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
  atlasSwapMode?: boolean;
  tooltip?: string;
  sourceAsset?: TextureAsset | null;
  clearedCells?: string[];
  atlasStatus?: AtlasStatus;
  uniqueId?: string;
  disableHover?: boolean;
  debugIslands?: { x: number; y: number; w: number; h: number }[];
}

export function AtlasCanvas({
  entries,
  onEntriesChange,
  onSelectEntry,
  onRemoveEntry,
  gridSettings,
  onCellClick,
  onCellRightClick,
  onDrop,
  className,
  canvasWidth = 2048,
  canvasHeight = 2048,
  selectedCells = [],
  onSelectedCellsChange,
  customSelection,
  onCustomSelectionChange,
  onMaterialize,
  atlasSwapMode = false,
  tooltip,
  sourceAsset,
  clearedCells = [],
  atlasStatus = 'parametric',
  uniqueId = 'atlas',
  disableHover = false,
  debugIslands = [],
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  const geo = useMemo(() => 
    new GridGeometry(gridSettings, canvasWidth, canvasHeight),
    [gridSettings, canvasWidth, canvasHeight]
  );

  const strategy = useMemo(() => new DefaultInteractionStrategy(geo), [geo]);

  // Unified Interaction State
  const [interactionState, setInteractionState] = useState<InteractionState>({
    isSelecting: false,
    selectionStart: null,
    draggingId: null,
    draggingIds: [],
    draggingPos: null,
    dragOffset: { x: 0, y: 0, originalX: 0, originalY: 0 },
    hoveredCell: null,
    isPanning: false,
    panStart: null
  });

  const getPointerPos = (e: React.PointerEvent | React.MouseEvent | PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    
    // rect already includes the transform scale and panOffset (if they shift the rect)
    // but the most reliable way is to go from screen -> viewport-relative -> unpanned -> unzoomed
    const viewRect = viewportRef.current?.getBoundingClientRect();
    if (!viewRect) return null;

    const screenX = e.clientX - viewRect.left;
    const screenY = e.clientY - viewRect.top;

    // Remove pan, then divide by zoom
    const x = (screenX - panOffset.x) / zoom;
    const y = (screenY - panOffset.y) / zoom;
    
    if (uniqueId === 'source' && gridSettings.mode === 'packing' && (e.type === 'pointerdown' || e.type === 'mousedown')) {
      console.log(`[AtlasCanvas:${uniqueId}] Click: screen(${e.clientX},${e.clientY}) -> canvas(${x.toFixed(1)},${y.toFixed(1)})`);
    }

    return { x, y };
  };

  // Zoom Handler
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = delta > 0 ? 1.1 : 0.9;
        setZoom(prev => Math.min(Math.max(0.1, prev * factor), 10));
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Fit-to-view when canvas dimensions change (new atlas loaded)
  useEffect(() => {
    if (!canvasWidth || !canvasHeight || !viewportRef.current) return;
    const { clientWidth, clientHeight } = viewportRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;
    const scale = Math.min(clientWidth / canvasWidth, clientHeight / canvasHeight) * 0.95;
    setZoom(Math.min(Math.max(0.1, scale), 10));
  }, [canvasWidth, canvasHeight]);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;

    const result = strategy.onPointerDown(e, pos, entries, { onEntriesChange, onMaterialize, selectedCells });
    setInteractionState(prev => ({ ...prev, ...result.state }));
    
    if (e.target instanceof HTMLElement) {
      try { e.target.setPointerCapture(e.pointerId); } catch(err) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;
    
    const result = strategy.onPointerMove(e, pos, interactionState, entries, { onCustomSelectionChange, onSelectedCellsChange, selectedCells });
    setInteractionState(prev => ({ ...prev, ...result.state }));

    if (result.onPan) {
      setPanOffset(prev => ({
        x: prev.x + result.onPan!.dx,
        y: prev.y + result.onPan!.dy
      }));
    }

    if (result.onCustomSelectionChange && onCustomSelectionChange) {
      onCustomSelectionChange(result.onCustomSelectionChange.rect, result.onCustomSelectionChange.screenPos);
    }
    if (result.onSelectedCellsChange && onSelectedCellsChange) {
      onSelectedCellsChange(result.onSelectedCellsChange);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;

    const result = strategy.onPointerUp(e, pos, interactionState, entries, {
      selectedCells,
      onSelectedCellsChange,
      onCellClick,
      onCellRightClick,
      onEntriesChange,
      onRemoveEntry,
      onCustomSelectionChange,
      atlasSwapMode,
      onMaterialize
    });

    setInteractionState(prev => ({ ...prev, ...result.state }));

    // Execute callbacks
    if (result.onCustomSelectionChange && onCustomSelectionChange) {
      onCustomSelectionChange(result.onCustomSelectionChange.rect, result.onCustomSelectionChange.screenPos);
    }
    if (result.onMaterialize && onMaterialize) {
      onMaterialize(result.onMaterialize.cx, result.onMaterialize.cy, result.onMaterialize.reason, result.onMaterialize.draggingPos);
    }
    if (result.onEntriesChange && onEntriesChange) onEntriesChange(result.onEntriesChange);
    if (result.onSelectedCellsChange && onSelectedCellsChange) onSelectedCellsChange(result.onSelectedCellsChange);
    if (result.onCellClick && onCellClick) {
      const c = result.onCellClick;
      onCellClick(c.x, c.y, c.w, c.h, c.cx, c.cy);
    }
    if (result.onCellRightClick && onCellRightClick) {
      const c = result.onCellRightClick;
      onCellRightClick(c.x, c.y, c.w, c.h, c.cx, c.cy);
    }
    if (result.onRemoveEntry && onRemoveEntry) onRemoveEntry(result.onRemoveEntry);

    if (e.target instanceof HTMLElement) {
      try { e.target.releasePointerCapture(e.pointerId); } catch(err) {}
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = getPointerPos(e as any);
    if (!pos || !onDrop) return;
    onDrop(e.dataTransfer.getData('text/plain'), pos.x, pos.y);
  };

  const renderGrid = () => {
    if (gridSettings.mode === 'packing') return null;
    const { cellW, cellH, stepX, stepY, cols, rows } = geo;
    const { hoveredCell, isSelecting, draggingId } = interactionState;
    const lines = [];
    for (let i = 0; i <= cols; i++) lines.push(<div key={`v-${i}`} className="absolute top-0 bottom-0 border-r border-white/20 mix-blend-difference" style={{ left: i * stepX }} />);
    for (let i = 0; i <= rows; i++) lines.push(<div key={`h-${i}`} className="absolute left-0 right-0 border-b border-white/20 mix-blend-difference" style={{ top: i * stepY }} />);
    
    if (hoveredCell && !isSelecting && !draggingId && !disableHover) {
      const { x, y } = geo.getPosFromCell(hoveredCell.cx, hoveredCell.cy);
      lines.push(
        <div 
          key="hover" 
          className="absolute pointer-events-none z-10" 
          style={{ left: x, top: y, width: cellW, height: cellH }}
        >
          {/* Thick dual-color border for maximum visibility */}
          <div className="absolute -inset-[2px] border-[2px] border-black" />
          <div className="absolute -inset-[2px] border-[2px] border-dashed border-white" />
          <div className="absolute inset-0 bg-blue-500/20" />
        </div>
      );
    }

    selectedCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      const { x, y } = geo.getPosFromCell(cx, cy);
      lines.push(
        <div 
          key={`sel-${key}`} 
          className="absolute bg-yellow-500/30 pointer-events-none z-10" 
          style={{ left: x, top: y, width: cellW, height: cellH }}
        >
          <div className="absolute inset-0 border-2 border-yellow-500" />
          <div className="absolute inset-0 border border-black/40" />
        </div>
      );
    });
    return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
  };

  return (
    <div ref={viewportRef} className={cn("flex-1 h-full bg-zinc-950 relative overflow-hidden checkerboard", className)} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={() => setInteractionState(prev => ({ ...prev, hoveredCell: null }))} onContextMenu={e => e.preventDefault()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div ref={containerRef} className="relative origin-top-left shadow-2xl transition-transform duration-75 ease-out" style={{ width: canvasWidth, height: canvasHeight, transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}>
        <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundColor: gridSettings.clearColor }} />
        
        {/* Background Source Image with Holes */}
        {sourceAsset && atlasStatus !== 'baked' && (
          <div className="absolute inset-0 pointer-events-none z-[1]">
            <svg width={canvasWidth} height={canvasHeight} className="absolute inset-0 w-full h-full">
              <defs>
                <mask id={`mask-${uniqueId}-${sourceAsset.id.replace(/[^a-zA-Z0-9]/g, '_')}`} x="0" y="0" width={canvasWidth} height={canvasHeight}>
                  <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill="white" />
                  {clearedCells.map(key => {
                    const [cx, cy] = key.split(',').map(Number);
                    const { x, y } = geo.getPosFromCell(cx, cy);
                    return <rect key={key} x={x} y={y} width={geo.cellW} height={geo.cellH} fill="black" />;
                  })}
                </mask>
              </defs>
              <image 
                href={sourceAsset.sourceUrl || sourceAsset.url} 
                width={canvasWidth} 
                height={canvasHeight} 
                mask={`url(#mask-${uniqueId}-${sourceAsset.id.replace(/[^a-zA-Z0-9]/g, '_')})`}
                preserveAspectRatio="none"
                style={{
                  filter: `hue-rotate(${sourceAsset.hue}deg) brightness(${sourceAsset.brightness}%)`
                }}
              />
            </svg>
          </div>
        )}

        {renderGrid()}
        {entries.map(entry => {
          const sX = entry.scaleX ?? entry.scale;
          const sY = entry.scaleY ?? entry.scale;
          
          const isPrimaryDragging = interactionState.draggingId === entry.id;
          const isPartOfMultiDrag = interactionState.draggingIds.includes(entry.id);
          const isDragging = isPrimaryDragging || isPartOfMultiDrag;

          let x = entry.x;
          let y = entry.y;

          if (isDragging && interactionState.draggingPos) {
             const deltaX = interactionState.draggingPos.x - interactionState.dragOffset.originalX;
             const deltaY = interactionState.draggingPos.y - interactionState.dragOffset.originalY;
             x = entry.x + deltaX;
             y = entry.y + deltaY;
          }
          
          return (
            <div 
              key={entry.id} 
              className="absolute select-none pointer-events-none" 
              style={{ 
                left: x, 
                top: y, 
                width: entry.width * sX, 
                height: entry.height * sY, 
                filter: `hue-rotate(${entry.hue}deg) brightness(${entry.brightness}%)`, 
                zIndex: isDragging ? 50 : 5, 
                opacity: isDragging ? 0.8 : 1 
              }}
              title={`${entry.name} (${entry.width}x${entry.height})`}
            >
              <img 
                src={entry.url} 
                alt={entry.name} 
                className="w-full h-full object-fill" 
                draggable={false} 
              />
            </div>
          );
        })}

        {/* Debug Islands */}
        {debugIslands.map((isl, idx) => (
          <div
            key={`debug-isl-${idx}`}
            className="absolute border border-magenta-500 bg-magenta-500/20 pointer-events-none z-[60]"
            style={{
              left: isl.x,
              top: isl.y,
              width: isl.w,
              height: isl.h,
              borderColor: '#ff00ff',
              backgroundColor: 'rgba(255, 0, 255, 0.2)'
            }}
          >
            <span className="absolute bottom-full left-0 bg-magenta-600 text-[8px] text-white px-0.5" style={{ backgroundColor: '#ff00ff' }}>
              {isl.w}x{isl.h}
            </span>
          </div>
        ))}

        {customSelection && (
          <div className="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none z-[100] ring-1 ring-white/50" style={{ left: customSelection.x, top: customSelection.y, width: customSelection.w, height: customSelection.h }}>
            <div className="absolute bottom-full right-0 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-t-sm font-mono whitespace-nowrap shadow-lg">
              {customSelection.w} x {customSelection.h} px
            </div>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono z-50">
        {tooltip || `Zoom: ${Math.round(zoom * 100)}% (Ctrl+Scroll) | Pan: MMB | L-Click: Select | R-Drag: Move | R-Click: Clear`}
      </div>
    </div>
  );
}
