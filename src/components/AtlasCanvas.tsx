import React, { useState, useRef, useEffect } from 'react';
import { TextureTile, GridSettings } from '../types';
import { cn } from '../lib/utils';

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
  atlasSwapMode?: boolean;
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
  atlasSwapMode = false,
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  
  // Interaction State
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingPos, setDraggingPos] = useState<{ x: number, y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0, originalX: 0, originalY: 0 });
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number, y: number } | null>(null);
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const MOVE_THRESHOLD = 5; // Slightly higher for better click/drag separation

  // Coordinate Helpers
  const getCellSize = () => {
    let cellW = 0, cellH = 0, padding = 0;
    if (gridSettings.mode === 'perfect') {
      cellW = canvasWidth / gridSettings.gridX;
      cellH = canvasHeight / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
    } else {
      padding = gridSettings.padding || 0;
      cellW = gridSettings.cellSize;
      cellH = gridSettings.cellY || gridSettings.cellSize;
    }
    return { w: cellW, h: cellH, p: padding, stepX: cellW + padding * 2, stepY: cellH + padding * 2 };
  };

  const getCellAtPointer = (e: React.PointerEvent | React.MouseEvent | PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const { stepX, stepY } = getCellSize();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const cx = Math.floor(x / stepX);
    const cy = Math.floor(y / stepY);
    return { cx, cy, x, y };
  };

  const getTileAtCell = (cx: number, cy: number) => {
    const { stepX, stepY, p } = getCellSize();
    const tx = cx * stepX + p;
    const ty = cy * stepY + p;
    return tiles.find(t => Math.round(t.x) === Math.round(tx) && Math.round(t.y) === Math.round(ty));
  };

  // Zoom Logic
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(prev => Math.min(Math.max(prev * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 10));
      }
    };
    containerRef.current?.addEventListener('wheel', handleWheel, { passive: false });
    return () => containerRef.current?.removeEventListener('wheel', handleWheel);
  }, []);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const cell = getCellAtPointer(e);
    if (!cell) return;

    setDragStartMouse({ x: e.clientX, y: e.clientY });

    if (e.button === 0) { // Left Click: Selection
      setIsSelecting(true);
      setSelectionStart({ x: cell.cx, y: cell.cy });
    } 
    else if (e.button === 2) { // Right Click: Movement Preparation
      const tile = getTileAtCell(cell.cx, cell.cy);
      if (tile) {
        setDraggingId(tile.id);
        setDragOffset({
          x: cell.x - tile.x,
          y: cell.y - tile.y,
          originalX: tile.x,
          originalY: tile.y
        });
      }
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const cell = getCellAtPointer(e);
    if (!cell) return;
    setHoveredCell({ x: cell.cx, y: cell.cy });

    const dist = dragStartMouse ? Math.sqrt(Math.pow(e.clientX - dragStartMouse.x, 2) + Math.pow(e.clientY - dragStartMouse.y, 2)) : 0;

    if (isSelecting && selectionStart && onSelectedCellsChange) {
      if (dist > MOVE_THRESHOLD) {
        const minX = Math.min(selectionStart.x, cell.cx);
        const maxX = Math.max(selectionStart.x, cell.cx);
        const minY = Math.min(selectionStart.y, cell.cy);
        const maxY = Math.max(selectionStart.y, cell.cy);
        
        const newSelection = [];
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            newSelection.push(`${x},${y}`);
          }
        }
        onSelectedCellsChange(newSelection);
      }
    }

    if (draggingId && dist > MOVE_THRESHOLD) {
      const { stepX, stepY, p } = getCellSize();
      let nx = cell.x - dragOffset.x;
      let ny = cell.y - dragOffset.y;
      
      if (gridSettings.mode !== 'packing') {
        nx = Math.round((nx - p) / stepX) * stepX + p;
        ny = Math.round((ny - p) / stepY) * stepY + p;
      }
      setDraggingPos({ x: nx, y: ny });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const cell = getCellAtPointer(e);
    const dist = dragStartMouse ? Math.sqrt(Math.pow(e.clientX - dragStartMouse.x, 2) + Math.pow(e.clientY - dragStartMouse.y, 2)) : 0;

    if (e.button === 0) { // Left Button Up
      if (dist <= MOVE_THRESHOLD && cell) {
        // PRIORITY: onCellClick (for Source Atlas)
        if (onCellClick) {
          const { w, h, stepX, stepY } = getCellSize();
          onCellClick(cell.cx * stepX, cell.cy * stepY, w, h, cell.cx, cell.cy);
        } else if (onSelectedCellsChange) {
          // Toggle single cell selection
          const key = `${cell.cx},${cell.cy}`;
          const newSelection = selectedCells.includes(key) 
            ? selectedCells.filter(k => k !== key)
            : [...selectedCells, key];
          onSelectedCellsChange(newSelection);
        }
      }
      setIsSelecting(false);
      setSelectionStart(null);
    }
    else if (e.button === 2) { // Right Button Up
      if (dist <= MOVE_THRESHOLD && cell) {
        // Single Right Click: Clear
        const tile = getTileAtCell(cell.cx, cell.cy);
        if (tile && onRemoveTile) {
          onRemoveTile(tile);
        }
      } 
      else if (draggingId && draggingPos && onTilesChange) {
        // Right Drag Finish: Apply Move
        const { stepX, stepY, p } = getCellSize();
        const nx = Math.round((draggingPos.x - p) / stepX) * stepX + p;
        const ny = Math.round((draggingPos.y - p) / stepY) * stepY + p;
        
        const destTile = tiles.find(t => t.id !== draggingId && Math.round(t.x) === Math.round(nx) && Math.round(t.y) === Math.round(ny));
        
        let newTiles = [...tiles];
        if (atlasSwapMode && destTile) {
          newTiles = newTiles.map(t => {
            if (t.id === draggingId) return { ...t, x: nx, y: ny };
            if (t.id === destTile.id) return { ...t, x: dragOffset.originalX, y: dragOffset.originalY };
            return t;
          });
        } else {
          newTiles = newTiles.filter(t => t.id === draggingId || !(Math.round(t.x) === Math.round(nx) && Math.round(t.y) === Math.round(ny)));
          newTiles = newTiles.map(t => t.id === draggingId ? { ...t, x: nx, y: ny } : t);
        }
        onTilesChange(newTiles);
      }
      setDraggingId(null);
      setDraggingPos(null);
    }

    setDragStartMouse(null);
    if (e.target instanceof HTMLElement) {
      try { e.target.releasePointerCapture(e.pointerId); } catch(e) {}
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cell = getCellAtPointer(e as any);
    if (!cell || !onDrop) return;
    const tileId = e.dataTransfer.getData('text/plain');
    onDrop(tileId, cell.x, cell.y);
  };

  // Rendering
  const renderGrid = () => {
    if (gridSettings.mode === 'packing') return null;
    const { w, h, stepX, stepY, p } = getCellSize();
    const cols = Math.floor(canvasWidth / stepX);
    const rows = Math.floor(canvasHeight / stepY);

    const lines = [];
    for (let i = 0; i <= cols; i++) lines.push(<div key={`v-${i}`} className="absolute top-0 bottom-0 border-r border-white/5" style={{ left: i * stepX }} />);
    for (let i = 0; i <= rows; i++) lines.push(<div key={`h-${i}`} className="absolute left-0 right-0 border-b border-white/5" style={{ top: i * stepY }} />);

    selectedCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      lines.push(<div key={`sel-${key}`} className="absolute bg-yellow-500/20 border border-yellow-500/50 pointer-events-none z-10" style={{ left: cx * stepX + p, top: cy * stepY + p, width: w, height: h }} />);
    });

    if (hoveredCell) {
      lines.push(<div key="hover" className="absolute bg-blue-500/10 border border-blue-500/30 pointer-events-none z-20" style={{ left: hoveredCell.x * stepX, top: hoveredCell.y * stepY, width: stepX, height: stepY }} />);
    }

    return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
  };

  return (
    <div 
      className={cn("flex-1 h-full bg-zinc-950 relative overflow-hidden checkerboard", className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={e => e.preventDefault()}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div 
        ref={containerRef}
        className="relative origin-top-left shadow-2xl transition-transform duration-75 ease-out"
        style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
      >
        <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundColor: gridSettings.clearColor }} />
        {renderGrid()}
        {tiles.map(tile => (
          <div
            key={tile.id}
            className="absolute select-none pointer-events-none"
            style={{
              left: draggingId === tile.id && draggingPos ? draggingPos.x : tile.x,
              top: draggingId === tile.id && draggingPos ? draggingPos.y : tile.y,
              width: tile.width * tile.scale,
              height: tile.height * tile.scale,
              filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`,
              zIndex: draggingId === tile.id ? 50 : 5,
              opacity: draggingId === tile.id ? 0.8 : 1
            }}
          >
            <img src={tile.url} alt={tile.name} className="w-full h-full object-fill" draggable={false} />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono z-50">
        Zoom: {Math.round(zoom * 100)}% (Ctrl+Scroll) | L-Click: Select | R-Drag: Move | R-Click: Clear
      </div>
    </div>
  );
}
