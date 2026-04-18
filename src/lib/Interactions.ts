import { TextureAsset } from '../types';
import { GridGeometry } from './GridGeometry';

export interface InteractionState {
  isSelecting: boolean;
  selectionStart: { x: number, y: number } | null;
  draggingId: string | null;
  draggingPos: { x: number, y: number } | null;
  dragOffset: { x: number, y: number, originalX: number, originalY: number };
  hoveredCell: { cx: number, cy: number } | null;
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
}

export interface InteractionCallbacks {
  onCustomSelectionChange?: (rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number }) => void;
  onSelectedCellsChange?: (cells: string[]) => void;
  selectedCells?: string[];
  onCellClick?: (x: number, y: number, w: number, h: number, cx: number, cy: number) => void;
  onCellRightClick?: (x: number, y: number, w: number, h: number, cx: number, cy: number) => void;
  atlasSwapMode?: boolean;
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
        entry = entries.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      }

      if (entry) {
        if (callbacks.onEntriesChange || callbacks.onMaterialize) {
          return {
            state: {
              draggingId: entry.id,
              dragOffset: { x: pos.x - entry.x, y: pos.y - entry.y, originalX: entry.x, originalY: entry.y }
            }
          };
        }
      } else if (this.geo.settings.mode !== 'packing') {
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
    const result: InteractionResult = { state: { isSelecting: false, selectionStart: null, draggingId: null, draggingPos: null } };

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
        const cellPos = this.geo.getPosFromCell(cx, cy);
        if (callbacks.onCellClick) {
          result.onCellClick = { ...cellPos, w: this.geo.cellW, h: this.geo.cellH, cx, cy };
        } else if (callbacks.onSelectedCellsChange) {
          const key = `${cx},${cy}`;
          result.onSelectedCellsChange = callbacks.selectedCells?.includes(key)
            ? callbacks.selectedCells.filter((k: string) => k !== key)
            : [...(callbacks.selectedCells || []), key];
        }
      }
    }
    else if (e.button === 2) { // Right Button
      if (dist <= this.MOVE_THRESHOLD) {
        let entry: TextureAsset | undefined;
        if (this.geo.settings.mode === 'packing') {
          entry = [...entries].reverse().find(t =>
            pos.x >= t.x && pos.x <= t.x + t.width * (t.scaleX ?? t.scale) &&
            pos.y >= t.y && pos.y <= t.y + t.height * (t.scaleY ?? t.scale)
          );
        } else {
          entry = entries.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
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
          if (this.geo.settings.mode !== 'packing') {
            const { cx: destCx, cy: destCy } = this.geo.getCellAtPos(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);
            const hitEntry = entries.find(e =>
              e.id !== state.draggingId &&
              this.geo.isTileInCell(e.x, e.y, e.width, e.height, e.scale, destCx, destCy)
            );

            if (hitEntry && callbacks.atlasSwapMode) {
              const origX = state.dragOffset.originalX;
              const origY = state.dragOffset.originalY;
              result.onEntriesChange = entries.map(e => {
                if (e.id === state.draggingId) return { ...e, x: nx, y: ny };
                if (e.id === hitEntry.id) return { ...e, x: origX, y: origY };
                return e;
              });
            } else if (hitEntry) {
              result.onEntriesChange = entries
                .filter(e => e.id !== hitEntry.id)
                .map(e => e.id === state.draggingId ? { ...e, x: nx, y: ny } : e);
            } else {
              result.onEntriesChange = entries.map(e => e.id === state.draggingId ? { ...e, x: nx, y: ny } : e);
            }
          } else {
            result.onEntriesChange = entries.map(e => e.id === state.draggingId ? { ...e, x: nx, y: ny } : e);
          }
        }
      }
    }

    this.dragStartMouse = null;
    this.dragStartCanvas = null;
    return result;
  }
}
