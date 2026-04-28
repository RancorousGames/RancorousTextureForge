import { TextureAsset, DragMode } from '../types';
import { GridGeometry } from './GridGeometry';

export interface InteractionState {
  isSelecting: boolean;
  selectionStart: { x: number, y: number } | null;
  draggingId: string | null;
  draggingIds: string[];
  draggingPos: { x: number, y: number } | null;
  dragOffset: { x: number, y: number, originalX: number, originalY: number };
  hoveredCell: { cx: number, cy: number } | null;
  isPanning: boolean;
  panStart: { x: number, y: number } | null;
}

export interface InteractionResult {
  state: Partial<InteractionState>;
  onCustomSelectionChange?: { rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number } };
  onSelectedCellsChange?: string[];
  onEntriesChange?: TextureAsset[];
  onRemoveEntry?: TextureAsset;
  onCellClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onCellRightClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onMaterialize?: { cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number } };
  onPan?: { dx: number, dy: number };
}

export interface InteractionCallbacks {
  onCustomSelectionChange?: (rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number }) => void;
  onSelectedCellsChange?: (cells: string[]) => void;
  selectedCells?: string[];
  onCellClick?: (x: number, y: number, w: number, h: number, cx: number, cy: number) => void;
  onCellRightClick?: (x: number, y: number, w: number, h: number, cx: number, cy: number) => void;
  dragMode?: DragMode;
}

export interface InteractionCallbacksExt extends InteractionCallbacks {
  onEntriesChange?: (entries: TextureAsset[] | ((prev: TextureAsset[]) => TextureAsset[])) => void;
  onRemoveEntry?: (entry: TextureAsset) => void;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
}

export interface InteractionStrategy {
  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult;
  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult;
  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult;
}

export class DefaultInteractionStrategy implements InteractionStrategy {
  private MOVE_THRESHOLD = 5;
  private dragStartMouse: { x: number, y: number } | null = null;
  private dragStartCanvas: { x: number, y: number } | null = null;

  constructor(private geo: GridGeometry) {}

  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    this.dragStartMouse = { x: e.clientX, y: e.clientY };
    this.dragStartCanvas = { x: pos.x, y: pos.y };

    if (e.button === 1) { // Middle Mouse
      return { state: { isPanning: true, panStart: { x: e.clientX, y: e.clientY } } };
    }

    if (e.button === 0) { // Left Click
      return { state: { isSelecting: true, selectionStart: { x: pos.x, y: pos.y } } };
    }
    else if (e.button === 2) { // Right Click
      let entry: TextureAsset | undefined;
      if (this.geo.settings.mode === 'packing') {
        entry = [...entries].reverse().find(t => 
          pos.x >= t.x && pos.x <= t.x + t.width * (t.scaleX ?? t.scale) &&
          pos.y >= t.y && pos.y <= t.y + t.height * (t.scaleY ?? t.scale)
        );
      } else {
        // Search backwards to pick the top-most entry
        entry = [...entries].reverse().find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      }

      if (entry) {
        console.log(`[Interaction] Drag Start (Real Entry): id=${entry.id}, pos=(${entry.x},${entry.y}), cell=(${cx},${cy})`);

        let draggingIds = [entry.id];
        const isEntryInSelectedCell = callbacks.selectedCells?.includes(`${cx},${cy}`);
        if (isEntryInSelectedCell && callbacks.selectedCells && callbacks.selectedCells.length > 1) {
          // Identify all entries that are in any of the selected cells
          const selectedEntries = entries.filter(e => {
            const ec = this.geo.getCellAtPos(e.x + e.width * (e.scaleX ?? e.scale) / 2, e.y + e.height * (e.scaleY ?? e.scale) / 2);
            return callbacks.selectedCells!.includes(`${ec.cx},${ec.cy}`);
          });
          draggingIds = selectedEntries.map(e => e.id);
          if (!draggingIds.includes(entry.id)) draggingIds.push(entry.id);
        }

        if (callbacks.onEntriesChange || callbacks.onMaterialize) {
          return {
            state: {
              draggingId: entry.id,
              draggingIds,
              dragOffset: { x: pos.x - entry.x, y: pos.y - entry.y, originalX: entry.x, originalY: entry.y }
            }
          };
        }
      }
 else if (this.geo.settings.mode !== 'packing') {
        console.log(`[Interaction] Drag Start (Virtual Cell): cell=(${cx},${cy})`);
        if (callbacks.onMaterialize) {
          const cellPos = this.geo.getPosFromCell(cx, cy);
          return {
            state: {
              draggingId: `virtual-${cx}-${cy}`,
              dragOffset: { x: pos.x - cellPos.x, y: pos.y - cellPos.y, originalX: cellPos.x, originalY: cellPos.y }
            }
          };
        }
      }
    }

