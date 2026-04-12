import React, { useState, useRef, useEffect } from 'react';
import { TextureTile, GridSettings } from '../types';
import { cn } from '../lib/utils';

interface AtlasCanvasProps {
  tiles: TextureTile[];
  onTilesChange?: (tiles: TextureTile[]) => void;
  selectedTileId: string | null;
  onSelectTile: (id: string | null) => void;
  onRemoveTile?: (tile: TextureTile) => void;
  gridSettings: GridSettings;
  onCellClick?: (x: number, y: number, width: number, height: number, cx: number, cy: number) => void;
  onDrop?: (tileId: string, x: number, y: number) => void;
  className?: string;
  canvasSize?: number;
  selectedCells?: string[];
  onSelectedCellsChange?: (cells: string[]) => void;
  atlasSwapMode?: boolean;
}

export function AtlasCanvas({
  tiles,
  onTilesChange,
  selectedTileId,
  onSelectTile,
  onRemoveTile,
  gridSettings,
  onCellClick,
  onDrop,
  className,
  canvasSize = 2048,
  selectedCells = [],
  onSelectedCellsChange,
  atlasSwapMode = false,
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0, originalX: 0, originalY: 0 });
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [emptyCells, setEmptyCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [draggingPos, setDraggingPos] = useState<{ x: number; y: number } | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!onDrop) return;
    
    const tileId = e.dataTransfer.getData('text/plain');
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    onDrop(tileId, x, y);
  };

  // Handle Zoom
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

  // Detect empty cells
  useEffect(() => {
    const detectEmpty = async () => {
      let cellW = 0, cellH = 0;
      let cols = 0, rows = 0;

      if (gridSettings.mode === 'perfect') {
        cols = gridSettings.gridX;
        rows = gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY;
        cellW = canvasSize / cols;
        cellH = canvasSize / rows;
      } else if (gridSettings.mode === 'fixed') {
        const innerW = gridSettings.cellSize;
        const innerH = gridSettings.cellY || gridSettings.cellSize;
        const padding = gridSettings.padding || 0;
        cellW = innerW + padding * 2;
        cellH = innerH + padding * 2;
        cols = Math.floor(canvasSize / cellW);
        rows = Math.floor(canvasSize / cellH);
      }

      if (cellW < 16 || cellH < 16) return;

      const newEmptyCells = new Set<string>();
      
      const offscreen = document.createElement('canvas');
      offscreen.width = canvasSize;
      offscreen.height = canvasSize;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.fillStyle = gridSettings.clearColor;
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (const tile of tiles) {
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.src = tile.url;
        });
        ctx.save();
        ctx.translate(tile.x, tile.y);
        ctx.filter = `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`;
        ctx.drawImage(img, 0, 0, tile.width * tile.scale, tile.height * tile.scale);
        ctx.restore();
      }

      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const x = cx * cellW;
          const y = cy * cellH;
          
          const checkW = cellW * 0.5;
          const checkH = cellH * 0.5;
          const startX = x + (cellW - checkW) / 2;
          const startY = y + (cellH - checkH) / 2;
          
          const pixels: {x: number, y: number}[] = [];
          for (let i = 0; i < checkW; i++) pixels.push({ x: startX + i, y: startY + checkH / 2 });
          for (let i = 0; i < checkH; i++) pixels.push({ x: startX + checkW / 2, y: startY + i });
          for (let i = 0; i < checkW; i++) {
            pixels.push({ x: startX + i, y: startY });
            pixels.push({ x: startX + i, y: startY + checkH - 1 });
          }
          for (let i = 0; i < checkH; i++) {
            pixels.push({ x: startX, y: startY + i });
            pixels.push({ x: startX + checkW - 1, y: startY + i });
          }

          let firstColor: Uint8ClampedArray | null = null;
          let isEmpty = true;

          for (const p of pixels) {
            const data = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
            if (!firstColor) {
              firstColor = data;
            } else {
              if (data[0] !== firstColor[0] || data[1] !== firstColor[1] || data[2] !== firstColor[2]) {
                isEmpty = false;
                break;
              }
            }
          }

          if (isEmpty) {
            newEmptyCells.add(`${cx},${cy}`);
          }
        }
      }
      setEmptyCells(newEmptyCells);
    };

    detectEmpty();
  }, [tiles, gridSettings, canvasSize]);

  // Auto-zoom to fit
  useEffect(() => {
    if (tiles.length > 0 && containerRef.current) {
      const parent = containerRef.current.parentElement;
      if (parent) {
        const pRect = parent.getBoundingClientRect();
        const scale = Math.min(pRect.width / canvasSize, pRect.height / canvasSize) * 0.95; 
        setZoom(scale);
      }
    }
  }, [tiles.length === 0]);

  const handlePointerDown = (e: React.PointerEvent, tile: TextureTile) => {
    if (!onTilesChange) return;
    e.stopPropagation();
    if (e.button === 2) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    onSelectTile(tile.id);
    setDraggingId(tile.id);
    setDraggingPos({ x: tile.x, y: tile.y });
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - tile.x,
      y: (e.clientY - rect.top) / zoom - tile.y,
      originalX: tile.x,
      originalY: tile.y,
    });
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left) / zoom;
    const mouseY = (e.clientY - rect.top) / zoom;

    // Update Hovered Cell
    let cellW = 0, cellH = 0;
    if (gridSettings.mode === 'perfect') {
      cellW = canvasSize / gridSettings.gridX;
      cellH = canvasSize / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
    } else if (gridSettings.mode === 'fixed') {
      cellW = gridSettings.cellSize + (gridSettings.padding || 0) * 2;
      cellH = (gridSettings.cellY || gridSettings.cellSize) + (gridSettings.padding || 0) * 2;
    }

    if (cellW >= 16 && cellH >= 16) {
      const cx = Math.floor(mouseX / cellW);
      const cy = Math.floor(mouseY / cellH);
      
      // Check bounds
      const maxCX = gridSettings.mode === 'perfect' ? gridSettings.gridX - 1 : Math.floor(canvasSize / cellW) - 1;
      const maxCY = gridSettings.mode === 'perfect' ? (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY) - 1 : Math.floor(canvasSize / cellH) - 1;

      if (cx >= 0 && cx <= maxCX && cy >= 0 && cy <= maxCY && mouseX >= 0 && mouseX <= canvasSize && mouseY >= 0 && mouseY <= canvasSize) {
        setHoveredCell({ x: cx, y: cy });
        
        if (isSelecting && selectionStart && onSelectedCellsChange) {
          const startCX = selectionStart.x;
          const startCY = selectionStart.y;
          const minCX = Math.min(startCX, cx);
          const maxCX_sel = Math.max(startCX, cx);
          const minCY = Math.min(startCY, cy);
          const maxCY_sel = Math.max(startCY, cy);
          
          const newSelection = [];
          for (let y = minCY; y <= maxCY_sel; y++) {
            for (let x = minCX; x <= maxCX_sel; x++) {
              newSelection.push(`${x},${y}`);
            }
          }
          onSelectedCellsChange(newSelection);
        }
      } else {
        setHoveredCell(null);
      }
    }

    // Handle Dragging
    if (draggingId) {
      let newX = mouseX - dragOffset.x;
      let newY = mouseY - dragOffset.y;
      
      // Snap to grid if dragging and not in packing mode
      if (gridSettings.mode !== 'packing' && cellW > 0 && cellH > 0) {
        newX = Math.round(newX / cellW) * cellW;
        newY = Math.round(newY / cellH) * cellH;
      } else if (gridSettings.mode === 'packing') {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }
      
      setDraggingPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingId && onTilesChange && draggingPos) {
      const tile = tiles.find(t => t.id === draggingId);
      if (tile) {
        let cellW = 0, cellH = 0;
        let padding = 0;
        if (gridSettings.mode === 'perfect') {
          cellW = canvasSize / gridSettings.gridX;
          cellH = canvasSize / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
        } else if (gridSettings.mode === 'fixed') {
          padding = gridSettings.padding || 0;
          cellW = gridSettings.cellSize + padding * 2;
          cellH = (gridSettings.cellY || gridSettings.cellSize) + padding * 2;
        }

        const newX = draggingPos.x;
        const newY = draggingPos.y;
        const oldX = dragOffset.originalX;
        const oldY = dragOffset.originalY;

        if (oldX !== newX || oldY !== newY) {
          // Find tile at destination
          const destTile = tiles.find(t => t.id !== draggingId && Math.round(t.x) === Math.round(newX) && Math.round(t.y) === Math.round(newY));
          
          let newTiles = [...tiles];
          if (atlasSwapMode && destTile) {
            // Swap
            newTiles = newTiles.map(t => {
              if (t.id === draggingId) return { ...t, x: newX, y: newY };
              if (t.id === destTile.id) return { ...t, x: oldX, y: oldY };
              return t;
            });
          } else {
            // Clear old spot
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = gridSettings.clearColor;
              ctx.fillRect(0, 0, 1, 1);
              const clearUrl = canvas.toDataURL();
              
              const clearTile: TextureTile = {
                id: Math.random().toString(36).substring(2, 9),
                url: clearUrl,
                name: 'Clear Color',
                width: cellW,
                height: cellH,
                x: oldX,
                y: oldY,
                hue: 0,
                brightness: 100,
                scale: 1,
                isCrop: true,
              };
              
              // Remove existing at destination if any
              newTiles = newTiles.filter(t => t.id === draggingId || !(Math.round(t.x) === Math.round(newX) && Math.round(t.y) === Math.round(newY)));
              newTiles = newTiles.map(t => t.id === draggingId ? { ...t, x: newX, y: newY } : t);
              newTiles.push(clearTile);
            }
          }
          onTilesChange(newTiles);
        }
      }
      setDraggingId(null);
      setDraggingPos(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (isSelecting) {
      setIsSelecting(false);
      setSelectionStart(null);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    if (gridSettings.mode === 'packing') {
      onSelectTile(null);
      return;
    }
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left) / zoom;
    const mouseY = (e.clientY - rect.top) / zoom;

    let cellW = 0, cellH = 0;
    if (gridSettings.mode === 'perfect') {
      cellW = canvasSize / gridSettings.gridX;
      cellH = canvasSize / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
    } else if (gridSettings.mode === 'fixed') {
      cellW = gridSettings.cellSize + (gridSettings.padding || 0) * 2;
      cellH = (gridSettings.cellY || gridSettings.cellSize) + (gridSettings.padding || 0) * 2;
    }

    if (cellW >= 16 && cellH >= 16) {
      const cx = Math.floor(mouseX / cellW);
      const cy = Math.floor(mouseY / cellH);
      
      if (onSelectedCellsChange) {
        onSelectedCellsChange([`${cx},${cy}`]);
      }
      setIsSelecting(true);
      setSelectionStart({ x: cx, y: cy });
    }
    
    onSelectTile(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (draggingId || isSelecting) return;
    
    // Left click handles selection
    if (e.button === 0) {
      if (onCellClick && hoveredCell) {
        let cellW = 0, cellH = 0;
        let padding = 0;
        if (gridSettings.mode === 'perfect') {
          cellW = canvasSize / gridSettings.gridX;
          cellH = canvasSize / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
        } else if (gridSettings.mode === 'fixed') {
          padding = gridSettings.padding || 0;
          cellW = gridSettings.cellSize;
          cellH = gridSettings.cellY || gridSettings.cellSize;
        }
        const stepX = cellW + padding * 2;
        const stepY = cellH + padding * 2;
        onCellClick(hoveredCell.x * stepX, hoveredCell.y * stepY, cellW, cellH, hoveredCell.x, hoveredCell.y);
      } else if (hoveredCell && onSelectedCellsChange && gridSettings.mode !== 'packing') {
        const cellKey = `${hoveredCell.x},${hoveredCell.y}`;
        if (selectedCells.includes(cellKey)) {
          onSelectedCellsChange(selectedCells.filter(k => k !== cellKey));
        } else {
          onSelectedCellsChange([...selectedCells, cellKey]);
        }
      }
    }
    
    onSelectTile(null);
  };

  const handleClearCell = () => {
    if (onTilesChange && hoveredCell && gridSettings.mode !== 'packing') {
      // Clear cell logic for MainAtlas
      let cellW = 0, cellH = 0;
      let padding = 0;
      if (gridSettings.mode === 'perfect') {
        cellW = canvasSize / gridSettings.gridX;
        cellH = canvasSize / (gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY);
      } else if (gridSettings.mode === 'fixed') {
        padding = gridSettings.padding || 0;
        cellW = gridSettings.cellSize;
        cellH = gridSettings.cellY || gridSettings.cellSize;
      }

      const stepX = cellW + padding * 2;
      const stepY = cellH + padding * 2;
      const x = hoveredCell.x * stepX + padding;
      const y = hoveredCell.y * stepY + padding;

      const filtered = tiles.filter(t => {
        const tx = Math.round(t.x);
        const ty = Math.round(t.y);
        const tw = Math.round(t.width * t.scale);
        const th = Math.round(t.height * t.scale);
        
        const isExactMatch = (tx === Math.round(x) && ty === Math.round(y) && tw === Math.round(cellW) && th === Math.round(cellH));
        return !isExactMatch;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = gridSettings.clearColor;
        ctx.fillRect(0, 0, 1, 1);
        const clearUrl = canvas.toDataURL();
        
        onTilesChange([...filtered, {
          id: Math.random().toString(36).substring(2, 9),
          url: clearUrl,
          name: 'Clear Color',
          width: cellW,
          height: cellH,
          x,
          y,
          hue: 0,
          brightness: 100,
          scale: 1,
        }]);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tile?: TextureTile) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (tile && onRemoveTile) {
      onRemoveTile(tile);
    } else {
      handleClearCell();
    }
  };

  // Grid Lines
  const renderGrid = () => {
    if (gridSettings.mode === 'packing') return null;
    let cellW = 0, cellH = 0;
    let cols = 0, rows = 0;

    if (gridSettings.mode === 'perfect') {
      cols = gridSettings.gridX;
      rows = gridSettings.keepSquare ? gridSettings.gridX : gridSettings.gridY;
      cellW = canvasSize / cols;
      cellH = canvasSize / rows;
    } else if (gridSettings.mode === 'fixed') {
      cellW = gridSettings.cellSize + (gridSettings.padding || 0) * 2;
      cellH = (gridSettings.cellY || gridSettings.cellSize) + (gridSettings.padding || 0) * 2;
      cols = Math.floor(canvasSize / cellW);
      rows = Math.floor(canvasSize / cellH);
    }

    if (cellW < 16 || cellH < 16) return null;

    const lines = [];
    // Vertical lines
    for (let i = 0; i <= cols; i++) {
      lines.push(<div key={`v-${i}`} className="absolute top-0 bottom-0 border-r border-white/10" style={{ left: i * cellW }} />);
    }
    // Horizontal lines
    for (let i = 0; i <= rows; i++) {
      lines.push(<div key={`h-${i}`} className="absolute left-0 right-0 border-b border-white/10" style={{ top: i * cellH }} />);
    }

    // Empty cell indicators
    emptyCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      lines.push(
        <div 
          key={`empty-${key}`}
          className="absolute border border-white/5 pointer-events-none"
          style={{
            left: cx * cellW,
            top: cy * cellH,
            width: cellW,
            height: cellH,
          }}
        />
      );
    });

    // Selection Highlight
    selectedCells.forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      lines.push(
        <div 
          key={`selected-${key}`}
          className="absolute bg-yellow-500/30 border-2 border-yellow-500 pointer-events-none z-10"
          style={{
            left: cx * cellW,
            top: cy * cellH,
            width: cellW,
            height: cellH,
          }}
        />
      );
    });

    // Highlight
    if (hoveredCell) {
      const innerW = gridSettings.mode === 'fixed' ? gridSettings.cellSize : cellW;
      const innerH = gridSettings.mode === 'fixed' ? (gridSettings.cellY || gridSettings.cellSize) : cellH;
      const padding = gridSettings.mode === 'fixed' ? (gridSettings.padding || 0) : 0;

      lines.push(
        <div 
          key="highlight-outer"
          className="absolute border border-blue-500/30 pointer-events-none z-20"
          style={{
            left: hoveredCell.x * cellW,
            top: hoveredCell.y * cellH,
            width: cellW,
            height: cellH,
          }}
        />
      );

      lines.push(
        <div 
          key="highlight-inner"
          className="absolute bg-blue-500/20 border-2 border-blue-500 pointer-events-none z-20"
          style={{
            left: hoveredCell.x * cellW + padding,
            top: hoveredCell.y * cellH + padding,
            width: innerW,
            height: innerH,
          }}
        />
      );
    }

    return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
  };

  return (
    <div 
      className={cn("flex-1 h-full bg-zinc-950 relative overflow-hidden checkerboard", className)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerDown={handleCanvasPointerDown}
      onClick={handleClick}
      onContextMenu={(e) => handleContextMenu(e)}
      onMouseLeave={() => {
        setHoveredCell(null);
        setIsSelecting(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div 
        ref={containerRef}
        className="relative origin-top-left"
        style={{ 
          width: canvasSize, 
          height: canvasSize,
          transform: `scale(${zoom})`,
          backgroundColor: gridSettings.clearColor,
        }}
      >
        {renderGrid()}
        
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className={cn(
              "absolute cursor-grab active:cursor-grabbing select-none",
              selectedTileId === tile.id && "ring-2 ring-blue-500 ring-offset-1 ring-offset-zinc-950 z-10"
            )}
            style={{
              left: draggingId === tile.id && draggingPos ? draggingPos.x : tile.x,
              top: draggingId === tile.id && draggingPos ? draggingPos.y : tile.y,
              width: tile.width * tile.scale,
              height: tile.height * tile.scale,
              filter: `hue-rotate(${tile.hue}deg) brightness(${tile.brightness}%)`,
              zIndex: draggingId === tile.id ? 50 : (selectedTileId === tile.id ? 10 : 1)
            }}
            onPointerDown={(e) => handlePointerDown(e, tile)}
            onPointerUp={handlePointerUp}
            onContextMenu={(e) => handleContextMenu(e, tile)}
          >
            <img 
              src={tile.url} 
              alt={tile.name}
              className="w-full h-full object-fill pointer-events-none"
              draggable={false}
            />
          </div>
        ))}
      </div>
      
      {/* Zoom Indicator */}
      <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono pointer-events-none z-50">
        Zoom: {Math.round(zoom * 100)}% (Ctrl+Scroll)
      </div>
    </div>
  );
}
