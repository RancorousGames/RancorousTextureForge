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
  onCustomSelectionChange?: { rect: { x: number, y: number, w: number, h: number } | null, screenPos?: { x: number, y: number } };
  onCellClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onCellRightClick?: { x: number, y: number, w: number, h: number, cx: number, cy: number };
  onRemoveTile?: TextureTile;
  onMaterialize?: { cx: number, cy: number, reason: 'move' | 'clear', draggingPos?: { x: number, y: number } };
}

export abstract class InteractionStrategy {
  constructor(protected geo: GridGeometry) {}

  abstract onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[], props: any): InteractionResult;
  abstract onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult;
  abstract onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult;
}

export class DefaultInteractionStrategy extends InteractionStrategy {
  private MOVE_THRESHOLD = 5;
  private dragStartMouse: { x: number, y: number } | null = null;
  private dragStartCanvas: { x: number, y: number } | null = null;

  onPointerDown(e: React.PointerEvent, pos: { x: number, y: number }, tiles: TextureTile[], props: any): InteractionResult {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    this.dragStartMouse = { x: e.clientX, y: e.clientY };
    this.dragStartCanvas = { x: pos.x, y: pos.y };

    if (e.button === 0) { // Left Click
      return { state: { isSelecting: true, selectionStart: { x: pos.x, y: pos.y } } };
    } 
    else if (e.button === 2) { // Right Click
      let tile: TextureTile | undefined;
      if (this.geo.settings.mode === 'packing') {
        // Precise hit-test for packing mode
        tile = tiles.slice().reverse().find(t => 
           pos.x >= t.x && pos.x <= t.x + (t.width * t.scale) &&
           pos.y >= t.y && pos.y <= t.y + (t.height * t.scale)
        );
      } else {
        tile = tiles.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
      }

      if (tile) {
        // Only allow dragging if we have somewhere to commit the changes (Main Atlas)
        if (props.onTilesChange || props.onMaterialize) {
          return { state: { draggingId: tile.id, dragOffset: { x: pos.x - tile.x, y: pos.y - tile.y, originalX: tile.x, originalY: tile.y } } };
        }
      } else if (this.geo.settings.mode !== 'packing') {
        // Only allow virtual drag in grid modes AND if we can materialize
        if (props.onMaterialize) {
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

  onPointerMove(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult {
    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);
    const result: InteractionResult = {
      state: { hoveredCell: { cx, cy } }
    };

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
    }
    else if (state.isSelecting && dist > this.MOVE_THRESHOLD && props.onCustomSelectionChange) {
      const rect = {
        x: Math.min(state.selectionStart!.x, pos.x),
        y: Math.min(state.selectionStart!.y, pos.y),
        w: Math.abs(pos.x - state.selectionStart!.x),
        h: Math.abs(pos.y - state.selectionStart!.y)
      };
      result.onCustomSelectionChange = { rect };
    }
    else if (state.isSelecting && dist > this.MOVE_THRESHOLD && props.onSelectedCellsChange) {
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

    return result;
  }

  onPointerUp(e: React.PointerEvent, pos: { x: number, y: number }, state: InteractionState, tiles: TextureTile[], props: any): InteractionResult {
    const dist = this.dragStartMouse ? Math.sqrt(Math.pow(e.clientX - this.dragStartMouse.x, 2) + Math.pow(e.clientY - this.dragStartMouse.y, 2)) : 0;
    const result: InteractionResult = { state: { isSelecting: false, selectionStart: null, draggingId: null, draggingPos: null } };

    const { cx, cy } = this.geo.getCellAtPos(pos.x, pos.y);

    if (e.button === 0) { // Left Button
      if (state.isSelecting && props.onCustomSelectionChange && dist > this.MOVE_THRESHOLD) {
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
        let tile: TextureTile | undefined;
        if (this.geo.settings.mode === 'packing') {
          tile = tiles.slice().reverse().find(t => 
            pos.x >= t.x && pos.x <= t.x + (t.width * t.scale) &&
            pos.y >= t.y && pos.y <= t.y + (t.height * t.scale)
          );
        } else {
          tile = tiles.find(t => this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, cx, cy));
        }
        
        // Unified Clear: Punch hole AND remove tile if exists
        // (Only materialize if NOT in packing mode)
        if (props.onMaterialize && this.geo.settings.mode !== 'packing') {
          result.onMaterialize = { cx, cy, reason: 'clear' };
        }
        if (tile && props.onRemoveTile) {
          result.onRemoveTile = tile;
        } else if (!tile && this.geo.settings.mode !== 'packing' && !props.onMaterialize && props.onCellRightClick) {
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
          
          if (props.onMaterialize) {
            result.onMaterialize = { 
              cx: origCX, 
              cy: origCY, 
              reason: 'move', 
              draggingPos: { x: nx, y: ny } 
            };
          }
        } else if (props.onTilesChange) {
          if (this.geo.settings.mode !== 'packing') {
            const { cx: destCx, cy: destCy } = this.geo.getCellAtPos(nx + this.geo.cellW / 2, ny + this.geo.cellH / 2);
            const hitTile = tiles.find(t =>
              t.id !== state.draggingId &&
              this.geo.isTileInCell(t.x, t.y, t.width, t.height, t.scale, destCx, destCy)
            );
            if (hitTile && props.atlasSwapMode) {
              const origX = state.dragOffset.originalX;
              const origY = state.dragOffset.originalY;
              result.onTilesChange = tiles.map(t => {
                if (t.id === state.draggingId) return { ...t, x: nx, y: ny };
                if (t.id === hitTile.id) return { ...t, x: origX, y: origY };
                return t;
              });
            } else if (hitTile) {
              result.onTilesChange = tiles
                .filter(t => t.id !== hitTile.id)
                .map(t => t.id === state.draggingId ? { ...t, x: nx, y: ny } : t);
            } else {
              result.onTilesChange = tiles.map(t => t.id === state.draggingId ? { ...t, x: nx, y: ny } : t);
            }
          } else {
            result.onTilesChange = tiles.map(t => t.id === state.draggingId ? { ...t, x: nx, y: ny } : t);
          }
        }
      }
    }

    this.dragStartMouse = null;
    this.dragStartCanvas = null;
    return result;
  }
}