    return { state: {} };
  }

  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    const result: InteractionResult = { state: { hoveredCell: { cx, cy } } };

    if (!this.dragStartCanvas || !this.dragStartMouse) return result;

    const dist = Math.sqrt(Math.pow(e.clientX - this.dragStartMouse.x, 2) + Math.pow(e.clientY - this.dragStartMouse.y, 2));

    if (state.isPanning) {
      const dx = e.clientX - state.panStart!.x;
      const dy = e.clientY - state.panStart!.y;
      result.onPan = { dx, dy };
      result.state.panStart = { x: e.clientX, y: e.clientY };
      return result;
    }

    if (state.draggingId && dist > this.MOVE_THRESHOLD) {
      let nx = pos.x - state.dragOffset.x;
      let ny = pos.y - state.dragOffset.y;
      if (this.geo.settings.mode !== 'packing') {
        const snapped = this.geo.snap(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);
        nx = snapped.x; ny = snapped.y;
      }
      result.state.draggingPos = { x: nx, y: ny };
    } else if (state.isSelecting && dist > this.MOVE_THRESHOLD) {
      if (callbacks.onCustomSelectionChange) {
        const rect = {
          x: Math.min(state.selectionStart!.x, pos.x),
          y: Math.min(state.selectionStart!.y, pos.y),
          w: Math.abs(pos.x - state.selectionStart!.x),
          h: Math.abs(pos.y - state.selectionStart!.y)
        };
        result.onCustomSelectionChange = { rect };
      } else if (callbacks.onSelectedCellsChange) {
        const startCell = this.geo.getCellAtPos(state.selectionStart!.x, state.selectionStart!.y);
        const minCx = Math.min(startCell.cx, cx);
        const maxCx = Math.max(startCell.cx, cx);
        const minCy = Math.min(startCell.cy, cy);
        const maxCy = Math.max(startCell.cy, cy);
        const cells: string[] = [];
        for (let x = minCx; x <= maxCx; x++)
          for (let y = minCy; y <= maxCy; y++)
            cells.push(`${x},${y}`);
        result.onSelectedCellsChange = cells;
      }
    }

    return result;
  }

  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, entries: TextureAsset[], callbacks: InteractionCallbacksExt): InteractionResult {
    const dist = this.dragStartMouse ? Math.sqrt(Math.pow(e.clientX - this.dragStartMouse.x, 2) + Math.pow(e.clientY - this.dragStartMouse.y, 2)) : 0;
    const result: InteractionResult = { state: { isSelecting: false, selectionStart: null, draggingId: null, draggingIds: [], draggingPos: null, isPanning: false, panStart: null } };

    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);

    if (e.button === 0) { // Left Button
      if (state.isSelecting && callbacks.onCustomSelectionChange && dist > this.MOVE_THRESHOLD) {
        const rect = {
          x: Math.min(state.selectionStart!.x, pos.x),
          y: Math.min(state.selectionStart!.y, pos.y),
          w: Math.abs(pos.x - state.selectionStart!.x),
          h: Math.abs(pos.y - state.selectionStart!.y)
        };
        result.onCustomSelectionChange = { rect, screenPos: { x: e.clientX, y: e.clientY } };
      }
      else if (dist <= this.MOVE_THRESHOLD) {
        if (callbacks.onCellClick) {
          result.onCellClick = { x: pos.x, y: pos.y, w: this.geo.cellW, h: this.geo.cellH, cx, cy };
          // Clear custom selection on click if one exists
          if (callbacks.onCustomSelectionChange) {
             result.onCustomSelectionChange = { rect: null };
          }
        } else if (callbacks.onSelectedCellsChange) {
          const key = `${cx},${cy}`;
          const isSelected = callbacks.selectedCells?.includes(key);
          
          if (e.ctrlKey || e.shiftKey) {
            // Toggle mode
            result.onSelectedCellsChange = isSelected
              ? callbacks.selectedCells!.filter((k: string) => k !== key)
              : [...(callbacks.selectedCells || []), key];
          } else {
            // Simple click: if already selected alone, keep it? 
            // Better behavior: clear everything and select only this one, OR if it's already selected alone, clear it.
            if (callbacks.selectedCells?.length === 1 && isSelected) {
              result.onSelectedCellsChange = [];
            } else {
              result.onSelectedCellsChange = [key];
            }
          }
        } else if (callbacks.onCustomSelectionChange) {
           // Clicked nowhere/background in a custom selection strategy
           result.onCustomSelectionChange = { rect: null };
        }
      }
    }
    else if (e.button === 2) { // Right Click
      if (dist <= this.MOVE_THRESHOLD) {
        let entry: TextureAsset | undefined;
        if (this.geo.settings.mode === 'packing') {
          entry = [...entries].reverse().find(t =>
            pos.x >= t.x && pos.x <= t.x + t.width * (t.scaleX ?? t.scale) &&
            pos.y >= t.y && pos.y <= t.y + t.height * (t.scaleY ?? t.scale)
          );
        } else {
          entry = [...entries].reverse().find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
        }

        if (callbacks.onMaterialize && this.geo.settings.mode !== 'packing') {
          result.onMaterialize = { cx, cy, reason: 'clear' };
        }
        if (entry && callbacks.onRemoveEntry) {
          result.onRemoveEntry = entry;
        } else if (!entry && this.geo.settings.mode !== 'packing' && !callbacks.onMaterialize && callbacks.onCellRightClick) {
          const cellPos = this.geo.getPosFromCell(cx, cy);
          result.onCellRightClick = { ...cellPos, w: this.geo.cellW, h: this.geo.cellH, cx, cy };
        }
      }
      else if (state.draggingId && state.draggingPos) {
        const nx = state.draggingPos.x;
        const ny = state.draggingPos.y;

        if (state.draggingId.startsWith('virtual-')) {
          const parts = state.draggingId.split('-');
          const origCX = parseInt(parts[1]);
          const origCY = parseInt(parts[2]);

          if (callbacks.onMaterialize) {
            result.onMaterialize = {
              cx: origCX,
              cy: origCY,
              reason: 'move',
              draggingPos: { x: nx, y: ny }
            };
          }
        } else if (callbacks.onEntriesChange) {
          const deltaX = nx - state.dragOffset.originalX;
          const deltaY = ny - state.dragOffset.originalY;

          if (this.geo.settings.mode !== 'packing') {
            const { cx: destCx, cy: destCy } = this.geo.getCellAtPos(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);
            
            // Multi-drag: move all draggingIds by the same delta
            if (state.draggingIds.length > 1) {
               const startCell = this.geo.getCellAtPos(state.dragOffset.originalX + this.geo.cellW / 2, state.dragOffset.originalY + this.geo.cellH / 2);
               const dCX = destCx - startCell.cx;
               const dCY = destCy - startCell.cy;

               // Calculate target cells
               const targetKeys = (callbacks.selectedCells || []).map(key => {
                 const [cx, cy] = key.split(',').map(Number);
                 return `${cx + dCX},${cy + dCY}`;
               });

               // Identify entries to be swapped or removed
               const hitTargetEntries = entries.filter(e => {
                 if (state.draggingIds.includes(e.id)) return false;
                 const ec = this.geo.getCellAtPos(e.x + e.width * (e.scaleX ?? e.scale) / 2, e.y + e.height * (e.scaleY ?? e.scale) / 2);
                 return targetKeys.includes(`${ec.cx},${ec.cy}`);
               });

               if (callbacks.dragMode === 'swap') {
                 result.onEntriesChange = entries.map(e => {
                    if (state.draggingIds.includes(e.id)) {
                      const nextX = e.x + deltaX;
                      const nextY = e.y + deltaY;
                      const snapped = this.geo.snap(nextX + (e.width * (e.scaleX ?? e.scale) / 2), nextY + (e.height * (e.scaleY ?? e.scale) / 2));
                      return { ...e, x: snapped.x, y: snapped.y };
                    }
                    if (hitTargetEntries.some(hit => hit.id === e.id)) {
                      const currentCell = this.geo.getCellAtPos(e.x + e.width * (e.scaleX ?? e.scale) / 2, e.y + e.height * (e.scaleY ?? e.scale) / 2);
                      const targetCell = { cx: currentCell.cx - dCX, cy: currentCell.cy - dCY };
                      const pos = this.geo.getPosFromCell(targetCell.cx, targetCell.cy);
                      return { ...e, x: pos.x, y: pos.y };
                    }
                    return e;
                 });
               } else {
                 const hitIds = callbacks.dragMode === 'replace' ? hitTargetEntries.map(h => h.id) : [];
                 const others = entries.filter(e => !state.draggingIds.includes(e.id) && !hitIds.includes(e.id));
                 const moved = entries.filter(e => state.draggingIds.includes(e.id)).map(e => {
                    const nextX = e.x + deltaX;
                    const nextY = e.y + deltaY;
                    const snapped = this.geo.snap(nextX + (e.width * (e.scaleX ?? e.scale) / 2), nextY + (e.height * (e.scaleY ?? e.scale) / 2));
                    return { ...e, x: snapped.x, y: snapped.y };
                 });
                 result.onEntriesChange = [...others, ...moved];
               }

               if (callbacks.selectedCells) {
                 result.onSelectedCellsChange = callbacks.selectedCells.map(key => {
                   const [cx, cy] = key.split(',').map(Number);
                   return `${cx + dCX},${cy + dCY}`;
                 });
               }
            } else {
              // Single drag with swap/hit logic
              const hitEntry = entries.find(e =>
                e.id !== state.draggingId &&
                this.geo.isTileInCell(e.x, e.y, e.width, e.height, e.scale, destCx, destCy)
              );

              if (hitEntry && callbacks.dragMode === 'swap') {
                const origX = state.dragOffset.originalX;
                const origY = state.dragOffset.originalY;
                result.onEntriesChange = entries.map(e => {
                  if (e.id === state.draggingId) return { ...e, x: nx, y: ny };
                  if (e.id === hitEntry.id) return { ...e, x: origX, y: origY };
                  return e;
                });
              } else {
                const others = entries.filter(e => e.id !== state.draggingId && (callbacks.dragMode !== 'replace' || !hitEntry || e.id !== hitEntry.id));
                const draggingEntry = entries.find(e => e.id === state.draggingId);
                if (draggingEntry) {
                   result.onEntriesChange = [...others, { ...draggingEntry, x: nx, y: ny }];
                }
              }
            }
          } else {
            // Packing mode multi-drag
            if (state.draggingIds.length > 1) {
              result.onEntriesChange = entries.map(e => {
                if (state.draggingIds.includes(e.id)) {
                  return { ...e, x: e.x + deltaX, y: e.y + deltaY };
                }
                return e;
              });
            } else {
              result.onEntriesChange = entries.map(e => e.id === state.draggingId ? { ...e, x: nx, y: ny } : e);
            }
          }
        }
      }
    }

    this.dragStartMouse = null;
    this.dragStartCanvas = null;
    return result;
  }
}
