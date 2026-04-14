import { GridGeometry } from './GridGeometry';
import { TextureTile } from '../types';

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
  onTilesChange?: TextureTile[];
  onSelectedCellsChange?: string[];
  onCustomSelectionChange?: any;
  onCellClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onCellRightClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onRemoveTile?: TextureTile;
  onMaterialize?: { cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number } };
}

export abstract class InteractionStrategy {
  constructor(protected geo: GridGeometry) {}

  abstract onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[]): Partial<InteractionState>;
  abstract onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[]): Partial<InteractionState>;
  abstract onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult;
}

export class DefaultInteractionStrategy extends InteractionStrategy {
  private MOVE_THRESHOLD = 5;
  private dragStartMouse: { x: number, y: number } | null = null;
  private dragStartCanvas: { x: number, y: number } | null = null;

  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[]): Partial<InteractionState> {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    this.dragStartMouse = { x: e.clientX, y: e.clientY };
    this.dragStartCanvas = { x: pos.x, y: pos.y };

    if (e.button === 0) { // Left Click
      return { isSelecting: true, selectionStart: { x: cx, y: cy } };
    } 
    else if (e.button === 2) { // Right Click
      const tile = tiles.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      if (tile) {
        return { draggingId: tile.id, dragOffset: { x: pos.x - tile.x, y: pos.y - tile.y, originalX: tile.x, originalY: tile.y } };
      } else {
        const cellPos = this.geo.getPosFromCell(cx, cy);
        return { 
          draggingId: `virtual-${cx}-${cy}`, 
          dragOffset: { x: pos.x - cellPos.x, y: pos.y - cellPos.y, originalX: cellPos.x, originalY: cellPos.y } 
        };
      }
    }
    return {};
  }

  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[]): Partial<InteractionState> {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    const updates: Partial<InteractionState> = { hoveredCell: { cx, cy } };

    if (!this.dragStartCanvas || !this.dragStartMouse) return updates;

    const dist = Math.sqrt(Math.pow(e.clientX - this.dragStartMouse.x, 2) + Math.pow(e.clientY - this.dragStartMouse.y, 2));

    if (state.draggingId && dist > this.MOVE_THRESHOLD) {
      let nx = pos.x - state.dragOffset.x;
      let ny = pos.y - state.dragOffset.y;
      if (this.geo.settings.mode !== 'packing') {
        const snapped = this.geo.snap(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);
        nx = snapped.x; ny = snapped.y;
      }
      updates.draggingPos = { x: nx, y: ny };
    }

    return updates;
  }

  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult {
    const dist = this.dragStartMouse ? Math.sqrt(Math.pow(e.clientX - this.dragStartMouse.x, 2) + Math.pow(e.clientY - this.dragStartMouse.y, 2)) : 0;
    const result: InteractionResult = { state: { isSelecting: false, selectionStart: null, draggingId: null, draggingPos: null } };

    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);

    if (e.button === 0) { // Left Button
      if (state.isSelecting && props.onCustomSelectionChange && dist > this.MOVE_THRESHOLD) {
        // Custom selection logic would go here if needed
      }
      else if (dist <= this.MOVE_THRESHOLD) {
        const cellPos = this.geo.getPosFromCell(cx, cy);
        if (props.onCellClick) {
          result.onCellClick = { ...cellPos, w: this.geo.cellW, h: this.geo.cellH, cx, cy };
        } else if (props.onSelectedCellsChange) {
          const key = `${cx},${cy}`;
          result.onSelectedCellsChange = props.selectedCells.includes(key) 
            ? props.selectedCells.filter((k: string) => k !== key) 
            : [...props.selectedCells, key];
        }
      }
    }
    else if (e.button === 2) { // Right Button
      if (dist <= this.MOVE_THRESHOLD) {
        const cellPos = this.geo.getPosFromCell(cx, cy);
        if (props.onCellRightClick) {
          result.onCellRightClick = { ...cellPos, w: this.geo.cellW, h: this.geo.cellH, cx, cy };
        } else if (props.onTilesChange) {
          result.onTilesChange = tiles.filter(t => !this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
        } else if (props.onRemoveTile) {
          const tile = tiles.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
          if (tile) result.onRemoveTile = tile;
        }
      } 
      else if (state.draggingId && state.draggingPos && props.onTilesChange) {
        const nx = state.draggingPos.x;
        const ny = state.draggingPos.y;
        const { cx: targetCX, cy: targetCY } = this.geo.getCellAtPos(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);

        let newTiles = tiles.filter(t => t.id === state.draggingId || !this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, targetCX, targetCY));

        if (props.atlasSwapMode) {
          const destTile = tiles.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, targetCX, targetCY));
          if (destTile) {
            newTiles = newTiles.map(t => {
              if (t.id === state.draggingId) return { ...t, x: nx, y: ny };
              if (t.id === destTile.id) return { ...t, x: state.dragOffset.originalX, y: state.dragOffset.originalY };
              return t;
            });
          } else {
            newTiles = newTiles.map(t => t.id === state.draggingId ? { ...t, x: nx, y: ny } : t);
          }
        } else {
          newTiles = newTiles.map(t => t.id === state.draggingId ? { ...t, x: nx, y: ny } : t);
        }
        result.onTilesChange = newTiles;
      }
    }

    this.dragStartMouse = null;
    this.dragStartCanvas = null;
    return result;
  }
}
