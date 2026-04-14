import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextureTile, GridSettings } from '../types';
import { cn, hexToRgb } from '../lib/utils';
import { GridGeometry } from '../lib/GridGeometry';

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
  atlasSwapMode?: boolean;
  tooltip?: string;
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
  atlasSwapMode = false,
  tooltip,
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  
  const geo = useMemo(() => 
    new GridGeometry(gridSettings, canvasWidth, canvasHeight),
    [gridSettings, canvasWidth, canvasHeight]
  );
  
  // Interaction State
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingPos, setDraggingPos] = useState<{ x: number, y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0, originalX: 0, originalY: 0 });
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number, y: number } | null>(null);
  const [dragStartCanvas, setDragStartCanvas] = useState<{ x: number, y: number } | null>(null);
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [emptyCells, setEmptyCells] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<{ cx: number, cy: number } | null>(null);

  const MOVE_THRESHOLD = 5; 

  const getPointerPos = (e: React.PointerEvent | React.MouseEvent | PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    return { x, y };
  };

  const getTileAtCell = (cx: number, cy: number) => {
    return tiles.find(t => geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
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
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const { cx, cy } = geo.getCellAtPos(x, y);

    console.log(`[Forge] PointerDown: Button ${e.button} at cell (${cx},${cy})`);

    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartCanvas({ x, y });

    if (e.button === 0) { // Left Click: Selection
      setIsSelecting(true);
      setSelectionStart({ x: cx, y: cy });
      if (onCustomSelectionChange) onCustomSelectionChange(null);
    } 
    else if (e.button === 2) { // Right Click: Movement or Clear
      e.preventDefault();
      setIsSelecting(false); 
      const tile = getTileAtCell(cx, cy);
      if (tile) {
        console.log(`[Forge] Matched tile: ${tile.name}`);
        setDraggingId(tile.id);
        setDragOffset({ x: x - tile.x, y: y - tile.y, originalX: tile.x, originalY: tile.y });
      } else {
        console.log(`[Forge] No tile found at cell (${cx},${cy})`);
      }
    }
    
    if (e.target instanceof HTMLElement) {
      try { e.target.setPointerCapture(e.pointerId); } catch(err) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    if (!pos) return;
    
    const { cx, cy } = geo.getCellAtPos(pos.x, pos.y);

    setHoveredCell({ cx, cy });

    if (!dragStartCanvas) return;

    const dist = dragStartMouse ? Math.sqrt(Math.pow(e.clientX - dragStartMouse.x, 2) + Math.pow(e.clientY - dragStartMouse.y, 2)) : 0;

    if (isSelecting) {
      if (onCustomSelectionChange) {
        const rx = Math.round(Math.min(dragStartCanvas.x, pos.x));
        const ry = Math.round(Math.min(dragStartCanvas.y, pos.y));
        const rw = Math.round(Math.abs(pos.x - dragStartCanvas.x));
        const rh = Math.round(Math.abs(pos.y - dragStartCanvas.y));
        if (dist > MOVE_THRESHOLD) onCustomSelectionChange({ x: rx, y: ry, w: rw, h: rh });
      } else if (selectionStart && onSelectedCellsChange) {
        if (dist > MOVE_THRESHOLD) {
          const minX = Math.min(selectionStart.x, cx);
          const maxX = Math.max(selectionStart.x, cx);
          const minY = Math.min(selectionStart.y, cy);
          const maxY = Math.max(selectionStart.y, cy);
          const newSelection = [];
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) newSelection.push(`${x},${y}`);
          onSelectedCellsChange(newSelection);
        }
      }
    }

    if (draggingId && dist > MOVE_THRESHOLD) {
      let nx = pos.x - dragOffset.x;
      let ny = pos.y - dragOffset.y;
      if (gridSettings.mode !== 'packing') {
        const snapped = geo.snap(nx + geo.cellW / 2, ny + geo.cellH / 2);
        nx = snapped.x;
        ny = snapped.y;
      }
      setDraggingPos({ x: nx, y: ny });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    const dist = dragStartMouse ? Math.sqrt(Math.pow(e.clientX - dragStartMouse.x, 2) + Math.pow(e.clientY - dragStartMouse.y, 2)) : 0;

    if (e.button === 0) { // Left Button Up
      if (isSelecting && onCustomSelectionChange && dist > MOVE_THRESHOLD) {
        onCustomSelectionChange(customSelection, { x: e.clientX, y: e.clientY });
      }
      else if (dist <= MOVE_THRESHOLD && pos) {
        const { cx, cy } = geo.getCellAtPos(pos.x, pos.y);
        const cellPos = geo.getPosFromCell(cx, cy);
        if (onCellClick) onCellClick(cellPos.x, cellPos.y, geo.cellW, geo.cellH, cx, cy);
        else if (onSelectedCellsChange) {
          const key = `${cx},${cy}`;
          onSelectedCellsChange(selectedCells.includes(key) ? selectedCells.filter(k => k !== key) : [...selectedCells, key]);
        }
      }
      setIsSelecting(false);
      setSelectionStart(null);
    }
    else if (e.button === 2) { // Right Button Up
      if (dist <= MOVE_THRESHOLD && pos) {
        const { cx, cy } = geo.getCellAtPos(pos.x, pos.y);
        const cellPos = geo.getPosFromCell(cx, cy);
        
        if (onCellRightClick) {
          onCellRightClick(cellPos.x, cellPos.y, geo.cellW, geo.cellH, cx, cy);
        } else if (onTilesChange) {
          const newTiles = tiles.filter(t => !geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
          if (newTiles.length !== tiles.length) onTilesChange(newTiles);
        } else if (onRemoveTile) {
          const tile = getTileAtCell(cx, cy);
          if (tile) onRemoveTile(tile);
        }
      } 
      else if (draggingId && draggingPos && onTilesChange) {
        const nx = draggingPos.x;
        const ny = draggingPos.y;
        const { cx: targetCX, cy: targetCY } = geo.getCellAtPos(nx + geo.cellW / 2, ny + geo.cellH / 2);

        // Logical Overwrite: Purge any tile that occupies this slot
        let newTiles = tiles.filter(t => {
          if (t.id === draggingId) return true;
          return !geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, targetCX, targetCY);
        });

        if (atlasSwapMode) {
          const destTile = getTileAtCell(targetCX, targetCY);
          if (destTile) {
            newTiles = newTiles.map(t => {
              if (t.id === draggingId) return { ...t, x: nx, y: ny };
              if (t.id === destTile.id) return { ...t, x: dragOffset.originalX, y: dragOffset.originalY };
              return t;
            });
          } else {
            newTiles = newTiles.map(t => t.id === draggingId ? { ...t, x: nx, y: ny } : t);
          }
        } else {
          newTiles = newTiles.map(t => t.id === draggingId ? { ...t, x: nx, y: ny } : t);
        }
        onTilesChange(newTiles);
      }
      setDraggingId(null);
      setDraggingPos(null);
    }

    setDragStartMouse(null);
    setDragStartCanvas(null);
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

    emptyCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      const { x, y } = geo.getPosFromCell(cx, cy);
      lines.push(<div key={`empty-${key}`} className="absolute border border-dashed border-white/10 pointer-events-none" style={{ left: x, top: y, width: cellW, height: cellH }} />);
    });
    selectedCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      const { x, y } = geo.getPosFromCell(cx, cy);
      lines.push(<div key={`sel-${key}`} className="absolute bg-yellow-500/20 border border-yellow-500/50 pointer-events-none z-10" style={{ left: x, top: y, width: cellW, height: cellH }} />);
    });
    return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
  };

  return (
    <div className={cn("flex-1 h-full bg-zinc-950 relative overflow-hidden checkerboard", className)} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={() => setHoveredCell(null)} onContextMenu={e => e.preventDefault()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div ref={containerRef} className="relative origin-top-left shadow-2xl transition-transform duration-75 ease-out" style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}>
        <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundColor: gridSettings.clearColor }} />
        {renderGrid()}
        {tiles.map(tile => (
          <div key={tile.id} className="absolute select-none pointer-events-none" style={{ left: draggingId === tile.id && draggingPos ? draggingPos.x : tile.x, top: draggingId === tile.id && draggingPos ? draggingPos.y : tile.y, width: tile.width * tile.scale, height: tile.height * tile.scale, filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`, zIndex: draggingId === tile.id ? 50 : 5, opacity: draggingId === tile.id ? 0.8 : 1 }}>
            <img src={tile.url} alt={tile.name} className="w-full h-full object-fill" draggable={false} />
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
        {tooltip || `Zoom: ${Math.round(zoom * 100)}% (Ctrl+Scroll) | L-Click: Select | R-Drag: Move | R-Click: Clear`}
      </div>
    </div>
  );
}
