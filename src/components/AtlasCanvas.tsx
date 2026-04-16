import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextureTile, GridSettings, AtlasStatus } from '../types';
import { cn, hexToRgb } from '../lib/utils';
import { GridGeometry } from '../lib/GridGeometry';
import { InteractionState, DefaultInteractionStrategy } from '../lib/Interactions';

interface AtlasCanvasProps {
  tiles: TextureTile[];
  onTilesChange?: (tiles: TextureTile[]) => void;
  onSelectTile: (id: string | null) => void;
  onRemoveTile?: (tile: TextureTile) => void;
  gridSettings: GridSettings;
  onCellClick?: (x: number, y: number, width: number, height: number, cx: number, cy: number) => void;
  onCellRightClick?: (x: number, y: number, width: number, height: number, cx: number, cy: number) => void;
  onDrop?: (tileId: string, x: number, y: number) => void;
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
  sourceTile?: TextureTile | null;
  clearedCells?: string[];
  atlasStatus?: AtlasStatus;
}

export function AtlasCanvas({
  tiles,
  onTilesChange,
  onSelectTile,
  onRemoveTile,
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
  sourceTile,
  clearedCells = [],
  atlasStatus = 'parametric',
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  
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
    draggingPos: null,
    dragOffset: { x: 0, y: 0, originalX: 0, originalY: 0 },
    hoveredCell: null
  });

  const getPointerPos = (e: React.PointerEvent | React.MouseEvent | PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
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

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;

    const updates = strategy.onPointerDown(e, pos, tiles);
    setInteractionState(prev => ({ ...prev, ...updates }));
    
    if (e.target instanceof HTMLElement) {
      try { e.target.setPointerCapture(e.pointerId); } catch(err) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;
    
    const updates = strategy.onPointerMove(e, pos, interactionState, tiles);
    setInteractionState(prev => ({ ...prev, ...updates }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;

    const result = strategy.onPointerUp(e, pos, interactionState, tiles, {
      selectedCells,
      onSelectedCellsChange,
      onCellClick,
      onCellRightClick,
      onTilesChange,
      onRemoveTile,
      onCustomSelectionChange,
      atlasSwapMode
    });

    setInteractionState(prev => ({ ...prev, ...result.state }));

    // Execute callbacks
    if (result.onMaterialize && onMaterialize) {
      onMaterialize(result.onMaterialize.cx, result.onMaterialize.cy, result.onMaterialize.reason, result.onMaterialize.draggingPos);
    }
    if (result.onTilesChange && onTilesChange) onTilesChange(result.onTilesChange);
    if (result.onSelectedCellsChange && onSelectedCellsChange) onSelectedCellsChange(result.onSelectedCellsChange);
    if (result.onCellClick && onCellClick) {
      const c = result.onCellClick;
      onCellClick(c.x, c.y, c.w, c.h, c.cx, c.cy);
    }
    if (result.onCellRightClick && onCellRightClick) {
      const c = result.onCellRightClick;
      onCellRightClick(c.x, c.y, c.w, c.h, c.cx, c.cy);
    }
    if (result.onRemoveTile && onRemoveTile) onRemoveTile(result.onRemoveTile);

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
    for (let i = 0; i <= cols; i++) lines.push(<div key={`v-${i}`} className="absolute top-0 bottom-0 border-r border-white/5" style={{ left: i * stepX }} />);
    for (let i = 0; i <= rows; i++) lines.push(<div key={`h-${i}`} className="absolute left-0 right-0 border-b border-white/5" style={{ top: i * stepY }} />);
    
    if (hoveredCell && !isSelecting && !draggingId) {
      const { x, y } = geo.getPosFromCell(hoveredCell.cx, hoveredCell.cy);
      lines.push(
        <div 
          key="hover" 
          className="absolute bg-white/5 border border-white/20 pointer-events-none z-10" 
          style={{ left: x, top: y, width: cellW, height: cellH }} 
        />
      );
    }

    selectedCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      const { x, y } = geo.getPosFromCell(cx, cy);
      lines.push(<div key={`sel-${key}`} className="absolute bg-yellow-500/20 border border-yellow-500/50 pointer-events-none z-10" style={{ left: x, top: y, width: cellW, height: cellH }} />);
    });
    return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
  };

  return (
    <div className={cn("flex-1 h-full bg-zinc-950 relative overflow-hidden checkerboard", className)} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={() => setInteractionState(prev => ({ ...prev, hoveredCell: null }))} onContextMenu={e => e.preventDefault()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div ref={containerRef} className="relative origin-top-left shadow-2xl transition-transform duration-75 ease-out" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}>
        <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundColor: gridSettings.clearColor }} />
        
        {/* Background Source Image with Holes */}
        {sourceTile && atlasStatus !== 'baked' && (
          <div className="absolute inset-0 pointer-events-none z-[1]">
            <svg width={canvasWidth} height={canvasHeight} className="absolute inset-0 w-full h-full">
              <defs>
                <mask id={`mask-${sourceTile.id}`} x="0" y="0" width={canvasWidth} height={canvasHeight}>
                  <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill="white" />
                  {clearedCells.map(key => {
                    const [cx, cy] = key.split(',').map(Number);
                    const { x, y } = geo.getPosFromCell(cx, cy);
                    return <rect key={key} x={x} y={y} width={geo.cellW} height={geo.cellH} fill="black" />;
                  })}
                </mask>
              </defs>
              <image 
                href={sourceTile.sourceUrl || sourceTile.url} 
                width={canvasWidth} 
                height={canvasHeight} 
                mask={`url(#mask-${sourceTile.id})`}
                preserveAspectRatio="none"
              />
            </svg>
          </div>
        )}

        {renderGrid()}
        {tiles.map(tile => {
          const sX = tile.scaleX ?? tile.scale;
          const sY = tile.scaleY ?? tile.scale;
          const isDragging = interactionState.draggingId === tile.id;
          const x = isDragging && interactionState.draggingPos ? interactionState.draggingPos.x : tile.x;
          const y = isDragging && interactionState.draggingPos ? interactionState.draggingPos.y : tile.y;
          
          return (
            <div 
              key={tile.id} 
              className="absolute select-none pointer-events-none" 
              style={{ 
                left: x, 
                top: y, 
                width: tile.width * sX, 
                height: tile.height * sY, 
                filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`, 
                zIndex: isDragging ? 50 : 5, 
                opacity: isDragging ? 0.8 : 1 
              }}
            >
              <img 
                src={tile.url} 
                alt={tile.name} 
                className="w-full h-full object-fill" 
                draggable={false} 
              />
            </div>
          );
        })}
        {customSelection && (
          <div className="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none z-[100] ring-1 ring-white/50" style={{ left: customSelection.x, top: customSelection.y, width: customSelection.w, height: customSelection.h }}>
            <div className="absolute bottom-full right-0 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-t-sm font-mono whitespace-nowrap shadow-lg">
              {customSelection.w} x {customSelection.h} px
            </div>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono z-50">
        {tooltip || `Zoom: ${Math.round(zoom * 100)}% (Ctrl+Scroll) | L-Click: Select | R-Drag: Move | R-Click: Clear`}
      </div>
    </div>
  );
}
