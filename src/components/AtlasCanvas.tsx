import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextureAsset, GridSettings, AtlasStatus, DragMode } from '../types';
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
  dragMode?: DragMode;
  tooltip?: string;
  sourceAsset?: TextureAsset | null;
  clearedCells?: string[];
  atlasStatus?: AtlasStatus;
  uniqueId?: string;
  disableHover?: boolean;
  debugIslands?: { x: number; y: number; w: number; h: number }[];
  addTextEnabled?: boolean;
  textColor?: string;
  lastMainAssetId?: string | null;
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
  dragMode = 'replace',
  tooltip,
  sourceAsset,
  clearedCells = [],
  atlasStatus = 'parametric',
  uniqueId = 'atlas',
  disableHover = false,
  debugIslands = [],
  addTextEnabled = false,
  textColor = '#ffffff',
  lastMainAssetId = null,
}: AtlasCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const mousePosRef = useRef({ x: 0, y: 0 });

  const [textInput, setTextInput] = useState<{ x: number, y: number, w: number, h: number, cells: string[] } | null>(null);
  const [textValue, setTextValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Submit text and rasterize
  const submitText = () => {
    if (!textInput || !textValue.trim() || !onEntriesChange) {
      setTextInput(null);
      setTextValue('');
      return;
    }

    const { x, y, w, h, cells } = textInput;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use a very clean font for tiny resolutions
    const fontStack = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    
    // Auto-size font to fit
    let fontSize = h * 0.8;
    ctx.font = `bold ${fontSize}px ${fontStack}`;
    
    // Shrink if too wide
    const metrics = ctx.measureText(textValue);
    if (metrics.width > w * 0.9) {
      fontSize = fontSize * (w * 0.9 / metrics.width);
      ctx.font = `bold ${fontSize}px ${fontStack}`;
    }

    ctx.fillStyle = textColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textValue, w / 2, h / 2);

    const newId = Math.random().toString(36).substring(2, 9);
    const newEntry: TextureAsset = {
      id: newId,
      url: canvas.toDataURL(),
      name: `Text_${textValue.substring(0, 10)}`,
      width: w,
      height: h,
      x: x,
      y: y,
      hue: 0,
      brightness: 100,
      scale: 1,
    };

    // Find entries that were in these cells to replace them (unless overlay)
    const replacedEntries = dragMode === 'overlay' ? [] : entries.filter(e => 
      cells.some(cellKey => {
        const [cx, cy] = cellKey.split(',').map(Number);
        return geo.isTileInCell(e.x, e.y, e.width, e.height, e.scale, cx, cy);
      })
    );

    const nextEntries = [...entries.filter(e => !replacedEntries.includes(e)), newEntry];
    onEntriesChange(nextEntries);

    setTextInput(null);
    setTextValue('');
  };

  useEffect(() => {
    if (textInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [textInput]);

  // Update mouse pos for zoom-to-cursor logic
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);
  
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
    const viewRect = viewportRef.current?.getBoundingClientRect();
    if (!viewRect) return null;

    const screenX = e.clientX - viewRect.left;
    const screenY = e.clientY - viewRect.top;

    // Remove pan, then divide by zoom
    const x = (screenX - panOffset.x) / zoom;
    const y = (screenY - panOffset.y) / zoom;
    
    return { x, y };
  };

  // Zoom Handler
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const viewRect = viewportRef.current?.getBoundingClientRect();
      if (!viewRect) return;

      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.1 : 0.9;
      
      setZoom(prevZoom => {
        const nextZoom = Math.min(Math.max(0.1, prevZoom * factor), 10);
        
        // Zoom relative to cursor:
        // P_screen = P_canvas * zoom + pan
        // We want P_screen to stay the same.
        // pan_new = P_screen - P_canvas * zoom_new
        
        const mouseX = e.clientX - viewRect.left;
        const mouseY = e.clientY - viewRect.top;

        // Current canvas-space coord under mouse
        const canvasX = (mouseX - panOffset.x) / prevZoom;
        const canvasY = (mouseY - panOffset.y) / prevZoom;

        const nextPanX = mouseX - canvasX * nextZoom;
        const nextPanY = mouseY - canvasY * nextZoom;

        setPanOffset({ x: nextPanX, y: nextPanY });
        return nextZoom;
      });
    };
    const el = viewportRef.current; // Use viewport as event target for better coverage
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, [panOffset]); // Need panOffset in deps to calculate next pan correctly in the functional setZoom callback or just use a ref for pan if needed, but this works if we use the current panOffset. Actually, closure on panOffset is dangerous here.

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

    // Handle Add Text Mode
    if (addTextEnabled && !interactionState.draggingId && !interactionState.isPanning) {
      const { cx, cy } = geo.getCellAtPos(pos.x, pos.y);
      const isSelected = selectedCells.includes(`${cx},${cy}`);

      let targetX, targetY, targetW, targetH, targetCells;

      if (isSelected && selectedCells.length > 0) {
        // Use full selected area
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedCells.forEach(key => {
          const [ccx, ccy] = key.split(',').map(Number);
          const p = geo.getPosFromCell(ccx, ccy);
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x + geo.cellW);
          maxY = Math.max(maxY, p.y + geo.cellH);
        });
        targetX = minX; targetY = minY;
        targetW = maxX - minX; targetH = maxY - minY;
        targetCells = [...selectedCells];
      } else {
        // Single cell
        const p = geo.getPosFromCell(cx, cy);
        targetX = p.x; targetY = p.y;
        targetW = geo.cellW; targetH = geo.cellH;
        targetCells = [`${cx},${cy}`];
      }

      setTextInput({ x: targetX, y: targetY, w: targetW, h: targetH, cells: targetCells });
      setInteractionState(prev => ({ ...prev, isSelecting: false, selectionStart: null }));
      return;
    }

    const result = strategy.onPointerUp(e, pos, interactionState, entries, {
      selectedCells,
      onSelectedCellsChange,
      onCellClick,
      onCellRightClick,
      onEntriesChange,
      onRemoveEntry,
      onCustomSelectionChange,
      dragMode,
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

        {textInput && (
          <div 
            className="absolute z-[200]" 
            style={{ 
              left: textInput.x, 
              top: textInput.y, 
              width: textInput.w, 
              height: textInput.h,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitText();
                if (e.key === 'Escape') {
                  setTextInput(null);
                  setTextValue('');
                }
              }}
              onBlur={submitText}
              className="w-full h-full bg-black/40 text-center outline-none border-2 border-blue-500 rounded-sm shadow-[0_0_15px_rgba(59,130,246,0.5)]"
              style={{ 
                color: textColor,
                fontSize: `${Math.min(textInput.h * 0.7, 100)}px`,
                fontWeight: 'bold',
                fontFamily: 'system-ui, sans-serif'
              }}
            />
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-400 font-mono z-50">
        {tooltip || `Zoom: ${Math.round(zoom * 100)}% (Scroll) | Pan: MMB | L-Click: Select | R-Drag: Move | R-Click: Clear`}
      </div>
    </div>
  );
}
