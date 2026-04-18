import { TextureTile } from '../types';
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
  onTilesChange?: TextureTile[];
  onRemoveTile?: TextureTile;
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
  onTilesChange?: (tiles: TextureTile[] | ((prev: TextureTile[]) => TextureTile[])) => void;
  onRemoveTile?: (tile: TextureTile) => void;
  onMaterialize?: (cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number }) => void;
}

export interface InteractionStrategy {
  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult;
  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult;
  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult;
}

export class DefaultInteractionStrategy implements InteractionStrategy {
  constructor(private geo: GridGeometry) {}

  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult {
    const isLeftClick = e.button === 0;

    if (isLeftClick) {
      const clickedTile = [...tiles].reverse().find(t => 
        pos.x >= t.x && pos.x <= t.x + t.width * (t.scaleX ?? t.scale) &&
        pos.y >= t.y && pos.y <= t.y + t.height * (t.scaleY ?? t.scale)
      );

      if (clickedTile) {
        return {
          state: {
            draggingId: clickedTile.id,
            draggingPos: { x: clickedTile.x, y: clickedTile.y },
            dragOffset: { x: pos.x - clickedTile.x, y: pos.y - clickedTile.y, originalX: clickedTile.x, originalY: clickedTile.y }
          }
        };
      }

      return {
        state: { isSelecting: true, selectionStart: pos },
        onSelectedCellsChange: e.shiftKey ? callbacks.selectedCells : []
      };
    }

    return { state: {} };
  }

  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    const result: InteractionResult = { state: { hoveredCell: { cx, cy } } };

    if (state.draggingId) {
      result.state.draggingPos = { x: pos.x - state.dragOffset.x, y: pos.y - state.dragOffset.y };
    } else if (state.isSelecting && state.selectionStart) {
      const x = Math.min(state.selectionStart.x, pos.x);
      const y = Math.min(state.selectionStart.y, pos.y);
      const w = Math.abs(state.selectionStart.x - pos.x);
      const h = Math.abs(state.selectionStart.y - pos.y);

      if (w > 5 || h > 5) {
        result.onCustomSelectionChange = { rect: { x, y, w, h } };
      }
    }

    return result;
  }

  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], callbacks: InteractionCallbacksExt): InteractionResult {
    const isRightClick = e.button === 2;
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    const { x: cellX, y: cellY } = this.geo.getPosFromCell(cx, cy);

    if (state.draggingId && state.draggingPos) {
      const snapped = this.geo.snap(state.draggingPos.x, state.draggingPos.y);
      const nextTiles = tiles.map(t => t.id === state.draggingId ? { ...t, x: snapped.x, y: snapped.y } : t);
      return {
        state: { draggingId: null, draggingPos: null },
        onTilesChange: nextTiles
      };
    }

    if (state.isSelecting) {
      return { state: { isSelecting: false, selectionStart: null } };
    }

    if (isRightClick) {
      return { state: {}, onCellRightClick: { x: cellX, y: cellY, w: this.geo.cellW, h: this.geo.cellH, cx, cy } };
    }

    return { state: {}, onCellClick: { x: cellX, y: cellY, w: this.geo.cellW, h: this.geo.cellH, cx, cy } };
  }
}
