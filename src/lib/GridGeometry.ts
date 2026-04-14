import { GridSettings } from '../types';

export class GridGeometry {
  public readonly cellW: number;
  public readonly cellH: number;
  public readonly padding: number;
  public readonly stepX: number;
  public readonly stepY: number;

  constructor(
    public readonly settings: GridSettings,
    public readonly canvasW: number,
    public readonly canvasH: number
  ) {
    if (settings.mode === 'perfect') {
      this.cellW = canvasW / settings.gridX;
      this.cellH = canvasH / (settings.keepSquare ? settings.gridX : settings.gridY);
      this.padding = 0;
    } else {
      this.padding = settings.padding || 0;
      this.cellW = settings.cellSize;
      this.cellH = settings.cellY || settings.cellSize;
    }
    this.stepX = this.cellW + this.padding * 2;
    this.stepY = this.cellH + this.padding * 2;
  }

  public get cols(): number {
    return Math.floor(this.canvasW / (this.stepX || 1));
  }

  public get rows(): number {
    return Math.floor(this.canvasH / (this.stepY || 1));
  }

  public getCellAtPos(x: number, y: number): { cx: number; cy: number } {
    const cx = Math.floor(x / (this.stepX || 1));
    const cy = Math.floor(y / (this.stepY || 1));
    return { cx, cy };
  }

  public getPosFromCell(cx: number, cy: number): { x: number; y: number } {
    return {
      x: cx * this.stepX + this.padding,
      y: cy * this.stepY + this.padding
    };
  }

  public getCellCenter(cx: number, cy: number): { x: number; y: number } {
    return {
      x: cx * this.stepX + this.padding + this.cellW / 2,
      y: cy * this.stepY + this.padding + this.cellH / 2
    };
  }

  /**
   * Returns true if the given tile's center falls within the specified cell.
   */
  public isTileInCell(tileX: number, tileY: number, tileW: number, tileH: number, scale: number, cx: number, cy: number): boolean {
    const centerX = tileX + (tileW * scale) / 2;
    const centerY = tileY + (tileH * scale) / 2;
    const tileCell = this.getCellAtPos(centerX - this.padding, centerY - this.padding);
    return tileCell.cx === cx && tileCell.cy === cy;
  }

  /**
   * Snaps a coordinate to the nearest grid step (including padding offset).
   */
  public snap(x: number, y: number): { x: number; y: number } {
    const { cx, cy } = this.getCellAtPos(x - this.padding, y - this.padding);
    return this.getPosFromCell(cx, cy);
  }
}
